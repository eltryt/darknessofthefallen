import { randomUUID } from 'node:crypto';
import { HttpError, text } from './domain.mjs';
import { audit } from './database-core.mjs';
import { encryptPayload, vapidAuthorization } from './web-push.mjs';

// App notifications for GM and officers. Events are queued in the same transaction
// that records them and delivered by the Durable Object alarm, like Discord notices.
export const pushReady = (env) => Boolean(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_JWK);
const RECIPIENT_RANKS = "('officer','leader')";
// The server only posts to browser push services, never to arbitrary hosts.
const PUSH_HOSTS = [
	'fcm.googleapis.com',
	'updates.push.services.mozilla.com',
	'web.push.apple.com',
	'.notify.windows.com',
	'.push.apple.com',
];
export function validEndpoint(value) {
	try {
		const url = new URL(value);
		return (
			url.protocol === 'https:' &&
			!url.username &&
			!url.port &&
			PUSH_HOSTS.some((h) => (h.startsWith('.') ? url.hostname.endsWith(h) : url.hostname === h))
		);
	} catch {
		return false;
	}
}

export function enqueuePush(db, kind, targetId, userId = null) {
	db.prepare(
		'INSERT OR IGNORE INTO push_jobs(id,kind,target_id,user_id,dedupe_key,created_at) VALUES(?,?,?,?,?,?)',
	).run(randomUUID(), kind, targetId, userId, kind + ':' + targetId, new Date().toISOString());
}

const clip = (value, n) =>
	String(value || '').length > n ? String(value).slice(0, n - 1) + '…' : String(value || '');
export function pushMessage(db, job) {
	if (job.kind === 'recruitment') {
		const row = db.prepare('SELECT data FROM applications WHERE id=?').get(job.target_id);
		const a = row ? JSON.parse(row.data) : {};
		return {
			title: 'Nueva candidatura',
			body: [a.character, a.class, a.role].filter(Boolean).join(' · ') || 'Revisa el panel.',
			url: '/panel?tab=applications&record=' + encodeURIComponent(job.target_id),
		};
	}
	if (job.kind === 'test')
		return {
			title: 'Avisos activados',
			body: 'Este dispositivo recibirá los avisos de la hermandad.',
			url: '/panel',
		};
	const message = db.prepare('SELECT subject FROM gm_messages WHERE id=?').get(job.target_id);
	return {
		title: job.kind === 'incident' ? 'Incidencia para revisar' : 'Nuevo mensaje de contacto',
		body: clip(message?.subject, 90) || 'Revisa el panel.',
		url: '/panel?tab=messages&record=' + encodeURIComponent(job.target_id),
	};
}

const busy = new WeakSet();
export async function deliverPush(db, env, transport = fetch) {
	if (!pushReady(env) || busy.has(db)) return;
	busy.add(db);
	try {
		const jobs = db
			.prepare(
				'SELECT * FROM push_jobs WHERE done_at IS NULL AND next_at<=? ORDER BY created_at LIMIT 10',
			)
			.all(Date.now());
		const vapid = {
			publicKey: env.VAPID_PUBLIC_KEY,
			privateJwk: env.VAPID_PRIVATE_JWK,
			subject: env.APP_ORIGIN || 'https://darknessofthefallen.com',
		};
		for (const job of jobs) {
			// Claim first: a crash after sending must not repeat the notification.
			if (
				!db
					.prepare('UPDATE push_jobs SET done_at=? WHERE id=? AND done_at IS NULL')
					.run(new Date().toISOString(), job.id).changes
			)
				continue;
			const payload = JSON.stringify({
				...pushMessage(db, job),
				tag: job.kind + ':' + job.target_id,
			});
			const devices = job.user_id
				? db.prepare('SELECT * FROM push_subscriptions WHERE user_id=?').all(job.user_id)
				: db
						.prepare(
							`SELECT s.* FROM push_subscriptions s JOIN users u ON u.id=s.user_id WHERE u.rank IN ${RECIPIENT_RANKS}`,
						)
						.all();
			let sent = 0;
			for (const device of devices) {
				let status = 0;
				try {
					const response = await transport(device.endpoint, {
						method: 'POST',
						headers: {
							Authorization: await vapidAuthorization(device.endpoint, vapid),
							'Content-Encoding': 'aes128gcm',
							'Content-Type': 'application/octet-stream',
							TTL: '86400',
							Urgency: 'high',
						},
						body: await encryptPayload(payload, device),
						redirect: 'manual',
						signal: AbortSignal.timeout(10000),
					});
					status = response.status;
				} catch {
					/* Network error: counted as a failure below. Never log endpoints. */
				}
				if (status >= 200 && status < 300) {
					sent++;
					db.prepare('UPDATE push_subscriptions SET failures=0 WHERE endpoint=?').run(
						device.endpoint,
					);
				} else if (status === 404 || status === 410) {
					// The browser dropped this subscription; it will never work again.
					db.prepare('DELETE FROM push_subscriptions WHERE endpoint=?').run(device.endpoint);
				} else {
					db.prepare('UPDATE push_subscriptions SET failures=failures+1 WHERE endpoint=?').run(
						device.endpoint,
					);
					db.prepare('DELETE FROM push_subscriptions WHERE endpoint=? AND failures>=10').run(
						device.endpoint,
					);
				}
			}
			audit(db, 'system', 'push.sent', job.id, { kind: job.kind, devices: devices.length, sent });
		}
	} finally {
		busy.delete(db);
	}
}
export const nextPushAt = (db) =>
	db.prepare('SELECT MIN(next_at) due FROM push_jobs WHERE done_at IS NULL').get().due;

export async function pushApi({ db, user, path, method, env, body, send, requirePermission }) {
	if (!path.startsWith('/api/push/')) return false;
	requirePermission('recruitment.manage');
	if (path === '/api/push/key' && method === 'GET') {
		send(200, {
			enabled: pushReady(env),
			publicKey: env.VAPID_PUBLIC_KEY || null,
			devices: db.prepare('SELECT COUNT(*) n FROM push_subscriptions WHERE user_id=?').get(user.id)
				.n,
		});
		return true;
	}
	if (!pushReady(env))
		throw new HttpError(503, 'Los avisos en la app todavía no están configurados.');
	const value = await body();
	const endpoint = text(value.endpoint, 'dispositivo', 1000);
	if (!validEndpoint(endpoint)) throw new HttpError(400, 'Dispositivo de avisos no válido.');
	if (path === '/api/push/subscribe' && method === 'POST') {
		const p256dh = text(value.keys?.p256dh, 'clave', 200),
			auth = text(value.keys?.auth, 'clave', 100);
		db.prepare(
			`INSERT INTO push_subscriptions(endpoint,user_id,p256dh,auth,created_at) VALUES(?,?,?,?,?)
			 ON CONFLICT(endpoint) DO UPDATE SET user_id=excluded.user_id,p256dh=excluded.p256dh,auth=excluded.auth,failures=0`,
		).run(endpoint, user.id, p256dh, auth, new Date().toISOString());
		// A welcome notification proves the whole chain on this device.
		enqueuePush(db, 'test', randomUUID(), user.id);
		audit(db, user.id, 'push.subscribed', 'device', {});
		send(201, { ok: true });
		return true;
	}
	if (path === '/api/push/unsubscribe' && method === 'POST') {
		db.prepare('DELETE FROM push_subscriptions WHERE endpoint=? AND user_id=?').run(
			endpoint,
			user.id,
		);
		audit(db, user.id, 'push.unsubscribed', 'device', {});
		send(200, { ok: true });
		return true;
	}
	throw new HttpError(404, 'Endpoint no encontrado.');
}
