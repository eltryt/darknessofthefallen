import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { openDatabase } from '../src/db.mjs';
import { createApp } from '../src/app.mjs';
import { issueSession } from '../src/auth.mjs';
import { spiralSquares, byLevel, specialSquares, walkRoute } from '../public/journey-board.js';

const ORIGIN = 'http://localhost:3000';

test('the journey shows members main characters with their level, to members only', async () => {
	const db = openDatabase(':memory:');
	const now = new Date().toISOString();
	const user = (id, rank) => {
		db.prepare('INSERT INTO users VALUES(?,?,?,?)').run(id, id, rank, now);
		return issueSession(db, id);
	};
	const character = (id, owner, level, { main = 1, archived = null, role = 'Tanque' } = {}) =>
		db
			.prepare(
				'INSERT INTO characters(id,user_id,name,class,role,is_main,level,archived_at,created_at) VALUES(?,?,?,?,?,?,?,?,?)',
			)
			.run(id, owner, id, 'Guerrero', role, main, level, archived, now);
	const sessions = {
		ana: user('ana', 'member'),
		bea: user('bea', 'raider'),
		vis: user('vis', 'visitor'),
	};
	user('old', 'member');
	character('Ana', 'ana', 60);
	character('Analt', 'ana', 12, { main: 0 });
	character('Bea', 'bea', 34, { role: 'Sanador' });
	character('Vis', 'vis', 50);
	character('Old', 'old', null);
	const server = createServer(createApp(db, { APP_ORIGIN: ORIGIN }));
	await new Promise((r) => server.listen(0, '127.0.0.1', r));
	const get = async (who) => {
		const r = await fetch(`http://127.0.0.1:${server.address().port}/api/journey`, {
			headers: who ? { Cookie: `session=${sessions[who].raw}` } : {},
		});
		return { status: r.status, body: await r.json() };
	};
	try {
		assert.equal((await get()).status, 401);
		assert.equal((await get('vis')).status, 403);
		const { status, body } = await get('ana');
		assert.equal(status, 200);
		assert.equal(body.maxLevel, 60);
		assert.deepEqual(
			body.players.map((p) => [p.name, p.level, p.me]),
			[
				['Ana', 60, true],
				['Bea', 34, false],
				['Old', null, false],
			],
			'mains of members only, highest first, without level last',
		);
		assert.deepEqual(body.ready, { Tanque: 1 });
		assert.ok(!('user_id' in body.players[0]), 'account ids stay private');
	} finally {
		await new Promise((r) => server.close(r));
		db.close();
	}
});

test('the board has 60 squares on a spiral that never overlap', () => {
	const squares = spiralSquares(60);
	assert.equal(squares.length, 60);
	assert.deepEqual(
		squares.map((s) => s.level),
		Array.from({ length: 60 }, (_, i) => i + 1),
	);
	for (const s of squares) assert.ok(s.x > 0 && s.x < 1000 && s.y > 0 && s.y < 1000);
	let closest = Infinity;
	for (let i = 0; i < squares.length; i++)
		for (let j = i + 1; j < squares.length; j++)
			closest = Math.min(
				closest,
				Math.hypot(squares[i].x - squares[j].x, squares[i].y - squares[j].y),
			);
	assert.ok(closest >= 64, `squares at least two radii apart (closest ${closest})`);
	assert.equal(specialSquares[60].kind, 'goal');
});

test('tokens group by level and leave characters without level aside', () => {
	const groups = byLevel([
		{ name: 'A', level: 10 },
		{ name: 'B', level: 10 },
		{ name: 'C', level: null },
	]);
	assert.deepEqual([...groups.keys()], [10]);
	assert.equal(groups.get(10).length, 2);
});

test('iconic squares carry a short label and a Classic phrase', () => {
	const kinds = new Set(['start', 'milestone', 'iconic', 'hazard', 'goal']);
	for (const [level, square] of Object.entries(specialSquares)) {
		assert.ok(Number(level) >= 1 && Number(level) <= 60, level);
		assert.ok(kinds.has(square.kind), level);
		assert.ok(square.label.length <= 11, square.label + ' fits under its square');
		assert.ok(square.phrase.length > 20 && square.phrase.length < 120, level);
	}
	assert.equal(specialSquares[1].kind, 'start');
	assert.equal(specialSquares[60].kind, 'goal');
});

test('tokens walk from square 1 to their own square, and to the centre at the cap', () => {
	const squares = spiralSquares(60);
	const to22 = walkRoute(squares, 22);
	assert.equal(to22.length, 22);
	assert.deepEqual(to22[0], [squares[0].x, squares[0].y]);
	assert.deepEqual(to22.at(-1), [squares[21].x, squares[21].y]);
	assert.deepEqual(walkRoute(squares, 60).at(-1), [500, 500]);
	assert.equal(walkRoute(squares, 1).length, 1, 'level 1 does not move');
});

test('reaching 60 is recorded, officers verify it and the first five verified get the medal', async () => {
	const db = openDatabase(':memory:');
	const now = new Date().toISOString();
	const sessions = {};
	const people = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6'];
	for (const [id, rank] of [...people.map((p) => [p, 'member']), ['ofi', 'officer']]) {
		db.prepare('INSERT INTO users VALUES(?,?,?,?)').run(id, id, rank, now);
		sessions[id] = issueSession(db, id);
		db.prepare(
			'INSERT INTO characters(id,user_id,name,class,role,is_main,level,created_at) VALUES(?,?,?,?,?,1,?,?)',
		).run('c-' + id, id, 'Pj ' + id, 'Mago', 'DPS distancia', 59, now);
	}
	const server = createServer(createApp(db, { APP_ORIGIN: ORIGIN }));
	await new Promise((r) => server.listen(0, '127.0.0.1', r));
	const call = async (path, who, method = 'GET') => {
		const s = sessions[who];
		const r = await fetch(`http://127.0.0.1:${server.address().port}${path}`, {
			method,
			headers: {
				Cookie: `session=${s.raw}`,
				...(method !== 'GET'
					? { Origin: ORIGIN, 'Content-Type': 'application/json', 'X-CSRF-Token': s.csrf }
					: {}),
			},
			...(method !== 'GET' ? { body: '{}' } : {}),
		});
		return { status: r.status, body: await r.json() };
	};
	try {
		const cap = (id) =>
			db.prepare('SELECT cap_reached_at,cap_verified_at FROM characters WHERE id=?').get(id);
		// The database records the moment, and a correction below 60 clears it.
		db.prepare("UPDATE characters SET level=60 WHERE id='c-p1'").run();
		assert.ok(cap('c-p1').cap_reached_at);
		assert.equal(
			(await call('/api/journey/c-p2/verification', 'ofi', 'PUT')).status,
			409,
			'not 60',
		);
		assert.equal((await call('/api/journey/c-p1/verification', 'p2', 'PUT')).status, 403);
		assert.equal((await call('/api/journey/c-p1/verification', 'ofi', 'PUT')).status, 200);
		db.prepare("UPDATE characters SET level=58 WHERE id='c-p1'").run();
		assert.deepEqual({ ...cap('c-p1') }, { cap_reached_at: null, cap_verified_at: null });
		// Six reach 60 in order; p1 comes back last. Only verified ones count.
		const order = ['p2', 'p3', 'p4', 'p5', 'p6', 'p1'];
		order.forEach((p, i) =>
			db
				.prepare('UPDATE characters SET level=60, cap_reached_at=? WHERE id=?')
				.run(`2026-11-${String(i + 5).padStart(2, '0')}T20:00:00.000Z`, 'c-' + p),
		);
		for (const p of order.filter((p) => p !== 'p3'))
			assert.equal((await call(`/api/journey/c-${p}/verification`, 'ofi', 'PUT')).status, 200);
		const board = (await call('/api/journey', 'p2')).body;
		assert.deepEqual(
			board.podium.map((x) => [x.name, x.place, x.tier]),
			[
				['Pj p2', 1, 3],
				['Pj p4', 2, 2],
				['Pj p5', 3, 2],
				['Pj p6', 4, 1],
				['Pj p1', 5, 1],
			],
			'p3 is not verified yet, so the rest move up',
		);
		assert.equal(board.canVerify, false);
		assert.equal((await call('/api/journey', 'ofi')).body.canVerify, true);
		const pending = board.players.find((x) => x.name === 'Pj p3');
		assert.deepEqual([pending.level, pending.verified], [60, false]);
		const medal = (who) =>
			call('/api/achievements', who).then((r) =>
				r.body.achievements.find((a) => a.id === 'pioneer'),
			);
		assert.equal((await medal('p2')).tier, 3, 'gold for the first');
		assert.equal((await medal('p5')).tier, 2, 'silver for the third');
		assert.equal((await medal('p3')).tier, 0, 'nothing until verified');
	} finally {
		await new Promise((r) => server.close(r));
		db.close();
	}
});
