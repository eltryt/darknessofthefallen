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
			// Cosmetic, but every armory API reports them: ready for the import.
			'shirt',
			'tabard',
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
		// Classic armory layout: two item columns around the character, weapons below.
		paperdoll: {
			left: ['head', 'neck', 'shoulders', 'back', 'chest', 'shirt', 'tabard', 'wrist'],
			right: ['hands', 'waist', 'legs', 'feet', 'finger1', 'finger2', 'trinket1', 'trinket2'],
			bottom: ['main_hand', 'off_hand', 'ranged'],
		},
		// Character statistics shown under the model once a data provider supplies them.
		stats: [
			['health', 'Salud'],
			['power', 'Maná / energía / ira'],
			['strength', 'Fuerza'],
			['agility', 'Agilidad'],
			['stamina', 'Aguante'],
			['intellect', 'Intelecto'],
			['spirit', 'Espíritu'],
			['armor', 'Armadura'],
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
// Empty-slot artwork: official WoW item icons from wow.zamimg.com, stored locally as
// WebP in /assets/slots (the CSP serves images from our own origin only), one per slot.
export const slotIconSources = {
	head: 'inv_helmet_03',
	neck: 'inv_jewelry_necklace_01',
	shoulders: 'inv_shoulder_05',
	back: 'inv_misc_cape_11',
	chest: 'inv_chest_plate03',
	shirt: 'inv_shirt_01',
	tabard: 'inv_misc_tabardpvp_01',
	wrist: 'inv_bracer_07',
	hands: 'inv_gauntlets_04',
	waist: 'inv_belt_03',
	legs: 'inv_pants_04',
	feet: 'inv_boots_05',
	finger1: 'inv_jewelry_ring_01',
	finger2: 'inv_jewelry_ring_03',
	trinket1: 'inv_jewelry_talisman_01',
	trinket2: 'inv_jewelry_talisman_02',
	main_hand: 'inv_sword_04',
	off_hand: 'inv_shield_04',
	ranged: 'inv_weapon_bow_07',
};
// Item catalogue files (public/catalog/<group>.json, built by scripts/sync-items.mjs):
// one per slot, with both rings and both trinkets sharing a file.
export const catalogGroups = [
	'head',
	'neck',
	'shoulders',
	'back',
	'chest',
	'shirt',
	'tabard',
	'wrist',
	'hands',
	'waist',
	'legs',
	'feet',
	'finger',
	'trinket',
	'main_hand',
	'off_hand',
	'ranged',
];
export const catalogGroup = (slot) => slot.replace(/^(finger|trinket)[12]$/, '$1');
// Catalogue icons are served by Blizzard's image CDN (the media API points there);
// the CSP allows exactly this origin. Rows store the icon name only.
export const CATALOG_ICON_ORIGIN = 'https://render.worldofwarcraft.com';
export const catalogIconUrl = (name) =>
	typeof name === 'string' && /^[a-z0-9_-]{1,80}$/.test(name)
		? `${CATALOG_ICON_ORIGIN}/classic1x-eu/icons/56/${name}.jpg`
		: '';
// Item stats the armory keeps and adds up: primary attributes, armour and resistances.
export const equipmentStats = [
	'strength',
	'agility',
	'stamina',
	'intellect',
	'spirit',
	'armor',
	'fire_resistance',
	'nature_resistance',
	'frost_resistance',
	'shadow_resistance',
	'arcane_resistance',
];
export function slotIcon(slot) {
	return Object.hasOwn(slotIconSources, slot) ? `/assets/slots/${slot}.webp` : '';
}
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
