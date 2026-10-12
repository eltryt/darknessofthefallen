// Mapeo completo de especializaciones de World of Warcraft organizadas por clase
export const specs = {
	// Warrior specializations
	warrior: {
		arms: { name: 'Armas', category: 'DPS melee' },
		fury: { name: 'Furia', category: 'DPS melee' },
		protection: { name: 'Protección', category: 'Tanque' },
	},

	// Paladin specializations
	paladin: {
		holy: { name: 'Sagrado', category: 'Sanador' },
		protection: { name: 'Protección', category: 'Tanque' },
		retribution: { name: 'Hierro', category: 'DPS melee' },
	},

	// Hunter specializations
	hunter: {
		beast_mastery: { name: 'Bestia', category: 'DPS distance' },
		archery: { name: 'Puntería', category: 'DPS distance' },
		survival: { name: 'Supervivencia', category: 'DPS distance' },
	},

	// Rogue specializations
	rogue: {
		subtlety: { name: 'Sutileza', category: 'DPS melee' },
		assassination: { name: 'Asesinato', category: 'DPS melee' },
		combat: { name: 'Combate', category: 'DPS melee' },
	},

	// Priest specializations
	priest: {
		discipline: { name: 'Disciplina', category: 'Sanador' },
		holy: { name: 'Sagrado', category: 'Sanador' },
		shadow: { name: 'Sombras', category: 'DPS distance' },
	},

	// Shaman specializations
	shaman: {
		elemental: { name: 'Elemental', category: 'DPS distance' },
		enhancement: { name: 'Melee', category: 'DPS melee' },
		restore: { name: 'Restauración', category: 'Sanador' },
	},

	// Mage specializations
	mage: {
		arcane: { name: 'Arcano', category: 'DPS distance' },
		fire: { name: 'Fuego', category: 'DPS distance' },
		frost: { name: 'Escarcha', category: 'DPS distance' },
	},

	// Warlock specializations
	warlock: {
		affliction: { name: 'Aflicción', category: 'DPS distance' },
		demonology: { name: 'Demonología', category: 'DPS distance' },
		destruction: { name: 'Destrucción', category: 'DPS distance' },
	},

	// Druid specializations
	druid: {
		balance: { name: 'Equilibrio', category: 'DPS distance' },
		feral: { name: 'Feral', category: 'DPS melee' },
		restore: { name: 'Restauración', category: 'Sanador' },
		guardian: { name: 'Guardián', category: 'Tanque' },
	},
};

// Función para validar si una especialización pertenece a una clase específica
export function isValidSpecForClass(spec, className) {
	if (!specs[className]) return false;
	return Object.hasOwn(specs[className], spec);
}

// Función para obtener todas las especializaciones de una clase
export function getSpecsForClass(className) {
	return specs[className] || {};
}

// Función para normalizar valores antiguos (textos en español) a IDs estables
export function normalizeSpecValue(specValue) {
	// Mapa de valores antiguos a IDs estables
	const oldToNew = {
		Armas: 'arms',
		Furia: 'fury',
		Protección: 'protection',
		Sagrado: 'holy',
		Hierro: 'retribution',
		Bestia: 'beast_mastery',
		Puntería: 'archery',
		Supervivencia: 'survival',
		Sutileza: 'subtlety',
		Asesinato: 'assassination',
		Combate: 'combat',
		Disciplina: 'discipline',
		Sombras: 'shadow',
		Elemental: 'elemental',
		Melee: 'enhancement',
		Restauración: 'restore',
		Arcano: 'arcane',
		Fuego: 'fire',
		Escarcha: 'frost',
		Afllicción: 'affliction',
		Demonología: 'demonology',
		Destrucción: 'destruction',
		Equilibrio: 'balance',
		Feral: 'feral',
		Guardián: 'guardian',
	};

	return oldToNew[specValue] || specValue;
}
