import { HttpError } from './domain.mjs';
import { characterFor, eligibleSignups } from './raid-lineup.mjs';

// "Pasar lista": everyone expected at one raid, with the character that counts and the
// attendance already marked. From the lineup when there is one (groups, then bench);
// otherwise from the Raid-Helper sign-ups; for a raid without sign-ups, the roster's mains.
// Anyone already marked for the raid is listed too, so nothing marked goes missing.
export function attendanceSheet(db, raidId) {
	const raid = db.prepare('SELECT id,title,starts_at FROM raids WHERE id=?').get(raidId);
	if (!raid) throw new HttpError(404, 'Raid no encontrada.');
	const event = db.prepare('SELECT * FROM raid_events WHERE id=?').get(raidId);
	const marked = Object.fromEntries(
		db
			.prepare('SELECT user_id,character_id,status FROM attendance WHERE raid_id=?')
			.all(raidId)
			.map((a) => [a.user_id, a]),
	);
	const character = db.prepare(
		'SELECT c.id,c.name,c.class,c.role,u.display_name FROM characters c JOIN users u ON u.id=c.user_id WHERE c.id=?',
	);
	const rows = [],
		seen = new Set();
	const add = (userId, name, characterId, slot, role = '') => {
		if (seen.has(userId)) return;
		seen.add(userId);
		const c = characterId ? character.get(characterId) : null;
		rows.push({
			userId,
			name:
				c?.display_name ||
				name ||
				db.prepare('SELECT display_name FROM users WHERE id=?').get(userId)?.display_name ||
				'',
			characterId: c?.id || null,
			characterName: c?.name || '',
			class: c?.class || '',
			role: c?.role || role,
			slot,
			status: marked[userId]?.status || null,
		});
	};
	let source = 'roster';
	if (event && event.state !== 'Eliminada') {
		const signups = eligibleSignups(event);
		const slots = new Map(
			db
				.prepare(
					'SELECT signup_id,slot FROM raid_lineup_slots WHERE event_id=? ORDER BY slot,position',
				)
				.all(raidId)
				.map((s) => [s.signup_id, s.slot]),
		);
		const placed = signups.filter((s) => slots.has(s.id));
		source = placed.length ? 'lineup' : signups.length ? 'signups' : 'roster';
		const order = (slot) => (slot === 'bench' ? 99 : Number(slot.split(':')[1]) || 98);
		for (const s of placed.length ? placed : signups) s.slot = slots.get(s.id) || null;
		for (const s of (placed.length ? placed : signups).sort(
			(a, b) => order(a.slot || 'group:98') - order(b.slot || 'group:98'),
		))
			add(
				s.userId,
				s.name,
				marked[s.userId]?.character_id || characterFor(db, raidId, s)?.id,
				s.slot,
				s.role,
			);
	}
	if (source === 'roster')
		for (const c of db
			.prepare(
				"SELECT c.id,c.user_id FROM characters c JOIN users u ON u.id=c.user_id WHERE c.archived_at IS NULL AND u.rank<>'visitor' ORDER BY u.display_name, c.is_main DESC, c.created_at",
			)
			.all())
			add(c.user_id, '', marked[c.user_id]?.character_id || c.id, null);
	for (const a of Object.values(marked)) add(a.user_id, '', a.character_id, 'other');
	return { raid, source, rows };
}

export function attendanceSheetApi({ db, path, method, send, requirePermission }) {
	const match = path.match(/^\/api\/raids\/([^/]+)\/attendance-sheet$/);
	if (!match || method !== 'GET') return false;
	requirePermission('attendance.manage');
	send(200, attendanceSheet(db, decodeURIComponent(match[1])));
	return true;
}
