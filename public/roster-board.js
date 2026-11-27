import { ClassIcon } from './components.js';
import { classKey, characterHref } from './roster-ui.js';

// Public roster: the guild's composition at a glance (roles and classes, each a filter),
// a search box and every character as a card in its class colour, grouped by role.
// Public data only: name, class and role.
const roles = [
	['Tanque', 'Tanques', 'role_tank'],
	['Sanador', 'Sanadores', 'role_healer'],
	['DPS melee', 'DPS cuerpo a cuerpo', 'role_dps'],
	['DPS distancia', 'DPS a distancia', 'role_dps'],
];
const roleIcon = (file) =>
	`<img src="/assets/icons/role/${file}.webp" alt="" width="28" height="28" loading="lazy">`;
const normal = (s) =>
	String(s || '')
		.normalize('NFD')
		.replace(/[̀-ͯ]/g, '')
		.toLowerCase();

export function mountRosterBoard(host, characters, { esc }) {
	const state = { q: '', cls: '', role: '' };
	const classes = [...new Set(characters.map((c) => c.class).filter(Boolean))]
		.map((name) => [name, characters.filter((c) => c.class === name).length])
		.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'es'));
	const total = characters.length;
	const pct = (n) => (total ? Math.round((n / total) * 100) : 0);

	function card(c) {
		return `<li><a class="rb-card class-${classKey(c.class)}" href="${characterHref(c.id)}">${ClassIcon({ className: c.class })}<span class="rb-name"><strong>${esc(c.name)}</strong><small>${esc(c.class)}</small></span></a></li>`;
	}
	function list() {
		const q = normal(state.q.trim());
		const rows = characters.filter(
			(c) =>
				(!q || normal(c.name).includes(q)) &&
				(!state.cls || c.class === state.cls) &&
				(!state.role || c.role === state.role),
		);
		host.querySelector('[data-count]').textContent =
			rows.length === total
				? `${total} ${total === 1 ? 'personaje' : 'personajes'}`
				: `${rows.length} de ${total} personajes`;
		host.querySelector('[data-clear]').hidden = !(state.q || state.cls || state.role);
		const groups = roles
			.map(([role, label, icon]) => [label, icon, rows.filter((c) => c.role === role)])
			.concat([
				['Sin rol indicado', 'role_dps', rows.filter((c) => !roles.some(([r]) => r === c.role))],
			])
			.filter(([, , list]) => list.length);
		host.querySelector('[data-list]').innerHTML = rows.length
			? groups
					.map(
						([label, icon, list]) =>
							`<section class="rb-group"><h3>${roleIcon(icon)}${esc(label)}<small>${list.length}</small></h3><ul class="rb-cards">${list
								.sort((a, b) => a.name.localeCompare(b.name, 'es'))
								.map(card)
								.join('')}</ul></section>`,
					)
					.join('')
			: total
				? '<div class="empty"><h3>No encontramos personajes con esos filtros</h3><p>Prueba otra clase o rol, o quita los filtros.</p></div>'
				: '<div class="empty"><h3>El roster está por abrirse</h3><p>Los personajes aparecerán cuando los miembros los registren. Aquí verás su nombre, clase y rol.</p></div>';
		host
			.querySelectorAll('[data-role]')
			.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.role === state.role)));
		host
			.querySelectorAll('[data-class]')
			.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.class === state.cls)));
	}

	host.innerHTML = /* HTML */ `<div class="rb">
		<section class="rb-stats" aria-label="Composición de la hermandad">
			<div class="rb-total"><strong>${total}</strong><small>Personajes</small></div>
			${roles
				.map(([role, label, icon]) => {
					const n = characters.filter((c) => c.role === role).length;
					return `<button type="button" class="rb-role" data-role="${esc(role)}" aria-pressed="false">${roleIcon(icon)}<strong>${n}</strong><small>${esc(label)}</small><i class="rb-role-bar" data-bar="${pct(n)}"></i></button>`;
				})
				.join('')}
		</section>
		${
			total
				? `<section class="rb-classes" aria-label="Clases"><div class="rb-classbar" role="img" aria-label="${classes.map(([c, n]) => `${n} ${c}`).join(', ')}">${classes
						.map(
							([c, n]) =>
								`<span class="class-${classKey(c)}" data-bar="${pct(n)}" title="${esc(c)}: ${n}"></span>`,
						)
						.join(
							'',
						)}</div><div class="rb-chips" role="group" aria-label="Filtrar por clase">${classes
						.map(
							([c, n]) =>
								`<button type="button" class="rb-chip class-${classKey(c)}" data-class="${esc(c)}" aria-pressed="false">${ClassIcon({ className: c, size: 'small' })}<span>${esc(c)}</span><b>${n}</b></button>`,
						)
						.join('')}</div></section>`
				: ''
		}
		<div class="rb-tools">
			<label class="rb-search"
				><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
					<circle cx="11" cy="11" r="7" />
					<path d="m20 20-4-4" /></svg
				><input
					type="search"
					placeholder="Buscar personaje…"
					aria-label="Buscar personaje"
					data-search
			/></label>
			<span class="rb-count" role="status" data-count></span>
			<button type="button" class="secondary" data-clear hidden>Quitar filtros</button>
		</div>
		<div data-list></div>
	</div>`;

	host.querySelector('[data-search]').oninput = (e) => {
		state.q = e.target.value;
		list();
	};
	host.querySelectorAll('[data-role]').forEach(
		(b) =>
			(b.onclick = () => {
				state.role = state.role === b.dataset.role ? '' : b.dataset.role;
				list();
			}),
	);
	host.querySelectorAll('[data-class]').forEach(
		(b) =>
			(b.onclick = () => {
				state.cls = state.cls === b.dataset.class ? '' : b.dataset.class;
				list();
			}),
	);
	host.querySelector('[data-clear]').onclick = () => {
		Object.assign(state, { q: '', cls: '', role: '' });
		host.querySelector('[data-search]').value = '';
		list();
		host.querySelector('[data-search]').focus();
	};
	list();
}
