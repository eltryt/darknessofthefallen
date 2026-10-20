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
