import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
test('only leaders change recruitment priorities; validation is atomic and changes are audited', async () => {
	const f = await fixture();
	try {
		const choices = {
			soughtClasses: ['Mago', 'Sacerdote'],
			classPriorities: { Mago: 'alta', Sacerdote: 'media' },
			specPriorities: { 'Sacerdote:holy': 'alta', 'Sacerdote:shadow': 'baja' },
			soughtRoles: ['Sanador'],
			about: 'Nuestra hermandad',
		};
		for (const rank of ['member', 'raider', 'raid_leader', 'officer'])
			assert.equal((await f.request('/api/settings', rank, 'PUT', choices)).status, 403);
		assert.equal((await f.request('/api/settings', 'leader', 'PUT', choices)).status, 200);
		for (const bad of [
			{ soughtClasses: 'Mago' },
			{ soughtClasses: ['Inventada'] },
			{ soughtRoles: ['leader'] },
			{ soughtRoles: null },
			{ classPriorities: { Mago: 'urgente' } },
			{ classPriorities: { Inventada: 'alta' } },
			{ classPriorities: [] },
			{ specPriorities: { 'Mago:fury': 'alta' } },
			{ specPriorities: { 'Sacerdote:__proto__': 'alta' } },
		])
			assert.equal(
				(await f.request('/api/settings', 'leader', 'PUT', { about: 'Do not save', ...bad }))
					.status,
				400,
			);
		const actual = (await f.request('/api/public')).body.settings;
		assert.deepEqual(actual.soughtClasses, choices.soughtClasses);
		assert.deepEqual(actual.classPriorities, choices.classPriorities);
		assert.deepEqual(actual.specPriorities, choices.specPriorities);
		assert.deepEqual(actual.soughtRoles, choices.soughtRoles);
		assert.equal(actual.about, choices.about);
		assert.ok(f.db.prepare("SELECT 1 FROM audit WHERE action='settings.updated'").get());
		assert.equal(
			(await f.request('/api/settings', 'leader', 'PUT', { soughtClasses: [], soughtRoles: [] }))
				.status,
			200,
		);
		assert.deepEqual((await f.request('/api/public')).body.settings.soughtRoles, []);
	} finally {
		await f.close();
	}
});
test('character editing preserves ownership and main status and rejects cross-account edits', async () => {
	const f = await fixture();
	try {
		const created = await f.request('/api/characters', 'member', 'POST', {
			name: 'Urco',
			class: 'Brujo',
			role: 'DPS distancia',
		});
		const path = `/api/characters/${created.body.id}`;
		assert.equal((await f.request(path, 'raider', 'PATCH', { name: 'Intruso' })).status, 404);
		assert.equal((await f.request(path, 'visitor', 'PATCH', { name: 'Intruso' })).status, 403);
		assert.equal((await f.request(path, 'member', 'PATCH', { class: 'invalid' })).status, 400);
		assert.equal(
			(
				await f.request(path, 'member', 'PATCH', {
					name: 'Ronsel',
					availability: 'Noches',
					user_id: 'leader',
					is_main: 0,
				})
			).status,
			200,
		);
		const character = (await f.request('/api/characters', 'member')).body[0];
		assert.equal(character.name, 'Ronsel');
		assert.equal(character.user_id, 'member');
		assert.equal(character.is_main, 1);
		assert.equal(character.availability, 'Noches');
		const log = f.db.prepare("SELECT changes FROM audit WHERE action='character.updated'").get();
		assert.equal(JSON.parse(log.changes).before.name, 'Urco');
		assert.equal(JSON.parse(log.changes).after.name, 'Ronsel');
	} finally {
		await f.close();
	}
});
import { openDatabase, transaction } from '../src/db.mjs';
import { readFileSync } from 'node:fs';
import { createApp } from '../src/app.mjs';
import { issueSession, finishOAuth, hash } from '../src/auth.mjs';
import { ranks, can, roleFromDiscord, permissions } from '../src/domain.mjs';
async function fixture() {
	const db = openDatabase(':memory:');
	const server = createServer(createApp(db, { APP_ORIGIN: 'http://localhost:3000' }));
	await new Promise((r) => server.listen(0, '127.0.0.1', r));
	const base = `http://127.0.0.1:${server.address().port}`;
	const sessions = {};
	for (const rank of ranks) {
		db.prepare('INSERT INTO users VALUES(?,?,?,?)').run(rank, rank, rank, new Date().toISOString());
		sessions[rank] = issueSession(db, rank);
	}
	return {
		db,
		server,
		sessions,
		async close() {
			await new Promise((r) => server.close(r));
			db.close();
		},
		async request(path, rank, method = 'GET', body, headers = {}) {
			const session = sessions[rank];
			const r = await fetch(base + path, {
				method,
				headers: {
					Origin: 'http://localhost:3000',
					'Content-Type': 'application/json',
					...(session ? { Cookie: `session=${session.raw}`, 'X-CSRF-Token': session.csrf } : {}),
					...headers,
				},
				...(body !== undefined ? { body: JSON.stringify(body) } : {}),
			});
			return { status: r.status, body: await r.json(), headers: r.headers };
		},
	};
}
test('all six roles are checked against server endpoints and direct panel URLs', async () => {
	const f = await fixture();
	try {
		for (const rank of ranks) {
			for (const [path, minimum] of [
				['/api/roster', 'raid_leader'],
				['/api/applications', 'officer'],
				['/api/audit', 'officer'],
				['/api/export', 'leader'],
			]) {
				const r = await f.request(path, rank);
				assert.equal(
					r.status,
					ranks.indexOf(rank) >= ranks.indexOf(minimum) ? 200 : 403,
					rank + path,
				);
			}
			const res = await fetch(`http://127.0.0.1:${f.server.address().port}/panel`, {
				headers: { Cookie: `session=${f.sessions[rank].raw}` },
			});
			assert.equal(res.status, ranks.indexOf(rank) >= 3 ? 200 : 403);
		}
		assert.equal((await f.request('/api/export')).status, 401);
	} finally {
		await f.close();
	}
});
test('public roster contains exactly name class and role; never internal metadata', async () => {
	const f = await fixture();
	try {
		await f.request('/api/characters', 'member', 'POST', {
			name: 'Urco',
			surname: 'Tryt',
			class: 'Brujo',
			role: 'DPS distancia',
			notes: 'SECRET',
		});
		const r = await f.request('/api/public');
		assert.deepEqual(Object.keys(r.body.characters[0]).sort(), ['class', 'name', 'role']);
		assert.ok(!JSON.stringify(r.body).includes('SECRET'));
	} finally {
		await f.close();
	}
});
test('character ownership and main invariant persist atomically', async () => {
	const f = await fixture();
	try {
		const value = { name: 'Uno', class: 'Mago', role: 'DPS distancia' };
		const a = await f.request('/api/characters', 'member', 'POST', value);
		const b = await f.request('/api/characters', 'member', 'POST', {
			...value,
			name: 'Dos',
			isMain: true,
		});
		assert.equal(a.status, 201);
		assert.equal(b.status, 201);
		let rows = (await f.request('/api/characters', 'member')).body;
		assert.equal(rows.filter((c) => c.is_main).length, 1);
		assert.equal(rows.find((c) => c.is_main).name, 'Dos');
		assert.equal(
			(await f.request(`/api/characters/${a.body.id}/main`, 'raider', 'POST', {})).status,
			404,
		);
		assert.equal(
			(await f.request(`/api/characters/${a.body.id}/main`, 'member', 'POST', {})).status,
			200,
		);
		rows = (await f.request('/api/characters', 'member')).body;
		assert.equal(rows.filter((c) => c.is_main).length, 1);
	} finally {
		await f.close();
	}
});
test('CSRF, origin, input validation, missing OAuth configuration', async () => {
	const f = await fixture();
	try {
		assert.equal(
			(await f.request('/api/settings', 'leader', 'PUT', {}, { 'X-CSRF-Token': 'bad' })).status,
			403,
		);
		assert.equal(
			(await f.request('/api/settings', 'leader', 'PUT', {}, { Origin: 'https://evil.example' }))
				.status,
			403,
		);
		assert.equal(
			(
				await f.request('/api/characters', 'member', 'POST', {
					name: 'bad',
					class: 'invalid',
					role: 'DPS',
				})
			).status,
			400,
		);
		assert.equal((await f.request('/auth/discord')).status, 503);
		assert.equal(
			(await f.request('/api/settings', 'member', 'PUT', { name: 'hacked' })).status,
			403,
		);
		assert.equal(
			(await f.request('/api/settings', 'leader', 'PUT', { discordUrl: 'javascript:alert(1)' }))
				.status,
			400,
		);
	} finally {
		await f.close();
	}
});
test('attendance private by owner, officers see all; exports omit credentials', async () => {
	const f = await fixture();
	try {
		f.db
			.prepare('INSERT INTO raids(id,title,starts_at) VALUES(?,?,?)')
			.run('r', 'Raid', new Date().toISOString());
		for (const id of ['member', 'raider'])
			f.db
				.prepare('INSERT INTO attendance(id,raid_id,user_id,status) VALUES(?,?,?,?)')
				.run(id, 'r', id, 'Asistió');
		const mine = (await f.request('/api/attendance', 'member')).body;
		assert.equal(mine.rows.length, 1);
		assert.equal(mine.rows[0].user_id, 'member');
		assert.equal((await f.request('/api/attendance', 'raid_leader')).body.rows.length, 2);
		const exported = (await f.request('/api/export', 'leader')).body;
		assert.equal(exported.sessions, undefined);
		assert.ok(!JSON.stringify(exported).includes(f.sessions.leader.raw));
		assert.equal(exported.schemaVersion, 2);
	} finally {
		await f.close();
	}
});
test('recruitment pipeline preserves private data and audit records', async () => {
	const f = await fixture();
	try {
		await f.request('/api/settings', 'leader', 'PUT', { recruitmentOpen: false });
		const value = {
			name: 'Candidato',
			discord: 'private_handle',
			character: 'Uno',
			class: 'Guerrero',
			role: 'Tanque',
			experience: 'Classic',
			availability: 'Noches',
			reason: 'Equipo',
			consent: true,
		};
		assert.equal((await f.request('/api/applications', null, 'POST', value)).status, 409);
		await f.request('/api/settings', 'leader', 'PUT', { recruitmentOpen: true });
		const create = await f.request('/api/applications', null, 'POST', value);
		assert.equal(create.status, 201);
		assert.equal((await f.request('/api/applications', 'member')).status, 403);
		assert.equal(
			(
				await f.request(`/api/applications/${create.body.id}`, 'officer', 'PATCH', {
					status: 'Contactado',
					notes: 'privado',
				})
			).status,
			200,
		);
		assert.ok(!JSON.stringify((await f.request('/api/public')).body).includes('private_handle'));
		assert.equal(f.db.prepare('SELECT count(*) AS n FROM outbox').get().n, 0);
		assert.ok(f.db.prepare("SELECT * FROM audit WHERE action='application.updated'").get());
	} finally {
		await f.close();
	}
});
test('Discord role mapping fails closed and never first-user promotion', () => {
	assert.equal(roleFromDiscord('new', [], {}), 'visitor');
	assert.equal(roleFromDiscord('new', ['unknown'], {}), 'visitor');
	assert.equal(roleFromDiscord('new', ['r'], { DISCORD_ROLE_MAP: '{"r":"officer"}' }), 'officer');
	assert.equal(roleFromDiscord('owner', [], { DISCORD_LEADER_ID: 'owner' }), 'leader');
	assert.equal(can({ rank: 'bogus' }, 'settings.manage'), false);
	assert.equal(can({ rank: 'leader' }, 'unknown'), false);
});
test('OAuth rejects mismatched state without exchanging credentials', async () => {
	const db = openDatabase(':memory:');
	try {
		await assert.rejects(
			() =>
				finishOAuth(
					db,
					{ headers: { cookie: 'oauth_state=valid' } },
					new URL('http://localhost/auth/discord/callback?state=wrong&code=a'),
					{},
					() => assert.fail('Must not fetch'),
				),
			(e) => e.status === 400,
		);
	} finally {
		db.close();
	}
});
test('expired sessions and absent authentication fail closed', async () => {
	const f = await fixture();
	try {
		f.db.prepare('UPDATE sessions SET expires=0 WHERE hash=?').run(hash(f.sessions.leader.raw));
		assert.equal((await f.request('/api/export', 'leader')).status, 401);
		assert.equal((await f.request('/api/me', 'leader')).body.user, null);
	} finally {
		await f.close();
	}
});

test('GM inbox enforces authentication, ranks and CSRF through real HTTP routes', async () => {
	const f = await fixture();
	try {
		for (const rank of [undefined, 'visitor', 'member', 'raider', 'raid_leader']) {
			for (const path of ['/api/gm-messages', '/api/gm-notifications'])
				assert.equal((await f.request(path, rank)).status, rank ? 403 : 401);
		}
		const value = {
			requestId: '12345678-1234-1234-1234-123456789abc',
			subject: 'Asunto privado',
			message: 'Mensaje privado',
		};
		assert.equal(
			(await f.request('/api/gm-messages', 'member', 'POST', value, { 'X-CSRF-Token': 'bad' }))
				.status,
			403,
		);
		assert.equal((await f.request('/api/gm-messages', 'visitor', 'POST', value)).status, 403);
		assert.equal((await f.request('/api/gm-messages', 'member', 'POST', value)).status, 201);
		assert.equal((await f.request('/api/gm-messages', 'member', 'POST', value)).status, 200);
		for (const rank of ['officer', 'leader']) {
			const inbox = await f.request('/api/gm-messages', rank);
			assert.equal(inbox.status, 200);
			assert.equal(inbox.body[0].message, value.message);
		}
		assert.ok(!JSON.stringify((await f.request('/api/public')).body).includes(value.message));
		assert.equal(
			(
				await f.request('/api/gm-notifications/retry', 'member', 'POST', {
					id: 'x',
					reviewed: true,
				})
			).status,
			403,
		);
	} finally {
		await f.close();
	}
});

test('application deletion requires staff and CSRF, removes queues and preserves other applications', async () => {
	const f = await fixture();
	try {
		for (const id of ['remove', 'keep'])
			f.db
				.prepare('INSERT INTO applications(id,data,created_at,updated_at) VALUES(?,?,?,?)')
				.run(id, '{}', '2026-10-11', '2026-10-11');
		f.db.prepare('INSERT INTO outbox(id,application_id) VALUES(?,?)').run('out', 'remove');
		f.db
			.prepare(
				'INSERT INTO gm_notifications(id,kind,target_id,dedupe_key,created_at) VALUES(?,?,?,?,?)',
			)
			.run('notice', 'recruitment', 'remove', 'recruitment:remove', '2026-10-11');
		for (const rank of [undefined, 'visitor', 'member', 'raider', 'raid_leader'])
			assert.equal(
				(await f.request('/api/applications/remove', rank, 'DELETE')).status,
				rank ? 403 : 401,
			);
		assert.equal(
			(
				await f.request('/api/applications/remove', 'leader', 'DELETE', undefined, {
					'X-CSRF-Token': 'wrong',
				})
			).status,
			403,
		);
		assert.equal((await f.request('/api/applications/remove', 'leader', 'DELETE')).status, 200);
		assert.equal(f.db.prepare("SELECT COUNT(*) n FROM applications WHERE id='remove'").get().n, 0);
		assert.equal(f.db.prepare('SELECT COUNT(*) n FROM outbox').get().n, 0);
		assert.equal(f.db.prepare('SELECT COUNT(*) n FROM gm_notifications').get().n, 0);
		assert.ok(f.db.prepare("SELECT 1 FROM applications WHERE id='keep'").get());
		assert.ok(
			f.db
				.prepare("SELECT 1 FROM audit WHERE action='application.deleted' AND target='remove'")
				.get(),
		);
		assert.equal((await f.request('/api/applications/remove', 'leader', 'DELETE')).status, 404);
		assert.equal((await f.request('/api/applications/keep', 'officer', 'DELETE')).status, 200);
	} finally {
		await f.close();
	}
});

test('manual roster enforces staff ranks, separates offline identity and preserves archived history', async () => {
	const f = await fixture();
	const value = {
		name: 'Offline',
		class: 'Mago',
		role: 'DPS distancia',
		playerName: 'Contacto privado',
		notes: 'Nota privada',
		availability: 'Noches',
	};
	try {
		for (const rank of [undefined, 'visitor', 'member', 'raider'])
			assert.ok(
				[401, 403].includes((await f.request('/api/roster/manual', rank, 'POST', value)).status),
			);
		assert.equal(
			(await f.request('/api/roster/manual', 'leader', 'POST', value, { 'X-CSRF-Token': 'bad' }))
				.status,
			403,
		);
		assert.equal(
			(await f.request('/api/roster/manual', 'leader', 'POST', { ...value, class: 'Inventada' }))
				.status,
			400,
		);
		for (const rank of ['raid_leader', 'officer', 'leader']) {
			const payload = { ...value, name: value.name + rank };
			const result = await f.request('/api/roster/manual', rank, 'POST', payload);
			assert.equal(result.status, 201);
			const id = result.body.id;
			const record = f.db.prepare('SELECT * FROM characters WHERE id=?').get(id);
			assert.match(record.user_id, /^manual:/);
			assert.equal(record.source, 'staff');
			assert.equal(record.is_main, 1);
			assert.throws(() => issueSession(f.db, record.user_id), /no tienen acceso/);
			assert.equal((await f.request('/api/roster/manual', rank, 'POST', payload)).status, 409);
			assert.equal(
				(await f.request('/api/roster/manual/' + id, 'member', 'PATCH', payload)).status,
				403,
			);
			assert.equal(
				(
					await f.request('/api/roster/manual/' + id, rank, 'PATCH', {
						...payload,
						spec: 'Escarcha',
					})
				).status,
				200,
			);
			const publicData = (await f.request('/api/public')).body;
			assert.ok(publicData.characters.some((c) => c.name === payload.name));
			assert.ok(!JSON.stringify(publicData).includes('Contacto privado'));
			assert.ok(!JSON.stringify(publicData).includes('Nota privada'));
			assert.equal((await f.request('/api/roster/manual/' + id, rank, 'DELETE', {})).status, 200);
			assert.ok(f.db.prepare('SELECT archived_at FROM characters WHERE id=?').get(id).archived_at);
			assert.ok(!(await f.request('/api/roster', rank)).body.some((c) => c.id === id));
		}
		const own = await f.request('/api/characters', 'member', 'POST', value);
		assert.equal(
			(await f.request('/api/roster/manual/' + own.body.id, 'leader', 'PATCH', value)).status,
			404,
		);
	} finally {
		await f.close();
	}
});

test('staff can edit existing roster characters without changing ownership or account permissions', async () => {
	const f = await fixture();
	const value = { name: 'Existing', class: 'Mago', role: 'DPS distancia', notes: 'Private' };
	try {
		const created = await f.request('/api/characters', 'member', 'POST', value);
		assert.equal(created.status, 201);
		const id = created.body.id;
		const path = '/api/roster/characters/' + id;
		const before = f.db.prepare('SELECT * FROM characters WHERE id=?').get(id);
		const owner = f.db.prepare("SELECT * FROM users WHERE id='member'").get();
		for (const rank of [undefined, 'visitor', 'member', 'raider'])
			assert.equal((await f.request(path, rank, 'PATCH', value)).status, rank ? 403 : 401);
		assert.equal(
			(await f.request(path, 'leader', 'PATCH', value, { 'X-CSRF-Token': 'bad' })).status,
			403,
		);
		assert.equal((await f.request(path, 'leader', 'DELETE')).status, 405);
		assert.equal(
			(await f.request(path, 'leader', 'PATCH', { ...value, class: 'Invalid' })).status,
			400,
		);
		for (const rank of ['raid_leader', 'officer', 'leader']) {
			assert.equal(
				(
					await f.request(path, rank, 'PATCH', {
						...value,
						spec: rank,
						playerName: 'Override',
						user_id: 'leader',
						rank: 'leader',
						isMain: !before.is_main,
						source: 'staff',
						archived_at: '2026-01-01',
					})
				).status,
				200,
			);
			const after = f.db.prepare('SELECT * FROM characters WHERE id=?').get(id);
			assert.equal(after.spec, rank);
			for (const key of [
				'user_id',
				'is_main',
				'source',
				'external_id',
				'created_at',
				'archived_at',
			])
				assert.equal(after[key], before[key]);
			assert.deepEqual(f.db.prepare("SELECT * FROM users WHERE id='member'").get(), owner);
		}
		assert.equal(
			f.db
				.prepare(
					"SELECT COUNT(*) n FROM audit WHERE action='roster.character.updated' AND target=?",
				)
				.get(id).n,
			3,
		);
		assert.equal(
			(await f.request('/api/characters/' + id, 'member', 'PATCH', { ...value, spec: 'Escarcha' }))
				.status,
			200,
		);
		await f.request('/api/characters', 'raider', 'POST', { ...value, name: 'Duplicate' });
		assert.equal(
			(await f.request(path, 'leader', 'PATCH', { ...value, name: 'Duplicate' })).status,
			409,
		);
		f.db.prepare('UPDATE characters SET archived_at=? WHERE id=?').run('2026-01-01', id);
		assert.equal((await f.request(path, 'leader', 'PATCH', value)).status, 404);
	} finally {
		await f.close();
	}
});

test('roster import is atomic, repeatable and never changes Discord account ranks', async () => {
	const f = await fixture();
	const request = (path, rank, method, characters, headers) =>
		f.request(path, rank, method, { characters }, headers);
	const entry = { name: 'Importado', class: 'Druida', role: 'Sanador', rank: 'raider' };
	try {
		const existing = await f.request('/api/characters', 'raider', 'POST', {
			...entry,
			name: 'Registrado',
			notes: 'Conservar',
		});
		const batch = [entry, { ...entry, name: 'Registrado', role: 'Tanque' }];
		for (const rank of [undefined, 'member', 'raider'])
			assert.equal(
				(await request('/api/roster/import', rank, 'POST', batch)).status,
				rank ? 403 : 401,
			);
		assert.equal(
			(await request('/api/roster/import', 'leader', 'POST', batch, { 'X-CSRF-Token': 'bad' }))
				.status,
			403,
		);
		assert.equal((await request('/api/roster/import', 'raid_leader', 'POST', batch)).status, 200);
		assert.deepEqual((await request('/api/roster/import', 'raid_leader', 'POST', batch)).body, {
			created: 0,
			updated: 2,
		});
		assert.equal(f.db.prepare('SELECT COUNT(*) n FROM characters').get().n, 2);
		const manual = f.db
			.prepare(
				"SELECT c.*,u.rank FROM characters c JOIN users u ON u.id=c.user_id WHERE c.source='staff'",
			)
			.get();
		assert.equal(manual.rank, 'raider');
		assert.throws(() => issueSession(f.db, manual.user_id), /no tienen acceso/);
		const real = f.db.prepare('SELECT * FROM characters WHERE id=?').get(existing.body.id);
		assert.equal(real.role, 'Tanque');
		assert.equal(real.notes, 'Conservar');
		assert.equal(real.user_id, 'raider');
		assert.equal(
			(
				await request('/api/roster/import', 'leader', 'POST', [
					{ ...entry, name: 'Rollback' },
					{ ...entry, name: 'Registrado', rank: 'leader' },
				])
			).status,
			409,
		);
		assert.equal(
			f.db.prepare("SELECT COUNT(*) n FROM characters WHERE name='Rollback'").get().n,
			0,
		);
		assert.equal(
			(await request('/api/roster/import', 'leader', 'POST', [{ ...entry, rank: 'leader' }]))
				.status,
			400,
		);
		assert.equal(
			(await request('/api/roster/import', 'leader', 'POST', [entry, entry])).status,
			409,
		);
		assert.equal(
			(await request('/api/roster/import', 'leader', 'POST', [{ ...entry, class: 'Invalid' }]))
				.status,
			400,
		);
	} finally {
		await f.close();
	}
});
test('loot officer handles loot and member sheets, never guild management', async () => {
	const allowed = [
		'community.read',
		'character.write',
		'roster.read',
		'loot.manage',
		'armory.read',
		'armory.review',
	];
	for (const permission of Object.keys(permissions))
		assert.equal(
			can({ rank: 'loot_officer' }, permission),
			allowed.includes(permission),
			permission,
		);
	assert.equal(
		roleFromDiscord('new', ['loot', 'raider'], {
			DISCORD_ROLE_MAP: '{"loot":"loot_officer","raider":"raider"}',
		}),
		'loot_officer',
	);
	assert.equal(
		roleFromDiscord('new', ['loot', 'ofi'], {
			DISCORD_ROLE_MAP: '{"loot":"loot_officer","ofi":"officer"}',
		}),
		'officer',
	);
	const f = await fixture();
	try {
		for (const [path, status] of [
			['/api/roster', 200],
			['/api/applications', 403],
			['/api/audit', 403],
			['/api/export', 403],
		])
			assert.equal((await f.request(path, 'loot_officer')).status, status, path);
		assert.equal((await f.request('/api/settings', 'loot_officer', 'PUT', {})).status, 403);
	} finally {
		await f.close();
	}
});
test('loot officer migration rebuilds users and keeps every referencing row', () => {
	const db = openDatabase(':memory:');
	try {
		const now = new Date().toISOString();
		db.prepare('INSERT INTO users VALUES(?,?,?,?)').run('u1', 'Infusiones', 'officer', now);
		db.prepare(
			'INSERT INTO characters(id,user_id,name,class,role,created_at) VALUES(?,?,?,?,?,?)',
		).run('c1', 'u1', 'Infusiones', 'Druida', 'Sanador', now);
		db.prepare('DELETE FROM schema_migrations WHERE version=13').run();
		transaction(db, () =>
			db.exec(readFileSync(new URL('../migrations/013_loot_officer.sql', import.meta.url), 'utf8')),
		);
		assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
		assert.equal(db.prepare('SELECT user_id FROM characters WHERE id=?').get('c1').user_id, 'u1');
		db.prepare("UPDATE users SET rank='loot_officer' WHERE id='u1'").run();
		assert.throws(() => db.prepare("UPDATE users SET rank='admin' WHERE id='u1'").run());
		assert.throws(() =>
			db
				.prepare(
					'INSERT INTO characters(id,user_id,name,class,role,created_at) VALUES(?,?,?,?,?,?)',
				)
				.run('c2', 'ghost', 'X', 'Mago', 'DPS distancia', now),
		);
	} finally {
		db.close();
	}
});
