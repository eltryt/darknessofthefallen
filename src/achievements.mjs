// Automatic achievements. Everything is computed from records the guild already
// keeps (attendance, progress, lineups, profile data) and only from the moment the
// system was activated. Each tier is stored once earned and never taken away.
// The catalogue lives on the server so secret conditions stay secret.

export const TIER_POINTS = { 1: 10, 2: 25, 3: 50 };
const COUNTED = ['Asistió', 'Llegó tarde', 'Reserva'];

// tiers: thresholds for bronze/silver/gold. single: the tier awarded once.
export const playerCatalog = [
	{
		id: 'present',
		category: 'asistencia',
		icon: 'shield',
		name: 'Siempre presente',
		unit: 'raids asistidas',
		tiers: [10, 25, 50],
		help: 'Raids asistidas (el banquillo cuenta).',
	},
	{
		id: 'streak',
		category: 'asistencia',
		icon: 'flame',
		name: 'Racha de hierro',
		unit: 'semanas seguidas',
		tiers: [4, 8, 16],
		help: 'Semanas de raid seguidas sin faltar.',
	},
	{
		id: 'punctual',
		category: 'asistencia',
		icon: 'hourglass',
		name: 'Puntual',
		unit: 'raids a tiempo',
		tiers: [10, 25, 50],
		help: 'Raids asistidas sin llegar tarde.',
	},
	{
		id: 'witness',
		category: 'progreso',
		icon: 'skull',
		name: 'Testigo de la historia',
		unit: 'primeras victorias',
		tiers: [1, 3, 10],
		help: 'Presente en la primera victoria de un jefe.',
	},
	{
		id: 'conqueror',
		category: 'progreso',
		icon: 'crown',
		name: 'Conquistador',
		single: 3,
		help: 'Presente en todas las primeras victorias de una raid.',
	},
	{
		id: 'called',
		category: 'compromiso',
		icon: 'banner',
		name: 'Llamado a filas',
		unit: 'convocatorias',
		tiers: [10, 25, 50],
		help: 'Convocado en alineaciones enviadas.',
	},
	{
		id: 'bench',
		category: 'compromiso',
		icon: 'anchor',
		name: 'Paciencia de hierro',
		unit: 'veces en el banquillo',
		tiers: [5, 10, 25],
		help: 'Disponible en el banquillo cuando tocaba.',
	},
	{
		id: 'sheet',
		category: 'perfil',
		icon: 'scroll',
		name: 'Ficha completa',
		single: 1,
		help: 'Reino, raza, nivel y especialización del Main.',
	},
	{
		id: 'armory',
		category: 'perfil',
		icon: 'helm',
		name: 'Armería al día',
		single: 1,
		help: 'Cinco huecos de equipo registrados en un personaje.',
	},
	{
		id: 'wishlist',
		category: 'perfil',
		icon: 'gem',
		name: 'Wishlist preparada',
		single: 1,
		help: 'Cinco objetos marcados como BiS o Me interesa.',
	},
	{
		id: 'family',
		category: 'perfil',
		icon: 'family',
		name: 'Familia',
		single: 1,
		help: 'Un Alter registrado además del Main.',
	},
	{
		id: 'phoenix',
		category: 'secreto',
		icon: 'phoenix',
		name: 'Ave fénix',
		single: 2,
		secret: true,
		help: 'Volver a una raid tras un mes sin asistir.',
	},
	{
		id: 'marathon',
		category: 'secreto',
		icon: 'bolt',
		name: 'Maratón',
		single: 2,
		secret: true,
		help: 'Tres raids en una misma semana.',
	},
];
export const guildCatalog = [
	{
		id: 'first-blood',
		category: 'hermandad',
		icon: 'sword',
		name: 'Primera sangre',
		single: 1,
		help: 'El primer jefe derrotado.',
	},
	{
		id: 'slayers',
		category: 'hermandad',
		icon: 'skull',
		name: 'Azote de jefes',
		unit: 'jefes derrotados',
		tiers: [5, 10, 25],
		help: 'Primeras victorias de jefes.',
	},
	{
		id: 'raid-cleared',
		category: 'hermandad',
		icon: 'crown',
		name: 'Raid conquistada',
		single: 3,
		help: 'Todos los jefes de una raid derrotados.',
	},
	{
		id: 'alive',
		category: 'hermandad',
		icon: 'family',
		name: 'Hermandad viva',
		unit: 'miembros activos',
		tiers: [10, 25, 40],
		help: 'Miembros distintos con asistencia en los últimos 30 días.',
	},
	{
		id: 'nights',
		category: 'hermandad',
		icon: 'moon',
		name: 'Noches de raid',
		unit: 'noches',
		tiers: [25, 50, 100],
		help: 'Raids con asistencia registrada.',
	},
];

const madridDay = (iso) =>
	new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(new Date(iso));
// ISO week of the Madrid calendar day, as "YYYY-Www".
function weekKey(iso) {
	const [y, m, d] = madridDay(iso).split('-').map(Number);
	const date = new Date(Date.UTC(y, m - 1, d));
	const day = date.getUTCDay() || 7;
	date.setUTCDate(date.getUTCDate() + 4 - day);
	const start = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
	const week = Math.ceil(((date - start) / 86400000 + 1) / 7);
	return `${date.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}
export const achievementsSince = (db) =>
	JSON.parse(db.prepare('SELECT data FROM settings WHERE id=1').get().data).achievementsSince ||
	new Date().toISOString();

function guildRaids(db, since) {
	return db
		.prepare(
			'SELECT r.id,r.starts_at FROM raids r WHERE r.starts_at>=? AND EXISTS(SELECT 1 FROM attendance a WHERE a.raid_id=r.id) ORDER BY r.starts_at',
		)
		.all(since);
}
function firstKills(db, since) {
	return db
		.prepare('SELECT data FROM progress')
		.all()
		.map((row) => JSON.parse(row.data))
		.map((raid) => ({
			name: raid.name,
			bosses: (raid.bosses || []).map((b) => ({
				name: b.name,
				kill: b.firstKill && b.firstKill >= since ? b.firstKill : null,
			})),
		}));
}

export function playerMetrics(db, userId, since, shared = {}) {
	const raids = shared.raids || guildRaids(db, since),
		progress = shared.progress || firstKills(db, since);
	const rows = db
		.prepare(
			`SELECT a.raid_id,a.status,r.starts_at FROM attendance a JOIN raids r ON r.id=a.raid_id
			 WHERE a.user_id=? AND r.starts_at>=? ORDER BY r.starts_at`,
		)
		.all(userId, since);
	const attended = rows.filter((r) => COUNTED.includes(r.status));
	const attendedWeeks = new Set(attended.map((r) => weekKey(r.starts_at)));
	// Streak over the weeks the guild actually raided; weeks without raids do not break it.
	let streak = 0,
		best = 0;
	for (const week of [...new Set(raids.map((r) => weekKey(r.starts_at)))]) {
		streak = attendedWeeks.has(week) ? streak + 1 : 0;
		best = Math.max(best, streak);
	}
	const days = new Set(attended.map((r) => madridDay(r.starts_at)));
	const witnessed = progress.flatMap((raid) =>
		raid.bosses.filter((b) => b.kill && days.has(madridDay(b.kill))),
	);
	const conqueror = progress.some(
		(raid) => raid.bosses.length && raid.bosses.every((b) => b.kill && days.has(madridDay(b.kill))),
	);
	const called = db
		.prepare(
			`SELECT c.event_id,c.slot FROM raid_callups c JOIN raid_events e ON e.id=c.event_id
			 WHERE c.user_id=? AND c.slot!='removed' AND e.state!='Eliminada' AND e.starts_at>=?`,
		)
		.all(userId, since);
	const bench = new Set([
		...called.filter((c) => c.slot === 'bench').map((c) => c.event_id),
		...rows.filter((r) => r.status === 'Reserva').map((r) => r.raid_id),
	]);
	const characters = db
		.prepare('SELECT * FROM characters WHERE user_id=? AND archived_at IS NULL')
		.all(userId);
	const main = characters.find((c) => c.is_main) || characters[0];
	const equipment = db
		.prepare(
			`SELECT MAX(n) n FROM (SELECT COUNT(*) n FROM character_equipment e JOIN characters c ON c.id=e.character_id
			 WHERE c.user_id=? AND c.archived_at IS NULL GROUP BY e.character_id)`,
		)
		.get(userId).n;
	const wishes = db
		.prepare('SELECT data FROM wishlists WHERE user_id=?')
		.all(userId)
		.filter((w) => JSON.parse(w.data).status !== 'Pasar').length;
	const times = attended.map((r) => Date.parse(r.starts_at));
	const perWeek = {};
	for (const r of attended)
		perWeek[weekKey(r.starts_at)] = (perWeek[weekKey(r.starts_at)] || 0) + 1;
	return {
		present: attended.length,
		streak: best,
		punctual: rows.filter((r) => r.status === 'Asistió').length,
		witness: witnessed.length,
		conqueror: conqueror ? 1 : 0,
		called: called.length,
		bench: bench.size,
		sheet: main && main.realm && main.race && main.level && main.spec ? 1 : 0,
		armory: (equipment || 0) >= 5 ? 1 : 0,
		wishlist: wishes >= 5 ? 1 : 0,
		family: characters.length >= 2 ? 1 : 0,
		phoenix: times.some((t, i) => i && t - times[i - 1] >= 28 * 86400000) ? 1 : 0,
		marathon: Object.values(perWeek).some((n) => n >= 3) ? 1 : 0,
	};
}
export function guildMetrics(db, since, shared = {}) {
	const raids = shared.raids || guildRaids(db, since),
		progress = shared.progress || firstKills(db, since);
	const kills = progress.flatMap((r) => r.bosses.filter((b) => b.kill));
	const month = new Date(Date.now() - 30 * 86400000).toISOString();
	const alive = db
		.prepare(
			`SELECT COUNT(DISTINCT a.user_id) n FROM attendance a JOIN raids r ON r.id=a.raid_id
			 WHERE r.starts_at>=? AND r.starts_at>=? AND a.status IN (${COUNTED.map(() => '?').join(',')})`,
		)
		.get(since, month, ...COUNTED).n;
	return {
		'first-blood': kills.length ? 1 : 0,
		slayers: kills.length,
		'raid-cleared': progress.some((r) => r.bosses.length && r.bosses.every((b) => b.kill)) ? 1 : 0,
		alive,
		nights: raids.length,
	};
}
// Tiers met by a value: thresholds reached, or the single tier when the flag is set.
const tiersFor = (item, value) =>
	item.single
		? value
			? [item.single]
			: []
		: item.tiers.map((t, i) => (value >= t ? i + 1 : 0)).filter(Boolean);

function award(db, table, key, catalog, metrics, now) {
	const insert =
		table === 'user_achievements'
			? db.prepare(
					'INSERT OR IGNORE INTO user_achievements(user_id,achievement_id,tier,earned_at) VALUES(?,?,?,?)',
				)
			: db.prepare(
					'INSERT OR IGNORE INTO guild_achievements(achievement_id,tier,earned_at) VALUES(?,?,?)',
				);
	for (const item of catalog)
		for (const tier of tiersFor(item, metrics[item.id]))
			table === 'user_achievements'
				? insert.run(key, item.id, tier, now)
				: insert.run(item.id, tier, now);
}
export function refreshAchievements(db, now = new Date().toISOString()) {
	const since = achievementsSince(db),
		shared = { raids: guildRaids(db, since), progress: firstKills(db, since) };
	const players = db.prepare("SELECT id FROM users WHERE rank!='visitor'").all();
	const metrics = {};
	for (const { id } of players) {
		metrics[id] = playerMetrics(db, id, since, shared);
		award(db, 'user_achievements', id, playerCatalog, metrics[id], now);
	}
	const guild = guildMetrics(db, since, shared);
	award(db, 'guild_achievements', null, guildCatalog, guild, now);
	return { since, metrics, guild };
}

const earnedMap = (rows) => {
	const map = {};
	for (const r of rows)
		(map[r.achievement_id] ||= []).push({ tier: r.tier, earnedAt: r.earned_at });
	return map;
};
// What a viewer may see of one achievement. Secret ones stay "???" until earned.
function present(item, earned = [], value) {
	const hidden = item.secret && !earned.length;
	const top = Math.max(0, ...earned.map((e) => e.tier));
	const next = item.tiers ? item.tiers.find((t) => !(value >= t)) : null;
	return {
		id: item.id,
		category: item.category,
		icon: hidden ? 'secret' : item.icon,
		name: hidden ? '???' : item.name,
		help: hidden ? 'Logro secreto. Se revela cuando alguien lo consigue.' : item.help,
		secret: !!item.secret,
		tiers: hidden ? null : item.tiers || null,
		single: hidden ? null : item.single || null,
		unit: hidden ? null : item.unit || null,
		tier: top,
		earned: earned.sort((a, b) => a.tier - b.tier),
		value: hidden ? null : (value ?? null),
		next: hidden ? null : (next ?? null),
	};
}
// Public wall on the Progreso page: only the guild's own achievements.
export function publicGuildAchievements(db, now = new Date().toISOString()) {
	const metrics = guildMetrics(db, achievementsSince(db));
	award(db, 'guild_achievements', null, guildCatalog, metrics, now);
	const earned = earnedMap(db.prepare('SELECT * FROM guild_achievements').all());
	return guildCatalog.map((item) => present(item, earned[item.id], metrics[item.id]));
}

export async function achievementsApi({ db, user, path, method, send, requirePermission }) {
	if (path !== '/api/achievements' || method !== 'GET') return false;
	requirePermission('community.read');
	const { since, metrics, guild } = refreshAchievements(db);
	const rows = db.prepare('SELECT * FROM user_achievements').all();
	const points = {};
	for (const r of rows) points[r.user_id] = (points[r.user_id] || 0) + TIER_POINTS[r.tier];
	const mine = earnedMap(rows.filter((r) => r.user_id === user.id));
	const members = db
		.prepare("SELECT id,display_name FROM users WHERE rank!='visitor'")
		.all()
		.map((u) => ({ id: u.id, name: u.display_name, points: points[u.id] || 0 }))
		.sort((a, b) => b.points - a.points || a.name.localeCompare(b.name, 'es'));
	// Competition ranking: equal points share a position.
	let rank = 0;
	members.forEach((m, i) => {
		if (i === 0 || m.points !== members[i - 1].points) rank = i + 1;
		m.rank = rank;
	});
	const me = members.find((m) => m.id === user.id);
	const guildEarned = earnedMap(db.prepare('SELECT * FROM guild_achievements').all());
	send(200, {
		since,
		points: points[user.id] || 0,
		achievements: playerCatalog.map((item) =>
			present(item, mine[item.id], metrics[user.id]?.[item.id]),
		),
		leaderboard: {
			top: members.slice(0, 10).map(({ name, points, rank }) => ({ name, points, rank })),
			me: me ? { rank: me.rank, points: me.points, total: members.length } : null,
		},
		guild: guildCatalog.map((item) => present(item, guildEarned[item.id], guild[item.id])),
	});
	return true;
}
