import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { openDatabase } from '../src/db.mjs';
import { createApp } from '../src/app.mjs';
import { issueSession } from '../src/auth.mjs';
import { audit } from '../src/database-core.mjs';

test('the audit names people and characters, and filters failures or a name', async () => {
	const db = openDatabase(':memory:');
	const now = new Date().toISOString();
	db.prepare('INSERT INTO users VALUES(?,?,?,?)').run('o1', 'Oficial', 'officer', now);
	db.prepare('INSERT INTO users VALUES(?,?,?,?)').run('m1', 'Miembro', 'member', now);
	db.prepare(
		"INSERT INTO characters(id,user_id,name,class,role,created_at) VALUES('c1','m1','Tryt','Brujo','DPS distancia',?)",
	).run(now);
	audit(db, 'm1', 'character.updated', 'c1', { level: 10 });
	audit(db, 'login:discord', 'auth.discord_failed', '42', {
		reason: 'not_in_guild',
		name: 'Infusiones',
	});
	const session = issueSession(db, 'o1');
	const server = createServer(createApp(db, { APP_ORIGIN: 'http://localhost:3000' }));
	await new Promise((r) => server.listen(0, '127.0.0.1', r));
	const get = (q = '') =>
		fetch(`http://127.0.0.1:${server.address().port}/api/audit${q}`, {
			headers: { cookie: `session=${session.raw}` },
		}).then((r) => r.json());
	try {
		const all = await get();
		const edit = all.find((r) => r.action === 'character.updated');
		assert.deepEqual([edit.actor_name, edit.target_name], ['Miembro', 'Tryt']);
		assert.deepEqual(
			(await get('?kind=failed')).map((r) => r.action),
			['auth.discord_failed'],
		);
		assert.deepEqual(
			(await get('?q=infus')).map((r) => r.target),
			['42'],
		);
		assert.deepEqual(
			(await get('?q=Miembro')).map((r) => r.action),
			['character.updated'],
		);
	} finally {
		server.close();
	}
});
