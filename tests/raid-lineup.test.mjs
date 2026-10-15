import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { openDatabase } from '../src/db.mjs';
import { createApp } from '../src/app.mjs';
import { issueSession } from '../src/auth.mjs';
import { deliverCallups, callupMessage } from '../src/raid-lineup.mjs';

const bot = { DISCORD_DM_ENABLED: 'true', DISCORD_BOT_TOKEN: 'x'.repeat(60) };
const signup = (id, userId, name, roleName) => ({
	id,
	userId,
	name,
	className: 'Mage',
	specName: 'Frost',
	roleName,
	status: 'primary',
});

async function fixture(extraEnv = {}) {
	const db = openDatabase(':memory:'),
		sessions = {};
	for (const [id, rank] of [
		['leader', 'leader'],
		['rl', 'raid_leader'],
		['other-rl', 'raid_leader'],
		['m1', 'member'],
		['m2', 'member'],
	]) {
		db.prepare('INSERT INTO users VALUES(?,?,?,?)').run(id, 'Usuario ' + id, rank, '2026-10-15');
		sessions[id] = issueSession(db, id);
	}
	db.prepare(
		"INSERT INTO characters(id,user_id,name,class,role,is_main,created_at) VALUES('c1','m1','Uno','Mago','DPS distancia',1,'2026-10-15')",
	).run();
	const signups = [
		signup('s1', 'm1', 'Uno', 'Ranged'),
		signup('s2', 'm2', 'Dos', 'Tank'),
		signup('s3', 'discord-only', 'Tres', 'Healer'),
		...Array.from({ length: 4 }, (_, i) => signup('x' + i, 'extra' + i, 'Extra ' + i, 'Melee')),
	];
	db.prepare(
		"INSERT INTO raid_events(id,channel_id,organizer_id,title,starts_at,capacity,state,raw,updated_at) VALUES('e1','ch','rl','Guarida de prueba','2030-01-01T22:00:00Z',20,'Abierta',?,'2026-10-15')",
	).run(JSON.stringify({ signUps: signups }));
	db.prepare(
		"INSERT INTO raids(id,title,starts_at,source) VALUES('e1','Guarida de prueba','2030-01-01T22:00:00Z','raid-helper')",
	).run();
	const env = { APP_ORIGIN: 'http://localhost:3000', ...extraEnv };
	const server = createServer(createApp(db, env));
	await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
	const request = async (path, who, method = 'GET', value) => {
		const session = sessions[who];
		const r = await fetch(`http://127.0.0.1:${server.address().port}${path}`, {
			method,
			headers: {
				Origin: 'http://localhost:3000',
				'Content-Type': 'application/json',
				...(session ? { Cookie: `session=${session.raw}`, 'X-CSRF-Token': session.csrf } : {}),
			},
			...(value === undefined ? {} : { body: JSON.stringify(value) }),
		});
		return { status: r.status, body: await r.json() };
	};
	return {
		db,
		env,
		request,
		close: async () => {
			await new Promise((resolve) => server.close(resolve));
			db.close();
		},
	};
}
// Fake Discord: records calls and answers each request with the next scripted response.
function fakeDiscord(script) {
	const calls = [];
	const transport = async (url, options) => {
		calls.push({ url, body: JSON.parse(options.body), auth: options.headers.Authorization });
		const next = script.shift() || { status: 200, data: { id: 'msg' } };
		if (next.throw) throw new Error('network');
		return { status: next.status, json: async () => next.data };
	};
	return { calls, transport };
}

test('only the event organiser, officers and the leader manage a lineup', async () => {
	const f = await fixture();
	try {
		assert.equal((await f.request('/api/events/e1/lineup')).status, 401);
		assert.equal((await f.request('/api/events/e1/lineup', 'm1')).status, 403);
		assert.equal((await f.request('/api/events/e1/lineup', 'other-rl')).status, 403);
		const view = await f.request('/api/events/e1/lineup', 'rl');
		assert.equal(view.status, 200);
		assert.equal(view.body.event.groups, 4);
		assert.equal(view.body.signups.length, 7);
		assert.equal(view.body.signups.find((s) => s.id === 's1').characterId, 'c1');
		assert.equal(view.body.signups.find((s) => s.id === 's3').registered, false);
		assert.equal((await f.request('/api/events/e1/lineup', 'leader')).status, 200);
	} finally {
		await f.close();
	}
});

test('lineups validate groups, size, duplicates and concurrent edits', async () => {
	const f = await fixture();
	try {
		const save = (slots, revision = 0) =>
			f.request('/api/events/e1/lineup', 'rl', 'PUT', { revision, slots });
		assert.equal((await save([{ signupId: 's1', slot: 'group:9' }])).status, 400);
		assert.equal((await save([{ signupId: 'missing', slot: 'group:1' }])).status, 400);
		assert.equal(
			(
				await save([
					{ signupId: 's1', slot: 'group:1' },
					{ signupId: 's1', slot: 'bench' },
				])
			).status,
			400,
		);
		const six = ['s1', 's2', 's3', 'x0', 'x1', 'x2'].map((signupId) => ({
			signupId,
			slot: 'group:1',
		}));
		assert.equal((await save(six)).status, 400);
		const ok = await save([
			{ signupId: 's1', slot: 'group:1' },
			{ signupId: 's2', slot: 'group:1' },
			{ signupId: 's3', slot: 'bench' },
		]);
		assert.equal(ok.status, 200);
		assert.equal(ok.body.lineup.revision, 1);
		assert.deepEqual(ok.body.slots, { s1: 'group:1', s2: 'group:1', s3: 'bench' });
		// A stale revision is rejected instead of overwriting someone else's work.
		assert.equal((await save([], 0)).status, 409);
	} finally {
		await f.close();
	}
});

test('sending without a bot records call-ups for profiles but sends no messages', async () => {
	const f = await fixture();
	try {
		await f.request('/api/events/e1/lineup', 'rl', 'PUT', {
			revision: 0,
			slots: [{ signupId: 's1', slot: 'bench' }],
		});
		assert.equal(
			(await f.request('/api/events/e1/lineup/send', 'rl', 'POST', { revision: 1 })).status,
			400,
		);
		await f.request('/api/events/e1/lineup', 'rl', 'PUT', {
			revision: 1,
			slots: [
				{ signupId: 's1', slot: 'group:2' },
				{ signupId: 's3', slot: 'bench' },
			],
		});
		const sent = await f.request('/api/events/e1/lineup/send', 'rl', 'POST', { revision: 2 });
		assert.equal(sent.status, 200);
		assert.equal(sent.body.dmReady, false);
		assert.equal(sent.body.notified, 2);
		assert.deepEqual(
			f.db
				.prepare('SELECT DISTINCT dm_status FROM raid_callups')
				.all()
				.map((r) => r.dm_status),
			['skipped'],
		);
		const mine = await f.request('/api/callups/mine', 'm1');
		assert.equal(mine.body.length, 1);
		assert.equal(mine.body[0].slotLabel, 'Grupo 2');
		assert.equal((await f.request('/api/callups/mine', 'm2')).body.length, 0);
		assert.equal((await f.request('/api/events/e1/lineup/retry', 'rl', 'POST', {})).status, 503);
	} finally {
		await f.close();
	}
});

test('call-up messages are delivered, retried, and never replayed when uncertain', async () => {
	const f = await fixture(bot);
	try {
		await f.request('/api/events/e1/lineup', 'rl', 'PUT', {
			revision: 0,
			slots: [
				{ signupId: 's1', slot: 'group:1' },
				{ signupId: 's2', slot: 'group:1' },
				{ signupId: 's3', slot: 'bench' },
				{ signupId: 'x0', slot: 'group:2' },
			],
		});
		await f.request('/api/events/e1/lineup/send', 'rl', 'POST', { revision: 1 });
		const status = () =>
			Object.fromEntries(
				f.db
					.prepare('SELECT user_id,dm_status FROM raid_callups')
					.all()
					.map((r) => [r.user_id, r.dm_status]),
			);
		const discord = fakeDiscord([
			{ status: 200, data: { id: 'dm-1' } },
			{ status: 200, data: { id: 'msg-1' } },
			{ status: 200, data: { id: 'dm-2' } },
			{ status: 403, data: { code: 50007 } },
			{ status: 200, data: { id: 'dm-3' } },
			{ throw: true },
			{ status: 429, data: { retry_after: 2 } },
		]);
		await deliverCallups(f.db, f.env, discord.transport);
		const result = status();
		assert.equal(Object.values(result).filter((s) => s === 'sent').length, 1);
		assert.equal(Object.values(result).filter((s) => s === 'failed').length, 1);
		assert.equal(Object.values(result).filter((s) => s === 'uncertain').length, 1);
		assert.equal(Object.values(result).filter((s) => s === 'pending').length, 1);
		assert.ok(discord.calls.every((c) => c.auth === 'Bot ' + bot.DISCORD_BOT_TOKEN));
		assert.equal(discord.calls[0].url, 'https://discord.com/api/v10/users/@me/channels');
		assert.match(discord.calls[1].body.content, /Guarida de prueba/);
		assert.deepEqual(discord.calls[1].body.allowed_mentions, { parse: [] });
		assert.match(
			f.db.prepare("SELECT dm_error FROM raid_callups WHERE dm_status='failed'").get().dm_error,
			/mensajes privados/,
		);
		// Uncertain deliveries are not retried by a new run; rate limits wait for retry_after.
		const again = fakeDiscord([]);
		await deliverCallups(f.db, f.env, again.transport);
		assert.equal(again.calls.length, 0);
		// Re-sending only notifies players whose place changed, and tells removed players once.
		await f.request('/api/events/e1/lineup', 'rl', 'PUT', {
			revision: 1,
			slots: [
				{ signupId: 's1', slot: 'group:1' },
				{ signupId: 's2', slot: 'group:2' },
			],
		});
		const resent = await f.request('/api/events/e1/lineup/send', 'rl', 'POST', { revision: 2 });
		assert.equal(resent.body.unchanged, 1);
		assert.equal(resent.body.removed, 2);
		assert.equal(
			f.db.prepare("SELECT COUNT(*) n FROM raid_callups WHERE slot='removed'").get().n,
			2,
		);
		const retry = await f.request('/api/events/e1/lineup/retry', 'rl', 'POST', {});
		assert.equal(retry.status, 200);
	} finally {
		await f.close();
	}
});

test('call-up messages describe the place without mentions', () => {
	const event = { title: 'Raid de 40', starts_at: '2030-01-02T22:00:00Z' };
	assert.match(callupMessage({ slot: 'group:3' }, event, 'https://x').content, /Grupo 3/);
	assert.match(callupMessage({ slot: 'bench' }, event, 'https://x').content, /Banquillo/);
	assert.match(callupMessage({ slot: 'removed' }, event, 'https://x').content, /Ya no figuras/);
	assert.equal(
		callupMessage({ slot: 'group:1' }, event, 'https://x').content.includes('@everyone'),
		false,
	);
});

test('members see only a sent lineup; drafts stay with the organisers', async () => {
	const f = await fixture();
	try {
		await f.request('/api/events/e1/lineup', 'rl', 'PUT', {
			revision: 0,
			slots: [
				{ signupId: 's1', slot: 'group:1' },
				{ signupId: 's2', slot: 'bench' },
			],
		});
		assert.equal((await f.request('/api/events/e1', 'm1')).body.lineup, undefined);
		await f.request('/api/events/e1/lineup/send', 'rl', 'POST', { revision: 1 });
		const event = (await f.request('/api/events/e1', 'm1')).body;
		assert.equal(event.lineup.players.length, 2);
		assert.equal(event.lineup.players.find((p) => p.own).slot, 'group:1');
		assert.equal(event.lineup.pendingChanges, false);
		assert.equal((await f.request('/api/events/e1')).body.lineup, undefined);
	} finally {
		await f.close();
	}
});

test('per-boss plans are managed by organisers; unassigned players stay pending', async () => {
	const f = await fixture();
	try {
		const save = (who, bosses) => f.request('/api/events/e1/lineup/bosses', who, 'PUT', { bosses });
		assert.equal((await save('m1', [{ boss: 'Onyxia' }])).status, 403);
		assert.equal((await save('other-rl', [{ boss: 'Onyxia' }])).status, 403);
		assert.equal((await save('rl', [{ boss: 'Onyxia' }, { boss: 'onyxia' }])).status, 400);
		assert.equal(
			(await save('rl', [{ boss: 'Onyxia', assignments: { stranger: 'in' } }])).status,
			400,
		);
		assert.equal((await save('rl', [{ boss: 'Onyxia', assignments: { m1: 'out' } }])).status, 400);
		// An old event without a plan keeps working and reports no bosses.
		assert.deepEqual((await f.request('/api/events/e1', 'm1')).body.bossPlan, []);
		const ok = await save('rl', [
			{ boss: 'Onyxia', assignments: { m1: 'in', m2: 'bench' } },
			{ boss: 'Segundo jefe', assignments: { m2: 'in' } },
		]);
		assert.equal(ok.status, 200);
		assert.deepEqual(ok.body.bosses[0].assignments, { m1: 'in', m2: 'bench' });
		const plan = (await f.request('/api/events/e1', 'm1')).body.bossPlan;
		assert.deepEqual(
			plan.map((b) => [b.boss, b.mine]),
			[
				['Onyxia', 'in'],
				['Segundo jefe', 'pending'],
			],
		);
		assert.equal(plan[0].bench, 1);
	} finally {
		await f.close();
	}
});
