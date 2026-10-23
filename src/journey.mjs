// "Camino al 60": where each member's main character is on the way to the level cap.
// The board reads characters.level, which players fill in from the Armería today and a
// future Blizzard API sync will write; the board needs no change when that arrives.
//
// Podium (Pioneros de Azeroth): the database records when a character first reaches the
// cap (migration 014). Levels are typed by hand, so an arrival only counts once an
// officer verifies it; the first five verified members, in order of arrival, earn the medal.
import { HttpError, can } from './domain.mjs';
import { audit, transaction } from './database-core.mjs';

export const MAX_LEVEL = 60;
// Places with a medal and their tier: gold for 1st, silver for 2nd–3rd, bronze for 4th–5th.
export const PODIUM_TIERS = [3, 2, 2, 1, 1];

// Each member's earliest verified arrival at the cap, in order of arrival.
export function podium(db) {
	const rows = db
		.prepare(
			`SELECT c.id,c.name,c.class,c.user_id,c.cap_reached_at
			 FROM characters c JOIN users u ON u.id=c.user_id
			 WHERE c.archived_at IS NULL AND u.rank!='visitor' AND c.level>=?
			   AND c.cap_reached_at IS NOT NULL AND c.cap_verified_at IS NOT NULL
			 ORDER BY c.cap_reached_at, c.id`,
		)
		.all(MAX_LEVEL);
	const seen = new Set(),
		places = [];
	for (const r of rows) {
		if (seen.has(r.user_id)) continue;
		seen.add(r.user_id);
		places.push(r);
		if (places.length === PODIUM_TIERS.length) break;
	}
	return places.map((r, i) => ({ ...r, place: i + 1, tier: PODIUM_TIERS[i] }));
}

export function journey(db, user) {
	const rows = db
		.prepare(
			`SELECT c.id,c.name,c.class,c.role,c.level,c.user_id,c.cap_reached_at,c.cap_verified_at
			 FROM characters c JOIN users u ON u.id=c.user_id
			 WHERE c.is_main=1 AND c.archived_at IS NULL AND u.rank!='visitor'
			 ORDER BY c.level IS NULL, c.level DESC, c.cap_reached_at IS NULL, c.cap_reached_at, c.name`,
		)
		.all();
	const players = rows.map((r) => ({
		id: r.id,
		name: r.name,
		class: r.class,
		role: r.role,
		level: Number.isInteger(r.level) ? Math.min(r.level, MAX_LEVEL) : null,
		me: r.user_id === user.id,
		reachedAt: r.cap_reached_at || null,
		verified: !!r.cap_verified_at,
	}));
	// Who could raid today: characters at the cap, by role.
	const ready = {};
	for (const p of players) if (p.level === MAX_LEVEL) ready[p.role] = (ready[p.role] || 0) + 1;
	return {
		maxLevel: MAX_LEVEL,
		players,
		ready,
		podium: podium(db).map(({ id, name, class: cls, cap_reached_at, place, tier, user_id }) => ({
			id,
			name,
			class: cls,
			reachedAt: cap_reached_at,
			place,
			tier,
			me: user_id === user.id,
		})),
		places: PODIUM_TIERS.length,
		canVerify: can(user, 'members.manage'),
	};
}

export async function journeyApi({ db, user, path, method, send, requirePermission }) {
	if (path === '/api/journey' && method === 'GET') {
		requirePermission('community.read');
		send(200, journey(db, user));
		return true;
	}
	// Officers confirm (or withdraw) an arrival at the cap after seeing proof.
	const m = path.match(/^\/api\/journey\/([^/]+)\/verification$/);
	if (m && (method === 'PUT' || method === 'DELETE')) {
		requirePermission('members.manage');
		const c = db
			.prepare('SELECT id,name,level,cap_reached_at,cap_verified_at FROM characters WHERE id=?')
			.get(decodeURIComponent(m[1]));
		if (!c) throw new HttpError(404, 'Personaje no encontrado.');
		if (method === 'PUT' && !(c.level >= MAX_LEVEL && c.cap_reached_at))
			throw new HttpError(409, `Solo se verifica un personaje de nivel ${MAX_LEVEL}.`);
		const verifiedAt = method === 'PUT' ? new Date().toISOString() : null;
		transaction(db, () => {
			db.prepare('UPDATE characters SET cap_verified_at=?,cap_verified_by=? WHERE id=?').run(
				verifiedAt,
				verifiedAt ? user.id : null,
				c.id,
			);
			audit(db, user.id, verifiedAt ? 'journey.cap.verified' : 'journey.cap.unverified', c.id, {
				previous: { verified: !!c.cap_verified_at },
				next: { verified: !!verifiedAt },
			});
		});
		send(200, { verified: !!verifiedAt });
		return true;
	}
	return false;
}
