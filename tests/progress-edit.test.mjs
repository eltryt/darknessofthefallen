import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { openDatabase } from '../src/db.mjs';
import { createApp } from '../src/app.mjs';
import { issueSession } from '../src/auth.mjs';

// A progress raid can be renamed and its bosses renamed, reordered, added or (if never
// attempted) removed, without losing the progress already recorded.
test('editing a progress raid keeps each boss and its progress', async () => {
	const db = openDatabase(':memory:');
	const now = new Date().toISOString();
	for (const [id, rank] of [
		['lead', 'leader'],
		['m', 'member'],
	])
		db.prepare('INSERT INTO users VALUES(?,?,?,?)').run(id, id, rank, now);
	const sessions = { lead: issueSession(db, 'lead'), m: issueSession(db, 'm') };
	const server = createServer(createApp(db, { APP_ORIGIN: 'http://localhost:3000' }));
	await new Promise((r) => server.listen(0, '127.0.0.1', r));
	const call = async (who, path, method = 'GET', value) => {
		const r = await fetch(`http://127.0.0.1:${server.address().port}${path}`, {
			method,
			headers: {
				Origin: 'http://localhost:3000',
				'Content-Type': 'application/json',
				Cookie: `session=${sessions[who].raw}`,
				'X-CSRF-Token': sessions[who].csrf,
			},
			...(value === undefined ? {} : { body: JSON.stringify(value) }),
		});
		return { status: r.status, body: await r.json().catch(() => null) };
	};
	try {
		const created = await call('lead', '/api/progress', 'POST', {
			name: 'Guarida de Onixya',
			bosses: ['Onyxia', 'Provisional'],
		});
		assert.equal(created.status, 201);
		const id = created.body.id;
		const [onyxia, provisional] = (await call('lead', '/api/progress')).body[0].data.bosses;
		await call('lead', `/api/progress/${id}/bosses/${onyxia.id}`, 'PATCH', {
			status: 'En progreso',
		});
		const path = '/api/progress/' + id;
		assert.equal((await call('m', path, 'PATCH', { name: 'X' })).status, 403);
		// The attempted boss cannot be dropped.
		assert.equal(
			(await call('lead', path, 'PATCH', { bosses: [{ id: provisional.id, name: 'Otro' }] }))
				.status,
			400,
		);
		assert.equal(
			(
				await call('lead', path, 'PATCH', {
					bosses: [{ id: onyxia.id, name: 'A' }, { name: 'a' }],
				})
			).status,
			400,
		);
		const ok = await call('lead', path, 'PATCH', {
			name: 'Guarida de Onyxia',
			difficulty: '40 jugadores',
			bosses: [{ name: 'Nuevo jefe' }, { id: onyxia.id, name: 'Onyxia' }],
		});
		assert.equal(ok.status, 200);
		const after = (await call('lead', '/api/progress')).body[0].data;
		assert.equal(after.name, 'Guarida de Onyxia');
		assert.equal(after.difficulty, '40 jugadores');
		assert.deepEqual(
			after.bosses.map((b) => [b.name, b.status]),
			[
				['Nuevo jefe', 'No intentado'],
				['Onyxia', 'En progreso'],
			],
		);
		assert.equal(after.bosses[1].id, onyxia.id);
		assert.ok(
			db.prepare("SELECT 1 FROM audit WHERE action='progress.edited' AND target=?").get(id),
		);
	} finally {
		await new Promise((r) => server.close(r));
		db.close();
	}
});
