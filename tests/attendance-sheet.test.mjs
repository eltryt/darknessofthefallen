import test from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase } from '../src/db.mjs';
import { attendanceSheet } from '../src/attendance-sheet.mjs';

const signup = (id, userId, name, roleName) => ({
	id,
	userId,
	name,
	className: 'Mage',
	specName: 'Frost',
	roleName,
	status: 'primary',
});
function setup() {
	const db = openDatabase(':memory:');
	for (const id of ['m1', 'm2', 'm3'])
		db.prepare('INSERT INTO users VALUES(?,?,?,?)').run(
			id,
			'Jugador ' + id,
			'raider',
			'2026-11-01',
		);
	for (const [id, user, name, main] of [
		['c1', 'm1', 'Uno', 1],
		['c1b', 'm1', 'Alter', 0],
		['c2', 'm2', 'Dos', 1],
		['c3', 'm3', 'Tres', 1],
	])
		db.prepare(
			"INSERT INTO characters(id,user_id,name,class,role,is_main,created_at) VALUES(?,?,?,'Mago','DPS distancia',?,'2026-11-01')",
		).run(id, user, name, main);
	return db;
}

test('the roll call follows the lineup: groups first, then the bench', () => {
	const db = setup();
	db.prepare(
		"INSERT INTO raid_events(id,channel_id,organizer_id,title,starts_at,capacity,state,raw,updated_at) VALUES('e1','ch','m1','Raid','2030-01-01T22:00:00Z',20,'Abierta',?,'2026-11-01')",
	).run(
		JSON.stringify({
			signUps: [
				signup('s1', 'm1', 'Uno', 'Ranged'),
				signup('s2', 'm2', 'Dos', 'Tank'),
				signup('s9', 'discord-only', 'Fantasma', 'Healer'),
			],
		}),
	);
	db.prepare(
		"INSERT INTO raids(id,title,starts_at,source) VALUES('e1','Raid','2030-01-01T22:00:00Z','raid-helper')",
	).run();
	for (const [s, u, slot] of [
		['s1', 'm1', 'bench'],
		['s2', 'm2', 'group:1'],
		['s9', 'discord-only', 'group:1'],
	])
		db.prepare('INSERT INTO raid_lineup_slots VALUES(?,?,?,?,0)').run('e1', s, u, slot);
	// Someone marked by hand who is not in the lineup still shows.
	db.prepare("INSERT INTO attendance VALUES('a1','e1','m3','c3','Llegó tarde')").run();
	const sheet = attendanceSheet(db, 'e1');
	assert.equal(sheet.source, 'lineup');
	assert.deepEqual(
		sheet.rows.map((r) => [r.name, r.characterName, r.slot, r.status]),
		[
			['Jugador m2', 'Dos', 'group:1', null],
			['Fantasma', '', 'group:1', null],
			['Jugador m1', 'Uno', 'bench', null],
			['Jugador m3', 'Tres', 'other', 'Llegó tarde'],
		],
	);
	assert.equal(sheet.rows[1].characterId, null);
});

test('a raid without sign-ups lists every member once, by their main', () => {
	const db = setup();
	db.prepare(
		"INSERT INTO raids(id,title,starts_at,source) VALUES('r1','Manual','2030-01-01T22:00:00Z','manual')",
	).run();
	const sheet = attendanceSheet(db, 'r1');
	assert.equal(sheet.source, 'roster');
	assert.deepEqual(
		sheet.rows.map((r) => r.characterName),
		['Uno', 'Dos', 'Tres'],
	);
	assert.throws(() => attendanceSheet(db, 'nope'), /no encontrada/);
});

test('emptying a raid archives its marks instead of deleting them', async () => {
	const { resetAttendance } = await import('../src/attendance-sheet.mjs');
	const db = setup();
	db.prepare(
		"INSERT INTO raids(id,title,starts_at,source) VALUES('r1','Manual','2030-01-01T22:00:00Z','manual')",
	).run();
	db.prepare("INSERT INTO attendance VALUES('a1','r1','m1','c1','Asistió')").run();
	db.prepare("INSERT INTO attendance VALUES('a2','r1','m2','c2','Asistió')").run();
	assert.deepEqual(resetAttendance(db, 'r1', { id: 'm3' }), { archived: 2 });
	assert.equal(db.prepare('SELECT count(*) n FROM attendance').get().n, 0);
	assert.deepEqual(
		db
			.prepare('SELECT id,status,archived_by FROM attendance_archive ORDER BY id')
			.all()
			.map((r) => ({ ...r })),
		[
			{ id: 'a1', status: 'Asistió', archived_by: 'm3' },
			{ id: 'a2', status: 'Asistió', archived_by: 'm3' },
		],
	);
	assert.ok(attendanceSheet(db, 'r1').rows.every((r) => r.status === null));
	assert.throws(() => resetAttendance(db, 'nope', { id: 'm3' }), /no encontrada/);
});
