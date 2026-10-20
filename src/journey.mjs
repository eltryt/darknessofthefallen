// "Camino al 60": where each member's main character is on the way to the level cap.
// The board reads characters.level, which players fill in from the Armería today and a
// future Blizzard API sync will write; the board needs no change when that arrives.
export const MAX_LEVEL = 60;

export function journey(db, user) {
	const rows = db
		.prepare(
			`SELECT c.id,c.name,c.class,c.role,c.level,c.user_id
			 FROM characters c JOIN users u ON u.id=c.user_id
			 WHERE c.is_main=1 AND c.archived_at IS NULL AND u.rank!='visitor'
			 ORDER BY c.level IS NULL, c.level DESC, c.name`,
		)
		.all();
	const players = rows.map((r) => ({
		id: r.id,
		name: r.name,
		class: r.class,
		role: r.role,
		level: Number.isInteger(r.level) ? Math.min(r.level, MAX_LEVEL) : null,
		me: r.user_id === user.id,
	}));
	// Who could raid today: characters at the cap, by role.
	const ready = {};
	for (const p of players) if (p.level === MAX_LEVEL) ready[p.role] = (ready[p.role] || 0) + 1;
	return { maxLevel: MAX_LEVEL, players, ready };
}

export function journeyApi({ db, user, path, method, send, requirePermission }) {
	if (path !== '/api/journey' || method !== 'GET') return false;
	requirePermission('community.read');
	send(200, journey(db, user));
	return true;
}
