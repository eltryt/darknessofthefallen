import { randomUUID } from 'node:crypto';
import { HttpError, classes } from './domain.mjs';
import { token, hash, cookies } from './auth.mjs';
import { gameVersions } from '../public/armory-catalog.js';
import { audit, transaction } from './database-core.mjs';

// "Conectar con Battle.net": each member authorises their own account once and the web
// imports their WoW Forever characters (name, surname, class, race, faction, level).
// The Battle.net token is used for that single request and never stored. Afterwards the
// web looks each imported character up every six hours with its own application token,
// to keep the level and professions current. Character sheets (equipment, portrait) are
// not imported: Blizzard does not serve them yet.
const REGION = 'eu';
const NAMESPACE = `profile-forever-${REGION}`;
const API = `https://${REGION}.api.blizzard.com`;
const CHARACTER_LIMIT = 30;
const SYNC_EVERY_MS = 6 * 3600000;
// Characters per alarm run: each takes up to four requests, and the Worker caps them.
const SYNC_BATCH = 10;
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
	return row.fresh ? Date.now() : Date.parse(row.oldest) + SYNC_EVERY_MS;
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
		.map((p) => [String(p?.profession?.name || '').trim(), skill(p)])
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
			'SELECT b.character_id AS id,b.realm_id,c.name,c.surname,c.external_id,c.level,c.professions FROM battlenet_characters b JOIN characters c ON c.id=b.character_id WHERE c.archived_at IS NULL AND (b.checked_at IS NULL OR b.checked_at<?) ORDER BY b.checked_at IS NOT NULL, b.checked_at LIMIT ?',
		)
		.all(cutoff, SYNC_BATCH);
	if (!due.length) return null;
	const result = { checked: due.length, updated: 0, missing: 0, answers: {} };
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
			const next = {
				level: Number.isInteger(level) && level >= 1 && level <= 100 ? level : c.level,
				professions: professions || c.professions,
			};
			if (next.level !== c.level || next.professions !== c.professions) {
				db.prepare(
					'UPDATE characters SET level=?,professions=?,synced_at=?,updated_at=? WHERE id=?',
				).run(next.level, next.professions, now, now, c.id);
				result.updated++;
			} else db.prepare('UPDATE characters SET synced_at=? WHERE id=?').run(now, c.id);
			mark.run(now, p.ok ? 'ok' : `ok, professions ${p.status}`, c.id);
		}
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
