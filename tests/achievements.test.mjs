import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { openDatabase } from '../src/db.mjs';
import { createApp } from '../src/app.mjs';
import { issueSession } from '../src/auth.mjs';
import { refreshAchievements } from '../src/achievements.mjs';

const SINCE = '2026-01-01T00:00:00.000Z';

async function fixture() {
	const db = openDatabase(':memory:');
	db.prepare("UPDATE settings SET data=json_set(data,'$.achievementsSince',?) WHERE id=1").run(
		SINCE,
	);
	const sessions = {};
	for (const [id, rank] of [
		['ana', 'member'],
		['bea', 'raider'],
		['visit', 'visitor'],
	]) {
		db.prepare('INSERT INTO users VALUES(?,?,?,?)').run(id, 'Jugadora ' + id, rank, SINCE);
		sessions[id] = issueSession(db, id);
	}
	const server = createServer(createApp(db, { APP_ORIGIN: 'http://localhost:3000' }));
	await new Promise((r) => server.listen(0, '127.0.0.1', r));
	const request = async (path, who) => {
		const s = sessions[who];
		const r = await fetch(`http://127.0.0.1:${server.address().port}${path}`, {
			headers: s ? { Cookie: `session=${s.raw}` } : {},
		});
		return { status: r.status, body: await r.json() };
	};
	let n = 0;
	// One raid per call on the given Madrid evening, with attendance for each player.
	const raid = (day, statuses) => {
		const id = 'r' + ++n;
		db.prepare('INSERT INTO raids(id,title,starts_at) VALUES(?,?,?)').run(
			id,
			'Raid',
			`${day}T20:00:00.000Z`,
		);
		for (const [user, status] of Object.entries(statuses))
			db.prepare('INSERT INTO attendance(id,raid_id,user_id,status) VALUES(?,?,?,?)').run(
				id + user,
				id,
				user,
				status,
			);
		return id;
	};
	return {
		db,
		request,
		raid,
		close: async () => {
			await new Promise((r) => server.close(r));
			db.close();
		},
	};
}
const find = (body, id) => body.achievements.find((a) => a.id === id);

test('attendance tiers count from activation; bench counts, late does not count as punctual', async () => {
	const f = await fixture();
	try {
		f.raid('2025-12-20', { ana: 'Asistió' }); // before activation: ignored
		const days = Array.from(
			{ length: 10 },
			(_, i) => `2026-02-${String(i * 2 + 2).padStart(2, '0')}`,
		);
		days.forEach((d, i) =>
			f.raid(d, { ana: i < 7 ? 'Asistió' : i < 9 ? 'Llegó tarde' : 'Reserva', bea: 'Ausente' }),
		);
		const me = (await f.request('/api/achievements', 'ana')).body;
		assert.equal(find(me, 'present').value, 10);
		assert.equal(find(me, 'present').tier, 1);
		assert.equal(find(me, 'present').next, 25);
		assert.equal(find(me, 'punctual').value, 7);
		assert.equal(find(me, 'punctual').tier, 0);
		assert.equal(find(me, 'bench').value, 1);
		// Three of those raids fall in one week: the secret Maratón (silver) unlocks too.
		assert.equal(find(me, 'marathon').tier, 2);
		const points = { 1: 10, 2: 25, 3: 50 };
		assert.equal(
			me.points,
			me.achievements.flatMap((a) => a.earned).reduce((n, e) => n + points[e.tier], 0),
		);
		const bea = (await f.request('/api/achievements', 'bea')).body;
		assert.equal(find(bea, 'present').value, 0);
		assert.equal(bea.leaderboard.me.rank, 2);
		assert.deepEqual(
			bea.leaderboard.top.map((m) => [m.rank, m.points]),
			[
				[1, me.points],
				[2, 0],
			],
		);
	} finally {
		await f.close();
	}
});

test('streaks follow guild raid weeks; secrets stay hidden until earned', async () => {
	const f = await fixture();
	try {
		// Four consecutive raid weeks for ana; bea misses the third.
		for (const [i, d] of ['2026-03-02', '2026-03-09', '2026-03-16', '2026-03-23'].entries())
			f.raid(d, { ana: 'Asistió', bea: i === 2 ? 'Ausente' : 'Asistió' });
		// A week without guild raids does not break the streak; three raids in a week.
		for (const d of ['2026-04-06', '2026-04-07', '2026-04-08']) f.raid(d, { ana: 'Asistió' });
		const ana = (await f.request('/api/achievements', 'ana')).body;
		assert.equal(find(ana, 'streak').value, 5);
		assert.equal(find(ana, 'streak').tier, 1);
		assert.equal(find(ana, 'marathon').name, 'Maratón');
		assert.equal(find(ana, 'marathon').tier, 2);
		const bea = (await f.request('/api/achievements', 'bea')).body;
		assert.equal(find(bea, 'streak').value, 2);
		assert.equal(find(bea, 'marathon').name, '???');
		assert.equal(find(bea, 'marathon').value, null);
		assert.equal(find(bea, 'phoenix').help.includes('mes'), false);
	} finally {
		await f.close();
	}
});

test('first kills are witnessed by the players present that evening', async () => {
	const f = await fixture();
	try {
		f.raid('2026-05-05', { ana: 'Asistió', bea: 'Ausente' });
		f.db.prepare('INSERT INTO progress(id,data) VALUES(?,?)').run(
			'p',
			JSON.stringify({
				name: 'Guarida',
				bosses: [
					{ id: 'b', name: 'Jefe', status: 'Derrotado', firstKill: '2026-05-05T21:30:00.000Z' },
				],
			}),
		);
		const ana = (await f.request('/api/achievements', 'ana')).body;
		assert.equal(find(ana, 'witness').tier, 1);
		assert.equal(find(ana, 'conqueror').tier, 3);
		assert.equal(find((await f.request('/api/achievements', 'bea')).body, 'witness').tier, 0);
		const guild = (await f.request('/api/public')).body.guildAchievements;
		assert.equal(guild.find((a) => a.id === 'first-blood').tier, 1);
		assert.equal(guild.find((a) => a.id === 'raid-cleared').tier, 3);
		assert.ok(!JSON.stringify(guild).includes('ana'));
	} finally {
		await f.close();
	}
});

test('earned medals are kept when records change, and access needs a member', async () => {
	const f = await fixture();
	try {
		for (let i = 1; i <= 10; i++)
			f.raid(`2026-06-${String(i).padStart(2, '0')}`, { ana: 'Asistió' });
		refreshAchievements(f.db);
		f.db.exec('DELETE FROM attendance');
		const ana = (await f.request('/api/achievements', 'ana')).body;
		assert.equal(find(ana, 'present').tier, 1);
		assert.equal(find(ana, 'present').value, 0);
		assert.equal((await f.request('/api/achievements')).status, 401);
		assert.equal((await f.request('/api/achievements', 'visit')).status, 403);
	} finally {
		await f.close();
	}
});
