import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { openDatabase } from '../src/db.mjs';
import { createApp } from '../src/app.mjs';
import { issueSession } from '../src/auth.mjs';

const ORIGIN = 'http://localhost:3000';
async function fixture() {
	const db = openDatabase(':memory:'),
		sessions = {};
	for (const [id, name, rank] of [
		['lead', 'Líder', 'leader'],
		['off', 'Oficial', 'officer'],
		['mem', 'Miembro', 'member'],
	]) {
		db.prepare('INSERT INTO users VALUES(?,?,?,?)').run(id, name, rank, '2026-11-06');
		sessions[id] = issueSession(db, id);
	}
	db.prepare(
		"INSERT INTO gm_messages VALUES('m1','incident','mem','Prueba','test','2026-11-06T03:15:47Z')",
	).run();
	const server = createServer(createApp(db, { APP_ORIGIN: ORIGIN }));
	await new Promise((r) => server.listen(0, '127.0.0.1', r));
	const call = async (who, path, method = 'GET', value) => {
		const s = sessions[who];
		const r = await fetch(`http://127.0.0.1:${server.address().port}${path}`, {
			method,
			headers: {
				Origin: ORIGIN,
				'Content-Type': 'application/json',
				Cookie: `session=${s.raw}`,
				'X-CSRF-Token': s.csrf,
			},
			...(value === undefined ? {} : { body: JSON.stringify(value) }),
		});
		return { status: r.status, body: await r.json() };
	};
	return { db, call, close: () => new Promise((r) => server.close(r)) };
}

test('a message becomes a case: status, officer, priority and a team thread', async () => {
	const f = await fixture();
	try {
		let inbox = (await f.call('lead', '/api/gm-cases')).body;
		assert.equal(inbox.messages[0].status, 'Nueva');
		assert.equal(inbox.messages[0].author_name, 'Miembro');
		assert.deepEqual(
			inbox.team.map((u) => u.name),
			['Líder', 'Oficial'],
		);
		// Taking a new case starts it.
		assert.equal(
			(await f.call('off', '/api/gm-messages/m1', 'PATCH', { assigneeId: 'off' })).status,
			200,
		);
		await f.call('lead', '/api/gm-messages/m1', 'PATCH', { priority: 'Urgente' });
		assert.equal(
			(await f.call('off', '/api/gm-messages/m1/notes', 'POST', { body: 'Lo miro esta noche' }))
				.status,
			201,
		);
		await f.call('off', '/api/gm-messages/m1', 'PATCH', { status: 'Resuelta' });
		inbox = (await f.call('lead', '/api/gm-cases')).body;
		const m = inbox.messages[0];
		assert.deepEqual([m.status, m.priority, m.assignee_name], ['Resuelta', 'Urgente', 'Oficial']);
		assert.ok(m.resolved_at);
		assert.deepEqual(
			m.notes.map((n) => [n.kind, n.author_name, n.body]),
			[
				['event', 'Oficial', 'se encarga del caso y cambió el estado a «En curso»'],
				['event', 'Líder', 'lo marcó como urgente'],
				['note', 'Oficial', 'Lo miro esta noche'],
				['event', 'Oficial', 'cambió el estado a «Resuelta»'],
			],
		);
		// Only someone from the team can take a case; only the author hides a note.
		assert.equal(
			(await f.call('lead', '/api/gm-messages/m1', 'PATCH', { assigneeId: 'mem' })).status,
			400,
		);
		const noteId = m.notes[2].id;
		assert.equal((await f.call('lead', `/api/gm-notes/${noteId}`, 'DELETE')).status, 403);
		assert.equal((await f.call('off', `/api/gm-notes/${noteId}`, 'DELETE')).status, 200);
		assert.equal(f.db.prepare('SELECT count(*) n FROM gm_case_notes').get().n, 4);
		assert.equal((await f.call('lead', '/api/gm-cases')).body.messages[0].notes.length, 3);
		// Members never see the cases.
		assert.equal((await f.call('mem', '/api/gm-cases')).status, 403);
		assert.equal(
			(await f.call('mem', '/api/gm-messages/m1/notes', 'POST', { body: 'x' })).status,
			403,
		);
		assert.equal(
			(await f.call('lead', '/api/gm-messages/nope', 'PATCH', { status: 'Resuelta' })).status,
			404,
		);
		assert.equal(
			(await f.call('lead', '/api/gm-messages/m1', 'PATCH', { status: 'Inventado' })).status,
			400,
		);
	} finally {
		await f.close();
	}
});
