import { gameVersions, defaultGameVersion, factions } from '../public/armory-catalog.js';
import { isValidSpecForClass, normalizeSpecValue } from '../public/specs.js';
export const ranks = [
	'visitor',
	'member',
	'raider',
	'raid_leader',
	'loot_officer',
	'officer',
	'leader',
];
export const classes = [
	'Guerrero',
	'Paladín',
	'Cazador',
	'Pícaro',
	'Sacerdote',
	'Chamán',
	'Mago',
	'Brujo',
	'Druida',
];
export const combatRoles = ['Tanque', 'Sanador', 'DPS melee', 'DPS distancia'];
export const permissions = {
	'community.read': 'member',
	'character.write': 'member',
	'roster.read': 'raid_leader',
	'roster.manage': 'raid_leader',
	'attendance.manage': 'raid_leader',
	'loot.delete': 'leader',
	'loot.manage': 'raid_leader',
	'progress.manage': 'raid_leader',
	'recruitment.manage': 'officer',
	'members.manage': 'officer',
	'audit.read': 'officer',
	'settings.manage': 'leader',
	'backup.export': 'leader',
	// Armory: read any member's sheet and BiS, review with internal notes, configure guides.
	'armory.read': 'raid_leader',
	'armory.review': 'officer',
	'armory.configure': 'leader',
};
// Ranks outside the hierarchy: they hold exactly these permissions, nothing inherited.
// The loot officer handles loot and reads members' sheets and notes, without guild management.
export const scopedRanks = {
	loot_officer: [
		'community.read',
		'character.write',
		'roster.read',
		'loot.manage',
		'armory.read',
		'armory.review',
	],
};
export function can(user, permission) {
	if (!user || !(permission in permissions)) return false;
	if (Object.hasOwn(scopedRanks, user.rank)) return scopedRanks[user.rank].includes(permission);
	return ranks.indexOf(user.rank) >= ranks.indexOf(permissions[permission]);
}
export function roleFromDiscord(id, roles, env) {
	if (env.DISCORD_LEADER_ID && id === env.DISCORD_LEADER_ID) return 'leader';
	const map = JSON.parse(env.DISCORD_ROLE_MAP || '{}');
	return roles.reduce(
		(rank, role) =>
			ranks.includes(map[role]) && ranks.indexOf(map[role]) > ranks.indexOf(rank)
				? map[role]
				: rank,
		'visitor',
	);
}
export class HttpError extends Error {
	constructor(status, message) {
		super(message);
		this.status = status;
	}
}
export function text(value, name, max = 200, required = true) {
	if (typeof value !== 'string' || value.trim().length > max || (required && !value.trim()))
		throw new HttpError(400, `Campo no válido: ${name}`);
	return value.trim();
}
export function choice(value, values, name) {
	if (!values.includes(value)) throw new HttpError(400, `Valor no válido: ${name}`);
	return value;
}
export function characterInput(v) {
	return {
		name: text(v.name, 'nombre', 40),
		surname: text(v.surname ?? '', 'apellido', 40, false),
		class: choice(v.class, classes, 'clase'),
		role: choice(v.role, combatRoles, 'rol'),
		spec: text(v.spec ?? '', 'especialización', 80, false),
		professions: text(v.professions ?? '', 'profesiones', 160, false),
		availability: text(v.availability ?? '', 'disponibilidad', 500, false),
		notes: text(v.notes ?? '', 'notas', 2000, false),
		isMain: v.isMain === true,
	};
}
// Armory sheet fields. Unknown values may stay empty; combinations are checked
// against the game version catalogue (race ↔ faction, spec ↔ class, level cap).
export function armoryInput(v, className) {
	const version = choice(
		v.game_version || defaultGameVersion,
		Object.keys(gameVersions),
		'versión',
	);
	const catalogue = gameVersions[version];
	const region = text(v.region ?? '', 'región', 40, false);
	if (region && !catalogue.regions.includes(region)) throw new HttpError(400, 'Región no válida.');
	let faction = text(v.faction ?? '', 'facción', 20, false);
	if (faction) choice(faction, factions, 'facción');
	const race = text(v.race ?? '', 'raza', 40, false);
	if (race) {
		if (!Object.hasOwn(catalogue.races, race)) throw new HttpError(400, 'Raza no válida.');
		if (faction && catalogue.races[race] !== faction)
			throw new HttpError(400, 'La raza no corresponde a la facción.');
		faction = catalogue.races[race];
		if (catalogue.raceClasses && !catalogue.raceClasses[race]?.includes(className))
			throw new HttpError(400, 'Esa clase no está disponible para la raza elegida.');
	}
	const secondary = text(v.secondary_spec ?? '', 'especialización secundaria', 40, false);
	if (secondary && !isValidSpecForClass(normalizeSpecValue(secondary), classKeys[className]))
		throw new HttpError(400, 'La especialización secundaria no pertenece a la clase.');
	let level = v.level ?? null;
	if (level === '') level = null;
	if (level !== null) {
		level = Number(level);
		if (!Number.isInteger(level) || level < 1 || level > (catalogue.maxLevel || 100))
			throw new HttpError(400, 'Nivel no válido.');
	}
	return {
		game_version: version,
		realm: text(v.realm ?? '', 'reino', 60, false),
		region,
		faction,
		race,
		secondary_spec: secondary ? normalizeSpecValue(secondary) : '',
		level,
	};
}
// Column order used by the character INSERT/UPDATE statements.
export function armoryValues(s) {
	return [s.game_version, s.realm, s.region, s.faction, s.race, s.secondary_spec, s.level];
}
export const classKeys = {
	Guerrero: 'warrior',
	Paladín: 'paladin',
	Cazador: 'hunter',
	Pícaro: 'rogue',
	Sacerdote: 'priest',
	Chamán: 'shaman',
	Mago: 'mage',
	Brujo: 'warlock',
	Druida: 'druid',
};
export function publicCharacter(c) {
	return { name: [c.name, c.surname].filter(Boolean).join(' '), class: c.class, role: c.role };
}
export function attendanceMetrics(rows) {
	const result = { raids: rows.length, attended: 0, absent: 0, reserve: 0, late: 0 };
	for (const r of rows) {
		if (r.status === 'Asistió') result.attended++;
		if (r.status === 'Ausente') result.absent++;
		if (r.status === 'Reserva') result.reserve++;
		if (r.status === 'Llegó tarde') result.late++;
	}
	result.percentage = result.raids
		? Math.round(((result.attended + result.late) / result.raids) * 100)
		: 0;
	return {
		...result,
		formula: '(Asistió + Llegó tarde) / registros',
		policy: 'Indicador descriptivo; no determina prioridad de loot.',
	};
}
