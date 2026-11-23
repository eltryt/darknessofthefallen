import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { openDatabase } from '../src/db.mjs';
import { createApp } from '../src/app.mjs';
import { issueSession } from '../src/auth.mjs';
import { ranks, attendanceMetrics } from '../src/domain.mjs';
import { slotGroup, wishlistWindow } from '../src/loot-rules.mjs';
import { pushMessage } from '../src/push-notifications.mjs';

// Raid rules of 22/11/2026: wishlist deadline, requests, history with warnings,
// excused absences with a 75 % monthly minimum, and Offspec as a loot request type.
async function fixture() {
	const db = openDatabase(':memory:'),
		sessions = {};
	for (const rank of ranks) {
		db.prepare('INSERT INTO users VALUES(?,?,?,?)').run(
			rank,
			`Nombre ${rank}`,
			rank,
			new Date().toISOString(),
		);
		sessions[rank] = issueSession(db, rank);
	}
	const server = createServer(createApp(db, { APP_ORIGIN: 'http://localhost:3000' }));
	await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
	const request = async (path, rank, method = 'GET', value) => {
		const session = sessions[rank],
			r = await fetch(`http://127.0.0.1:${server.address().port}${path}`, {
				method,
				headers: {
					Origin: 'http://localhost:3000',
					'Content-Type': 'application/json',
					...(session ? { Cookie: `session=${session.raw}`, 'X-CSRF-Token': session.csrf } : {}),
				},
				...(value === undefined ? {} : { body: JSON.stringify(value) }),
			});
		return { status: r.status, body: await r.json().catch(() => null) };
	};
	const character = async (rank, name) => {
		const r = await request('/api/characters', rank, 'POST', {
			name,
			class: 'Pícaro',
			role: 'DPS melee',
		});
		assert.equal(r.status, 201);
		return r.body.id;
	};
	const raid = async (starts = '2026-11-05T23:00:00+01:00') => {
		const r = await request('/api/raids', 'raid_leader', 'POST', {
			title: 'Raid de prueba',
			starts_at: starts,
		});
		assert.equal(r.status, 201);
		return r.body.id;
	};
	const wish = (rank, characterId, item, slot = '', status = 'BiS') =>
		request('/api/wishlists', rank, 'POST', { characterId, item, slot, status, priority: 1 });
	const soon = () => new Date(Date.now() + 3 * 86400000).toISOString();
	return {
		db,
		request,
		character,
		raid,
		wish,
		soon,
		close: async () => {
			await new Promise((resolve) => server.close(resolve));
			db.close();
		},
	};
}

test('the wishlist deadline: free until opened, then only removals once closed', async () => {
	const f = await fixture();
	try {
		const c = await f.character('raider', 'Sombra');
		assert.equal((await f.request('/api/wishlist-window', 'raider')).body.state, 'free');
		assert.equal((await f.wish('raider', c, 'Libre')).status, 201);
		// Only loot managers open or close the deadline, with a future date.
		const open = { closesAt: f.soon(), note: 'Tier 1' };
		assert.equal((await f.request('/api/wishlist-window', 'raider', 'POST', open)).status, 403);
		assert.equal(
			(
				await f.request('/api/wishlist-window', 'loot_officer', 'POST', {
					closesAt: '2020-01-01T00:00:00Z',
				})
			).status,
			400,
		);
		const opened = await f.request('/api/wishlist-window', 'loot_officer', 'POST', open);
		assert.equal(opened.status, 201);
		assert.equal(opened.body.state, 'open');
		assert.equal(opened.body.closesAt, open.closesAt);
		const added = await f.wish('raider', c, 'Abierto', 'head');
		assert.equal(added.status, 201);
		// Closed: no adding, no changing status, slot or priority.
		assert.equal(
			(await f.request('/api/wishlist-window/close', 'loot_officer', 'POST', {})).status,
			200,
		);
		assert.equal((await f.request('/api/wishlist-window', 'raider')).body.state, 'closed');
		assert.equal((await f.wish('raider', c, 'Tarde')).status, 409);
		const entry = '/api/wishlists/' + added.body.id;
		assert.equal(
			(await f.request(entry, 'raider', 'PATCH', { status: 'Me interesa' })).status,
			409,
		);
		assert.equal((await f.request(entry, 'raider', 'PATCH', { priority: 2 })).status, 409);
		// Still allowed: "Ya lo tengo", notes and removing.
		assert.equal((await f.request(entry, 'raider', 'PATCH', { obtained: true })).status, 200);
		assert.equal((await f.request(entry, 'raider', 'PATCH', { notes: 'ok' })).status, 200);
		assert.equal((await f.request(entry, 'raider', 'DELETE', {})).status, 200);
		// A deadline that simply runs out closes too.
		f.db
			.prepare("UPDATE wishlist_windows SET closed_at=NULL,closes_at='2020-01-01T00:00:00.000Z'")
			.run();
		assert.equal(wishlistWindow(f.db).state, 'closed');
	} finally {
		await f.close();
	}
});

test('every wishlist change is kept in a history only loot managers read', async () => {
	const f = await fixture();
	try {
		const c = await f.character('raider', 'Sombra');
		const added = await f.wish('raider', c, 'Yelmo', 'head');
		await f.request('/api/wishlists/' + added.body.id, 'raider', 'PATCH', { status: 'Pasar' });
		await f.request('/api/wishlists/' + added.body.id, 'raider', 'DELETE', {});
		assert.equal((await f.request('/api/wishlist-history', 'raider')).status, 403);
		const history = await f.request('/api/wishlist-history?characterId=' + c, 'loot_officer');
		assert.equal(history.status, 200);
		assert.deepEqual(
			history.body.map((h) => h.action),
			['removed', 'changed', 'added'],
		);
		assert.equal(history.body[0].actor_name, 'Nombre raider');
		assert.equal(history.body[1].before.status, 'BiS');
		assert.equal(history.body[1].after.status, 'Pasar');
		assert.equal(history.body[2].item, 'Yelmo');
		assert.ok(history.body.every((h) => !h.alert));
	} finally {
		await f.close();
	}
});

test('out-of-deadline requests: officers approve or reject, approval applies the change', async () => {
	const f = await fixture();
	try {
		const c = await f.character('raider', 'Sombra');
		const other = await f.character('member', 'Ajeno');
		const kept = await f.wish('raider', c, 'Capa', 'back', 'Me interesa');
		await f.request('/api/wishlist-window', 'loot_officer', 'POST', { closesAt: f.soon() });
		// While the deadline is open there is nothing to request.
		const early = await f.request('/api/wishlist-requests', 'raider', 'POST', {
			kind: 'add',
			characterId: c,
			item: 'Anillo',
		});
		assert.equal(early.status, 409);
		await f.request('/api/wishlist-window/close', 'loot_officer', 'POST', {});
		assert.equal(
			(
				await f.request('/api/wishlist-requests', 'raider', 'POST', {
					kind: 'add',
					characterId: other,
					item: 'Anillo',
				})
			).status,
			403,
		);
		const add = await f.request('/api/wishlist-requests', 'raider', 'POST', {
			kind: 'add',
			characterId: c,
			item: 'Anillo',
			slot: 'finger1',
			status: 'BiS',
			priority: 1,
			reason: 'Me equivoqué de anillo',
		});
		assert.equal(add.status, 201);
		assert.equal(
			(
				await f.request('/api/wishlist-requests', 'raider', 'POST', {
					kind: 'add',
					characterId: c,
					item: 'Anillo',
				})
			).status,
			409,
		);
		const change = await f.request('/api/wishlist-requests', 'raider', 'POST', {
			kind: 'change',
			wishlistId: kept.body.id,
			status: 'BiS',
		});
		assert.equal(change.status, 201);
		const decide = (id, rank, value) =>
			f.request(`/api/wishlist-requests/${id}/decision`, rank, 'POST', value);
		assert.equal((await decide(add.body.id, 'raider', { approve: true })).status, 403);
		assert.equal((await decide(change.body.id, 'loot_officer', { approve: false })).status, 400);
		assert.equal(
			(await decide(change.body.id, 'loot_officer', { approve: false, note: 'No toca' })).status,
			200,
		);
		assert.equal((await decide(add.body.id, 'loot_officer', { approve: true })).status, 200);
		assert.equal((await decide(add.body.id, 'loot_officer', { approve: true })).status, 404);
		const wishes = (await f.request('/api/wishlists', 'raider')).body;
		assert.ok(wishes.some((w) => w.data.item === 'Anillo' && w.data.slot === 'finger1'));
		assert.equal(wishes.find((w) => w.id === kept.body.id).data.status, 'Me interesa');
		const mine = (await f.request('/api/wishlist-requests', 'raider')).body;
		assert.deepEqual(mine.map((r) => r.status).sort(), ['approved', 'rejected']);
		assert.equal(mine.find((r) => r.status === 'rejected').decision_note, 'No toca');
		// The approved addition appears in the history as done by the officer.
		const history = (await f.request('/api/wishlist-history', 'loot_officer')).body;
		assert.equal(history[0].actor_name, 'Nombre loot_officer');
		assert.equal(history[0].request_id, add.body.id);
		// The player can cancel a pending request of their own.
		const again = await f.request('/api/wishlist-requests', 'raider', 'POST', {
			kind: 'change',
			wishlistId: kept.body.id,
			priority: 1,
		});
		assert.equal(
			(await f.request(`/api/wishlist-requests/${again.body.id}/cancel`, 'member', 'POST', {}))
				.status,
			404,
		);
		assert.equal(
			(await f.request(`/api/wishlist-requests/${again.body.id}/cancel`, 'raider', 'POST', {}))
				.status,
			200,
		);
	} finally {
		await f.close();
	}
});

test('a rogue who got two swords by wishlist and swaps them for daggers triggers a warning', async () => {
	const f = await fixture();
	try {
		const rogue = await f.character('raider', 'Pícaro');
		const raid = await f.raid();
		const main = await f.wish('raider', rogue, 'Espada del Alba', 'main_hand');
		const off = await f.wish('raider', rogue, 'Espada del Ocaso', 'off_hand');
		// Officers with a device registered get an app notification.
		f.db
			.prepare(
				"INSERT INTO push_subscriptions(endpoint,user_id,p256dh,auth,created_at) VALUES('https://fcm.googleapis.com/x','loot_officer','k','a','2026-11-22')",
			)
			.run();
		const loot = await f.request('/api/loot', 'loot_officer', 'POST', {
			raidId: raid,
			item: 'Espada del Alba',
			boss: 'Jefe',
			recipientCharacterId: rogue,
			date: '2026-11-05T23:30:00Z',
			reason: 'BiS de su wishlist',
			method: 'Roll',
			requestType: 'BiS',
		});
		assert.equal(loot.status, 201);
		await f.request('/api/wishlists/' + off.body.id, 'raider', 'PATCH', { obtained: true });
		await f.request('/api/wishlist-window', 'loot_officer', 'POST', { closesAt: f.soon() });
		await f.request('/api/wishlist-window/close', 'loot_officer', 'POST', {});
		// Removing the sword is allowed, but the officers are warned.
		assert.equal(
			(await f.request('/api/wishlists/' + main.body.id, 'raider', 'DELETE', {})).status,
			200,
		);
		const alerts = (await f.request('/api/wishlist-history?alerts=true', 'loot_officer')).body;
		assert.equal(alerts.length, 1);
		assert.match(alerts[0].alert, /Ya se llevó «Espada del (Alba|Ocaso)» \(armas\)/);
		assert.match(alerts[0].alert, /quita «Espada del Alba»/);
		// Asking to add a dagger in the other hand is the same weapon slot.
		const dagger = await f.request('/api/wishlist-requests', 'raider', 'POST', {
			kind: 'add',
			characterId: rogue,
			item: 'Daga',
			slot: 'off_hand',
			status: 'BiS',
			priority: 1,
		});
		assert.match(dagger.body.alert, /añade «Daga»/);
		const jobs = f.db
			.prepare("SELECT kind,target_id,user_id FROM push_jobs WHERE kind LIKE 'wishlist-%'")
			.all();
		assert.deepEqual(jobs.map((j) => j.kind).sort(), ['wishlist-alert', 'wishlist-request']);
		assert.ok(jobs.every((j) => j.user_id === 'loot_officer'));
		const message = pushMessage(
			f.db,
			jobs.find((j) => j.kind === 'wishlist-alert'),
		);
		assert.match(message.title, /Pícaro/);
		// Marking the warning as reviewed takes it off the list.
		assert.equal(
			(await f.request(`/api/wishlist-alerts/${alerts[0].id}/seen`, 'loot_officer', 'POST', {}))
				.status,
			200,
		);
		assert.equal(
			(await f.request('/api/wishlist-history?alerts=true', 'loot_officer')).body.length,
			0,
		);
		// A slot with nothing received stays quiet.
		const head = await f.request('/api/wishlist-requests', 'raider', 'POST', {
			kind: 'add',
			characterId: rogue,
			item: 'Capucha',
			slot: 'head',
		});
		assert.equal(head.body.alert, null);
		assert.equal(slotGroup('finger2'), slotGroup('finger1'));
	} finally {
		await f.close();
	}
});

test('excused absences leave the monthly percentage and 75 % is the loot minimum', async () => {
	const f = await fixture();
	try {
		const c = await f.character('raider', 'Constante');
		const raids = [];
		for (const day of ['05', '12', '19', '26'])
			raids.push(await f.raid(`2026-11-${day}T23:00:00+01:00`));
		const mark = (raid, status) =>
			f.request('/api/raids/' + raid + '/attendance', 'raid_leader', 'PUT', {
				entries: [{ characterId: c, status }],
			});
		await mark(raids[0], 'Asistió');
		await mark(raids[1], 'Asistió');
		await mark(raids[2], 'Llegó tarde');
		await mark(raids[3], 'Ausente');
		let list = (await f.request('/api/attendance?userId=raider', 'raid_leader')).body;
		assert.equal(list.metrics.minimum, 75);
		assert.equal(list.metrics.monthly[0].month, '2026-11');
		assert.equal(list.metrics.monthly[0].percentage, 75);
		assert.equal(list.metrics.monthly[0].eligible, true);
		const absent = list.rows.find((r) => r.status === 'Ausente');
		const attended = list.rows.find((r) => r.status === 'Asistió');
		const excuse = (id, rank, value) =>
			f.request(`/api/attendance/${id}/excuse`, rank, 'PUT', value);
		assert.equal((await excuse(absent.id, 'raider', { excused: true, reason: 'x' })).status, 403);
		assert.equal((await excuse(absent.id, 'raid_leader', { excused: true })).status, 400);
		assert.equal(
			(await excuse(attended.id, 'raid_leader', { excused: true, reason: 'Vacaciones' })).status,
			400,
		);
		assert.equal(
			(await excuse(absent.id, 'raid_leader', { excused: true, reason: 'Vacaciones' })).status,
			200,
		);
		list = (await f.request('/api/attendance?userId=raider', 'raid_leader')).body;
		const row = list.rows.find((r) => r.id === absent.id);
		assert.equal(row.excused, 1);
		assert.equal(row.excuse_reason, 'Vacaciones');
		assert.equal(list.metrics.excused, 1);
		assert.equal(list.metrics.monthly[0].percentage, 100);
		// The player sees the same numbers in their profile.
		const own = (await f.request('/api/attendance?userId=me', 'raider')).body;
		assert.equal(own.metrics.percentage, 100);
		// Taking the excuse back counts the absence again.
		await excuse(absent.id, 'raid_leader', { excused: false });
		list = (await f.request('/api/attendance?userId=raider', 'raid_leader')).body;
		assert.equal(list.metrics.monthly[0].percentage, 75);
		// Removing the attendance row still works with an excuse stored.
		await excuse(absent.id, 'raid_leader', { excused: true, reason: 'Trabajo' });
		assert.equal(
			(await f.request('/api/attendance/' + absent.id, 'raid_leader', 'DELETE', {})).status,
			200,
		);
	} finally {
		await f.close();
	}
});

test('monthly attendance splits by Madrid month and falls below 75 % with one unexcused miss in three', () => {
	const row = (status, starts_at, extra = {}) => ({
		status,
		starts_at,
		user_id: 'u',
		display_name: 'U',
		...extra,
	});
	const m = attendanceMetrics([
		row('Asistió', '2026-10-31T23:30:00Z'), // 1 November in Madrid
		row('Asistió', '2026-11-10T22:00:00Z'),
		row('Ausente', '2026-11-17T22:00:00Z'),
		row('Ausente', '2026-10-20T22:00:00Z', { excused: 1 }),
	]);
	const nov = m.monthly.find((x) => x.month === '2026-11');
	const oct = m.monthly.find((x) => x.month === '2026-10');
	assert.equal(nov.raids, 3);
	assert.equal(nov.percentage, 67);
	assert.equal(nov.eligible, false);
	// A month with only excused absences has nothing to measure.
	assert.equal(oct.eligible, null);
	assert.match(m.policy, /75 %/);
});

test('loot records the request type, Offspec included, and shows it to members', async () => {
	const f = await fixture();
	try {
		const c = await f.character('raider', 'Secundaria');
		const raid = await f.raid();
		const data = {
			raidId: raid,
			item: 'Escudo',
			boss: 'Jefe',
			recipientCharacterId: c,
			date: '2026-11-05T23:30:00Z',
			reason: 'Nadie lo necesitaba para su rol principal',
			method: 'Roll',
		};
		assert.equal(
			(await f.request('/api/loot', 'loot_officer', 'POST', { ...data, requestType: 'Capricho' }))
				.status,
			400,
		);
		assert.equal(
			(await f.request('/api/loot', 'loot_officer', 'POST', { ...data, requestType: 'Offspec' }))
				.status,
			201,
		);
		assert.equal((await f.request('/api/loot', 'loot_officer', 'POST', data)).status, 201);
		const seen = (await f.request('/api/loot', 'member')).body.map((r) => r.data.requestType);
		assert.deepEqual(seen.sort(), ['', 'Offspec']);
	} finally {
		await f.close();
	}
});
