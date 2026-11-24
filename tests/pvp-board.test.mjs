import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { openDatabase } from '../src/db.mjs';
import { createApp } from '../src/app.mjs';
import { issueSession } from '../src/auth.mjs';

const ORIGIN = 'http://localhost:3000';

test('the PvP board ranks members mains by honor rank and kills, to members only', async () => {
	const db = openDatabase(':memory:');
	const now = new Date().toISOString();
	const user = (id, rank) => {
		db.prepare('INSERT INTO users VALUES(?,?,?,?)').run(id, id, rank, now);
		return issueSession(db, id);
	};
	const character = (id, owner, pvpRank, kills, { main = 1 } = {}) =>
		db
			.prepare(
				'INSERT INTO characters(id,user_id,name,class,role,is_main,pvp_rank,honorable_kills,created_at) VALUES(?,?,?,?,?,?,?,?,?)',
			)
			.run(id, owner, id, 'Pícaro', 'DPS melee', main, pvpRank, kills, now);
	const sessions = { ana: user('ana', 'member'), vis: user('vis', 'visitor') };
	user('bea', 'raider');
	user('cai', 'member');
	user('dan', 'member');
	character('Ana', 'ana', 0, 526);
	character('Analt', 'ana', 9, 9000, { main: 0 });
	character('Bea', 'bea', 3, 93);
	character('Cai', 'cai', 0, 0);
	character('Dan', 'dan', null, null);
	character('Vis', 'vis', 14, 99999);
	const server = createServer(createApp(db, { APP_ORIGIN: ORIGIN }));
	await new Promise((r) => server.listen(0, '127.0.0.1', r));
	const get = async (who) => {
		const r = await fetch(`http://127.0.0.1:${server.address().port}/api/pvp`, {
			headers: who ? { Cookie: `session=${sessions[who].raw}` } : {},
		});
		return { status: r.status, body: await r.json() };
	};
	try {
		assert.equal((await get()).status, 401);
		assert.equal((await get('vis')).status, 403);
		const { status, body } = await get('ana');
		assert.equal(status, 200);
		assert.deepEqual(
			body.players.map((p) => [p.name, p.rank, p.kills, p.me]),
			[
				['Bea', 3, 93, false],
				['Ana', 0, 526, true],
				['Cai', 0, 0, false],
				['Dan', null, null, false],
			],
			'mains of members only, highest rank first, without data last',
		);
		assert.equal(body.ranks.length, 15);
		assert.deepEqual(body.ranks[0], ['Ana', 'Cai']);
		assert.deepEqual(body.ranks[3], ['Bea']);
		assert.deepEqual(
			body.podium.map((p) => p.id),
			['Ana', 'Bea'],
			'podium by kills, nobody with none',
		);
		assert.equal(body.totalKills, 619);
		assert.equal(body.ranked, 1);
		assert.ok(!('user_id' in body.players[0]), 'account ids stay private');
	} finally {
		server.close();
	}
});
