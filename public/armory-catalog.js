// Armory catalogue shared by the browser and the backend. It describes structure
// only (versions, slots, labels); it never contains items, stats or BiS data.
// A new game version is added here, without touching the rest of the application.

export const gameVersions = {
	forever: {
		label: 'WoW Forever',
		// Provisional: Forever's exact equipment system, races and level cap are not
		// confirmed by an official source. Classic-style slots are the working layout.
		provisional: true,
		maxLevel: null,
		regions: ['Europa', 'América', 'Asia'],
		races: {
			Humano: 'Alianza',
			Enano: 'Alianza',
			'Elfo de la noche': 'Alianza',
			Gnomo: 'Alianza',
			Orco: 'Horda',
			'No-muerto': 'Horda',
			Tauren: 'Horda',
			Trol: 'Horda',
		},
		// No race/class restrictions until they are confirmed for Forever.
		raceClasses: null,
		slots: [
			'head',
			'neck',
			'shoulders',
			'back',
			'chest',
			'wrist',
			'hands',
			'waist',
			'legs',
			'feet',
			'finger1',
			'finger2',
			'trinket1',
			'trinket2',
			'main_hand',
			'off_hand',
			'ranged',
		],
	},
};
export const defaultGameVersion = 'forever';
export const factions = ['Alianza', 'Horda'];
export const slotLabels = {
	head: 'Cabeza',
	neck: 'Cuello',
	shoulders: 'Hombros',
	back: 'Espalda',
	chest: 'Pecho',
	shirt: 'Camisa',
	tabard: 'Tabardo',
	wrist: 'Muñecas',
	hands: 'Manos',
	waist: 'Cintura',
	legs: 'Piernas',
	feet: 'Pies',
	finger1: 'Anillo 1',
	finger2: 'Anillo 2',
	trinket1: 'Abalorio 1',
	trinket2: 'Abalorio 2',
	main_hand: 'Mano principal',
	off_hand: 'Mano secundaria',
	ranged: 'A distancia / reliquia',
};
export const itemQualities = {
	poor: 'Pobre',
	common: 'Común',
	uncommon: 'Poco común',
	rare: 'Raro',
	epic: 'Épico',
	legendary: 'Legendario',
};
export const bisStatuses = ['Pendiente', 'Prioritario', 'Conseguido', 'Alternativa'];
export const bisContents = ['General', 'Banda', 'Mazmorras', 'PvP'];
export const guideContentTypes = {
	general: 'Guía general',
	talents: 'Talentos',
	rotation: 'Rotación',
	gear: 'Equipamiento recomendado',
	bis: 'Lista BiS',
	stats: 'Estadísticas prioritarias',
	consumables: 'Consumibles',
};
export const reviewStatuses = ['En curso', 'Completada'];

export function versionOf(id) {
	return Object.hasOwn(gameVersions, id) ? gameVersions[id] : null;
}
// Hostnames are compared exactly or as subdomains of an allowed host.
export function hostAllowed(url, allowedHosts) {
	try {
		const parsed = new URL(url);
		if (parsed.protocol !== 'https:' || parsed.username || parsed.password) return false;
		return allowedHosts.some(
			(host) => parsed.hostname === host || parsed.hostname.endsWith('.' + host),
		);
	} catch {
		return false;
	}
}
