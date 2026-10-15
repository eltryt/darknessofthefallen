import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { openDatabase } from '../src/db.mjs';
import { createApp } from '../src/app.mjs';
import { issueSession } from '../src/auth.mjs';
import { ranks } from '../src/domain.mjs';

async function fixture() {
	const db = openDatabase(':memory:'),
		sessions = {};
	for (const rank of ranks) {
		db.prepare('INSERT INTO users VALUES(?,?,?,?)').run(rank, `Nombre ${rank}`, rank, '2026-10-15');
		sessions[rank] = issueSession(db, rank);
	}
	const server = createServer(createApp(db, { APP_ORIGIN: 'http://localhost:3000' }));
	await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
	const request = async (path, rank, method = 'GET', value) => {
		const session = sessions[rank];
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
	const character = async (rank, extra = {}) => {
		const r = await request('/api/characters', rank, 'POST', {
			name: 'Personaje ' + rank,
			class: 'Mago',
			role: 'DPS distancia',
			...extra,
		});
		assert.equal(r.status, 201, JSON.stringify(r.body));
		return r.body.id;
	};
	return {
		db,
		request,
		character,
		close: async () => {
			await new Promise((resolve) => server.close(resolve));
			db.close();
		},
	};
}

test('migration 007 keeps existing characters and applies empty armory defaults', () => {
	const dir = mkdtempSync(join(tmpdir(), 'armory-migration-')),
		file = join(dir, 'guild.sqlite');
	try {
		// Build a schema-6 database exactly as production had it before this change.
		const old = new DatabaseSync(file);
		for (const name of [
			'001_initial',
			'002_operations',
			'003_discord_invite',
			'004_open_recruitment',
			'005_raid_events',
			'006_gm_notifications',
		])
			old.exec(readFileSync(new URL(`../migrations/${name}.sql`, import.meta.url), 'utf8'));
		old.exec(`INSERT INTO users VALUES('u','Usuario','member','2026-10-01');
			INSERT INTO characters(id,user_id,name,class,role,spec,is_main,created_at) VALUES('c','u','Existente','Mago','DPS distancia','arcane',1,'2026-10-01');`);
		old.close();
		const db = openDatabase(file);
		const c = db.prepare('SELECT * FROM characters WHERE id=?').get('c');
		assert.equal(c.name, 'Existente');
		assert.equal(c.spec, 'arcane');
		assert.equal(c.is_main, 1);
		assert.equal(c.game_version, 'forever');
		assert.equal(c.realm, '');
		assert.equal(c.level, null);
		assert.equal(c.stats, '{}');
		assert.equal(db.prepare('SELECT COUNT(*) n FROM guide_links').get().n, 0);
		assert.equal(db.prepare('SELECT COUNT(*) n FROM bis_entries').get().n, 0);
		assert.deepEqual(
			db
				.prepare('SELECT id FROM guide_providers ORDER BY sort')
				.all()
				.map((r) => r.id),
			['wowhead', 'icy-veins', 'archon'],
		);
		db.close();
		// Reopening must not run the migration twice.
		const again = openDatabase(file);
		assert.equal(again.prepare('SELECT COUNT(*) n FROM schema_migrations').get().n, 9);
		again.close();
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

test('sheets are visible to their owner and armory readers only; reviews stay with officers', async () => {
	const f = await fixture();
	try {
		const own = await f.character('member'),
			other = await f.character('raider');
		assert.equal((await f.request(`/api/armory/characters/${own}`, undefined)).status, 401);
		const mine = await f.request(`/api/armory/characters/${own}`, 'member');
		assert.equal(mine.status, 200);
		assert.equal(mine.body.canEdit, true);
		assert.equal(mine.body.canReview, false);
		assert.equal('notes' in mine.body, false);
		assert.deepEqual(mine.body.equipment, []);
		assert.deepEqual(mine.body.lists, []);
		// Another member's id answers 404, not 403, so ids cannot be probed.
		assert.equal((await f.request(`/api/armory/characters/${other}`, 'member')).status, 404);
		const leaderView = await f.request(`/api/armory/characters/${own}`, 'raid_leader');
		assert.equal(leaderView.status, 200);
		assert.equal(leaderView.body.canEdit, false);
		assert.equal('reviews' in leaderView.body, false);
		const officerView = await f.request(`/api/armory/characters/${own}`, 'officer');
		assert.deepEqual(officerView.body.reviews, []);
		assert.deepEqual(officerView.body.notes, []);
		const guild = await f.request('/api/armory/characters?scope=guild', 'member');
		assert.deepEqual(
			guild.body.map((c) => c.id),
			[own],
		);
		assert.equal((await f.request('/api/armory/characters?scope=guild', 'officer')).body.length, 2);
	} finally {
		await f.close();
	}
});

test('sheet fields are validated against the game version catalogue', async () => {
	const f = await fixture();
	try {
		const id = await f.character('member', {
			realm: 'Reino',
			race: 'Gnomo',
			level: 60,
			secondary_spec: 'frost',
		});
		const c = (await f.request(`/api/armory/characters/${id}`, 'member')).body.character;
		assert.equal(c.faction, 'Alianza');
		assert.equal(c.race, 'Gnomo');
		assert.equal(c.level, 60);
		for (const bad of [
			{ race: 'Gnomo', faction: 'Horda' },
			{ race: 'Elfo de sangre' },
			{ secondary_spec: 'fury' },
			{ level: 0 },
			{ level: 3.5 },
			{ game_version: 'retail' },
			{ region: 'Luna' },
		])
			assert.equal(
				(await f.request(`/api/characters/${id}`, 'member', 'PATCH', bad)).status,
				400,
				JSON.stringify(bad),
			);
		// Partial updates keep the rest of the sheet.
		assert.equal(
			(await f.request(`/api/characters/${id}`, 'member', 'PATCH', { realm: 'Otro reino' })).status,
			200,
		);
		const after = (await f.request(`/api/armory/characters/${id}`, 'member')).body.character;
		assert.equal(after.realm, 'Otro reino');
		assert.equal(after.race, 'Gnomo');
		assert.ok(after.updated_at);
	} finally {
		await f.close();
	}
});

test('only the owner edits BiS lists; principal items demote alternatives', async () => {
	const f = await fixture();
	try {
		const id = await f.character('member', { spec: 'arcane' });
		const list = await f.request(`/api/armory/characters/${id}/bis-lists`, 'member', 'POST', {
			spec: 'arcane',
			content: 'Banda',
			phase: 'Fase 1',
		});
		assert.equal(list.status, 201);
		assert.equal(
			(
				await f.request(`/api/armory/characters/${id}/bis-lists`, 'member', 'POST', {
					spec: 'arcane',
					content: 'Banda',
					phase: 'Fase 1',
				})
			).status,
			409,
		);
		for (const rank of ['raid_leader', 'officer', 'leader'])
			assert.equal(
				(
					await f.request(`/api/armory/bis-lists/${list.body.id}/entries`, rank, 'POST', {
						slot: 'head',
						item_name: 'Intento ajeno',
					})
				).status,
				404,
			);
		const entry = (value) =>
			f.request(`/api/armory/bis-lists/${list.body.id}/entries`, 'member', 'POST', value);
		const first = await entry({ slot: 'head', item_name: 'Primero', is_primary: true });
		assert.equal(first.status, 201);
		const second = await entry({ slot: 'head', item_name: 'Segundo', is_primary: true });
		assert.equal(second.status, 201);
		assert.equal((await entry({ slot: 'tail', item_name: 'Ranura inexistente' })).status, 400);
		assert.equal(
			(await entry({ slot: 'head', item_name: 'Estado', status: 'Robado' })).status,
			400,
		);
		assert.equal((await entry({ slot: 'head', item_name: 'P', priority: 9 })).status, 400);
		assert.equal((await entry({ slot: 'head', item_name: 'Id', item_id: '<script>' })).status, 400);
		const entries = (await f.request(`/api/armory/characters/${id}`, 'member')).body.lists[0]
			.entries;
		assert.deepEqual(
			entries.filter((e) => e.is_primary).map((e) => e.item_name),
			['Segundo'],
		);
		assert.equal(
			(
				await f.request(`/api/armory/bis-entries/${first.body.id}`, 'officer', 'PATCH', {
					status: 'Conseguido',
				})
			).status,
			404,
		);
		assert.equal(
			(
				await f.request(`/api/armory/bis-entries/${first.body.id}`, 'member', 'PATCH', {
					status: 'Conseguido',
					notes: 'Me falta poco',
				})
			).status,
			200,
		);
		assert.equal(
			(await f.request(`/api/armory/bis-lists/${list.body.id}`, 'member', 'DELETE', {})).status,
			200,
		);
		assert.equal(f.db.prepare('SELECT COUNT(*) n FROM bis_entries').get().n, 0);
	} finally {
		await f.close();
	}
});

test('officer reviews and internal notes are restricted and audited without note text', async () => {
	const f = await fixture();
	try {
		const id = await f.character('member');
		assert.equal(
			(await f.request(`/api/armory/characters/${id}/reviews`, 'raid_leader', 'POST', {})).status,
			403,
		);
		const review = await f.request(`/api/armory/characters/${id}/reviews`, 'officer', 'POST', {
			summary: 'Lista coherente con las guías consultadas',
		});
		assert.equal(review.status, 201);
		assert.equal(
			(
				await f.request(`/api/armory/reviews/${review.body.id}`, 'officer', 'PATCH', {
					status: 'Completada',
				})
			).status,
			200,
		);
		const note = await f.request(`/api/armory/characters/${id}/notes`, 'officer', 'POST', {
			body: 'Texto interno confidencial',
		});
		assert.equal(note.status, 201);
		const sheet = (await f.request(`/api/armory/characters/${id}`, 'officer')).body;
		assert.equal(sheet.reviews[0].status, 'Completada');
		assert.equal(sheet.reviews[0].completed_by, 'officer');
		assert.ok(sheet.reviews[0].completed_at);
		assert.equal(sheet.notes[0].body, 'Texto interno confidencial');
		const ownerView = (await f.request(`/api/armory/characters/${id}`, 'member')).body;
		assert.equal(JSON.stringify(ownerView).includes('confidencial'), false);
		assert.equal(
			JSON.stringify(f.db.prepare('SELECT changes FROM audit').all()).includes('confidencial'),
			false,
		);
		assert.equal(
			(await f.request(`/api/armory/notes/${note.body.id}`, 'member', 'DELETE', {})).status,
			403,
		);
		assert.equal(
			(await f.request(`/api/armory/notes/${note.body.id}`, 'leader', 'DELETE', {})).status,
			200,
		);
	} finally {
		await f.close();
	}
});

test('guide links are configured by the leader, host-checked and shown only when verified', async () => {
	const f = await fixture();
	try {
		const id = await f.character('member', { spec: 'arcane' });
		const link = {
			provider_id: 'wowhead',
			game_version: 'forever',
			class: 'Mago',
			spec: 'arcane',
			content_type: 'general',
			url: 'https://www.wowhead.com/',
			verified: false,
		};
		assert.equal((await f.request('/api/armory/guides', 'officer')).status, 403);
		assert.equal((await f.request('/api/armory/guide-links', 'officer', 'POST', link)).status, 403);
		for (const url of [
			'http://www.wowhead.com/',
			'https://wowhead.com.evil.example/',
			'https://user:pass@www.wowhead.com/',
			'javascript:alert(1)',
		])
			assert.equal(
				(await f.request('/api/armory/guide-links', 'leader', 'POST', { ...link, url })).status,
				400,
				url,
			);
		assert.equal(
			(await f.request('/api/armory/guide-links', 'leader', 'POST', { ...link, spec: 'fury' }))
				.status,
			400,
		);
		const created = await f.request('/api/armory/guide-links', 'leader', 'POST', link);
		assert.equal(created.status, 201);
		const sections = async () =>
			(await f.request(`/api/armory/characters/${id}`, 'member')).body.guides.arcane[0].sections;
		assert.deepEqual((await sections()).find((s) => s.type === 'general').links, []);
		assert.equal(
			(
				await f.request(`/api/armory/guide-links/${created.body.id}`, 'leader', 'PATCH', {
					...link,
					verified: true,
				})
			).status,
			200,
		);
		assert.deepEqual((await sections()).find((s) => s.type === 'general').links, [
			{ url: 'https://www.wowhead.com/', phase: '' },
		]);
		// A different class never receives the link.
		const warrior = await f.character('raider', { class: 'Guerrero', role: 'Tanque' });
		const other = (await f.request(`/api/armory/characters/${warrior}`, 'raider')).body.guides[''];
		assert.ok(other.every((p) => p.sections.every((s) => !s.links.length)));
		// Changing the URL drops the previous verification unless re-confirmed.
		const verifiedAt = f.db.prepare('SELECT verified_at FROM guide_links').get().verified_at;
		assert.ok(verifiedAt);
		await f.request(`/api/armory/guide-links/${created.body.id}`, 'leader', 'PATCH', {
			...link,
			url: 'https://www.wowhead.com/guides',
			verified: false,
		});
		assert.equal(f.db.prepare('SELECT verified_at FROM guide_links').get().verified_at, null);
		// Disabled providers disappear from sheets.
		await f.request('/api/armory/guide-providers/wowhead', 'leader', 'PATCH', { active: false });
		const providers = (await f.request(`/api/armory/characters/${id}`, 'member')).body.guides
			.arcane;
		assert.equal(
			providers.some((p) => p.id === 'wowhead'),
			false,
		);
	} finally {
		await f.close();
	}
});
