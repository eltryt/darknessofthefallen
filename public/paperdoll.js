import { ClassIcon } from './components.js';
import { gameVersions, slotLabels, itemQualities } from './armory-catalog.js';

const escape = (value) =>
	String(value ?? '').replace(
		/[&<>"']/g,
		(c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
	);
// Only same-origin images: the CSP blocks remote artwork, and provider assets
// must be proxied or stored locally before they can be shown.
const localImage = (value) =>
	typeof value === 'string' && /^\/(?!\/)[\w/.-]+$/.test(value) ? value : '';
const emptyIcon =
	'<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="m12 3 8 4.5v9L12 21l-8-4.5v-9Z"/><path d="m4 7.5 8 4.5 8-4.5M12 12v9"/></svg>';

function slot(name, item, side, href) {
	const label = slotLabels[name] || name;
	const tag = href ? 'a' : 'div';
	const link = href ? ` href="${escape(href)}"` : '';
	if (!item)
		return `<${tag} class="doll-slot is-empty side-${side}"${link} title="${escape(label)} · Sin datos"><span class="doll-icon">${emptyIcon}</span><span class="doll-text"><span class="doll-slot-name">${escape(label)}</span><small>Sin datos</small></span></${tag}>`;
	const icon = localImage(item.icon);
	const details = [
		item.enchant ? 'Encantamiento: ' + item.enchant : '',
		item.gems?.length ? `${item.gems.length} ${item.gems.length === 1 ? 'gema' : 'gemas'}` : '',
	].filter(Boolean);
	return `<${tag} class="doll-slot side-${side} quality-${escape(item.quality || 'none')}"${link} title="${escape(label)}: ${escape(item.item_name)}${item.quality ? ' · ' + escape(itemQualities[item.quality] || item.quality) : ''}"><span class="doll-icon">${icon ? `<img src="${escape(icon)}" alt="" width="44" height="44" loading="lazy">` : emptyIcon}</span><span class="doll-text"><strong>${escape(item.item_name || 'Objeto sin nombre')}</strong><span class="doll-meta">${item.item_level ? `<b>${escape(item.item_level)}</b>` : ''}${details.map((d) => `<small>${escape(d)}</small>`).join('')}</span></span></${tag}>`;
}

// Character "paper doll": item columns around the character portrait, weapons
// below and statistics at the foot. Empty slots render a calm placeholder.
export function paperdoll(sheet, { href = '' } = {}) {
	const c = sheet.character,
		version = gameVersions[c.game_version] || Object.values(gameVersions)[0],
		layout = version.paperdoll,
		items = new Map(sheet.equipment.map((row) => [row.slot, row]));
	const levels = sheet.equipment.map((e) => e.item_level).filter(Number.isFinite);
	const average = levels.length
		? Math.round(levels.reduce((a, b) => a + b, 0) / levels.length)
		: null;
	const portrait = localImage(c.avatar_url);
	const stats = sheet.stats || {};
	const column = (side) =>
		`<div class="doll-column doll-${side}">${layout[side].map((name) => slot(name, items.get(name), side, href)).join('')}</div>`;
	return `<section class="paperdoll" aria-label="Equipamiento de ${escape(c.name)}">
		<header class="doll-summary">
			<span><small>Nivel de objeto medio</small><strong>${average ?? '—'}</strong></span>
			<span><small>Ranuras registradas</small><strong>${sheet.equipment.length} / ${version.slots.length}</strong></span>
			<span><small>Origen</small><strong>${sheet.equipment.some((e) => e.origin === 'provider') ? 'Proveedor' : sheet.equipment.length ? 'Manual' : 'Sin datos'}</strong></span>
		</header>
		<div class="doll-stage">
			${column('left')}
			<figure class="doll-figure class-tint">
				${
					portrait
						? `<img class="doll-portrait" src="${escape(portrait)}" alt="Imagen de ${escape(c.name)}">`
						: `<div class="doll-placeholder">${ClassIcon({ className: c.class, size: 'large' })}<span class="doll-silhouette" aria-hidden="true"></span></div>`
				}
				<figcaption>${portrait ? escape(c.name) : 'La imagen del personaje aparecerá cuando exista un proveedor compatible con WoW Forever.'}</figcaption>
			</figure>
			${column('right')}
		</div>
		<div class="doll-weapons">${layout.bottom.map((name, i) => slot(name, items.get(name), i ? 'left' : 'right', href)).join('')}</div>
		<dl class="doll-stats">${version.stats
			.map(
				([key, label]) =>
					`<div><dt>${escape(label)}</dt><dd>${Number.isFinite(stats[key]) ? escape(stats[key].toLocaleString('es-ES')) : '—'}</dd></div>`,
			)
			.join('')}</dl>
	</section>`;
}
