import test from 'node:test';
import assert from 'node:assert/strict';
import { compactItem, iconName, inventoryGroups } from '../scripts/sync-items.mjs';
import { searchItems, equipmentFromItem } from '../public/item-catalog.js';
import { catalogGroups, catalogIconUrl, catalogGroup } from '../public/armory-catalog.js';
import { staticFile, securityHeaders } from '../src/app.mjs';

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

test('catalogue files are served and only Blizzard icons may load from outside', () => {
	for (const g of [...catalogGroups, 'meta']) assert.ok(staticFile(`/catalog/${g}.json`), g);
	assert.match(
		securityHeaders('https://x')['Content-Security-Policy'],
		/img-src 'self' data: https:\/\/render\.worldofwarcraft\.com;/,
	);
	assert.equal(
		catalogIconUrl('inv_sword_39'),
		'https://render.worldofwarcraft.com/classic1x-eu/icons/56/inv_sword_39.jpg',
	);
	assert.equal(catalogIconUrl('../x'), '');
});
