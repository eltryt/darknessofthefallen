// Builds the wishlist's raid catalogue: every Classic raid, its bosses and what each boss
// drops, with Spanish names. Loot tables come from AtlasLoot Classic (item ids per boss);
// names, quality, icon and slot of each item and the bosses' Spanish names come from
// Wowhead Classic (es). Boss portraits are Blizzard's encounter-journal art from Wowhead,
// stored as small WebP files. Classic loot, shown as orientative for WoW Forever.
//
// Run: node scripts/build-raid-loot.mjs
// Writes public/catalog/raids.json, public/boss-portraits.js and public/assets/bosses/.
import { mkdir, writeFile } from 'node:fs/promises';
import sharp from 'sharp';

const ATLAS =
	'https://raw.githubusercontent.com/Hoizame/AtlasLootClassic/master/AtlasLootClassic_DungeonsAndRaids/data.lua';
const tooltip = (kind, id) => `https://nether.wowhead.com/tooltip/${kind}/${id}?dataEnv=4&locale=6`;
const PORTRAIT = (slug) => `https://wow.zamimg.com/images/wow/journal/ui-ej-boss-${slug}.png`;
const OUT = new URL('../public/', import.meta.url);

// Release order. id is stable; names are the Spanish client's.
export const raids = [
	{ key: 'MoltenCore', id: 'mc', name: 'Núcleo de Magma', size: 40 },
	{ key: 'Onyxia', id: 'onyxia', name: 'Guarida de Onyxia', size: 40 },
	{ key: 'BlackwingLair', id: 'bwl', name: 'Guarida Alanegra', size: 40 },
	{ key: "Zul'Gurub", id: 'zg', name: "Zul'Gurub", size: 20 },
	{ key: 'TheRuinsofAhnQiraj', id: 'aq20', name: "Ruinas de Ahn'Qiraj", size: 20 },
	{ key: 'TheTempleofAhnQiraj', id: 'aq40', name: "Templo de Ahn'Qiraj", size: 40 },
	{ key: 'Naxxramas', id: 'naxx', name: 'Naxxramas', size: 40 },
];
// Encounters with several NPCs: their encounter-journal names in Spanish.
const groupNames = {
	'Bug Trio': 'Realeza silítida',
	'Twin Emperors': 'Emperadores gemelos',
	'The Four Horsemen': 'Los Cuatro Jinetes',
};
// Wowhead's Spanish slot words → the wishlist's slots.
const slotWords = [
	[/^cabeza$/i, 'head'],
	[/^cuello$/i, 'neck'],
	[/^hombros?$/i, 'shoulders'],
	[/^espalda$/i, 'back'],
	[/^(pecho|toga)$/i, 'chest'],
	[/^muñecas?$/i, 'wrist'],
	[/^manos$/i, 'hands'],
	[/^cintura$/i, 'waist'],
	[/^piernas$/i, 'legs'],
	[/^pies$/i, 'feet'],
	[/^dedo$/i, 'finger1'],
	[/^(abalorio|alhaja)$/i, 'trinket1'],
	[/^(una mano|dos manos|mano principal|mano derecha)$/i, 'main_hand'],
	[
		/^(mano secundaria|mano izquierda|sostener con la mano izquierda|sostenido con la mano izquierda)$/i,
		'off_hand',
	],
	[/^(a distancia|arrojadiza|reliquia|munición|varita)$/i, 'ranged'],
];
const qualities = ['poor', 'common', 'uncommon', 'rare', 'epic', 'legendary'];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function json(url) {
	for (let tries = 0; ; tries++) {
		const res = await fetch(url, { headers: { 'user-agent': 'guild-raid-catalog/1.0' } });
		if (res.ok) return res.json();
		if (tries >= 3) throw new Error(`${res.status} ${url}`);
		await sleep(1000 * (tries + 1));
	}
}
async function pool(list, size, task) {
	const out = new Array(list.length);
	let next = 0;
	await Promise.all(
		Array.from({ length: size }, async () => {
			while (next < list.length) {
				const i = next++;
				out[i] = await task(list[i]);
			}
		}),
	);
	return out;
}

// One raid block of data.lua → [{name, npcs, items}] for real bosses (no trash/extra lists).
export function parseRaid(src, key) {
	const start = src.indexOf(`data["${key}"]`);
	if (start < 0) throw new Error(`Raid not found: ${key}`);
	const end = src.indexOf('\ndata["', start + 10);
	const block = src.slice(start, end < 0 ? undefined : end);
	const bosses = [];
	const parts = block.split(/\n\t\t\{[^\n]*\n/).slice(1);
	for (const part of parts) {
		const name = /name = AL\["([^"]+)"\]/.exec(part)?.[1];
		const npc = /npcID = (\{[^}]*\}|\d+)/.exec(part)?.[1];
		if (!name || !npc || /ExtraList = true/.test(part)) continue;
		const loot = /\[NORMAL_DIFF\] = \{([\s\S]*?)\n\t\t\t\}/.exec(part)?.[1] || '';
		const items = [...loot.matchAll(/\{\s*\d+,\s*(\d+)\s*[,}]/g)].map((m) => Number(m[1]));
		bosses.push({ name, npcs: npc.match(/\d+/g).map(Number), items: [...new Set(items)] });
	}
	return bosses;
}

// The slot line of a tooltip: "<td>Pies</td><th>Tela</th>" → {slot, type: 'Pies · Tela'}.
export function slotOf(html) {
	const m = /<table width="100%"><tr><td>([^<]+)<\/td>(?:<th>(?:<[^>]+>)*([^<]*))?/.exec(
		html.replace(/<!--.*?-->/g, ''),
	);
	if (!m) return { slot: '', type: '' };
	const word = m[1].trim();
	return {
		slot: slotWords.find(([re]) => re.test(word))?.[1] || '',
		type: [word, (m[2] || '').trim()].filter(Boolean).join(' · '),
	};
}

const slugify = (s) =>
	s
		.toLowerCase()
		.replace(/['’]/g, '')
		.replace(/[^a-z0-9]+/g, ' ')
		.trim();
function portraitSlugs(name) {
	const words = slugify(name).split(' ');
	const noThe = words.filter((w) => w !== 'the');
	const set = new Set([
		words.join(''),
		noThe.join(''),
		words.join('-'),
		noThe.join('-'),
		noThe[0],
		noThe.at(-1),
		noThe.slice(0, 2).join(''),
		noThe.slice(0, 2).join('-'),
	]);
	return [...set].filter(Boolean);
}
// Journal art whose file name is not derived from the boss's English name.
const portraitNames = { 'Bug Trio': 'silithid-royalty' };
async function portrait(boss, file) {
	const slugs = portraitNames[boss.name] ? [portraitNames[boss.name]] : portraitSlugs(boss.name);
	for (const slug of slugs) {
		const res = await fetch(PORTRAIT(slug));
		if (!res.ok) continue;
		const buf = Buffer.from(await res.arrayBuffer());
		await sharp(buf)
			.resize(96, 96, { fit: 'cover' })
			.webp({ quality: 82 })
			.toFile(fileURLToPath(file));
		return slug;
	}
	return null;
}

async function main() {
	const src = await (await fetch(ATLAS)).text();
	await mkdir(new URL('assets/bosses/', OUT), { recursive: true });
	await mkdir(new URL('catalog/', OUT), { recursive: true });
	const itemCache = new Map();
	const item = async (id) => {
		if (!itemCache.has(id))
			itemCache.set(
				id,
				json(tooltip('item', id))
					.then((t) => ({
						id,
						name: t.name,
						quality: qualities[t.quality] || 'common',
						icon: t.icon,
						...slotOf(t.tooltip || ''),
						// Containers that only hold gems or gold are not loot anyone asks for.
						junk: /para abrir/i.test(t.tooltip || '') || t.quality < 2,
					}))
					.catch(() => null),
			);
		return itemCache.get(id);
	};
	const portraits = [];
	const out = [];
	for (const raid of raids) {
		const bosses = parseRaid(src, raid.key);
		const built = await pool(bosses, 3, async (b) => {
			const npc = b.npcs[0];
			const spanish =
				groupNames[b.name] ||
				(await json(tooltip('npc', npc))
					.then((t) => t.name)
					.catch(() => b.name));
			const items = (await pool(b.items, 6, item))
				.filter((i) => i && !i.junk)
				.map(({ junk, ...i }) => i);
			const file = new URL(`assets/bosses/${npc}.webp`, OUT);
			const slug = await portrait(b, file);
			if (slug) portraits.push(npc);
			console.log(`  ${b.name} → ${spanish}: ${slug || 'sin retrato'}`);
			return { id: `${raid.id}-${npc}`, npc, name: spanish, portrait: Boolean(slug), items };
		});
		out.push({ id: raid.id, name: raid.name, size: raid.size, bosses: built });
		console.log(
			`${raid.name}: ${built.length} jefes, ${built.reduce((n, b) => n + b.items.length, 0)} objetos`,
		);
	}
	const catalog = {
		source: 'AtlasLoot Classic (tablas de botín) y Wowhead Classic (nombres en español)',
		game: 'WoW Classic (orientativo para WoW Forever)',
		generatedAt: new Date().toISOString(),
		raids: out,
	};
	await writeFile(new URL('catalog/raids.json', OUT), JSON.stringify(catalog));
	await writeFile(
		new URL('boss-portraits.js', OUT),
		`// Bosses with a portrait in /assets/bosses/<npc>.webp (scripts/build-raid-loot.mjs).\nexport const bossPortraits = ${JSON.stringify(portraits.sort((a, b) => a - b))};\n`,
	);
}

import { pathToFileURL, fileURLToPath } from 'node:url';
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
