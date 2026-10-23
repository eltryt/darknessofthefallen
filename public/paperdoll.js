import { ClassIcon } from './components.js';
import { gameVersions, slotLabels, itemQualities, slotIcon } from './armory-catalog.js';

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
	const icon = localImage(item.icon);
	const details = [
		item.enchant ? 'Encantamiento: ' + item.enchant : '',
		item.gems?.length ? `${item.gems.length} ${item.gems.length === 1 ? 'gema' : 'gemas'}` : '',
	].filter(Boolean);
	return `<${tag} class="doll-slot side-${side} quality-${escape(item.quality || 'none')}"${link} title="${escape(label)}: ${escape(item.item_name)}${item.quality ? ' · ' + escape(itemQualities[item.quality] || item.quality) : ''}"><span class="doll-icon">${icon ? `<img src="${escape(icon)}" alt="" width="44" height="44" loading="lazy">` : placeholder}</span><span class="doll-text"><strong>${escape(item.item_name || 'Objeto sin nombre')}</strong><span class="doll-meta">${item.item_level ? `<b>${escape(item.item_level)}</b>` : ''}${details.map((d) => `<small>${escape(d)}</small>`).join('')}</span></span></${tag}>`;
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
	const portrait = localImage(c.avatar_url),
		classArt = Object.hasOwn(classPortraits, c.class) ? classPortraits[c.class] : '';
	const stats = sheet.stats || {};
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
			<span><small>Origen</small><strong>${sheet.equipment.some((e) => e.origin === 'provider') ? 'Proveedor' : sheet.equipment.length ? 'Manual' : 'Sin datos'}</strong></span>`
		}
		</header>
		<div class="doll-stage">
			${column('left')}
			<figure class="doll-figure class-tint">
				${
					portrait
						? `<img class="doll-portrait fade-in" src="${escape(portrait)}" alt="Imagen de ${escape(c.name)}" decoding="async">`
						: classArt
							? `<img class="doll-portrait is-class-art fade-in" src="/assets/portraits/${classArt}.webp" alt="" width="600" height="800" decoding="async" fetchpriority="high">`
							: `<div class="doll-placeholder">${ClassIcon({ className: c.class, size: 'large' })}<span class="doll-silhouette" aria-hidden="true"></span></div>`
				}
				<figcaption>${portrait ? escape(c.name) : classArt ? `Retrato provisional de ${escape(c.class)}. Se sustituirá por tu personaje real cuando la web se conecte con la API de Blizzard.` : 'La imagen del personaje aparecerá cuando exista un proveedor compatible con WoW Forever.'}</figcaption>
			</figure>
			${column('right')}
		</div>
		<div class="doll-weapons">${layout.bottom.map((name, i) => slot(name, items.get(name), i ? 'left' : 'right', href, slotButtons)).join('')}</div>
		<dl class="doll-stats">${version.stats
			.map(
				([key, label]) =>
					`<div><dt>${escape(label)}</dt><dd>${Number.isFinite(stats[key]) ? escape(stats[key].toLocaleString('es-ES')) : '—'}</dd></div>`,
			)
			.join('')}</dl>
	</section>`;
}
