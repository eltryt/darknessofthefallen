import { attachCharacterEditor } from './character-editor.js';
import { operationTab } from './operations-ui.js';
import { mountWishlist } from './wishlist-ui.js';
import { mountMyCallups } from './my-callups.js';
import { contactForm } from './gm-ui.js';
import { ClassIcon } from './components.js';
import { classKey } from './roster-ui.js';
import { paperdoll } from './paperdoll.js';
import {
	sheetHelpers,
	factsList,
	sheetForm,
	bindSheetForm,
	renderGuides,
	openSlotDialog,
} from './sheet-parts.js';

const icons = {
	armeria: '<path d="M12 3 4 6v6c0 4.5 3.4 8.2 8 9 4.6-.8 8-4.5 8-9V6Z"/><path d="M9 12l2 2 4-4"/>',
	personajes:
		'<circle cx="9" cy="8" r="3"/><path d="M3 20v-2a6 6 0 0 1 12 0v2M16 5a3 3 0 0 1 0 6m1 3a5 5 0 0 1 4 5v1"/>',
	wishlist: '<path d="M6 3h12v18l-6-4-6 4Z"/>',
	botin: '<path d="M4 9h16v11H4Z"/><path d="M3 5h18v4H3ZM12 5v15"/>',
	convocatorias:
		'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
};
const sections = [
	['armeria', 'Armería'],
	['personajes', 'Personajes'],
	['wishlist', 'Wishlist / BiS'],
	['botin', 'Botín'],
	['convocatorias', 'Convocatorias'],
];
export const rankLabels = {
	visitor: 'Visitante',
	member: 'Miembro',
	raider: 'Raider',
	raid_leader: 'Raid Leader',
	officer: 'Oficial',
	leader: 'Líder',
};
const svg = (name) =>
	`<svg class="hub-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${icons[name]}</svg>`;
const STORAGE_KEY = 'profile-character';
const remember = (id) => {
	try {
		localStorage.setItem(STORAGE_KEY, id);
	} catch {
		/* storage unavailable: the URL still keeps the choice */
	}
};
const recalled = () => {
	try {
		return localStorage.getItem(STORAGE_KEY);
	} catch {
		return null;
	}
};

// Mi perfil: one place for the player's characters. The selected character
// drives every section and survives reloads (URL first, then this browser).
export function createProfileView(context) {
	const { $, api, esc, field, select, area, formHandler, toast, me, roles, classes } = context;
	const { specName } = sheetHelpers(esc);
	let rows = [],
		attendance,
		selected = null,
		sheetCache = new Map(),
		wishCache = null,
		armoryMode = 'equipped',
		guideState = {},
		renderToken = 0;

	const current = () => location.hash.slice(1) || 'armeria';
	const selectedCharacter = () => rows.find((c) => c.id === selected) || null;

	async function profile() {
		[rows, attendance] = await Promise.all([
			api('/api/characters'),
			api('/api/attendance?userId=me'),
		]);
		sheetCache = new Map();
		wishCache = null;
		const wanted = [new URLSearchParams(location.search).get('personaje'), selected, recalled()];
		selected =
			wanted.find((id) => id && rows.some((c) => c.id === id)) ||
			rows.find((c) => c.is_main)?.id ||
			rows[0]?.id ||
			null;
		syncUrl();
		render();
	}
	function syncUrl() {
		const url = new URL(location.href);
		if (selected) url.searchParams.set('personaje', selected);
		else url.searchParams.delete('personaje');
		history.replaceState(null, '', url);
		if (selected) remember(selected);
	}
	function choose(id) {
		if (id === selected) return;
		selected = id;
		guideState = {};
		syncUrl();
		render();
	}

	function render() {
		const main = selectedCharacter();
		const metrics = attendance.metrics;
		const rank = rankLabels[me.user.rank] || me.user.rank;
		const corners = ['tl', 'tr', 'bl', 'br']
			.map((k) => `<span class="frame-corner corner-${k}"></span>`)
			.join('');
		$('#content').innerHTML = /* HTML */ `<section
				class="hub-hero ${main ? 'class-' + classKey(main.class) : ''}"
			>
				<span class="hub-hero-frame" aria-hidden="true">${corners}</span>
				<div class="hub-hero-main">
					<div class="hub-crest">
						<span class="hub-crest-ring" aria-hidden="true"></span>
						${main ? ClassIcon({ className: main.class, size: 'large' }) : svg('personajes')}
						${main ? `<span class="hub-crest-tag">${main.is_main ? 'Main' : 'Alter'}</span>` : ''}
					</div>
					<div class="hub-hero-text">
						<span class="eyebrow">Tu espacio en la hermandad</span>
						<h1>${esc(me.user.name)}</h1>
						${
							main
								? `<p class="hub-hero-line"><strong>${esc(main.name)}</strong><span>${esc(main.class)}${main.spec ? ' · ' + esc(specName(main.class, main.spec)) : ''}</span><span>${esc(main.role)}</span></p>`
								: '<p class="hub-hero-line">Registra tu primer personaje para abrir tu armería.</p>'
						}
					</div>
				</div>
				<dl class="hub-stats">
					<div>
						${svg('armeria')}
						<dt>Rango</dt>
						<dd>${esc(rank)}</dd>
					</div>
					<div>
						<span
							class="hub-ring"
							data-value="${Number(metrics.percentage) || 0}"
							aria-hidden="true"
						></span>
						<dt>Asistencia</dt>
						<dd>${metrics.percentage}%</dd>
						<small>${metrics.raids ? metrics.raids + ' registros' : 'Sin registros'}</small>
					</div>
					<div>
						${svg('personajes')}
						<dt>Personajes</dt>
						<dd>${rows.length}</dd>
					</div>
				</dl>
				<button type="button" id="logout" class="hub-logout" aria-label="Cerrar sesión">
					<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
						<path d="M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10" /></svg
					><span>Salir</span>
				</button>
			</section>
			${
				rows.length
					? `<div class="hub-chars" role="group" aria-label="Personaje seleccionado"><span class="hub-chars-label">Personaje</span>${rows
							.map(
								(c) =>
									`<button type="button" class="hub-char class-${classKey(c.class)}" data-select-character="${esc(c.id)}" aria-pressed="${c.id === selected}">${ClassIcon({ className: c.class, size: 'small' })}<span>${esc(c.name)}</span><small>${c.is_main ? 'Main' : 'Alter'}</small></button>`,
							)
							.join('')}</div>`
					: ''
			}
			<nav class="hub-nav" aria-label="Secciones de tu perfil">
				${sections
					.map(
						([id, label]) =>
							`<a href="#${id}" data-hub-section="${id}" ${id === current() ? 'aria-current="page"' : ''}>${svg(id)}<span>${label}</span>${id === 'personajes' ? `<b>${rows.length}</b>` : ''}</a>`,
					)
					.join('')}
			</nav>
			<section id="hub-body" class="hub-body" aria-live="polite"></section>`;
		// The CSP forbids style attributes; the ring value is set through the DOM.
		const ring = $('.hub-ring');
		if (ring) ring.style.setProperty('--value', ring.dataset.value);
		$('#logout').onclick = async () => {
			await api('/api/logout', 'POST', {});
			location.href = '/';
		};
		document
			.querySelectorAll('[data-select-character]')
			.forEach((b) => (b.onclick = () => choose(b.dataset.selectCharacter)));
		void show(current());
	}

	// Each section mounts into a fresh host, so late responses from a previous one are dropped.
	async function show(id) {
		if (!sections.some(([s]) => s === id)) id = 'armeria';
		document
			.querySelectorAll('[data-hub-section]')
			.forEach((a) =>
				a.dataset.hubSection === id
					? a.setAttribute('aria-current', 'page')
					: a.removeAttribute('aria-current'),
			);
		document
			.querySelector(`[data-hub-section="${id}"]`)
			?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
		const token = ++renderToken;
		const host = document.createElement('section');
		host.id = 'hub-body';
		host.className = 'hub-body is-entering';
		host.setAttribute('aria-live', 'polite');
		host.innerHTML =
			'<div class="hub-skeleton" role="status"><span></span><span></span><span></span><span class="visually-hidden">Cargando…</span></div>';
		$('#hub-body').replaceWith(host);
		try {
			if (id === 'armeria') await armory(host);
			if (id === 'personajes') characters(host);
			if (id === 'wishlist') {
				if (!me.permissions.includes('community.read')) return locked(host);
				await mountWishlist(host, selectedCharacter(), refreshWishlist, context);
			}
			if (id === 'botin') {
				if (!me.permissions.includes('community.read')) return locked(host);
				await loot(host);
			}
			if (id === 'convocatorias') await mountMyCallups(host, context);
		} catch (error) {
			if (token === renderToken && host.isConnected)
				host.innerHTML = `<div class="empty-note" role="alert"><strong>No se pudo cargar esta sección</strong><p>${esc(error.message)}</p></div>`;
		} finally {
			requestAnimationFrame(() => host.classList.remove('is-entering'));
		}
	}
	async function refreshWishlist() {
		wishCache = null;
		await show('wishlist');
	}
	function locked(host) {
		host.innerHTML =
			'<div class="empty-note" role="status"><strong>Disponible para miembros</strong><p>Un rol de miembro en Discord es necesario para esta sección.</p></div>';
	}

	async function armory(host) {
		const c = selectedCharacter();
		if (!c) {
			host.innerHTML = /* HTML */ `<div class="hub-empty">
				<h2>Tu historia empieza aquí</h2>
				<p>Registra tu primer personaje y tendrás su equipo, su wishlist y sus guías.</p>
				<a class="button" href="#personajes">Añadir personaje</a>
			</div>`;
			return;
		}
		const [sheet, wishes] = await Promise.all([
			sheetCache.get(c.id) || api('/api/armory/characters/' + encodeURIComponent(c.id)),
			wishCache ||
				(me.permissions.includes('community.read') ? api('/api/wishlists') : Promise.resolve([])),
		]);
		sheetCache.set(c.id, sheet);
		wishCache = wishes;
		if (!host.isConnected || selected !== c.id) return;
		const own = wishes.filter((w) => w.data.characterId === c.id);
		// BiS goals per slot: the same wishlist data, never a second list.
		const targets = own
			.filter((w) => w.data.slot && w.data.status === 'BiS')
			.map((w) => ({
				slot: w.data.slot,
				item_name: w.data.item,
				obtained: w.data.obtained,
				quality: '',
			}));
		const view = armoryMode === 'target' ? { ...sheet, equipment: dedupe(targets) } : sheet;
		const ch = sheet.character;
		const missing = [
			['Reino', ch.realm],
			['Raza', ch.race],
			['Nivel', ch.level],
			['Especialización', ch.spec],
		].filter(([, v]) => !v);
		host.innerHTML = /* HTML */ `<div class="hub-armory">
			<div class="hub-armory-gear">
				<header>
					<h2>
						${esc(ch.name)}
						<span class="pill ${ch.is_main ? 'gold' : ''}">${ch.is_main ? 'Main' : 'Alter'}</span>
					</h2>
					<div class="hub-segment" role="group" aria-label="Qué mostrar">
						<button
							type="button"
							data-armory-mode="equipped"
							aria-pressed="${armoryMode === 'equipped'}"
						>
							Equipo actual
						</button>
						<button
							type="button"
							data-armory-mode="target"
							aria-pressed="${armoryMode === 'target'}"
						>
							Objetivo BiS
						</button>
					</div>
				</header>
				${paperdoll(view, { slotButtons: true, target: armoryMode === 'target' })}
				<p class="muted hub-armory-hint">
					${
						armoryMode === 'target'
							? 'Objetos marcados como BiS en tu wishlist con un hueco indicado. Se editan en Wishlist / BiS.'
							: 'Pulsa un hueco para ver el objeto y, si es tuyo, registrarlo a mano.'
					}
				</p>
			</div>
			<div class="hub-armory-side">
				<details class="card hub-sheet">
					<summary>
						<span>${svg('personajes')} Datos de la ficha</span>
						<small
							>${missing.length ? missing.length + ' por completar: ' + esc(missing.map(([k]) => k).join(', ')) : 'Completa'}</small
						>
					</summary>
					${factsList(ch, esc)}
					${sheet.canEdit ? `<details class="hub-sheet-edit"><summary>Editar datos</summary>${sheetForm(ch, context)}</details>` : ''}
				</details>
				<section class="card hub-guides">
					<h3>${svg('armeria')} Guías de ${esc(ch.class)}</h3>
					<div data-guides></div>
				</section>
			</div>
		</div>`;
		renderGuides(host.querySelector('[data-guides]'), sheet, context, guideState);
		const form = host.querySelector('#armory-sheet');
		if (form)
			bindSheetForm(form, ch, context, async () => {
				await profile();
			});
		host.querySelectorAll('[data-armory-mode]').forEach(
			(b) =>
				(b.onclick = () => {
					armoryMode = b.dataset.armoryMode;
					void armory(host);
				}),
		);
		host.querySelectorAll('[data-slot]').forEach(
			(b) =>
				(b.onclick = () =>
					openSlotDialog({
						slot: b.dataset.slot,
						sheet,
						wishes: own,
						canEdit: sheet.canEdit && armoryMode === 'equipped',
						ctx: context,
						onSaved: async () => {
							sheetCache.delete(c.id);
							if (host.isConnected) await armory(host);
						},
					})),
		);
	}
	const dedupe = (items) => [...new Map(items.map((i) => [i.slot, i])).values()];

	async function loot(host) {
		const council = await api('/api/council');
		if (!host.isConnected) return;
		host.innerHTML = /* HTML */ `<div class="hub-section-head">
				<div>
					<h2>Botín</h2>
					<p>Qué se ha repartido y quién decide en el consejo actual.</p>
				</div>
			</div>
			<section class="loot-council">
				<h3>Consejo de botín</h3>
				${
					council.length
						? `<ul class="council-cards">${council
								.map(
									(m) =>
										`<li class="card"><strong>${esc(m.display_name)}</strong><span class="pill">${esc(rankLabels[m.rank] || m.rank)}</span>${m.discordUrl ? `<a class="link" href="${esc(m.discordUrl)}" target="_blank" rel="noopener noreferrer">Perfil de Discord ↗</a>` : ''}</li>`,
								)
								.join('')}</ul>`
						: '<p class="muted">El Líder todavía no ha designado el consejo de botín.</p>'
				}
				<details class="loot-question">
					<summary>¿Dudas sobre el botín?</summary>
					<div data-loot-contact></div>
				</details>
			</section>
			<section class="loot-history">
				<h3>Historial de botín</h3>
				<div data-loot-history></div>
			</section>`;
		contactForm(host.querySelector('[data-loot-contact]'), context, 'contact', {
			subject: 'Consulta sobre botín',
			heading: 'Consulta sobre botín',
		});
		await operationTab('loot', host.querySelector('[data-loot-history]'), {
			...context,
			me: {
				...me,
				permissions: me.permissions.filter(
					(p) => !['loot.manage', 'loot.delete', 'settings.manage'].includes(p),
				),
			},
		});
	}

	function characters(host) {
		host.innerHTML = /* HTML */ `<div class="hub-section-head">
				<div>
					<h2>Mis personajes</h2>
					<p>Un Main y todos tus Alters. Elige uno para ver su armería, su wishlist y sus guías.</p>
				</div>
				${
					me.permissions.includes('character.write')
						? '<button type="button" class="button" data-open-new>Añadir personaje</button>'
						: ''
				}
			</div>
			${
				rows.length
					? `<div class="hub-char-grid">${rows
							.map(
								(c) =>
									`<article class="hub-char-card class-${classKey(c.class)} ${c.id === selected ? 'is-selected' : ''}"><div class="hub-char-top">${ClassIcon({ className: c.class, size: 'large' })}<div><h3>${esc(c.name)} ${esc(c.surname)}</h3><p>${esc(c.class)}${c.spec ? ' · ' + esc(specName(c.class, c.spec)) : ''} · ${esc(c.role)}</p></div><span class="pill ${c.is_main ? 'gold' : ''}">${c.is_main ? 'Main' : 'Alter'}</span></div><div class="hub-char-actions"><button type="button" class="button secondary" data-open-armory="${esc(c.id)}">${c.id === selected ? 'Seleccionado · ver armería' : 'Ver armería'}</button><details class="hub-settings"><summary aria-label="Ajustes de ${esc(c.name)}"><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/></svg><span>Ajustes</span></summary><div class="hub-menu"><button type="button" data-character-edit="${esc(c.id)}">Editar datos básicos</button>${c.is_main ? '' : `<button type="button" data-main="${esc(c.id)}">Marcar como Main</button>`}<button type="button" class="is-danger" data-character-archive="${esc(c.id)}">Archivar personaje</button></div></details></div></article>`,
							)
							.join('')}</div>`
					: '<div class="empty-note" role="status"><strong>Todavía no tienes personajes</strong><p>Añade el primero para incorporarte al roster y abrir su armería.</p></div>'
			}
			${
				me.permissions.includes('character.write')
					? /* HTML */ `<details class="card hub-new" ${rows.length ? '' : 'open'}>
							<summary>Añadir personaje</summary>
							<h3>Añadir personaje</h3>
							<form id="character" class="form">
								<div class="form-grid">
									${field('Nombre', 'name')}${field('Apellido', 'surname', 'text', '', false)}${select('Clase', 'class', classes)}${select('Rol', 'role', roles)}${field('Especialización', 'spec', 'text', '', false)}${field('Profesiones', 'professions', 'text', '', false)}${area('Disponibilidad', 'availability', false)}${area('Notas personales', 'notes', false)}
								</div>
								<p class="muted">
									Reino, raza, nivel y el resto de la ficha se completan después en Armería → Datos
									de la ficha.
								</p>
								<label class="armory-check"
									><input type="checkbox" name="isMain" />Marcar como Main</label
								><button type="submit">Guardar personaje</button>
							</form>
						</details>`
					: '<p class="notice">Un rol de miembro en Discord es necesario para registrar personajes.</p>'
			}`;
		const menus = [...host.querySelectorAll('.hub-settings')];
		menus.forEach((m) =>
			m.addEventListener('toggle', () => {
				if (m.open) menus.forEach((o) => o !== m && (o.open = false));
			}),
		);
		host.addEventListener('click', (e) => {
			if (!e.target.closest('.hub-settings')) menus.forEach((m) => (m.open = false));
			else if (e.target.closest('.hub-menu button')) e.target.closest('.hub-settings').open = false;
		});
		host.addEventListener('keydown', (e) => {
			if (e.key === 'Escape') menus.forEach((m) => (m.open = false));
		});
		attachCharacterEditor({ rows, api, refresh: profile, toast });
		formHandler('#character', async (v) => {
			const created = await api('/api/characters', 'POST', { ...v, isMain: !!v.isMain });
			toast('Personaje guardado');
			if (created?.id) {
				selected = created.id;
				remember(created.id);
			}
			await profile();
		});
		host.querySelector('[data-open-new]')?.addEventListener('click', () => {
			const details = host.querySelector('.hub-new');
			details.open = true;
			details.scrollIntoView({ block: 'start', behavior: 'smooth' });
			details.querySelector('input[name=name]')?.focus({ preventScroll: true });
		});
		host.querySelectorAll('[data-open-armory]').forEach(
			(b) =>
				(b.onclick = () => {
					selected = b.dataset.openArmory;
					guideState = {};
					syncUrl();
					history.replaceState(null, '', '#armeria');
					render();
				}),
		);
		host.querySelectorAll('[data-main]').forEach(
			(b) =>
				(b.onclick = async () => {
					try {
						await api(`/api/characters/${b.dataset.main}/main`, 'POST', {});
						toast('Main actualizado');
						await profile();
					} catch (e) {
						toast(e.message);
					}
				}),
		);
	}

	window.addEventListener('hashchange', () => {
		if (location.pathname === '/perfil' && document.querySelector('.hub-nav')) void show(current());
	});
	return { profile };
}
