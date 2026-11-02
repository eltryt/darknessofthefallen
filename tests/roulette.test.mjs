import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { openDatabase } from '../src/db.mjs';
import { createApp } from '../src/app.mjs';
import { issueSession } from '../src/auth.mjs';
import { playTable, spinNumber } from '../src/roulette.mjs';
import { exportRecovery, restoreRecovery } from '../src/recovery.mjs';

const ORIGIN = 'http://localhost:3000';
const sequence =
	(...numbers) =>
	() =>
		numbers.shift();

test('the lowest number pays the highest, and ties spin again among the tied', () => {
	const plain = playTable(['a', 'b', 'c'], sequence(30, 4, 17));
	assert.deepEqual([plain.winner, plain.loser, plain.high, plain.low], ['a', 'b', 30, 4]);
	assert.equal(plain.spins.length, 3);
	// a and c tie at the top; b and d at the bottom.
	const tied = playTable(['a', 'b', 'c', 'd'], sequence(20, 3, 20, 3, 8, 12, 5, 1));
	assert.deepEqual([tied.winner, tied.loser, tied.high, tied.low], ['c', 'd', 20, 3]);
	assert.deepEqual(
		tied.spins.slice(4).map((s) => [s.kind, s.userId, s.number]),
		[
			['high', 'a', 8],
			['high', 'c', 12],
			['low', 'b', 5],
			['low', 'd', 1],
		],
	);
	// Everyone on the same number: the whole table spins again.
	const again = playTable(['a', 'b'], sequence(7, 7, 0, 36));
	assert.deepEqual([again.winner, again.loser, again.high, again.low], ['b', 'a', 36, 0]);
	assert.deepEqual(
		again.spins.map((s) => s.round),
		[1, 1, 2, 2],
	);
	for (let i = 0; i < 2000; i++) {
		const n = spinNumber();
		assert.ok(Number.isInteger(n) && n >= 0 && n <= 36);
	}
});

test('members open tables, join, spin and the winner marks the gold as collected', async () => {
	const db = openDatabase(':memory:');
	const now = new Date().toISOString();
	const user = (id, rank) => {
		db.prepare('INSERT INTO users VALUES(?,?,?,?)').run(id, id, rank, now);
		return issueSession(db, id);
	};
	const sessions = {
		ana: user('ana', 'member'),
		bea: user('bea', 'raider'),
		cid: user('cid', 'member'),
		gm: user('gm', 'leader'),
		vis: user('vis', 'visitor'),
	};
	db.prepare(
		'INSERT INTO characters(id,user_id,name,class,role,is_main,created_at) VALUES(?,?,?,?,?,?,?)',
	).run('c1', 'ana', 'Anaïs', 'Mago', 'DPS distancia', 1, now);
	const server = createServer(createApp(db, { APP_ORIGIN: ORIGIN }));
	await new Promise((r) => server.listen(0, '127.0.0.1', r));
	const call = async (who, path, method = 'GET', value) => {
		const s = sessions[who];
		const r = await fetch(`http://127.0.0.1:${server.address().port}${path}`, {
			method,
			headers: {
				...(s ? { Cookie: `session=${s.raw}`, 'X-CSRF-Token': s.csrf } : {}),
				Origin: ORIGIN,
				'Content-Type': 'application/json',
			},
			...(value !== undefined ? { body: JSON.stringify(value) } : {}),
		});
		return { status: r.status, body: await r.json() };
	};
	try {
		assert.equal((await call(null, '/api/roulette')).status, 401);
		assert.equal((await call('vis', '/api/roulette')).status, 403);
		const empty = await call('ana', '/api/roulette');
		assert.equal(empty.body.maxBet, 1000);
		assert.equal(empty.body.canConfigure, false);
		// 28 × 36 = 1008 is over the default limit of 1000 gold.
		assert.equal((await call('ana', '/api/roulette', 'POST', { stake: 28 })).status, 400);
		const opened = await call('ana', '/api/roulette', 'POST', { stake: 10 });
		assert.equal(opened.status, 201);
		const table = opened.body.open[0];
		assert.deepEqual(
			table.players.map((p) => [p.name, p.class]),
			[['Anaïs', 'Mago']],
		);
		assert.equal(table.canSpin, false);
		assert.equal((await call('ana', '/api/roulette', 'POST', { stake: 5 })).status, 409);
		assert.equal((await call('ana', `/api/roulette/${table.id}/players`, 'DELETE')).status, 409);
		await call('bea', `/api/roulette/${table.id}/players`, 'PUT');
		await call('cid', `/api/roulette/${table.id}/players`, 'PUT');
		await call('cid', `/api/roulette/${table.id}/players`, 'DELETE');
		assert.equal((await call('bea', `/api/roulette/${table.id}/spin`, 'POST')).status, 403);
		const spun = await call('ana', `/api/roulette/${table.id}/spin`, 'POST');
		assert.equal(spun.status, 200);
		assert.equal(spun.body.open.length, 0);
		const [result] = spun.body.recent;
		assert.deepEqual(result.players.map((p) => p.id).sort(), ['ana', 'bea']);
		assert.ok(result.spins.length >= 2);
		assert.equal(result.amount, (result.high - result.low) * 10);
		assert.ok(result.high > result.low);
		assert.notEqual(result.winner.id, result.loser.id);
		assert.equal(spun.body.pending.length, 1);
		assert.equal(
			(await call(result.loser.id, `/api/roulette/${table.id}/settled`, 'PUT')).status,
			403,
		);
		const settled = await call(result.winner.id, `/api/roulette/${table.id}/settled`, 'PUT');
		assert.equal(settled.body.pending.length, 0);
		const winner = settled.body.ranking.find((r) => r.id === result.winner.id);
		assert.deepEqual([winner.won, winner.net, winner.wins], [result.amount, result.amount, 1]);
		assert.equal((await call('ana', `/api/roulette/${table.id}/spin`, 'POST')).status, 409);
		// The GM raises the limit; officers can cancel any open table.
		assert.equal(
			(await call('ana', '/api/roulette/settings', 'PUT', { maxBet: 5000 })).status,
			403,
		);
		const limit = await call('gm', '/api/roulette/settings', 'PUT', { maxBet: 5000 });
		assert.equal(limit.body.maxBet, 5000);
		const big = await call('bea', '/api/roulette', 'POST', { stake: 100 });
		assert.equal(big.status, 201);
		await call('gm', `/api/roulette/${big.body.open[0].id}/cancel`, 'POST');
		assert.equal(
			db.prepare("SELECT COUNT(*) AS n FROM roulette_tables WHERE status='cancelled'").get().n,
			1,
		);
	} finally {
		server.close();
	}
	// Tables, seats and spins travel with the backup.
	const snapshot = exportRecovery(db);
	const restored = openDatabase(':memory:');
	const counts = restoreRecovery(restored, snapshot).counts;
	assert.deepEqual(
		[counts.roulette_tables, counts.roulette_players, counts.roulette_spins],
		[
			2,
			db.prepare('SELECT COUNT(*) AS n FROM roulette_players').get().n,
			db.prepare('SELECT COUNT(*) AS n FROM roulette_spins').get().n,
		],
	);
});

test('the ball always ends over the pocket of the drawn number', async () => {
	const { WHEEL, spinAngles, colorOf } = await import('../public/roulette.js');
	assert.equal(WHEEL.length, 37);
	assert.deepEqual(
		[...WHEEL].sort((a, b) => a - b),
		Array.from({ length: 37 }, (_, i) => i),
	);
	assert.deepEqual([colorOf(0), colorOf(32), colorOf(15)], ['green', 'red', 'black']);
	let wheel = 0,
		ball = 0;
	for (let i = 0; i < 500; i++) {
		const n = i % 37,
			next = spinAngles(wheel, ball, n, (i * 97) % 360);
		const relative = (((next.ball - next.wheel) % 360) + 360) % 360;
		assert.ok(Math.abs(relative - WHEEL.indexOf(n) * (360 / 37)) < 1e-6);
		assert.ok(next.wheel > wheel && next.ball <= ball - 1440);
		wheel = next.wheel % 360;
		ball = next.ball % 360;
	}
});
