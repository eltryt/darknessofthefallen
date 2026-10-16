import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { openDatabase } from '../src/db.mjs';
import { createApp } from '../src/app.mjs';
import { issueSession } from '../src/auth.mjs';
import { countPactClick, PACT_CLICKS } from '../public/home-events.js';

const ORIGIN = 'http://localhost:3000';

test('the title easter egg needs quick consecutive clicks', () => {
	let state = { clicks: 0, last: 0 };
	for (let i = 1; i < PACT_CLICKS; i++) {
		state = countPactClick(state, 10000 + i * 500);
		assert.equal(state.ready, false);
	}
	assert.equal(countPactClick(state, 10000 + PACT_CLICKS * 500).ready, true);
	// A pause restarts the count.
	assert.equal(countPactClick(state, 10000 + PACT_CLICKS * 500 + 5000).clicks, 1);
});

test('the secret Pact achievement is claimed once by members and stays hidden for others', async () => {
	const db = openDatabase(':memory:');
	const sessions = {};
	for (const [id, rank] of [
		['ana', 'member'],
		['bea', 'member'],
		['visit', 'visitor'],
	]) {
		db.prepare('INSERT INTO users VALUES(?,?,?,?)').run(id, 'Jugadora ' + id, rank, '2026-10-01');
		sessions[id] = issueSession(db, id);
	}
	const server = createServer(createApp(db, { APP_ORIGIN: ORIGIN }));
	await new Promise((r) => server.listen(0, '127.0.0.1', r));
	const call = async (path, who, method = 'GET') => {
		const s = sessions[who];
		const r = await fetch(`http://127.0.0.1:${server.address().port}${path}`, {
			method,
			headers: {
				Cookie: `session=${s.raw}`,
				...(method === 'POST'
					? { Origin: ORIGIN, 'Content-Type': 'application/json', 'X-CSRF-Token': s.csrf }
					: {}),
			},
			body: method === 'POST' ? '{}' : undefined,
		});
		return { status: r.status, body: await r.json() };
	};
	const pactOf = async (who) =>
		(await call('/api/achievements', who)).body.achievements.find((a) => a.id === 'pact');
	try {
		assert.equal((await pactOf('bea')).name, '???');
		assert.deepEqual((await call('/api/achievements/pact', 'ana', 'POST')).body, { first: true });
		assert.deepEqual((await call('/api/achievements/pact', 'ana', 'POST')).body, {
			first: false,
		});
		const mine = await pactOf('ana');
		assert.equal(mine.name, 'Pacto de los Caídos');
		assert.equal(mine.tier, 2);
		assert.equal((await call('/api/achievements', 'ana')).body.points, 25);
		assert.equal((await pactOf('bea')).name, '???');
		assert.equal((await call('/api/achievements/pact', 'visit', 'POST')).status, 403);
	} finally {
		server.close();
	}
});
