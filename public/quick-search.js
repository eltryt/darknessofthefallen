// Quick search for members: Ctrl+K (⌘K on Mac), «/» or the header button opens a box
// that jumps to any page, profile section, panel section or guild character.
import { panelAreas } from './panel-home.js';

const normal = (s) =>
	String(s || '')
		.normalize('NFD')
		.replace(/[̀-ͯ]/g, '')
		.toLowerCase();
const profileSections = [
	['inicio', 'Inicio del perfil'],
	['armeria', 'Mi armería'],
	['personajes', 'Mis personajes'],
	['wishlist', 'Mi wishlist / BiS'],
	['botin', 'Botín y consejo'],
	['convocatorias', 'Mis convocatorias'],
	['logros', 'Logros'],
	['camino', 'Camino al 60'],
	['pvp', 'Senda del honor'],
	['ruleta', 'Ruleta'],
];
const pages = [
	['/', 'Inicio de la web'],
	['/nosotros', 'La hermandad'],
	['/progreso', 'Progreso PvE'],
	['/roster', 'Roster público'],
	['/raids', 'Raids y horarios'],
	['/mapa', 'Mapa de Azeroth'],
	['/reclutamiento', 'Reclutamiento'],
	['/contacto', 'Contacto y Discord'],
	['/armeria', 'Armería de la hermandad'],
];

export function initQuickSearch({ api, esc, me }) {
	if (!me.user) return;
	const items = [
		...profileSections.map(([id, label]) => ({ kind: 'Perfil', label, href: `/perfil#${id}` })),
		...panelAreas.flatMap((a) =>
			a.tabs
				.filter(([p]) => me.permissions.includes(p))
				.map(([, id, label]) => ({ kind: 'Panel · ' + a.label, label, href: `/panel?tab=${id}` })),
		),
		...pages.map(([href, label]) => ({ kind: 'Web', label, href })),
	];
	let characters = null;
	const loadCharacters = () =>
		(characters ??= api('/api/armory/characters?scope=guild')
			.then((rows) =>
				rows.map((c) => ({
					kind: 'Personaje',
					label: [c.name, c.surname].filter(Boolean).join(' '),
					detail: [c.class, c.role].filter(Boolean).join(' · '),
					href: `/armeria?personaje=${encodeURIComponent(c.id)}`,
				})),
			)
			.catch(() => []));

	const button = document.createElement('button');
	button.type = 'button';
	button.className = 'qs-open';
	button.setAttribute('aria-label', 'Buscar en la web (Ctrl+K)');
	button.innerHTML =
		'<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></svg><span>Buscar</span><kbd>Ctrl K</kbd>';
	document.querySelector('.header-actions')?.prepend(button);

	const dialog = document.createElement('dialog');
	dialog.className = 'qs';
	dialog.setAttribute('aria-label', 'Búsqueda rápida');
	dialog.innerHTML =
		'<form method="dialog" class="qs-box"><input type="search" placeholder="Busca un personaje, una sección o una página…" aria-label="Buscar" autocomplete="off" spellcheck="false"><ul class="qs-results" role="listbox"></ul><p class="qs-hint"><kbd>↑</kbd><kbd>↓</kbd> elegir · <kbd>Intro</kbd> abrir · <kbd>Esc</kbd> cerrar</p></form>';
	document.body.append(dialog);
	const input = dialog.querySelector('input');
	const list = dialog.querySelector('.qs-results');
	let shown = [],
		active = 0;

	function render() {
		const q = normal(input.value.trim());
		const pool = [...(q ? characterItems : []), ...items];
		shown = (
			q
				? pool.filter((i) => normal(i.label + ' ' + (i.detail || '') + ' ' + i.kind).includes(q))
				: items
		).slice(0, 12);
		active = Math.min(active, Math.max(0, shown.length - 1));
		list.innerHTML = shown.length
			? shown
					.map(
						(i, n) =>
							`<li role="option" aria-selected="${n === active}"><a href="${esc(i.href)}" data-n="${n}"><span>${esc(i.label)}${i.detail ? `<small>${esc(i.detail)}</small>` : ''}</span><b>${esc(i.kind)}</b></a></li>`,
					)
					.join('')
			: '<li class="qs-none">Sin resultados</li>';
	}
	let characterItems = [];
	async function open() {
		if (dialog.open) return;
		input.value = '';
		active = 0;
		render();
		dialog.showModal();
		input.focus();
		characterItems = await loadCharacters();
		render();
	}
	const go = (i) => {
		if (!i) return;
		dialog.close();
		const url = new URL(i.href, location.origin);
		// Same page, only the hash changes: let the page react without a reload.
		if (url.pathname === location.pathname && url.hash && url.search === location.search)
			location.hash = url.hash;
		else location.href = i.href;
	};
	button.onclick = open;
	input.oninput = () => {
		active = 0;
		render();
	};
	input.onkeydown = (e) => {
		if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
			e.preventDefault();
			active =
				(active + (e.key === 'ArrowDown' ? 1 : -1) + shown.length) % Math.max(1, shown.length);
			render();
		} else if (e.key === 'Enter') {
			e.preventDefault();
			go(shown[active]);
		}
	};
	list.onclick = (e) => {
		const a = e.target.closest('[data-n]');
		if (!a) return;
		e.preventDefault();
		go(shown[Number(a.dataset.n)]);
	};
	dialog.onclick = (e) => {
		if (e.target === dialog) dialog.close();
	};
	document.addEventListener('keydown', (e) => {
		const typing =
			/^(input|textarea|select)$/i.test(e.target.tagName) || e.target.isContentEditable;
		if ((e.key === 'k' || e.key === 'K') && (e.ctrlKey || e.metaKey)) {
			e.preventDefault();
			void open();
		} else if (e.key === '/' && !typing && !dialog.open) {
			e.preventDefault();
			void open();
		}
	});
}
