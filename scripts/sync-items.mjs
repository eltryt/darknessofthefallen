// Builds the armory's item catalogue from the Blizzard Game Data API: every equippable
// Classic item (no junk) with its Spanish name, slot, quality, levels, stats, weapon
// damage, equip effects and icon. Writes one JSON file per armory slot group plus a
// meta file to public/catalog. Runs in GitHub Actions (see item-catalog.yml).
//
// WoW Forever has no namespace in the API yet; Classic data is shown as orientative.
// When Blizzard publishes Forever, change NAMESPACE (and MAX_ID) and run it again.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { blizzardClient, pool } from './blizzard-api.mjs';
import { catalogGroups } from '../public/armory-catalog.js';

export const NAMESPACE = 'static-classic1x';
// Original Classic items end around 24,300; higher ids are later seasons (SoD and others).
export const MAX_ID = 25000;
const OUT = new URL('../public/catalog/', import.meta.url);

// Blizzard inventory types → catalogue groups (one-hand weapons fit both hands).
export const inventoryGroups = {
	HEAD: ['head'],
	NECK: ['neck'],
	SHOULDER: ['shoulders'],
	CLOAK: ['back'],
	CHEST: ['chest'],
	ROBE: ['chest'],
	BODY: ['shirt'],
	TABARD: ['tabard'],
	WRIST: ['wrist'],
	HAND: ['hands'],
	WAIST: ['waist'],
	LEGS: ['legs'],
	FEET: ['feet'],
	FINGER: ['finger'],
	TRINKET: ['trinket'],
	WEAPON: ['main_hand', 'off_hand'],
	TWOHWEAPON: ['main_hand'],
	WEAPONMAINHAND: ['main_hand'],
	WEAPONOFFHAND: ['off_hand'],
	SHIELD: ['off_hand'],
	HOLDABLE: ['off_hand'],
	RANGED: ['ranged'],
	RANGEDRIGHT: ['ranged'],
	THROWN: ['ranged'],
	RELIC: ['ranged'],
};

// A compact catalogue entry from the item endpoint and its icon name.
export function compactItem(item, icon) {
	const preview = item.preview_item || {};
	const stats = {};
	for (const s of preview.stats || []) if (s.type?.type) stats[s.type.type.toLowerCase()] = s.value;
	const weapon = preview.weapon;
	const entry = {
		id: item.id,
		name: item.name,
		quality: item.quality?.type?.toLowerCase() || '',
		level: item.level || null,
		required: item.required_level || null,
		type: [item.item_subclass?.name, item.inventory_type?.name].filter(Boolean).join(' · '),
		icon: icon || '',
	};
	if (preview.armor?.value) entry.armor = preview.armor.value;
	if (Object.keys(stats).length) entry.stats = stats;
	if (weapon?.damage)
		entry.weapon = {
			min: weapon.damage.min_value,
			max: weapon.damage.max_value,
			speed: weapon.attack_speed ? weapon.attack_speed.value / 1000 : null,
			dps: weapon.dps ? Math.round(weapon.dps.value * 10) / 10 : null,
		};
	const effects = (preview.spells || []).map((s) => s.description).filter(Boolean);
	if (effects.length) entry.effects = effects;
	if (preview.binding?.type === 'ON_ACQUIRE') entry.bop = true;
	return entry;
}

export const iconName = (media) =>
	media?.assets?.find((a) => a.key === 'icon')?.value?.match(/\/([\w-]+)\.jpg$/)?.[1] || '';

// Every equippable, non-junk item id: ranges are halved until each fits under the
// search's 1,000-result cap.
async function equippableIds(api, namespace) {
	const found = [];
	let build = '';
	const walk = async (from, to) => {
		const page = await api.get('/data/wow/search/item', {
			namespace,
			orderby: 'id',
			_pageSize: '1000',
			id: `[${from},${to}]`,
			is_equippable: 'true',
		});
		if (page.resultCountCapped && to > from) {
			const middle = Math.floor((from + to) / 2);
			await walk(from, middle);
			await walk(middle + 1, to);
			return;
		}
		for (const r of page.results) {
			build ||= r.key?.href?.match(/namespace=static-([\d.]+_\d+)/)?.[1] || '';
			if (r.data.quality?.type !== 'POOR' && inventoryGroups[r.data.inventory_type?.type])
				found.push(r.data.id);
		}
	};
	for (let from = 1; from <= MAX_ID; from += 5000) await walk(from, Math.min(from + 4999, MAX_ID));
	return { ids: [...new Set(found)].sort((a, b) => a - b), build };
}

async function main() {
	const api = await blizzardClient();
	const namespace = `${NAMESPACE}-${api.region}`;
	const { ids, build } = await equippableIds(api, namespace);
	console.log(`${ids.length} equippable items in ${namespace} (build ${build || 'unknown'}).`);
	const previous = await readFile(new URL('meta.json', OUT), 'utf8')
		.then(JSON.parse)
		.catch(() => null);
	if (previous?.build === build && previous?.count && !process.env.FORCE_CATALOG) {
		console.log('Game data build unchanged since the last catalogue: nothing to do.');
		return;
	}
	// Item + icon per id. Blizzard allows 36,000 requests an hour: stay well under it.
	let done = 0;
	const failed = [];
	const started = Date.now();
	const entries = await pool(ids, 8, async (id) => {
		// One item that keeps failing is skipped and reported, never the whole catalogue.
		const [item, media] = await Promise.all([
			api.get(`/data/wow/item/${id}`, { namespace, locale: 'es_ES' }),
			api.get(`/data/wow/media/item/${id}`, { namespace }),
		]).catch((error) => {
			failed.push(id);
			console.log(`Item ${id} skipped: ${error.message}`);
			return [null, null];
		});
		if (++done % 500 === 0) console.log(`${done}/${ids.length} items`);
		// Two requests per item, at most ~9 per second.
		const wait = (done * 2 * 1000) / 9 - (Date.now() - started);
		if (wait > 0) await new Promise((r) => setTimeout(r, wait));
		return item ? { item, icon: iconName(media) } : null;
	});
	const groups = Object.fromEntries(catalogGroups.map((g) => [g, []]));
	for (const e of entries) {
		if (!e) continue;
		for (const group of inventoryGroups[e.item.inventory_type?.type] || [])
			groups[group]?.push(compactItem(e.item, e.icon));
	}
	await mkdir(OUT, { recursive: true });
	const counts = {};
	for (const [group, items] of Object.entries(groups)) {
		items.sort((a, b) => (b.level || 0) - (a.level || 0) || a.name.localeCompare(b.name, 'es'));
		counts[group] = items.length;
		await writeFile(new URL(`${group}.json`, OUT), JSON.stringify(items));
	}
	const meta = {
		source: 'Blizzard Game Data API',
		namespace,
		build,
		game: 'WoW Classic (orientativo para WoW Forever)',
		iconBase: `https://render.worldofwarcraft.com/classic1x-${api.region}/icons/56/`,
		generatedAt: new Date().toISOString(),
		count: entries.filter(Boolean).length,
		skipped: failed.length,
		counts,
	};
	await writeFile(new URL('meta.json', OUT), JSON.stringify(meta, null, '\t') + '\n');
	console.log(JSON.stringify(meta, null, 2));
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('sync-items.mjs'))
	await main();
