import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createECDH, randomBytes } from 'node:crypto';
import { openDatabase } from '../src/db.mjs';
import { createApp } from '../src/app.mjs';
import { issueSession } from '../src/auth.mjs';
import { generateVapidKeys, b64url } from '../src/web-push.mjs';
import { deliverPush, validEndpoint } from '../src/push-notifications.mjs';

const ORIGIN = 'http://localhost:3000';
const device = (endpoint) => {
	const ecdh = createECDH('prime256v1');
	ecdh.generateKeys();
	return { endpoint, keys: { p256dh: b64url(ecdh.getPublicKey()), auth: b64url(randomBytes(16)) } };
};

test('only browser push services are accepted as devices', () => {
	assert.ok(validEndpoint('https://fcm.googleapis.com/fcm/send/abc'));
	assert.ok(validEndpoint('https://web.push.apple.com/QJx'));
	assert.ok(validEndpoint('https://wns2-db5p.notify.windows.com/w/?token=x'));
	assert.ok(!validEndpoint('http://fcm.googleapis.com/fcm/send/abc'));
	assert.ok(!validEndpoint('https://evil.example.com/fcm.googleapis.com'));
	assert.ok(!validEndpoint('https://169.254.169.254/latest'));
});

test('GM and officers get app notifications for applications and messages; others cannot subscribe', async () => {
	const keys = await generateVapidKeys();
	const env = {
		APP_ORIGIN: ORIGIN,
		VAPID_PUBLIC_KEY: keys.publicKey,
		VAPID_PRIVATE_JWK: JSON.stringify(keys.privateJwk),
	};
	const db = openDatabase(':memory:');
	db.prepare(
		"UPDATE settings SET data=json_set(data,'$.recruitmentOpen',json('true')) WHERE id=1",
	).run();
	const sessions = {};
	for (const [id, rank] of [
		['gm', 'leader'],
		['ofi', 'officer'],
		['ana', 'member'],
	]) {
		db.prepare('INSERT INTO users VALUES(?,?,?,?)').run(id, id, rank, '2026-10-01');
		sessions[id] = issueSession(db, id);
	}
	const server = createServer(createApp(db, env));
	await new Promise((r) => server.listen(0, '127.0.0.1', r));
	const call = async (path, who, value) => {
		const s = sessions[who];
		const r = await fetch(`http://127.0.0.1:${server.address().port}${path}`, {
			method: value ? 'POST' : 'GET',
			headers: {
				Origin: ORIGIN,
				'Content-Type': 'application/json',
				...(s ? { Cookie: `session=${s.raw}`, 'X-CSRF-Token': s.csrf } : {}),
			},
			body: value ? JSON.stringify(value) : undefined,
		});
		return { status: r.status, body: await r.json() };
	};
	try {
		assert.equal((await call('/api/push/key', 'ana')).status, 403);
		assert.equal(
			(await call('/api/push/subscribe', 'gm', device('https://evil.example/x'))).status,
			400,
		);
		assert.equal(
			(await call('/api/push/subscribe', 'gm', device('https://fcm.googleapis.com/fcm/send/gm')))
				.status,
			201,
		);
		assert.equal(
			(await call('/api/push/subscribe', 'ofi', device('https://web.push.apple.com/ofi'))).status,
			201,
		);
		const posted = [];
		const transport = async (url, init) => {
			posted.push({ url, init });
			return new Response(null, { status: url.includes('apple') ? 410 : 201 });
		};
		// Each subscription first gets its own welcome notification.
		await deliverPush(db, env, transport);
		assert.deepEqual(posted.map((p) => p.url).sort(), [
			'https://fcm.googleapis.com/fcm/send/gm',
			'https://web.push.apple.com/ofi',
		]);
		assert.equal(posted[0].init.headers['Content-Encoding'], 'aes128gcm');
		assert.match(posted[0].init.headers.Authorization, /^vapid t=.+, k=/);
		// The push service said the iPhone subscription is gone: it is removed.
		assert.equal(db.prepare('SELECT COUNT(*) n FROM push_subscriptions').get().n, 1);
		posted.length = 0;
		const application = await call('/api/applications', null, {
			name: 'Karage',
			discord: 'karage',
			character: 'Karage',
			class: 'Cazador',
			role: 'DPS distancia',
			experience: 'x',
			availability: 'x',
			reason: 'x',
			consent: true,
		});
		assert.equal(application.status, 201);
		await call('/api/gm-messages', 'ana', {
			kind: 'contact',
			subject: 'No puedo entrar',
			message: 'Ayuda',
			requestId: crypto.randomUUID(),
		});
		await deliverPush(db, env, transport);
		assert.equal(posted.length, 2);
		assert.ok(posted.every((p) => p.url === 'https://fcm.googleapis.com/fcm/send/gm'));
		// Delivered jobs are never sent twice.
		await deliverPush(db, env, transport);
		assert.equal(posted.length, 2);
	} finally {
		server.close();
	}
});
