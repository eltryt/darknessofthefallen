import test from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase } from '../src/db.mjs';
import {
	issueSession,
	currentSession,
	cookie,
	hash,
	SESSION_MAX_AGE_SECONDS,
} from '../src/auth.mjs';

test('sessions last seven days, observe local rank changes, expire and can be revoked', (t) => {
	const db = openDatabase(':memory:');
	try {
		const now = Date.now();
		t.mock.method(Date, 'now', () => now);
		db.prepare('INSERT INTO users VALUES(?,?,?,?)').run(
			'test-user',
			'Test',
			'member',
			new Date(now).toISOString(),
		);
		const session = issueSession(db, 'test-user');
		const req = { headers: { cookie: `session=${session.raw}` } };
		assert.equal(SESSION_MAX_AGE_SECONDS, 604800);
		assert.equal(
			db.prepare('SELECT expires FROM sessions WHERE hash=?').get(hash(session.raw)).expires,
			now + 604800000,
		);
		const header = cookie(
			'session',
			session.raw,
			{ APP_ORIGIN: 'https://guild.example' },
			SESSION_MAX_AGE_SECONDS,
		);
		assert.match(header, /HttpOnly; SameSite=Lax; Max-Age=604800; Secure/);
		t.mock.method(Date, 'now', () => now + 6 * 86400000);
		assert.equal(currentSession(db, req).rank, 'member');
		db.prepare('UPDATE users SET rank=? WHERE id=?').run('visitor', 'test-user');
		assert.equal(currentSession(db, req).rank, 'visitor');
		t.mock.method(Date, 'now', () => now + 604800000);
		assert.equal(currentSession(db, req), null);
		const fresh = issueSession(db, 'test-user');
		db.prepare('DELETE FROM sessions WHERE hash=?').run(hash(fresh.raw));
		assert.equal(currentSession(db, { headers: { cookie: `session=${fresh.raw}` } }), null);
	} finally {
		db.close();
	}
});
