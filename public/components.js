// Componente para mostrar íconos de clase con nombre y tooltip
export function ClassIcon({ className, size = 'medium', showName = false, tooltip = false }) {
	const classMap = {
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

	const classKey = classMap[className] || 'unknown';
	const sizeClass = `icon-${size}`;
	const titleText = tooltip ? className : '';

	if (showName) {
		return /* HTML */ `<span class="class-icon-container" title="${titleText}">
			<img src="/assets/icons/${classKey}.png" alt="${className}" class="${sizeClass} icon-class" />
			<span class="icon-text">${className}</span>
		</span>`;
	}

	return /* HTML */ `<img
		src="/assets/icons/${classKey}.png"
		alt="${className}"
		class="${sizeClass} icon-class"
		title="${titleText}"
	/>`;
}

// Componente para mostrar íconos de especialización
export function SpecIcon({
	className,
	specId,
	size = 'medium',
	showName = false,
	tooltip = false,
}) {
	const specMap = {
		Guerrero: {
			arms: { name: 'Armas', icon: 'arms' },
			fury: { name: 'Furia', icon: 'fury' },
			protection: { name: 'Protección', icon: 'protection' },
		},
		Paladín: {
			holy: { name: 'Sagrado', icon: 'holy' },
			protection: { name: 'Protección', icon: 'protection' },
			retribution: { name: 'Hierro', icon: 'retribution' },
		},
		Cazador: {
			beast_mastery: { name: 'Bestia', icon: 'beast_mastery' },
			archery: { name: 'Puntería', icon: 'archery' },
			survival: { name: 'Supervivencia', icon: 'survival' },
		},
		Pícaro: {
			subtlety: { name: 'Sutileza', icon: 'subtlety' },
			assassination: { name: 'Asesinato', icon: 'assassination' },
			combat: { name: 'Combate', icon: 'combat' },
		},
		Sacerdote: {
			discipline: { name: 'Disciplina', icon: 'discipline' },
			holy: { name: 'Sagrado', icon: 'holy' },
			shadow: { name: 'Sombras', icon: 'shadow' },
		},
		Chamán: {
			elemental: { name: 'Elemental', icon: 'elemental' },
			enhancement: { name: 'Melee', icon: 'enhancement' },
			restore: { name: 'Restauración', icon: 'restore' },
		},
		Mago: {
			arcane: { name: 'Arcano', icon: 'arcane' },
			fire: { name: 'Fuego', icon: 'fire' },
			frost: { name: 'Escarcha', icon: 'frost' },
		},
		Brujo: {
			affliction: { name: 'Aflicción', icon: 'affliction' },
			demonology: { name: 'Demonología', icon: 'demonology' },
			destruction: { name: 'Destrucción', icon: 'destruction' },
		},
		Druida: {
			balance: { name: 'Equilibrio', icon: 'balance' },
			feral: { name: 'Feral', icon: 'feral' },
			restore: { name: 'Restauración', icon: 'restore' },
			guardian: { name: 'Guardián', icon: 'guardian' },
		},
	};

	const classSpecs = specMap[className];
	if (!classSpecs || !classSpecs[specId]) {
		return /* HTML */ `<span
			class="spec-icon-placeholder"
			title="${tooltip ? 'Especialización no disponible' : ''}"
			>?</span
		>`;
	}

	const specInfo = classSpecs[specId];
	const sizeClass = `icon-${size}`;
	const titleText = tooltip ? `${className} — ${specInfo.name}` : '';

	if (showName) {
		return /* HTML */ `<span class="spec-icon-container" title="${titleText}">
			<img
				src="/assets/icons/spec/${specInfo.icon}.png"
				alt="${specInfo.name}"
				class="${sizeClass} icon-spec"
			/>
			<span class="icon-text">${specInfo.name}</span>
		</span>`;
	}

	return /* HTML */ `<img
		src="/assets/icons/spec/${specInfo.icon}.png"
		alt="${specInfo.name}"
		class="${sizeClass} icon-spec"
		title="${titleText}"
	/>`;
}

// Componente combinado de clase y especialización
export function ClassWithSpecIcon({ className, specId, showSpec = true }) {
	if (!showSpec || !specId) {
		return ClassIcon({ className });
	}

	const classKey =
		{
			Guerrero: 'warrior',
			Paladín: 'paladin',
			Cazador: 'hunter',
			Pícaro: 'rogue',
			Sacerdote: 'priest',
			Chamán: 'shaman',
			Mago: 'mage',
			Brujo: 'warlock',
			Druida: 'druid',
		}[className] || 'unknown';

	return /* HTML */ `<span class="class-with-spec">
		<img src="/assets/icons/${classKey}.png" alt="${className}" class="icon-medium icon-class" />
		<span class="spec-separator">·</span>
		${SpecIcon({ className, specId, size: 'small', showName: false, tooltip: true })}
	</span>`;
}
