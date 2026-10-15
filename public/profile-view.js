import { attachCharacterEditor } from './character-editor.js';
import { mountMemberLoot } from './operations-ui.js';
import { mountWishlist } from './wishlist-ui.js';
import { mountRaidEvents } from './raid-events-ui.js';
import { ClassIcon } from './components.js';
import { classKey } from './roster-ui.js';
import { getSpecsForClass, normalizeSpecValue } from './specs.js';
import { paperdoll } from './paperdoll.js';

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
	['armeria', 'Mi armería'],
	['personajes', 'Personajes'],
	['wishlist', 'Wishlist'],
	['botin', 'Botín'],
	['convocatorias', 'Convocatorias'],
];
const rankLabels = {
	visitor: 'Visitante',
	member: 'Miembro',
	raider: 'Raider',
	raid_leader: 'Raid Leader',
	officer: 'Oficial',
	leader: 'Líder',
};
const svg = (name) =>
	`<svg class="hub-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${icons[name]}</svg>`;

// Profile hub: the main character's armory first, everything else one click away.
export function createProfileView(context) {
	const { $, api, esc, field, select, area, formHandler, toast, me, roles, classes } = context;
	let rows = [],
		attendance,
		selected = null,
		sheetCache = new Map(),
		renderToken = 0;

	const specName = (className, id) => {
		const specs = getSpecsForClass(classKey(className)),
			key = normalizeSpecValue(id || '');
		return Object.hasOwn(specs, key) ? specs[key].name : id || '';
	};
	const current = () => location.hash.slice(1) || 'armeria';

	async function profile() {
		[rows, attendance] = await Promise.all([
			api('/api/characters'),
			api('/api/attendance?userId=me'),
		]);
		sheetCache = new Map();
		if (!rows.some((c) => c.id === selected))
			selected = rows.find((c) => c.is_main)?.id || rows[0]?.id || null;
		render();
	}

	function render() {
		const main = rows.find((c) => c.id === selected);
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
						${main?.is_main ? '<span class="hub-crest-tag">Main</span>' : ''}
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
							style="--value:${Number(metrics.percentage) || 0}"
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
				rows.length > 1
					? `<div class="hub-chars" role="group" aria-label="Elegir personaje">${rows
							.map(
								(c) =>
									`<button type="button" class="hub-char class-${classKey(c.class)}" data-select-character="${esc(c.id)}" aria-pressed="${c.id === selected}">${ClassIcon({ className: c.class, size: 'small' })}<span>${esc(c.name)}</span>${c.is_main ? '<small>Main</small>' : ''}</button>`,
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
		$('#logout').onclick = async () => {
			await api('/api/logout', 'POST', {});
			location.href = '/';
		};
		document.querySelectorAll('[data-select-character]').forEach(
			(b) =>
				(b.onclick = () => {
					selected = b.dataset.selectCharacter;
					render();
				}),
		);
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
				await mountWishlist(host, rows, profile, context);
			}
			if (id === 'botin') {
				if (!me.permissions.includes('community.read')) return locked(host);
				await mountMemberLoot(host, context);
			}
			if (id === 'convocatorias') await mountRaidEvents(host, context, { mine: true });
		} catch (error) {
			if (token === renderToken)
				host.innerHTML = `<div class="empty-note" role="alert"><strong>No se pudo cargar esta sección</strong><p>${esc(error.message)}</p></div>`;
		} finally {
			requestAnimationFrame(() => host.classList.remove('is-entering'));
		}
	}
	function locked(host) {
		host.innerHTML =
			'<div class="empty-note" role="status"><strong>Disponible para miembros</strong><p>Un rol de miembro en Discord es necesario para esta sección.</p></div>';
	}

	async function armory(host) {
		const c = rows.find((x) => x.id === selected);
		if (!c) {
			host.innerHTML = /* HTML */ `<div class="hub-empty">
				<h2>Tu historia empieza aquí</h2>
				<p>Registra tu primer personaje y tendrás su ficha, su lista BiS y sus guías.</p>
				<a class="button" href="#personajes">Añadir personaje</a>
			</div>`;
			return;
		}
		if (!sheetCache.has(c.id))
			sheetCache.set(c.id, await api('/api/armory/characters/' + encodeURIComponent(c.id)));
		if (!host.isConnected) return;
		const sheet = sheetCache.get(c.id),
			ch = sheet.character;
		const entries = sheet.lists.flatMap((l) => l.entries),
			got = entries.filter((e) => e.status === 'Conseguido').length,
			priority = entries.filter((e) => e.status === 'Prioritario').length,
			percent = entries.length ? Math.round((got / entries.length) * 100) : 0;
		const guides = Object.values(sheet.guides)
			.flat()
			.reduce((n, p) => n + p.sections.reduce((m, s) => m + s.links.length, 0), 0);
		const link = (tab) => `/armeria?personaje=${encodeURIComponent(c.id)}&tab=${tab}`;
		const missing = [
			['Reino', ch.realm],
			['Raza', ch.race],
			['Nivel', ch.level],
			['Especialización', ch.spec],
		].filter(([, v]) => !v);
		host.innerHTML = /* HTML */ `<div class="hub-armory">
			<div class="hub-armory-gear">
				<header>
					<h2>Equipamiento</h2>
					<a href="${link('gear')}">Ver ficha completa →</a>
				</header>
				${paperdoll(sheet, { href: link('gear') })}
			</div>
			<div class="hub-armory-side">
				<a class="hub-card" href="${link('bis')}">
					<span class="hub-card-label">${svg('wishlist')} Mi lista BiS</span>
					${
						entries.length
							? `<strong>${got} / ${entries.length}</strong><span>conseguidos · ${priority} prioritarios</span><span class="hub-progress" role="img" aria-label="${percent}% conseguido"><i style="width:${percent}%"></i></span>`
							: '<strong>Vacía</strong><span>Crea tu primera lista por especialización y fase.</span>'
					}
					<em>${entries.length ? 'Abrir lista' : 'Empezar lista'} →</em>
				</a>
				<a class="hub-card" href="${link('guides')}">
					<span class="hub-card-label">${svg('armeria')} Guías de ${esc(ch.class)}</span>
					<strong>${guides || 'Sin enlaces'}</strong>
					<span
						>${
							guides
								? 'enlaces comprobados por la hermandad'
								: 'Ninguna guía verificada todavía para tu clase.'
						}</span
					>
					<em>Ver guías →</em>
				</a>
				<a class="hub-card ${missing.length ? 'is-pending' : ''}" href="${link('summary')}">
					<span class="hub-card-label">${svg('personajes')} Datos de la ficha</span>
					<strong>${missing.length ? missing.length + ' por completar' : 'Completa'}</strong>
					<span
						>${
							missing.length
								? esc(missing.map(([k]) => k).join(' · '))
								: esc(
										[ch.realm, ch.race, ch.level ? 'Nivel ' + ch.level : '']
											.filter(Boolean)
											.join(' · '),
									)
						}</span
					>
					<em>Editar ficha →</em>
				</a>
			</div>
		</div>`;
	}

	function characters(host) {
		host.innerHTML = /* HTML */ `<div class="hub-section-head">
				<div>
					<h2>Mis personajes</h2>
					<p>Un Main y todos tus Alters. La ficha de cada uno abre su armería.</p>
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
									`<article class="hub-char-card class-${classKey(c.class)}"><div class="hub-char-top">${ClassIcon({ className: c.class, size: 'large' })}<div><h3>${esc(c.name)} ${esc(c.surname)}</h3><p>${esc(c.class)}${c.spec ? ' · ' + esc(specName(c.class, c.spec)) : ''} · ${esc(c.role)}</p></div>${c.is_main ? '<span class="pill gold">Main</span>' : ''}</div><div class="hub-char-actions"><a class="button secondary" href="/armeria?personaje=${encodeURIComponent(c.id)}">Ver ficha</a><details class="hub-settings"><summary aria-label="Ajustes de ${esc(c.name)}"><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/></svg><span>Ajustes</span></summary><div class="hub-menu"><button type="button" data-character-edit="${esc(c.id)}">Editar datos</button>${c.is_main ? '' : `<button type="button" data-main="${esc(c.id)}">Marcar como Main</button>`}<button type="button" class="is-danger" data-character-archive="${esc(c.id)}">Archivar personaje</button></div></details></div></article>`,
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
			await api('/api/characters', 'POST', { ...v, isMain: !!v.isMain });
			toast('Personaje guardado');
			await profile();
		});
		host.querySelector('[data-open-new]')?.addEventListener('click', () => {
			const details = host.querySelector('.hub-new');
			details.open = true;
			details.scrollIntoView({ block: 'start', behavior: 'smooth' });
			details.querySelector('input[name=name]')?.focus({ preventScroll: true });
		});
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
