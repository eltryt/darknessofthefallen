import { randomUUID } from 'node:crypto';
import { audit, transaction } from './database-core.mjs';
import { HttpError, text } from './domain.mjs';

export function gmWebhook(env) {
	const value = env.DISCORD_GM_WEBHOOK_URL;
	if (!value) return null;
	try {
		const url = new URL(value);
		if (
			url.protocol !== 'https:' ||
			!['discord.com', 'discordapp.com'].includes(url.hostname) ||
			url.port ||
			url.username ||
			url.password ||
			!/^\/api(?:\/v10)?\/webhooks\/\d{17,20}\/[\w.-]+\/?$/.test(url.pathname) ||
			[...url.searchParams.keys()].some((key) => key !== 'wait') ||
			url.hash
		)
			return null;
		url.hostname = 'discord.com';
		url.pathname = url.pathname.replace(/\/$/, '');
		url.search = '';
		return url;
	} catch {
		return null;
	}
}
export const gmReady = (env) => env.GM_NOTIFICATIONS_ENABLED === 'true' && Boolean(gmWebhook(env));
export function enqueueGM(db, kind, targetId, key = kind + ':' + targetId) {
	db.prepare(
		'INSERT OR IGNORE INTO gm_notifications(id,kind,target_id,dedupe_key,created_at) VALUES(?,?,?,?,?)',
	).run(randomUUID(), kind, targetId, key, new Date().toISOString());
}
export function gmPayload(kind, targetId, origin) {
	const sections = { recruitment: 'applications', contact: 'messages', incident: 'messages' };
	const titles = {
		recruitment: 'Nueva solicitud de reclutamiento',
		contact: 'Nuevo mensaje de contacto',
		incident: 'Incidencia importante para revisar',
	};
	if (!sections[kind]) throw new Error('Unsupported notification kind');
	return {
		content: `🔔 ${titles[kind]} · Darkness of the Fallen\n${origin}/panel?tab=${sections[kind]}&record=${encodeURIComponent(targetId)}`,
		allowed_mentions: { parse: [] },
	};
}
const busy = new WeakSet();
export async function deliverGM(db, env, transport = fetch) {
	if (!gmReady(env) || busy.has(db)) return;
	busy.add(db);
	try {
		// A process may die after Discord receives the POST. Never blindly replay it.
		db.prepare(
			"UPDATE gm_notifications SET status='uncertain',last_error='Entrega interrumpida: revisa el canal antes de reintentar.' WHERE status='sending' AND next_at<=?",
		).run(Date.now());
		const row = db
			.prepare(
				"SELECT * FROM gm_notifications WHERE status='pending' AND next_at<=? ORDER BY created_at LIMIT 1",
			)
			.get(Date.now());
		if (!row) return;
		const claimed = db
			.prepare(
				"UPDATE gm_notifications SET status='sending',attempts=attempts+1,next_at=? WHERE id=? AND status='pending'",
			)
			.run(Date.now() + 120000, row.id);
		if (!claimed.changes) return;
		const url = gmWebhook(env);
		url.searchParams.set('wait', 'true');
		let status = 'uncertain',
			reason = 'Respuesta no confirmada: revisa el canal antes de reintentar.',
			messageId = null,
			nextAt = 0;
		try {
			const response = await transport(url.href, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(gmPayload(row.kind, row.target_id, env.APP_ORIGIN)),
				redirect: 'error',
				signal: AbortSignal.timeout(10000),
			});
			const result = await response.json().catch(() => ({}));
			if (response.ok && /^\d{17,20}$/.test(result.id || '')) {
				status = 'delivered';
				reason = '';
				messageId = result.id;
			} else if (response.status === 429) {
				status = row.attempts + 1 >= 5 ? 'failed' : 'pending';
				reason = 'Discord ha limitado los envíos. Reintento aplazado.';
				const retry =
					Number(result.retry_after) || Number(response.headers.get('retry-after')) || 60;
				nextAt = Date.now() + Math.max(60000, Math.min(retry * 1000, 86400000));
				// Respect the webhook-wide limit for other queued events too.
				db.prepare("UPDATE gm_notifications SET next_at=MAX(next_at,?) WHERE status='pending'").run(
					nextAt,
				);
			} else if (response.status >= 400 && response.status < 500) {
				status = 'failed';
				reason =
					'Discord rechazó el aviso (HTTP ' +
					response.status +
					'). Revisa el webhook y sus permisos.';
			}
		} catch {
			/* Never log request objects, response bodies or webhook tokens. */
		}
		transaction(db, () => {
			db.prepare(
				'UPDATE gm_notifications SET status=?,last_error=?,next_at=?,message_id=?,delivered_at=? WHERE id=?',
			).run(
				status,
				reason,
				nextAt,
				messageId,
				status === 'delivered' ? new Date().toISOString() : null,
				row.id,
			);
			audit(db, 'system', 'notification.' + status, row.id, { kind: row.kind, status });
		});
	} finally {
		busy.delete(db);
	}
}
export function captureRaidIncidents(db, env) {
	if (!gmReady(env)) return;
	// Only newly failed jobs, not the historical backlog at activation.
	for (const job of db
		.prepare("SELECT id FROM raid_jobs WHERE status='blocked' AND created_at>=? LIMIT 20")
		.all(new Date(Date.now() - 15 * 60000).toISOString())) {
		const key = 'raid-job:' + job.id;
		transaction(db, () => {
			if (db.prepare('SELECT id FROM gm_notifications WHERE dedupe_key=?').get(key)) return;
			const id = randomUUID();
			db.prepare('INSERT INTO gm_messages VALUES(?,?,?,?,?,?)').run(
				id,
				'incident',
				null,
				'Operación de convocatoria bloqueada',
				'Una operación de Raid-Helper requiere revisión. Consulta Panel → Raids. Referencia: ' +
					job.id,
				new Date().toISOString(),
			);
			enqueueGM(db, 'incident', id, key);
		});
	}
}
export async function gmApi(ctx) {
	const { path, method, user, db, env, body, send, requirePermission } = ctx;
	if (path === '/api/gm-messages') {
		if (method === 'GET') {
			requirePermission('recruitment.manage');
			send(200, db.prepare('SELECT * FROM gm_messages ORDER BY created_at DESC LIMIT 200').all());
			return true;
		}
		if (method === 'POST') {
			requirePermission('community.read');
			const value = await body();
			const kind = value.kind === 'incident' ? 'incident' : 'contact';
			if (kind === 'incident') requirePermission('recruitment.manage');
			const subject = text(value.subject, 'asunto', 160),
				message = text(value.message, 'mensaje', 3000);
			const requestId = text(value.requestId, 'identificador', 80);
			if (!/^[a-f0-9-]{36}$/i.test(requestId)) throw new HttpError(400, 'Identificador inválido.');
			const existing = db.prepare('SELECT user_id FROM gm_messages WHERE id=?').get(requestId);
			if (existing) {
				if (existing.user_id !== user.id) throw new HttpError(409, 'Identificador ya utilizado.');
				send(200, { id: requestId });
				return true;
			}
			const recent = db
				.prepare('SELECT COUNT(*) n FROM gm_messages WHERE user_id=? AND created_at>?')
				.get(user.id, new Date(Date.now() - 3600000).toISOString()).n;
			if (recent >= 5)
				throw new HttpError(429, 'Has enviado varios mensajes. Espera antes de enviar otro.');
			transaction(db, () => {
				db.prepare('INSERT INTO gm_messages VALUES(?,?,?,?,?,?)').run(
					requestId,
					kind,
					user.id,
					subject,
					message,
					new Date().toISOString(),
				);
				enqueueGM(db, kind, requestId);
				audit(db, user.id, 'message.created', requestId, { kind });
			});
			send(201, { id: requestId });
			return true;
		}
	}
	if (path === '/api/gm-notifications' && method === 'GET') {
		requirePermission('recruitment.manage');
		send(200, {
			configured: gmReady(env),
			rows: db
				.prepare(
					'SELECT id,kind,target_id,status,attempts,next_at,last_error,created_at,delivered_at FROM gm_notifications ORDER BY created_at DESC LIMIT 200',
				)
				.all(),
		});
		return true;
	}
	if (path === '/api/gm-notifications/retry' && method === 'POST') {
		requirePermission('recruitment.manage');
		const v = await body();
		if (v.reviewed !== true)
			throw new HttpError(400, 'Confirma primero que el aviso no está en Discord.');
		const id = text(v.id, 'aviso', 80);
		transaction(db, () => {
			db.prepare(
				"UPDATE gm_notifications SET status='pending',attempts=0,next_at=0,last_error='' WHERE id=? AND status IN ('failed','uncertain')",
			).run(id);
			audit(db, user.id, 'notification.retry', id, {});
		});
		send(200, { ok: true });
		return true;
	}
	return false;
}
