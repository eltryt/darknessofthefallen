import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { generateKeyPairSync } from 'node:crypto';
import { openDatabase } from '../src/db.mjs';
import { createApp } from '../src/app.mjs';
import { issueSession } from '../src/auth.mjs';
import { encryptBackup, decryptBackup } from '../src/backup-crypto.mjs';
import { exportRecovery } from '../src/recovery.mjs';
import { repairGMRedirectFailures } from '../src/gm-notifications.mjs';

const TOKEN = 'a'.repeat(43);
const keys = () =>
	generateKeyPairSync('rsa', {
		modulusLength: 2048,
		publicKeyEncoding: { type: 'spki', format: 'pem' },
		privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
	});

async function serve(db, env) {
	const server = createServer(createApp(db, { APP_ORIGIN: 'http://localhost:3000', ...env }));
	await new Promise((r) => server.listen(0, '127.0.0.1', r));
	const call = async (path, { token, method = 'GET', body } = {}) => {
		const r = await fetch(`http://127.0.0.1:${server.address().port}${path}`, {
			method,
			headers: {
				...(token ? { Authorization: `Bearer ${token}` } : {}),
				...(body ? { 'Content-Type': 'application/json' } : {}),
			},
			body,
		});
		return { status: r.status, body: await r.json() };
	};
	return { call, close: () => server.close() };
}

test('encrypted backups only open with the matching private key and detect tampering', () => {
	const owner = keys(),
		stranger = keys();
	const snapshot = { exportedAt: '2026-10-17T04:17:00.000Z', users: [{ name: 'Ana' }] };
	const envelope = encryptBackup(snapshot, owner.publicKey);
	assert.ok(!JSON.stringify(envelope).includes('Ana'));
	assert.deepEqual(decryptBackup(envelope, owner.privateKey), snapshot);
	assert.throws(() => decryptBackup(envelope, stranger.privateKey), /clave privada/);
	const data = Buffer.from(envelope.data, 'base64');
	data[0] ^= 1;
	assert.throws(
		() => decryptBackup({ ...envelope, data: data.toString('base64') }, owner.privateKey),
		/dañada/,
	);
});

test('backup endpoints need the dedicated token and do not exist without it', async () => {
	const db = openDatabase(':memory:');
	db.prepare('INSERT INTO users VALUES(?,?,?,?)').run('leader', 'Líder', 'leader', '2026-10-01');
	const leader = issueSession(db, 'leader');
	const off = await serve(db, {});
	try {
		assert.equal((await off.call('/api/backup', { token: TOKEN })).status, 404);
	} finally {
		off.close();
	}
	const on = await serve(db, { BACKUP_TOKEN: TOKEN });
	try {
		assert.equal((await on.call('/api/backup')).status, 401);
		assert.equal((await on.call('/api/backup', { token: TOKEN + 'x' })).status, 401);
		const ok = await on.call('/api/backup', { token: TOKEN });
		assert.equal(ok.status, 200);
		assert.equal(ok.body.users[0].id, 'leader');
		assert.ok(!JSON.stringify(ok.body).includes(leader.raw));
		// A live database is never overwritten, even with a valid copy.
		const refused = await on.call('/api/restore', {
			token: TOKEN,
			method: 'POST',
			body: JSON.stringify(ok.body),
		});
		assert.equal(refused.status, 409);
		assert.match(refused.body.error, /vacía/);
	} finally {
		on.close();
	}
});

test('a copy restores into an empty database through the API', async () => {
	const source = openDatabase(':memory:');
	source.prepare('INSERT INTO users VALUES(?,?,?,?)').run('ana', 'Ana', 'member', '2026-10-01');
	const snapshot = JSON.parse(JSON.stringify(exportRecovery(source)));
	const empty = openDatabase(':memory:');
	// A fresh Durable Object audits this repair on start; it is not guild data.
	repairGMRedirectFailures(empty);
	const app = await serve(empty, { BACKUP_TOKEN: TOKEN });
	try {
		const restored = await app.call('/api/restore', {
			token: TOKEN,
			method: 'POST',
			body: JSON.stringify(snapshot),
		});
		assert.equal(restored.status, 200);
		assert.equal(restored.body.verified, true);
		assert.equal(empty.prepare('SELECT id FROM users').get().id, 'ana');
		const tampered = { ...snapshot, settings: { ...snapshot.settings, name: 'Otra' } };
		const second = openDatabase(':memory:');
		const other = await serve(second, { BACKUP_TOKEN: TOKEN });
		try {
			const bad = await other.call('/api/restore', {
				token: TOKEN,
				method: 'POST',
				body: JSON.stringify(tampered),
			});
			assert.equal(bad.status, 409);
			assert.match(bad.body.error, /checksum/);
		} finally {
			other.close();
		}
	} finally {
		app.close();
	}
});
