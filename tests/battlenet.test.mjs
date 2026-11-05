import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { openDatabase } from '../src/db.mjs';
import { createApp } from '../src/app.mjs';
import { issueSession } from '../src/auth.mjs';
import {
	readCharacter,
	importCharacters,
	startBattlenet,
	finishBattlenet,
} from '../src/battlenet.mjs';

const ORIGIN = 'http://localhost:3000';
const ENV = { APP_ORIGIN: ORIGIN, BLIZZARD_CLIENT_ID: 'client', BLIZZARD_CLIENT_SECRET: 'shh' };
const now = new Date().toISOString();
// The shape /profile/user/wow returns for Forever: surname, no realm.
const bnet = (id, name, surname, classId, raceId, level, faction = 'ALLIANCE', raceName) => ({
	id,
	name,
	surname,
	level,
	playable_class: { id: classId },
	playable_race: { id: raceId, name: raceName },
	faction: { type: faction },
});
function setup() {
	const db = openDatabase(':memory:');
	db.prepare('INSERT INTO users VALUES(?,?,?,?)').run('u1', 'Uno', 'member', now);
	db.prepare('INSERT INTO users VALUES(?,?,?,?)').run('u2', 'Dos', 'member', now);
	return db;
}
const chars = (db, user = 'u1') =>
	db
		.prepare(
			'SELECT name,surname,class,role,race,faction,level,is_main,source,external_id,archived_at FROM characters WHERE user_id=? ORDER BY name',
		)
		.all(user);

test('Battle.net characters map to our classes, races and factions', () => {
	assert.deepEqual(readCharacter(bnet(7, 'Mishuka', 'Luzalba', 5, 4, 23)), {
		externalId: 'forever-eu:7',
		name: 'Mishuka',
		surname: 'Luzalba',
		class: 'Sacerdote',
		race: 'Elfo de la noche',
		faction: 'Alianza',
		level: 23,
	});
	// New races arrive by their Spanish name, in either gender; the faction is kept.
	const sky = readCharacter(bnet(8, 'Aire', '', 8, 99, 10, 'HORDE', 'Cielonata'));
	assert.deepEqual([sky.race, sky.faction], ['Cielonato', 'Horda']);
	// Unknown races stay empty; a race that contradicts the faction is dropped.
	assert.equal(readCharacter(bnet(9, 'X', '', 1, 98, 5, 'ALLIANCE', 'Pandaren')).race, '');
	assert.equal(readCharacter(bnet(10, 'Y', '', 1, 2, 5, 'ALLIANCE')).race, '');
	// Classes this version doesn't have, missing names or ids are not imported.
	assert.equal(readCharacter(bnet(11, 'Z', '', 6, 1, 5)), null);
	assert.equal(readCharacter(bnet(12, '', '', 1, 1, 5)), null);
	assert.equal(readCharacter({ ...bnet(13, 'W', '', 1, 1, 5), id: undefined }), null);
	assert.equal(readCharacter(bnet(14, 'V', '', 1, 1, 0)).level, null);
});

test('the import adds, links and refreshes characters without removing any', () => {
	const db = setup();
	// A character the member wrote by hand, and someone else's with the same name.
	db.prepare(
		"INSERT INTO characters(id,user_id,name,surname,class,role,is_main,created_at) VALUES('hand','u1','mishuka','','Sacerdote','Sanador',1,?)",
	).run(now);
	db.prepare(
		"INSERT INTO characters(id,user_id,name,class,role,created_at) VALUES('other','u2','Borja','Guerrero','Tanque',?)",
	).run(now);
	const account = {
		wow_accounts: [
			{ characters: [bnet(1, 'Mishuka', 'Luzalba', 5, 4, 12), bnet(2, 'Borja', '', 1, 1, 8)] },
			{ characters: [bnet(3, 'Druid', '', 11, 4, 3), bnet(4, 'Monk', '', 10, 1, 3)] },
		],
	};
	assert.deepEqual(importCharacters(db, { id: 'u1' }, account), {
		added: 2,
		updated: 1,
		skipped: 1,
	});
	const first = chars(db);
	assert.deepEqual(
		first.map((c) => [c.name, c.surname, c.class, c.role, c.level, c.is_main, c.source]),
		[
			['Borja', '', 'Guerrero', 'DPS melee', 8, 0, 'battlenet'],
			['Druid', '', 'Druida', 'Sanador', 3, 0, 'battlenet'],
			// The hand-written one keeps its role and Main, and takes Battle.net's spelling.
			['Mishuka', 'Luzalba', 'Sacerdote', 'Sanador', 12, 1, 'battlenet'],
		],
	);
	assert.equal(chars(db, 'u2').length, 1);
	// Levelling up and importing again refreshes; an archived character stays archived.
	db.prepare("UPDATE characters SET archived_at=? WHERE external_id='forever-eu:3'").run(now);
	account.wow_accounts[0].characters[0].level = 20;
	assert.deepEqual(importCharacters(db, { id: 'u1' }, account), {
		added: 0,
		updated: 2,
		skipped: 2,
	});
	const second = chars(db);
	assert.equal(second.length, 3);
	assert.equal(second.find((c) => c.name === 'Mishuka').level, 20);
	assert.ok(second.find((c) => c.name === 'Druid').archived_at);
	// The first character of an empty account becomes its Main.
	importCharacters(
		db,
		{ id: 'u2' },
		{ wow_accounts: [{ characters: [bnet(5, 'Nuevo', '', 8, 7, 1)] }] },
	);
	assert.equal(chars(db, 'u2').find((c) => c.name === 'Nuevo').is_main, 0);
	const db2 = setup();
	importCharacters(
		db2,
		{ id: 'u1' },
		{ wow_accounts: [{ characters: [bnet(5, 'Nuevo', '', 8, 7, 1)] }] },
	);
	assert.equal(chars(db2)[0].is_main, 1);
});

test('the authorisation is bound to the member and the token is not kept', async () => {
	const db = setup();
	const { state, url } = startBattlenet(db, ENV, { id: 'u1' });
	const target = new URL(url);
	assert.equal(target.origin, 'https://oauth.battle.net');
	assert.equal(target.searchParams.get('scope'), 'wow.profile');
	assert.equal(target.searchParams.get('redirect_uri'), `${ORIGIN}/auth/battlenet/callback`);
	const calls = [];
	const fetcher = async (u, opts) => {
		calls.push([String(u), opts]);
		if (String(u).startsWith('https://oauth.battle.net/token'))
			return new Response(JSON.stringify({ access_token: 'user-token' }));
		return new Response(
			JSON.stringify({ wow_accounts: [{ characters: [bnet(1, 'Mishuka', '', 5, 4, 12)] }] }),
		);
	};
	const req = { headers: { cookie: `bnet_state=${state}` } };
	const back = new URL(`${ORIGIN}/auth/battlenet/callback?code=abc&state=${state}`);
	// Someone else's session can't use this member's authorisation.
	await assert.rejects(finishBattlenet(db, req, back, ENV, { id: 'u2' }, fetcher), /expired/);
	assert.deepEqual(await finishBattlenet(db, req, back, ENV, { id: 'u1' }, fetcher), {
		added: 1,
		updated: 0,
		skipped: 0,
	});
	assert.match(calls[1][0], /profile\/user\/wow\?namespace=profile-forever-eu/);
	assert.equal(calls[1][1].headers.Authorization, 'Bearer user-token');
	// Used once.
	await assert.rejects(finishBattlenet(db, req, back, ENV, { id: 'u1' }, fetcher), /expired/);
	await assert.rejects(
		finishBattlenet(
			db,
			req,
			new URL(`${ORIGIN}/auth/battlenet/callback?error=access_denied`),
			ENV,
			{ id: 'u1' },
			fetcher,
		),
		/denied/,
	);
	const dump = JSON.stringify(
		db
			.prepare("SELECT name FROM sqlite_master WHERE type='table'")
			.all()
			.flatMap(({ name }) => db.prepare(`SELECT * FROM "${name}"`).all()),
	);
	assert.ok(!dump.includes('user-token'));
});

test('the profile button only appears once Battle.net is configured', async () => {
	for (const [env, ready] of [
		[ENV, true],
		[{ APP_ORIGIN: ORIGIN }, false],
	]) {
		const db = setup();
		const session = issueSession(db, 'u1');
		const server = createServer(createApp(db, env));
		await new Promise((r) => server.listen(0, '127.0.0.1', r));
		const base = `http://127.0.0.1:${server.address().port}`;
		const headers = { cookie: `session=${session.raw}` };
		try {
			const me = await (await fetch(`${base}/api/me`, { headers })).json();
			assert.equal(me.battlenet, ready);
			const r = await fetch(`${base}/auth/battlenet`, { headers, redirect: 'manual' });
			if (ready) {
				assert.equal(r.status, 302);
				assert.match(r.headers.get('location'), /^https:\/\/oauth\.battle\.net\/authorize\?/);
				assert.match(r.headers.get('set-cookie'), /bnet_state=/);
			} else assert.equal(r.status, 503);
			// A failed callback goes back to the profile with a short code, never an error page.
			const cb = await fetch(`${base}/auth/battlenet/callback?code=x&state=y`, {
				headers,
				redirect: 'manual',
			});
			assert.equal(cb.status, 302);
			assert.equal(cb.headers.get('location'), '/perfil?battlenet=invalid#personajes');
			// Signed out: log in with Discord first, then come back here.
			const out = await fetch(`${base}/auth/battlenet`, { redirect: 'manual' });
			assert.match(out.headers.get('location'), /^\/auth\/discord\?next=/);
		} finally {
			server.close();
		}
	}
});
