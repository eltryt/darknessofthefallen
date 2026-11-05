import test from 'node:test';
import assert from 'node:assert/strict';
import { compactItem, iconName, inventoryGroups, nameIndex } from '../scripts/sync-items.mjs';
import { searchItems, equipmentFromItem } from '../public/item-catalog.js';
import { catalogGroups, catalogIconUrl, catalogGroup } from '../public/armory-catalog.js';
import { staticFile, securityHeaders } from '../src/app.mjs';
import { itemKey, itemLink, wowheadItemUrl } from '../public/wowhead.js';

const thunderfury = {
	id: 19019,
	name: 'Trueno furioso, espada bendita del Hijo del Viento',
	quality: { type: 'LEGENDARY' },
	level: 80,
	required_level: 60,
	item_subclass: { name: 'Espada' },
	inventory_type: { type: 'WEAPON', name: 'Una mano' },
	preview_item: {
		binding: { type: 'ON_ACQUIRE' },
		stats: [
			{ type: { type: 'AGILITY' }, value: 5 },
			{ type: { type: 'FIRE_RESISTANCE' }, value: 8 },
		],
		weapon: {
			damage: { min_value: 82, max_value: 153 },
			attack_speed: { value: 1900 },
			dps: { value: 73.947 },
		},
		spells: [{ description: 'Lanza un rayo.' }],
	},
};

test('the sync keeps what the armory needs from a Blizzard item', () => {
	const icon = iconName({
		assets: [
			{
				key: 'icon',
				value: 'https://render.worldofwarcraft.com/classic1x-eu/icons/56/inv_sword_39.jpg',
			},
		],
	});
	assert.equal(icon, 'inv_sword_39');
	assert.deepEqual(compactItem(thunderfury, icon), {
		id: 19019,
		name: 'Trueno furioso, espada bendita del Hijo del Viento',
		quality: 'legendary',
		level: 80,
		required: 60,
		type: 'Espada · Una mano',
		icon: 'inv_sword_39',
		stats: { agility: 5, fire_resistance: 8 },
		weapon: { min: 82, max: 153, speed: 1.9, dps: 73.9 },
		effects: ['Lanza un rayo.'],
		bop: true,
	});
	for (const groups of Object.values(inventoryGroups))
		for (const g of groups) assert.ok(catalogGroups.includes(g), g);
	assert.equal(catalogGroup('finger2'), 'finger');
	assert.equal(catalogGroup('main_hand'), 'main_hand');
});

test('the finder ignores accents and keeps only known qualities and stats', () => {
	const items = [
		{ id: 1, name: 'Yelmo de Valor', level: 60 },
		{ id: 2, name: 'Gorro de lana', level: 5 },
	];
	assert.deepEqual(
		searchItems(items, 'valór').map((i) => i.id),
		[1],
	);
	assert.deepEqual(searchItems(items, '  '), []);
	const item = equipmentFromItem({
		id: 7,
		name: 'Pieza',
		quality: 'heirloom',
		level: 40,
		icon: 'inv_x',
		armor: 300,
		stats: { stamina: 10, haste: 5 },
	});
	assert.deepEqual(item, {
		item_id: '7',
		item_name: 'Pieza',
		quality: '',
		item_level: 40,
		icon: 'inv_x',
		stats: { stamina: 10, armor: 300 },
	});
});

test('catalogue files are served and only Blizzard and Wowhead may load from outside', () => {
	for (const g of [...catalogGroups, 'names', 'meta'])
		assert.ok(staticFile(`/catalog/${g}.json`), g);
	const csp = securityHeaders('https://x')['Content-Security-Policy'];
	assert.match(
		csp,
		/img-src 'self' data: https:\/\/render\.worldofwarcraft\.com https:\/\/wow\.zamimg\.com;/,
	);
	assert.match(
		csp,
		/script-src 'self' https:\/\/www\.googletagmanager\.com https:\/\/wow\.zamimg\.com;/,
	);
	assert.match(csp, /connect-src [^;]* https:\/\/nether\.wowhead\.com;/);
	assert.equal(
		catalogIconUrl('inv_sword_39'),
		'https://render.worldofwarcraft.com/classic1x-eu/icons/56/inv_sword_39.jpg',
	);
	assert.equal(catalogIconUrl('../x'), '');
});

test('item names typed in the wishlist or loot link to their Wowhead Forever tooltip', () => {
	const ids = new Map(
		Object.entries(
			nameIndex({
				main_hand: [
					{ id: 19019, name: 'Trueno furioso, espada bendita del Hijo del Viento' },
					{ id: 1, name: 'Capa de la Necrópolis' },
				],
				back: [{ id: 23050, name: 'Capa de la Necrópolis' }],
			}),
		),
	);
	const esc = (v) => String(v).replace(/[<>&"]/g, (c) => `&#${c.charCodeAt(0)};`);
	assert.equal(itemKey('  capa de la  NECROPOLIS '), 'capa de la necropolis');
	assert.equal(ids.get('capa de la necropolis'), 1);
	assert.equal(wowheadItemUrl(19019), 'https://www.wowhead.com/forever/es/item=19019');
	assert.match(
		itemLink('trueno furioso, espada bendita del hijo del viento', ids, esc),
		/^<a class="wowhead-link" href="https:\/\/www\.wowhead\.com\/forever\/es\/item=19019"/,
	);
	assert.equal(
		itemLink('<b>Objeto inventado</b>', ids, esc),
		'&#60;b&#62;Objeto inventado&#60;/b&#62;',
	);
	assert.equal(itemLink('Lo que sea', undefined, esc), 'Lo que sea');
});
