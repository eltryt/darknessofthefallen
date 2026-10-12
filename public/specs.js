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
		retribution: { name: 'Reprensión', category: 'DPS melee' },
	},

	// Hunter specializations
	hunter: {
		beast_mastery: { name: 'Bestias', category: 'DPS distancia' },
		archery: { name: 'Puntería', category: 'DPS distancia' },
		survival: { name: 'Supervivencia', category: 'DPS distancia' },
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
		shadow: { name: 'Sombras', category: 'DPS distancia' },
	},

	// Shaman specializations
	shaman: {
		elemental: { name: 'Elemental', category: 'DPS distancia' },
		enhancement: { name: 'Mejora', category: 'DPS melee' },
		restore: { name: 'Restauración', category: 'Sanador' },
	},

	// Mage specializations
	mage: {
		arcane: { name: 'Arcano', category: 'DPS distancia' },
		fire: { name: 'Fuego', category: 'DPS distancia' },
		frost: { name: 'Escarcha', category: 'DPS distancia' },
	},

	// Warlock specializations
	warlock: {
		affliction: { name: 'Aflicción', category: 'DPS distancia' },
		demonology: { name: 'Demonología', category: 'DPS distancia' },
		destruction: { name: 'Destrucción', category: 'DPS distancia' },
	},

	// Druid specializations
	druid: {
		balance: { name: 'Equilibrio', category: 'DPS distancia' },
		feral: { name: 'Feral', category: 'DPS melee' },
		restore: { name: 'Restauración', category: 'Sanador' },
		guardian: { name: 'Guardián', category: 'Tanque' },
	},
};

// Función para validar si una especialización pertenece a una clase específica
export function isValidSpecForClass(spec, className) {
	if (!Object.hasOwn(specs, className)) return false;
	return Object.hasOwn(specs[className], spec);
}

// Función para obtener todas las especializaciones de una clase
export function getSpecsForClass(className) {
	return Object.hasOwn(specs, className) ? specs[className] : {};
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
		Reprensión: 'retribution',
		Bestia: 'beast_mastery',
		Bestias: 'beast_mastery',
		Puntería: 'archery',
		Supervivencia: 'survival',
		Sutileza: 'subtlety',
		Asesinato: 'assassination',
		Combate: 'combat',
		Disciplina: 'discipline',
		Sombras: 'shadow',
		Elemental: 'elemental',
		Melee: 'enhancement',
		Mejora: 'enhancement',
		Restauración: 'restore',
		Arcano: 'arcane',
		Fuego: 'fire',
		Escarcha: 'frost',
		Aflicción: 'affliction',
		Demonología: 'demonology',
		Destrucción: 'destruction',
		Equilibrio: 'balance',
		Feral: 'feral',
		Guardián: 'guardian',
	};

	return Object.hasOwn(oldToNew, specValue) ? oldToNew[specValue] : specValue;
}
