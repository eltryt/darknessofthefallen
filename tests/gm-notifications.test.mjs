import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { openDatabase } from '../src/db.mjs';
import {
	enqueueGM,
	deliverGM,
	gmReady,
	gmApi,
	captureRaidIncidents,
} from '../src/gm-notifications.mjs';
import { exportRecovery, restoreRecovery } from '../src/recovery.mjs';
const env = {
	GM_NOTIFICATIONS_ENABLED: 'true',
	DISCORD_GM_WEBHOOK_URL: 'https://discord.com/api/webhooks/1550997172982382723/test-token',
	APP_ORIGIN: 'https://guild.example',
};
test('webhook queue deduplicates and sends only generic links without candidate contents', async () => {
	const db = openDatabase(':memory:');
	try {
		enqueueGM(db, 'recruitment', 'application-1');
		enqueueGM(db, 'recruitment', 'application-1');
		let count = 0;
		const transport = async (url, options) => {
			count++;
			assert.equal(new URL(url).searchParams.get('wait'), 'true');
			const body = JSON.parse(options.body);
			assert.deepEqual(body.allowed_mentions, { parse: [] });
			assert.match(body.content, /panel\?tab=applications&record=application-1/);
			return Response.json({ id: '1550997172982382724' });
		};
		await Promise.all([deliverGM(db, env, transport), deliverGM(db, env, transport)]);
		await deliverGM(db, env, transport);
		assert.equal(count, 1);
		assert.equal(db.prepare('SELECT status FROM gm_notifications').get().status, 'delivered');
	} finally {
		db.close();
	}
});
test('429 is delayed; uncertain network outcomes are never replayed automatically', async () => {
	const db = openDatabase(':memory:');
	try {
		enqueueGM(db, 'contact', 'm');
		await deliverGM(db, env, async () => Response.json({ retry_after: 180 }, { status: 429 }));
		let row = db.prepare('SELECT * FROM gm_notifications').get();
		assert.equal(row.status, 'pending');
		assert.ok(row.next_at > Date.now() + 170000);
		let called = false;
		await deliverGM(db, env, async () => {
			called = true;
		});
		assert.equal(called, false);
		db.exec('UPDATE gm_notifications SET next_at=0');
		await deliverGM(db, env, async () => {
			throw new Error('secret-token must never persist');
		});
		row = db.prepare('SELECT * FROM gm_notifications').get();
		assert.equal(row.status, 'uncertain');
		assert.ok(!row.last_error.includes('secret-token'));
		await deliverGM(db, env, async () => {
			throw Error('Must not run');
		});
	} finally {
		db.close();
	}
});
test('crash recovery, revoked webhook and restored snapshots do not repeat sends', async () => {
	const db = openDatabase(':memory:'),
		copy = openDatabase(':memory:');
	try {
		enqueueGM(db, 'incident', 'i');
		await deliverGM(db, env, async () => Response.json({}, { status: 403 }));
		assert.equal(db.prepare('SELECT status FROM gm_notifications').get().status, 'failed');
		db.exec("UPDATE gm_notifications SET status='sending',next_at=0");
		await deliverGM(db, env, async () => {
			throw Error('No resend');
		});
		assert.equal(db.prepare('SELECT status FROM gm_notifications').get().status, 'uncertain');
		restoreRecovery(copy, exportRecovery(db));
		assert.equal(copy.prepare('SELECT status FROM gm_notifications').get().status, 'uncertain');
		assert.equal(
			gmReady({
				...env,
				DISCORD_GM_WEBHOOK_URL: 'https://evil.example/api/webhooks/1550997172982382723/token',
			}),
			false,
		);
	} finally {
		db.close();
		copy.close();
	}
});
test('message creation is idempotent and inbox is restricted to officers', async () => {
	const db = openDatabase(':memory:');
	try {
		db.prepare('INSERT INTO users VALUES(?,?,?,?)').run(
			'member',
			'Member',
			'member',
			new Date().toISOString(),
		);
		const id = randomUUID();
		let result;
		const ctx = {
			db,
			env,
			path: '/api/gm-messages',
			method: 'POST',
			user: { id: 'member' },
			body: async () => ({ requestId: id, subject: 'Private subject', message: 'Private message' }),
			send: (status, data) => {
				result = { status, data };
			},
			requirePermission: (p) => {
				if (p !== 'community.read') throw Error('Forbidden');
			},
		};
		await gmApi(ctx);
		await gmApi(ctx);
		assert.equal(result.status, 200);
		assert.equal(db.prepare('SELECT COUNT(*) n FROM gm_messages').get().n, 1);
		assert.equal(db.prepare('SELECT COUNT(*) n FROM gm_notifications').get().n, 1);
		await assert.rejects(gmApi({ ...ctx, method: 'GET' }), /Forbidden/);
		await assert.rejects(
			gmApi({
				...ctx,
				body: async () => ({
					requestId: randomUUID(),
					kind: 'incident',
					subject: 'Test',
					message: 'Test',
				}),
			}),
			/Forbidden/,
		);
	} finally {
		db.close();
	}
});

test('Discord legacy URLs and wait query are supported without allowing arbitrary endpoints', () => {
	assert.equal(
		gmReady({
			...env,
			DISCORD_GM_WEBHOOK_URL:
				'https://discordapp.com/api/webhooks/1550997172982382723/test.token/?wait=true',
		}),
		true,
	);
	assert.equal(
		gmReady({
			...env,
			DISCORD_GM_WEBHOOK_URL:
				'https://discord.com/developers/applications/1550997172982382723/webhooks',
		}),
		false,
	);
});
