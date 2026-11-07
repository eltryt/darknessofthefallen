import { randomUUID } from 'node:crypto';
import { HttpError, classes } from './domain.mjs';
import { token, hash, cookies } from './auth.mjs';
import { gameVersions } from '../public/armory-catalog.js';
import { audit, transaction } from './database-core.mjs';

// "Conectar con Battle.net": each member authorises their own account once and the web
// imports their WoW Forever characters (name, surname, class, race, faction, level).
// The Battle.net token is used for that single request and never stored. Afterwards the
// web looks each imported character up every six hours with its own application token,
// to keep the level, professions, equipment and portrait current.
const REGION = 'eu';
const NAMESPACE = `profile-forever-${REGION}`;
const API = `https://${REGION}.api.blizzard.com`;
const CHARACTER_LIMIT = 30;
const SYNC_EVERY_MS = 6 * 3600000;
// Characters per alarm run: each takes up to seven requests, and the Worker caps them.
const SYNC_BATCH = 6;
// Item icons asked to Blizzard per refresh; an icon already known for that item is reused.
const ICON_FETCHES = 30;
const callback = (env) => `${env.APP_ORIGIN}/auth/battlenet/callback`;

export function battlenetReady(env) {
	return !!(env.BLIZZARD_CLIENT_ID && env.BLIZZARD_CLIENT_SECRET);
}

// The state is bound to the member who started it, so a callback only imports into
// the account that asked for it.
export function startBattlenet(db, env, user) {
	if (!battlenetReady(env))
		throw new HttpError(503, 'La conexión con Battle.net está pendiente de configuración.');
	const state = token();
	db.prepare('DELETE FROM oauth_states WHERE expires<?').run(Date.now());
	db.prepare('INSERT INTO oauth_states VALUES(?,?)').run(
		hash(`battlenet:${user.id}:${state}`),
		Date.now() + 600000,
	);
	const params = new URLSearchParams({
		client_id: env.BLIZZARD_CLIENT_ID,
		response_type: 'code',
		redirect_uri: callback(env),
		scope: 'wow.profile',
		state,
	});
	return { state, url: `https://oauth.battle.net/authorize?${params}` };
}

export async function finishBattlenet(db, req, url, env, user, fetcher = fetch) {
	if (url.searchParams.get('error')) throw new HttpError(400, 'denied');
	const state = url.searchParams.get('state'),
		code = url.searchParams.get('code');
	if (!state || state !== cookies(req).bnet_state || !code) throw new HttpError(400, 'invalid');
	const found = db
		.prepare('DELETE FROM oauth_states WHERE hash=? AND expires>? RETURNING hash')
		.get(hash(`battlenet:${user.id}:${state}`), Date.now());
	if (!found) throw new HttpError(400, 'expired');
	const r = await fetcher('https://oauth.battle.net/token', {
		method: 'POST',
		headers: {
			Authorization: 'Basic ' + btoa(`${env.BLIZZARD_CLIENT_ID}:${env.BLIZZARD_CLIENT_SECRET}`),
			'Content-Type': 'application/x-www-form-urlencoded',
		},
		body: new URLSearchParams({
			grant_type: 'authorization_code',
			code,
			redirect_uri: callback(env),
		}),
		signal: AbortSignal.timeout(10000),
	});
	if (!r.ok) throw new HttpError(502, 'token');
	const { access_token: access } = await r.json();
	const p = await fetcher(`${API}/profile/user/wow?namespace=${NAMESPACE}&locale=es_ES`, {
		headers: { Authorization: `Bearer ${access}` },
		signal: AbortSignal.timeout(10000),
	});
	// 404: the account has no Forever characters yet.
	if (p.status === 404) return importCharacters(db, user, { wow_accounts: [] });
	if (!p.ok) throw new HttpError(502, 'profile');
	return importCharacters(db, user, await p.json());
}

// Blizzard's numeric ids, the same in every WoW version.
const classById = {
	1: 'Guerrero',
	2: 'Paladín',
	3: 'Cazador',
	4: 'Pícaro',
	5: 'Sacerdote',
	7: 'Chamán',
	8: 'Mago',
	9: 'Brujo',
	11: 'Druida',
};
const raceById = {
	1: 'Humano',
	2: 'Orco',
	3: 'Enano',
	4: 'Elfo de la noche',
	5: 'No-muerto',
	6: 'Tauren',
	7: 'Gnomo',
	8: 'Trol',
};
// A starting role the member can change afterwards; Battle.net does not say it.
const defaultRole = {
	Guerrero: 'DPS melee',
	Paladín: 'Sanador',
	Cazador: 'DPS distancia',
	Pícaro: 'DPS melee',
	Sacerdote: 'Sanador',
	Chamán: 'Sanador',
	Mago: 'DPS distancia',
	Brujo: 'DPS distancia',
	Druida: 'Sanador',
};
const fold = (s) =>
	String(s || '')
		.normalize('NFD')
		.replace(/[̀-ͯ]/g, '')
		.toLowerCase()
		.trim();

// One Battle.net character in the shape of our characters table, or null if it can't be read.
export function readCharacter(c) {
	const races = gameVersions.forever.races;
	const name = String(c?.name || '').trim();
	const className = classById[c?.playable_class?.id];
	if (!name || name.length > 40 || !classes.includes(className) || c?.id == null) return null;
	// Races by id; the new ones (Cielonato) by their Spanish name, any gender.
	let race = raceById[c.playable_race?.id] || '';
	if (!race) {
		const given = fold(c.playable_race?.name);
		race =
			Object.keys(races).find((r) => fold(r) === given) ||
			(given.startsWith('cielonat') ? 'Cielonato' : '');
	}
	let faction = { ALLIANCE: 'Alianza', HORDE: 'Horda' }[c.faction?.type] || '';
	const allowed = race ? [].concat(races[race]) : [];
	if (race && faction && !allowed.includes(faction)) race = '';
	if (!faction && allowed.length === 1) faction = allowed[0];
	const level = Number.isInteger(c.level) && c.level >= 1 && c.level <= 100 ? c.level : null;
	return {
		externalId: `forever-${REGION}:${c.id}`,
		name,
		surname: String(c.surname || '')
			.trim()
			.slice(0, 40),
		class: className,
		race,
		faction,
		level,
	};
}

// Adds the account's characters and refreshes the ones already imported. A character the
// member wrote by hand is linked when its name, surname and class match. Nothing is removed,
// and a character the member archived stays archived.
export function importCharacters(db, user, profile) {
	const found = (profile?.wow_accounts || []).flatMap((a) => a.characters || []);
	// The hidden realm is the first half of the protected character's id: {realm}-{character}.
	const realmOf = new Map(
		found.map((c) => [
			c?.id,
			Number(/protected-character\/(\d+)-\d+/.exec(c?.protected_character?.href || '')?.[1]) ||
				null,
		]),
	);
	const list = found
		.map(readCharacter)
		.filter(Boolean)
		.map((c) => ({ ...c, realmId: realmOf.get(Number(c.externalId.split(':')[1])) ?? null }));
	// Due for the next refresh straight away, so the professions arrive within minutes.
	const link = db.prepare(
		'INSERT INTO battlenet_characters(character_id,realm_id) VALUES(?,?) ON CONFLICT(character_id) DO UPDATE SET realm_id=COALESCE(excluded.realm_id,realm_id),checked_at=NULL',
	);
	const result = { added: 0, updated: 0, skipped: found.length - list.length };
	const now = new Date().toISOString();
	transaction(db, () => {
		for (const c of list) {
			let row = db
				.prepare('SELECT id,archived_at FROM characters WHERE user_id=? AND external_id=?')
				.get(user.id, c.externalId);
			if (row?.archived_at) {
				result.skipped++;
				continue;
			}
			row ||= db
				.prepare(
					"SELECT id FROM characters WHERE user_id=? AND archived_at IS NULL AND external_id IS NULL AND class=? AND lower(name)=lower(?) AND (surname='' OR lower(surname)=lower(?))",
				)
				.get(user.id, c.class, c.name, c.surname);
			if (row) {
				db.prepare(
					"UPDATE characters SET name=?,surname=?,race=?,faction=?,level=?,game_version='forever',region='Europa',source='battlenet',external_id=?,synced_at=?,updated_at=? WHERE id=?",
				).run(c.name, c.surname, c.race, c.faction, c.level, c.externalId, now, now, row.id);
				link.run(row.id, c.realmId);
				result.updated++;
				continue;
			}
			const count = db
				.prepare('SELECT count(*) AS n FROM characters WHERE user_id=? AND archived_at IS NULL')
				.get(user.id).n;
			if (count >= CHARACTER_LIMIT) {
				result.skipped++;
				continue;
			}
			const id = randomUUID();
			db.prepare(
				"INSERT INTO characters(id,user_id,name,surname,class,role,is_main,source,external_id,game_version,region,race,faction,level,created_at,updated_at,synced_at) VALUES(?,?,?,?,?,?,?,'battlenet',?,'forever','Europa',?,?,?,?,?,?)",
			).run(
				id,
				user.id,
				c.name,
				c.surname,
				c.class,
				defaultRole[c.class],
				count ? 0 : 1,
				c.externalId,
				c.race,
				c.faction,
				c.level,
				now,
				now,
				now,
			);
			link.run(id, c.realmId);
			result.added++;
		}
		audit(db, user.id, 'character.battlenet_import', user.id, result);
	});
	return result;
}

// When the alarm should next refresh characters: now for ones never checked, otherwise
// six hours after the oldest check. Null while nobody has imported a character.
export function nextBattlenetSyncAt(db) {
	const row = db
		.prepare(
			'SELECT count(*) AS n, sum(b.checked_at IS NULL) AS fresh, min(b.checked_at) AS oldest FROM battlenet_characters b JOIN characters c ON c.id=b.character_id WHERE c.archived_at IS NULL',
		)
		.get();
	if (!row.n) return null;
	const next = row.fresh ? Date.now() : Date.parse(row.oldest) + SYNC_EVERY_MS;
	return iconsPending(db) ? Math.min(next, lastIconPass + ICON_RETRY_MS) : next;
}

// Forever answers profession names in English whatever the locale: ours go by Blizzard's id,
// with the English name as a fallback.
const professionById = {
	129: 'Primeros auxilios',
	164: 'Herrería',
	165: 'Peletería',
	171: 'Alquimia',
	182: 'Herboristería',
	185: 'Cocina',
	186: 'Minería',
	197: 'Sastrería',
	202: 'Ingeniería',
	333: 'Encantamiento',
	356: 'Pesca',
	393: 'Desuello',
};
const professionByName = Object.fromEntries(
	Object.entries({
		'First Aid': 129,
		Blacksmithing: 164,
		Leatherworking: 165,
		Alchemy: 171,
		Herbalism: 182,
		Cooking: 185,
		Mining: 186,
		Tailoring: 197,
		Engineering: 202,
		Enchanting: 333,
		Fishing: 356,
		Skinning: 393,
	}).map(([name, id]) => [name.toLowerCase(), professionById[id]]),
);
const professionName = (p) => {
	const given = String(p?.name || '').trim();
	return professionById[p?.id] || professionByName[given.toLowerCase()] || given;
};

// Blizzard's equipment slots in our armory's names.
const slotByType = {
	HEAD: 'head',
	NECK: 'neck',
	SHOULDER: 'shoulders',
	BACK: 'back',
	CHEST: 'chest',
	SHIRT: 'shirt',
	TABARD: 'tabard',
	WRIST: 'wrist',
	HANDS: 'hands',
	WAIST: 'waist',
	LEGS: 'legs',
	FEET: 'feet',
	FINGER_1: 'finger1',
	FINGER_2: 'finger2',
	TRINKET_1: 'trinket1',
	TRINKET_2: 'trinket2',
	MAIN_HAND: 'main_hand',
	OFF_HAND: 'off_hand',
	RANGED: 'ranged',
};
const statByType = {
	STRENGTH: 'strength',
	AGILITY: 'agility',
	STAMINA: 'stamina',
	INTELLECT: 'intellect',
	SPIRIT: 'spirit',
	FIRE_RESISTANCE: 'fire_resistance',
	NATURE_RESISTANCE: 'nature_resistance',
	FROST_RESISTANCE: 'frost_resistance',
	SHADOW_RESISTANCE: 'shadow_resistance',
	ARCANE_RESISTANCE: 'arcane_resistance',
};
const qualities = ['poor', 'common', 'uncommon', 'rare', 'epic', 'legendary'];
// The equipped items, one per slot, in the shape of character_equipment. The icon stays
// empty: the armory takes it from our item catalogue by the item's id.
export function readEquipment(data) {
	const out = new Map();
	for (const e of data?.equipped_items || []) {
		const slot = slotByType[e?.slot?.type],
			id = Number(e?.item?.id);
		if (!slot || !Number.isInteger(id) || id < 1 || id > 9999999) continue;
		const stats = {};
		for (const s of e.stats || []) {
			const key = statByType[s?.type?.type];
			if (key && Number.isFinite(s.value)) stats[key] = s.value;
		}
		if (Number.isFinite(e.armor?.value)) stats.armor = e.armor.value;
		const level = Number(e.level?.value);
		const quality = String(e.quality?.type || '').toLowerCase();
		out.set(slot, {
			item_id: String(id),
			item_name: String(e.name || '').slice(0, 120),
			quality: qualities.includes(quality) ? quality : '',
			item_level: Number.isInteger(level) && level >= 1 && level <= 1000 ? level : null,
			enchant: String(e.enchantments?.[0]?.display_string || '').slice(0, 120),
			stats,
		});
	}
	return out;
}
// The character sheet's totals: Blizzard gives each attribute as {base, effective}.
export function readStats(data) {
	if (!data || typeof data !== 'object') return null;
	const n = (v) => {
		const x = typeof v === 'object' && v ? (v.effective ?? v.base) : v;
		return Number.isFinite(x) && x >= 0 && x < 1e7 ? Math.round(x) : undefined;
	};
	const stats = {
		health: n(data.health),
		power: n(data.power),
		strength: n(data.strength),
		agility: n(data.agility),
		stamina: n(data.stamina),
		intellect: n(data.intellect),
		spirit: n(data.spirit),
		armor: n(data.armor),
	};
	// Critical strike as a percentage: melee, ranged or spell, whichever is highest.
	const crit = Math.max(
		...[data.melee_crit, data.ranged_crit, data.spell_crit].map((c) =>
			Number.isFinite(c?.value) ? c.value : -1,
		),
	);
	if (crit >= 0 && crit <= 100) stats.crit = Math.round(crit * 100) / 100;
	for (const k of Object.keys(stats)) if (stats[k] === undefined) delete stats[k];
	const power = String(data.power_type?.name || '').trim();
	if (Object.keys(stats).length && /^[\p{L} ]{2,20}$/u.test(power)) stats.power_name = power;
	return Object.keys(stats).length ? stats : null;
}
// The character's image on Blizzard's render host, only in its known shape.
export function readAvatar(data) {
	const assets = data?.assets || [];
	const url = assets.find((a) => a?.key === 'avatar')?.value || data?.avatar_url || '';
	return /^https:\/\/render\.worldofwarcraft\.com\/forever-[a-z]{2}\/character\/[\w/-]+-avatar\.jpg$/.test(
		url,
	)
		? url
		: '';
}
// The icon Forever gives an item (its media asset), kept as "forever:<file id>". Forever has
// its own items and icons, so the Classic catalogue is only the fallback.
export function readItemIcon(data) {
	for (const a of data?.assets || []) {
		const m =
			a?.key === 'icon' &&
			/^https:\/\/render\.worldofwarcraft\.com\/forever-eu\/icons\/56\/(\d{1,10})\.jpg$/.exec(
				a.value,
			);
		if (m) return `forever:${m[1]}`;
	}
	return '';
}

// Blizzard items still without an icon. They are looked up right away (every ten minutes
// at most), not at the character's next six-hour refresh.
const ICON_RETRY_MS = 10 * 60000;
let lastIconPass = 0;
const iconsPending = (db) =>
	db
		.prepare(
			"SELECT 1 FROM character_equipment e JOIN battlenet_characters b ON b.character_id=e.character_id WHERE e.origin='provider' AND e.icon='' AND e.item_id GLOB '[0-9]*' LIMIT 1",
		)
		.get();

// Blizzard items without an icon get Forever's. An item Blizzard has no icon for is marked
// "forever:0" so it is not asked again; the armory then tries the Classic catalogue.
async function fillIcons(db, media, budget) {
	lastIconPass = Date.now();
	const rows = db
		.prepare(
			"SELECT e.character_id,e.slot,e.item_id FROM character_equipment e JOIN battlenet_characters b ON b.character_id=e.character_id WHERE e.origin='provider' AND e.icon='' AND e.item_id GLOB '[0-9]*'",
		)
		.all();
	let filled = 0;
	for (const r of rows) {
		if (!/^\d+$/.test(r.item_id || '')) continue;
		let icon =
			db
				.prepare(
					"SELECT icon FROM character_equipment WHERE item_id=? AND icon LIKE 'forever:%' LIMIT 1",
				)
				.get(r.item_id)?.icon || '';
		if (!icon && budget.left > 0) {
			budget.left--;
			const m = await media(r.item_id);
			icon = m.ok
				? readItemIcon(await m.json().catch(() => null)) || 'forever:0'
				: m.status === 404
					? 'forever:0'
					: '';
		}
		if (!icon) continue;
		db.prepare(
			"UPDATE character_equipment SET icon=? WHERE character_id=? AND slot=? AND origin='provider'",
		).run(icon, r.character_id, r.slot);
		if (icon !== 'forever:0') filled++;
	}
	return filled;
}

// Blizzard is the source for the slots it reports; a slot a member filled by hand stays
// theirs. A Blizzard item no longer equipped leaves its slot.
function saveEquipment(db, characterId, items, now) {
	const rows = db
		.prepare('SELECT slot,origin FROM character_equipment WHERE character_id=?')
		.all(characterId);
	const manual = new Set(rows.filter((r) => r.origin === 'manual').map((r) => r.slot));
	let changed = 0;
	for (const r of rows)
		if (r.origin === 'provider' && !items.has(r.slot)) {
			db.prepare(
				"DELETE FROM character_equipment WHERE character_id=? AND slot=? AND origin='provider'",
			).run(characterId, r.slot);
			changed++;
		}
	for (const [slot, e] of items) {
		if (manual.has(slot)) continue;
		const stats = JSON.stringify(e.stats);
		const same = db
			.prepare(
				"SELECT 1 FROM character_equipment WHERE character_id=? AND slot=? AND origin='provider' AND item_id=? AND item_level IS ? AND enchant=? AND stats=?",
			)
			.get(characterId, slot, e.item_id, e.item_level, e.enchant, stats);
		if (same) continue;
		db.prepare(
			"INSERT INTO character_equipment(id,character_id,slot,item_id,item_name,quality,item_level,enchant,stats,origin,provider,updated_at) VALUES(?,?,?,?,?,?,?,?,?,'provider','battlenet',?) ON CONFLICT(character_id,slot) DO UPDATE SET item_id=excluded.item_id,item_name=excluded.item_name,quality=excluded.quality,item_level=excluded.item_level,enchant=excluded.enchant,stats=excluded.stats,icon='',origin='provider',provider='battlenet',updated_at=excluded.updated_at",
		).run(
			randomUUID(),
			characterId,
			slot,
			e.item_id,
			e.item_name,
			e.quality,
			e.item_level,
			e.enchant,
			stats,
			now,
		);
		changed++;
	}
	return changed;
}

// Blizzard lists professions with a skill per expansion tier (Retail) or a single one
// (Classic); either way the highest is the character's.
export function readProfessions(data) {
	const skill = (p) =>
		Math.max(
			Number(p?.skill_points) || 0,
			...(p?.tiers || []).map((t) => Number(t?.skill_points) || 0),
		);
	return [...(data?.primaries || []), ...(data?.secondaries || [])]
		.map((p) => [professionName(p?.profession), skill(p)])
		.filter(([name]) => name)
		.map(([name, points]) => (points ? `${name} ${points}` : name))
		.join(', ')
		.slice(0, 160);
}

// The refresh: level and professions of the characters due, oldest check first. A lookup
// counts only when it returns the Blizzard id we imported, so a namesake is never taken
// for the member's character. What Blizzard answered is kept per character and in the audit.
export async function syncBattlenet(db, env, fetcher = fetch) {
	if (!battlenetReady(env)) return null;
	const cutoff = new Date(Date.now() - SYNC_EVERY_MS).toISOString();
	const due = db
		.prepare(
			'SELECT b.character_id AS id,b.realm_id,c.name,c.surname,c.external_id,c.level,c.professions,c.avatar_url,c.stats FROM battlenet_characters b JOIN characters c ON c.id=b.character_id WHERE c.archived_at IS NULL AND (b.checked_at IS NULL OR b.checked_at<?) ORDER BY b.checked_at IS NOT NULL, b.checked_at LIMIT ?',
		)
		.all(cutoff, SYNC_BATCH);
	if (!due.length && (!iconsPending(db) || Date.now() < lastIconPass + ICON_RETRY_MS)) return null;
	const result = { checked: due.length, updated: 0, missing: 0, gear: 0, icons: 0, answers: {} };
	const budget = { left: ICON_FETCHES };
	const mark = db.prepare(
		'UPDATE battlenet_characters SET checked_at=?,status=? WHERE character_id=?',
	);
	const get = (path, token, namespace = NAMESPACE) =>
		fetcher(`${API}${path}?namespace=${namespace}&locale=es_ES`, {
			headers: { Authorization: `Bearer ${token}` },
			signal: AbortSignal.timeout(10000),
		});
	try {
		const r = await fetcher('https://oauth.battle.net/token', {
			method: 'POST',
			headers: {
				Authorization: 'Basic ' + btoa(`${env.BLIZZARD_CLIENT_ID}:${env.BLIZZARD_CLIENT_SECRET}`),
				'Content-Type': 'application/x-www-form-urlencoded',
			},
			body: new URLSearchParams({ grant_type: 'client_credentials' }),
			signal: AbortSignal.timeout(10000),
		});
		if (!r.ok) throw new Error(`token ${r.status}`);
		const { access_token: token } = await r.json();
		const slugs = new Map();
		const slugOf = async (realmId) => {
			if (!realmId) return '';
			if (!slugs.has(realmId)) {
				const s = await get(`/data/wow/realm/${realmId}`, token, `dynamic-forever-${REGION}`);
				slugs.set(realmId, s.ok ? String((await s.json().catch(() => null))?.slug || '') : '');
			}
			return slugs.get(realmId);
		};
		for (const c of due) {
			const now = new Date().toISOString(),
				blizzardId = Number(c.external_id?.split(':')[1]),
				name = c.name.toLowerCase(),
				slug = await slugOf(c.realm_id);
			// The realm route, and the realmless one Forever's own links use.
			const paths = [
				slug && `/profile/wow/character/${encodeURIComponent(slug)}/${encodeURIComponent(name)}`,
				c.surname &&
					`/profile/wow/character/${encodeURIComponent(`${name}-${c.surname.toLowerCase()}`)}`,
			].filter(Boolean);
			let found = null;
			const status = [];
			for (const path of paths) {
				const p = await get(path, token);
				const body = p.ok ? await p.json().catch(() => null) : null;
				status.push(body && body.id !== blizzardId ? 'other' : p.status);
				if (body?.id === blizzardId) {
					found = { path, body };
					break;
				}
			}
			const answer = status.join('/') || 'no-realm';
			result.answers[answer] = (result.answers[answer] || 0) + 1;
			if (!found) {
				mark.run(now, answer, c.id);
				result.missing++;
				continue;
			}
			const level = found.body.level;
			const p = await get(`${found.path}/professions`, token);
			const professions = p.ok ? readProfessions(await p.json().catch(() => null)) : '';
			const [g, m, st] = await Promise.all([
				get(`${found.path}/equipment`, token),
				get(`${found.path}/character-media`, token),
				get(`${found.path}/statistics`, token),
			]);
			const stats = st.ok ? readStats(await st.json().catch(() => null)) : null;
			const gear = g.ok ? readEquipment(await g.json().catch(() => null)) : null;
			const avatar = m.ok ? readAvatar(await m.json().catch(() => null)) : '';
			const next = {
				level: Number.isInteger(level) && level >= 1 && level <= 100 ? level : c.level,
				professions: professions || c.professions,
				avatar: avatar || c.avatar_url,
				stats: stats ? JSON.stringify(stats) : c.stats,
			};
			transaction(db, () => {
				if (gear?.size) result.gear += saveEquipment(db, c.id, gear, now);
				if (
					next.level !== c.level ||
					next.professions !== c.professions ||
					next.avatar !== c.avatar_url ||
					next.stats !== c.stats
				) {
					db.prepare(
						'UPDATE characters SET level=?,professions=?,avatar_url=?,stats=?,synced_at=?,updated_at=? WHERE id=?',
					).run(next.level, next.professions, next.avatar, next.stats, now, now, c.id);
					result.updated++;
				} else db.prepare('UPDATE characters SET synced_at=? WHERE id=?').run(now, c.id);
			});
			const missingParts = [
				!p.ok && `professions ${p.status}`,
				!g.ok && `equipment ${g.status}`,
				!m.ok && `media ${m.status}`,
				!st.ok && `statistics ${st.status}`,
			].filter(Boolean);
			mark.run(now, missingParts.length ? `ok, ${missingParts.join(', ')}` : 'ok', c.id);
		}
		result.icons = await fillIcons(
			db,
			(id) => get(`/data/wow/media/item/${id}`, token, `static-forever-${REGION}`),
			budget,
		);
	} catch (e) {
		// Blizzard down or the application refused: the ones left are tried again in six hours.
		const now = new Date().toISOString();
		for (const c of due)
			db.prepare(
				'UPDATE battlenet_characters SET checked_at=?,status=? WHERE character_id=? AND (checked_at IS NULL OR checked_at<?)',
			).run(now, 'error', c.id, cutoff);
		result.error = String(e?.message || e).slice(0, 120);
		console.warn('Battle.net refresh failed:', result.error);
	}
	audit(db, 'battlenet:sync', 'character.battlenet_sync', 'characters', result);
	return result;
}
