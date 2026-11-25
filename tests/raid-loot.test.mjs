import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createServer } from 'node:http';
import { parseRaid, slotOf, raids } from '../scripts/build-raid-loot.mjs';
import { bossPortraits } from '../public/boss-portraits.js';
import { wishLabel, isWanted } from '../public/wish-states.js';
import { openDatabase } from '../src/db.mjs';
import { createApp } from '../src/app.mjs';
import { issueSession } from '../src/auth.mjs';

// The wishlist's raid catalogue: every Classic raid with its bosses and their loot.
const catalog = JSON.parse(
	readFileSync(new URL('../public/catalog/raids.json', import.meta.url), 'utf8'),
);

test('AtlasLoot blocks become bosses with their item ids; trash and extra lists are skipped', () => {
	const src = `data["MoltenCore"] = {
	items = {
		{	--MCLucifron
			name = AL["Lucifron"],
			npcID = 12118,
			[NORMAL_DIFF] = {
				{ 1, 16800 },	-- Arcanist Boots
				{ 16, 18870 },	-- Helm of the Lifegiver
				{ 17, 16800 },
			},
		},
		{	--MCTwins
			name = AL["Twin Emperors"],
			npcID = {15275, 15276},
			[NORMAL_DIFF] = {
				{ 1, 20726, [PRICE_EXTRA_ITTYPE] = "x" },
			},
		},
		{	--MCTrash
			name = AL["Trash"],
			ExtraList = true,
			[NORMAL_DIFF] = {
				{ 1, 16802 },
			},
		},
	},
}
data["Onyxia"] = {}`;
	assert.deepEqual(parseRaid(src, 'MoltenCore'), [
		{ name: 'Lucifron', npcs: [12118], items: [16800, 18870] },
		{ name: 'Twin Emperors', npcs: [15275, 15276], items: [20726] },
	]);
});

test('the slot and type of an item come from its Spanish tooltip', () => {
	assert.deepEqual(
		slotOf('<table width="100%"><tr><td>Pies</td><th><!--x--><span>Tela</span></th>'),
		{
			slot: 'feet',
			type: 'Pies · Tela',
		},
	);
	assert.deepEqual(slotOf('<table width="100%"><tr><td>Espalda</td></tr></table>'), {
		slot: 'back',
		type: 'Espalda',
	});
	assert.equal(slotOf('<table width="100%"><tr><td>Alhaja</td><th></th>').slot, 'trinket1');
	assert.equal(
		slotOf('<table width="100%"><tr><td>Mano secundaria</td><th>Escudo</th>').slot,
		'off_hand',
	);
	assert.deepEqual(slotOf('<b>Cabeza de Onyxia</b>'), { slot: '', type: '' });
});

test('the catalogue has every raid and boss, with loot, and portraits that exist', () => {
	assert.deepEqual(
		catalog.raids.map((r) => [r.id, r.bosses.length]),
		[
			['mc', 10],
			['onyxia', 1],
			['bwl', 8],
			['zg', 13],
			['aq20', 6],
			['aq40', 9],
			['naxx', 15],
		],
	);
	assert.deepEqual(
		catalog.raids.map((r) => r.id),
		raids.map((r) => r.id),
	);
	const ids = new Set();
	for (const raid of catalog.raids)
		for (const boss of raid.bosses) {
			assert.ok(!ids.has(boss.id), `boss repeated: ${boss.id}`);
			ids.add(boss.id);
			assert.ok(boss.name && boss.items.length, `${boss.id} has a name and loot`);
			for (const item of boss.items) {
				assert.ok(Number.isInteger(item.id) && item.name && item.icon, `${item.id} complete`);
				assert.ok(['uncommon', 'rare', 'epic', 'legendary'].includes(item.quality));
			}
			assert.equal(boss.portrait, bossPortraits.includes(boss.npc), boss.name);
		}
	for (const npc of bossPortraits)
		assert.ok(
			existsSync(new URL(`../public/assets/bosses/${npc}.webp`, import.meta.url)),
			String(npc),
		);
	const nefarian = catalog.raids[2].bosses.find((b) => b.npc === 11583);
	assert.equal(nefarian.name, 'Nefarian');
	assert.ok(nefarian.items.some((i) => i.id === 19003)); // Cabeza de Nefarian
	assert.ok(!nefarian.items.some((i) => /saco de gemas/i.test(i.name)));
});

test('old wishlist marks read as the new ones', () => {
	assert.equal(wishLabel('Me interesa'), 'Mejora menor');
	assert.equal(wishLabel(undefined), 'Mejora menor');
	assert.equal(wishLabel('Mejora mayor'), 'Mejora mayor');
	assert.equal(isWanted('Pasar'), false);
	assert.equal(isWanted('BiS'), true);
});

test('the wishlist saves BiS, Mejora mayor and Mejora menor with priority and notes', async () => {
	const db = openDatabase(':memory:');
	db.prepare('INSERT INTO users VALUES(?,?,?,?)').run(
		'r',
		'Raider',
		'raider',
		new Date().toISOString(),
	);
	const session = issueSession(db, 'r');
	const server = createServer(createApp(db, { APP_ORIGIN: 'http://localhost:3000' }));
	await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
	const request = async (path, method = 'GET', value) => {
		const r = await fetch(`http://127.0.0.1:${server.address().port}${path}`, {
			method,
			headers: {
				Origin: 'http://localhost:3000',
				'Content-Type': 'application/json',
				Cookie: `session=${session.raw}`,
				'X-CSRF-Token': session.csrf,
			},
			...(value === undefined ? {} : { body: JSON.stringify(value) }),
		});
		return { status: r.status, body: await r.json().catch(() => null) };
	};
	try {
		const c = await request('/api/characters', 'POST', {
			name: 'Tryt',
			class: 'Brujo',
			role: 'DPS distancia',
		});
		const base = { characterId: c.body.id, raid: 'Guarida Alanegra', boss: 'Nefarian' };
		const major = await request('/api/wishlists', 'POST', {
			...base,
			item: 'Lágrima de Neltharion',
			status: 'Mejora mayor',
			priority: 2,
			notes: 'Para PvE de sombras',
		});
		assert.equal(major.status, 201);
		const plain = await request('/api/wishlists', 'POST', {
			...base,
			item: 'Capa tejida con elementium',
			priority: 3,
		});
		assert.equal(plain.status, 201);
		assert.equal(
			(await request('/api/wishlists', 'POST', { ...base, item: 'X', status: 'Lo quiero' })).status,
			400,
		);
		const path = '/api/wishlists/' + major.body.id;
		assert.equal((await request(path, 'PATCH', { status: 'BiS', priority: 1 })).status, 200);
		const rows = Object.fromEntries(
			(await request('/api/wishlists')).body.map((w) => [w.id, w.data]),
		);
		assert.equal(rows[major.body.id].status, 'BiS');
		assert.equal(rows[major.body.id].priority, 1);
		assert.equal(rows[major.body.id].notes, 'Para PvE de sombras');
		assert.equal(rows[plain.body.id].status, 'Mejora menor');
	} finally {
		await new Promise((resolve) => server.close(resolve));
		db.close();
	}
});
