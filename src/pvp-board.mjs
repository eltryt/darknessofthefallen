// "Senda del honor": the honor rank and honorable kills of each member's main character,
// as the hourly Battle.net refresh reads them from Forever's /pvp-summary (migration 027).
// Characters entered by hand have no PvP data and are listed apart.
export const MAX_PVP_RANK = 14;
export const PVP_PODIUM = 3;

export function pvpBoard(db, user) {
	const rows = db
		.prepare(
			`SELECT c.id,c.name,c.class,c.role,c.user_id,c.pvp_rank,c.honorable_kills
			 FROM characters c JOIN users u ON u.id=c.user_id
			 WHERE c.is_main=1 AND c.archived_at IS NULL AND u.rank!='visitor'
			 ORDER BY c.pvp_rank IS NULL, c.pvp_rank DESC, c.honorable_kills IS NULL,
			          c.honorable_kills DESC, c.name`,
		)
		.all();
	const players = rows.map((r) => ({
		id: r.id,
		name: r.name,
		class: r.class,
		role: r.role,
		rank: Number.isInteger(r.pvp_rank) ? r.pvp_rank : null,
		kills: Number.isInteger(r.honorable_kills) ? r.honorable_kills : null,
		me: r.user_id === user.id,
	}));
	const known = players.filter((p) => p.rank !== null);
	const ranks = Array.from({ length: MAX_PVP_RANK + 1 }, (_, rank) =>
		known.filter((p) => p.rank === rank).map((p) => p.id),
	);
	// Podium: the most honorable kills, ties by rank and then by name.
	const podium = known
		.filter((p) => p.kills > 0)
		.sort((a, b) => b.kills - a.kills || b.rank - a.rank || a.name.localeCompare(b.name, 'es'))
		.slice(0, PVP_PODIUM)
		.map((p, i) => ({ id: p.id, place: i + 1 }));
	return {
		maxRank: MAX_PVP_RANK,
		players,
		ranks,
		podium,
		places: PVP_PODIUM,
		totalKills: known.reduce((n, p) => n + (p.kills || 0), 0),
		ranked: known.filter((p) => p.rank > 0).length,
	};
}

export async function pvpBoardApi({ db, user, path, method, send, requirePermission }) {
	if (path !== '/api/pvp' || method !== 'GET') return false;
	requirePermission('community.read');
	send(200, pvpBoard(db, user));
	return true;
}
