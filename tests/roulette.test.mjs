import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { openDatabase } from '../src/db.mjs';
import { createApp } from '../src/app.mjs';
import { issueSession } from '../src/auth.mjs';
import { playTable, playable, rollOf, spinNumber } from '../src/roulette.mjs';
import { exportRecovery, restoreRecovery } from '../src/recovery.mjs';

const ORIGIN = 'http://localhost:3000';
const sequence =
	(...numbers) =>
	() =>
		numbers.shift();

test('each pocket is worth 1 to M gold, rounding halves up', () => {
	assert.deepEqual(
		[0, 18, 36].map((r) => rollOf(r, 100)),
		[1, 51, 100],
	);
	// 17 × 1 / 36 rounds down, 18 × 1 / 36 is a half and rounds up.
	assert.deepEqual(
		[0, 17, 18, 36].map((r) => rollOf(r, 2)),
		[1, 1, 2, 2],
	);
	assert.equal(rollOf(36, 1000), 1000);
	for (let i = 0; i < 2000; i++) {
		const n = spinNumber();
		assert.ok(Number.isInteger(n) && n >= 0 && n <= 36);
	}
});

test('the lowest result pays the highest the difference; ties replace results', () => {
	// Pockets 29 → 81, 11 → 31, 18 → 51 at a table of 100.
	const plain = playTable(['a', 'b', 'c'], 100, sequence(29, 11, 18));
	assert.deepEqual([plain.winner, plain.loser, plain.high, plain.low], ['a', 'b', 81, 31]);
	assert.equal(plain.spins.length, 3);
	// a and b tie at 100. Their new spins (1 and 51) replace the old results, so a now ties
	// c at the bottom; a's next spin (100) wins and c's (pocket 9 → 26) loses.
	const tied = playTable(['a', 'b', 'c'], 100, sequence(36, 36, 0, 0, 18, 36, 9));
	assert.deepEqual([tied.winner, tied.loser, tied.high, tied.low], ['a', 'c', 100, 26]);
	assert.deepEqual(
		tied.spins.slice(3).map((s) => [s.round, s.kind, s.userId, s.roll]),
		[
			[2, 'high', 'a', 1],
			[2, 'high', 'b', 51],
			[3, 'low', 'a', 100],
			[3, 'low', 'c', 26],
		],
	);
	// Everyone on the same result: the whole table spins again, never a zero payment.
	const again = playTable(['a', 'b'], 100, sequence(7, 7, 0, 36));
	assert.deepEqual([again.winner, again.loser, again.high, again.low], ['b', 'a', 100, 1]);
	assert.deepEqual(
		again.spins.map((s) => s.round),
		[1, 1, 2, 2],
	);
	// Different pockets worth the same gold are a tie: at a table of 2, pockets 0 and 17 are 1.
	const small = playTable(['a', 'b'], 2, sequence(0, 17, 36, 0));
	assert.deepEqual([small.winner, small.loser, small.high - small.low], ['a', 'b', 1]);
	// Big tables always end with one winner and one loser, paying at most M − 1.
	for (const M of [3, 100]) {
		const g = playTable(
			Array.from({ length: 40 }, (_, i) => 'p' + i),
			M,
		);
		assert.ok(g.winner !== g.loser && g.high - g.low >= 1 && g.high - g.low <= M - 1);
	}
	assert.equal(playable(3, 2), false);
	assert.equal(playable(2, 2), true);
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
		// Over the default limit of 1000 gold, and under the minimum of 2.
		assert.equal((await call('ana', '/api/roulette', 'POST', { stake: 1001 })).status, 400);
		assert.equal((await call('ana', '/api/roulette', 'POST', { stake: 1 })).status, 400);
		const opened = await call('ana', '/api/roulette', 'POST', { stake: 100 });
		assert.equal(opened.status, 201);
		const table = opened.body.open[0];
		assert.deepEqual(
			table.players.map((p) => [p.name, p.class]),
			[['Anaïs', 'Mago']],
		);
		assert.equal(table.canSpin, false);
		assert.equal((await call('ana', '/api/roulette', 'POST', { stake: 50 })).status, 409);
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
		// The lowest pays the highest the difference between their results.
		assert.equal(result.amount, result.high - result.low);
		assert.ok(result.low >= 1 && result.high <= 100);
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
		const big = await call('bea', '/api/roulette', 'POST', { stake: 2500 });
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
