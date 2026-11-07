import { ClassIcon } from './components.js';
import { wowheadItemUrl } from './wowhead.js';
import {
	gameVersions,
	slotLabels,
	itemQualities,
	slotIcon,
	catalogIconUrl,
	foreverIconUrl,
	blizzardImage,
	blizzardArmoryUrl,
	raceBackdrop,
} from './armory-catalog.js';

const escape = (value) =>
	String(value ?? '').replace(
		/[&<>"']/g,
		(c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
	);
// Only same-origin images: the CSP blocks remote artwork, and provider assets
// must be proxied or stored locally before they can be shown.
const localImage = (value) =>
	typeof value === 'string' && /^\/(?!\/)[\w/.-]+$/.test(value) ? value : '';
// Provisional class portraits, shown until the Blizzard API (or another provider)
// supplies the real character image.
const classPortraits = {
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
// Generic outline, only for a slot without its own artwork.
const emptyIcon =
	'<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="m12 3 8 4.5v9L12 21l-8-4.5v-9Z"/><path d="m4 7.5 8 4.5 8-4.5M12 12v9"/></svg>';

// Our own stat emblems, in the spirit of the official armory: a coloured frame and symbol.
const statIcons = {
	health:
		'<path d="M12 19s-6.5-4.1-6.5-8.6A3.6 3.6 0 0 1 12 8.2a3.6 3.6 0 0 1 6.5 2.2C18.5 14.9 12 19 12 19Z"/>',
	power:
		'<path d="M10 4h4M10.5 4v5l-4.3 7.6A2 2 0 0 0 8 19.5h8a2 2 0 0 0 1.8-2.9L13.5 9V4"/><path d="M8 14h8"/>',
	strength: '<path d="M4 9v6M7 7v10M17 7v10M20 9v6M7 12h10"/>',
	agility:
		'<circle cx="8" cy="8" r="1.6"/><circle cx="12" cy="6.5" r="1.6"/><circle cx="16" cy="8" r="1.6"/><path d="M12 11c-2.6 0-4.5 2.6-4.5 4.4 0 1.7 1.6 2.4 4.5 1.6 2.9.8 4.5.1 4.5-1.6 0-1.8-1.9-4.4-4.5-4.4Z"/>',
	stamina: '<path d="m12 4 8 8-8 8-8-8Z"/><path d="M12 9v6M9 12h6"/>',
	intellect:
		'<path d="M9 17h6M10 20h4M8.5 14.5a5 5 0 1 1 7 0c-.8.8-1 1.4-1 2.5h-5c0-1.1-.2-1.7-1-2.5Z"/>',
	spirit:
		'<path d="M12 4c.8 4.4 3.6 7.2 8 8-4.4.8-7.2 3.6-8 8-.8-4.4-3.6-7.2-8-8 4.4-.8 7.2-3.6 8-8Z"/>',
	armor: '<path d="M12 4 5 7v5c0 4.2 3 7 7 8 4-1 7-3.8 7-8V7Z"/>',
	crit: '<circle cx="12" cy="12" r="6.5"/><circle cx="12" cy="12" r="1.4"/><path d="M12 3v4M12 17v4M3 12h4M17 12h4"/>',
};
function statCell(key, label, value) {
	const shown = Number.isFinite(value)
		? key === 'crit'
			? `${value.toLocaleString('es-ES')}%`
			: value.toLocaleString('es-ES')
		: '—';
	return `<div role="listitem" class="doll-stat stat-${escape(key)}${Number.isFinite(value) ? '' : ' is-empty'}"><span class="stat-emblem" aria-hidden="true"><svg viewBox="0 0 24 24" focusable="false">${statIcons[key] || ''}</svg></span><span class="stat-text"><b class="stat-value">${escape(shown)}</b><span class="stat-label">${escape(label)}</span></span></div>`;
}

function slot(name, item, side, href, buttons) {
	const label = slotLabels[name] || name;
	// Each slot shows its own silhouette (a faded official icon) until an item fills it.
	const placeholder = slotIcon(name)
		? `<img class="doll-placeholder" src="${slotIcon(name)}" alt="" width="44" height="44" loading="lazy">`
		: emptyIcon;
	const tag = buttons ? 'button' : href ? 'a' : 'div';
	const link = buttons
		? ` type="button" data-slot="${escape(name)}" aria-haspopup="dialog" aria-label="${escape(label)}: ${escape(item?.item_name || 'sin datos')}. Abrir detalles"`
		: href
			? ` href="${escape(href)}"`
			: '';
	if (!item)
		return `<${tag} class="doll-slot is-empty side-${side}"${link} title="${escape(label)} · Sin datos"><span class="doll-icon">${placeholder}</span><span class="doll-text"><span class="doll-slot-name">${escape(label)}</span><small>Sin datos</small></span></${tag}>`;
	// An item with its id is a link to Wowhead Forever in Spanish, so hovering it shows the
	// item's tooltip; clicking still opens our slot details (the click handler stops it).
	const wowhead = /^\d+$/.test(item.item_id || '') ? wowheadItemUrl(item.item_id) : '';
	const itemTag = buttons && wowhead ? 'a' : tag,
		itemLink =
			buttons && wowhead
				? ` href="${escape(wowhead)}" role="button" data-slot="${escape(name)}" aria-haspopup="dialog" aria-label="${escape(label)}: ${escape(item.item_name)}. Abrir detalles"`
				: link;
	// Our own images, Forever's icon of an imported item, or the icon of a catalogue pick.
	const icon = localImage(item.icon) || foreverIconUrl(item.icon) || catalogIconUrl(item.icon);
	// A Blizzard item whose icon is not known yet: fillCatalogIcons() tries the catalogue.
	const lookup =
		!icon && /^\d+$/.test(item.item_id || '') ? ` data-catalog-item="${escape(item.item_id)}"` : '';
	const details = [
		item.enchant ? 'Encantamiento: ' + item.enchant : '',
		item.gems?.length ? `${item.gems.length} ${item.gems.length === 1 ? 'gema' : 'gemas'}` : '',
	].filter(Boolean);
	const title = wowhead
		? ''
		: ` title="${escape(label)}: ${escape(item.item_name)}${item.quality ? ' · ' + escape(itemQualities[item.quality] || item.quality) : ''}"`;
	return `<${itemTag} data-doll-slot="${escape(name)}" class="doll-slot side-${side} quality-${escape(item.quality || 'none')}"${itemLink}${title}><span class="doll-icon"${lookup}>${icon ? `<img src="${escape(icon)}" alt="" width="44" height="44" loading="lazy">` : placeholder}</span><span class="doll-text"><strong>${escape(item.item_name || 'Objeto sin nombre')}</strong><span class="doll-meta">${item.item_level ? `<b>${escape(item.item_level)}</b>` : ''}${details.map((d) => `<small>${escape(d)}</small>`).join('')}</span></span></${itemTag}>`;
}

// Adds up the stats of the equipped pieces (items picked from the catalogue carry them).
export function equipmentTotals(equipment) {
	const totals = {};
	for (const e of equipment)
		for (const [key, value] of Object.entries(e.stats || {}))
			if (Number.isFinite(value)) totals[key] = (totals[key] || 0) + value;
	return totals;
}

// Character "paper doll": item columns around the character portrait, weapons
// below and statistics at the foot. Empty slots render a calm placeholder.
// slotButtons turns each slot into a button that opens its detail panel;
// target shows BiS goals (from the wishlist) instead of current equipment.
export function paperdoll(sheet, { href = '', slotButtons = false, target = false } = {}) {
	const c = sheet.character,
		version = gameVersions[c.game_version] || Object.values(gameVersions)[0],
		layout = version.paperdoll,
		items = new Map(sheet.equipment.map((row) => [row.slot, row]));
	const levels = sheet.equipment.map((e) => e.item_level).filter(Number.isFinite);
	const average = levels.length
		? Math.round(levels.reduce((a, b) => a + b, 0) / levels.length)
		: null;
	const portrait = localImage(c.avatar_url) || blizzardImage(c.avatar_url, 'main'),
		armoryUrl = blizzardArmoryUrl(c),
		// Blizzard's render comes on a wide transparent canvas: framed like their armory,
		// over the backdrop of the character's race.
		blizzard = !!blizzardImage(c.avatar_url),
		backdrop = blizzard ? raceBackdrop(c.race) : '',
		classArt = Object.hasOwn(classPortraits, c.class) ? classPortraits[c.class] : '';
	// A data provider's character stats win; otherwise the sum of the equipped pieces.
	const ownStats = Object.keys(sheet.stats || {}).length > 0,
		stats = ownStats ? sheet.stats : target ? {} : equipmentTotals(sheet.equipment),
		summed = !ownStats && Object.keys(stats).length > 0;
	const column = (side) =>
		`<div class="doll-column doll-${side}">${layout[side].map((name) => slot(name, items.get(name), side, href, slotButtons)).join('')}</div>`;
	return `<section class="paperdoll${target ? ' is-target' : ''}" aria-label="${target ? 'Objetivo BiS' : 'Equipamiento'} de ${escape(c.name)}">
		<header class="doll-summary">${
			target
				? `<span><small>Huecos con objetivo BiS</small><strong>${sheet.equipment.length} / ${version.slots.length}</strong></span>
			<span><small>Conseguidos</small><strong>${sheet.equipment.filter((e) => e.obtained).length}</strong></span>
			<span><small>Origen</small><strong>Tu wishlist</strong></span>`
				: `<span><small>Nivel de objeto medio</small><strong>${average ?? '—'}</strong></span>
			<span><small>Ranuras registradas</small><strong>${sheet.equipment.length} / ${version.slots.length}</strong></span>
			${armoryUrl ? `<a class="doll-armory-link" href="${escape(armoryUrl)}" target="_blank" rel="noopener noreferrer">Ver en la armería de Blizzard ↗</a>` : ''}`
		}
		</header>
		<div class="doll-stage">
			${column('left')}
			<figure class="doll-figure class-tint${blizzard ? ' is-blizzard' : ''}">
				${backdrop ? `<img class="doll-backdrop" src="${escape(backdrop)}" alt="" decoding="async">` : ''}
				${
					portrait
						? `<img class="doll-portrait fade-in${blizzard ? ' is-render' : ''}" src="${escape(portrait)}" alt="Imagen de ${escape(c.name)}" decoding="async">`
						: classArt
							? `<img class="doll-portrait is-class-art fade-in" src="/assets/portraits/${classArt}.webp" alt="" width="600" height="800" decoding="async" fetchpriority="high">`
							: `<div class="doll-placeholder">${ClassIcon({ className: c.class, size: 'large' })}<span class="doll-silhouette" aria-hidden="true"></span></div>`
				}
				<figcaption>${portrait ? escape(c.name) + (blizzardImage(c.avatar_url) ? ' · imagen de Blizzard' : '') : classArt ? `Retrato provisional de ${escape(c.class)}. Se sustituirá por tu personaje real cuando la web se conecte con la API de Blizzard.` : 'La imagen del personaje aparecerá cuando exista un proveedor compatible con WoW Forever.'}</figcaption>
			</figure>
			${column('right')}
		</div>
		<div class="doll-weapons">${layout.bottom.map((name, i) => slot(name, items.get(name), i ? 'left' : 'right', href, slotButtons)).join('')}</div>
		<div class="doll-stats" role="list" aria-label="Estadísticas">${version.stats
			.filter(([key]) => key !== 'crit' || Number.isFinite(stats.crit))
			.map(([key, label]) =>
				statCell(
					key,
					key === 'power' && typeof stats.power_name === 'string' ? stats.power_name : label,
					stats[key],
				),
			)
			.join('')}</div>
		${summed ? '<p class="doll-stats-note">Suma de los atributos de las piezas elegidas del catálogo. Sin atributos base del personaje, talentos ni encantamientos.</p>' : ''}
	</section>`;
}
