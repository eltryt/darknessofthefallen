import { slotLabels, gameVersions } from './armory-catalog.js';

// One wishlist per character, organised raid → boss → loot. Known loot comes only
// from the guild's own data: registered progress, the player's entries and the
// loot history. There is no verified WoW Forever loot catalogue to invent from.
export const wishStates = [
	['BiS', 'BiS', '★'],
	['Me interesa', 'Me interesa', '◆'],
	['Pasar', 'Pasar', '–'],
];
const filters = [
	['all', 'Todo'],
	['selected', 'Seleccionados'],
	['BiS', 'Solo BiS'],
	['Pasar', 'Pasados'],
];
const NO_RAID = '';
const norm = (value) =>
	String(value || '')
		.trim()
		.toLocaleLowerCase('es');
const bossIcon = (name, raid) =>
	/onyxia|onixya|onixia/i.test(name + ' ' + raid)
		? '<img class="fade-in" src="/assets/icons/onyxia.webp" alt="" width="48" height="48" loading="lazy" decoding="async">'
		: '<span class="boss-sigil" aria-hidden="true">◇</span>';

export async function mountWishlist(host, character, refresh, ctx) {
	const { api, esc, toast, data } = ctx;
	if (!character) {
		host.innerHTML =
			'<div class="hub-empty"><h2>Elige o registra un personaje</h2><p>La wishlist se guarda por personaje.</p><a class="button" href="#personajes">Añadir personaje</a></div>';
		return;
	}
	const [allWishes, loot] = await Promise.all([
		api('/api/wishlists'),
		api('/api/loot').catch(() => []),
	]);
	if (!host.isConnected) return;
	const wishes = allWishes.filter((w) => w.data.characterId === character.id);
	const progress = data.progress || [];
	// Raids: registered progress first, then any raid the player typed.
	const raids = [];
	const addRaid = (name) => {
		if (!raids.some((r) => norm(r.name) === norm(name))) raids.push({ name, bosses: [] });
		return raids.find((r) => norm(r.name) === norm(name));
	};
	for (const p of progress) {
		const raid = addRaid(p.name);
		for (const b of p.bosses)
			if (!raid.bosses.some((x) => norm(x) === norm(b.name))) raid.bosses.push(b.name);
	}
	for (const w of wishes) {
		const raid = addRaid(w.data.raid || NO_RAID);
		const boss = w.data.boss || '';
		if (!raid.bosses.some((x) => norm(x) === norm(boss))) raid.bosses.push(boss);
	}
	const lootRows = Array.isArray(loot) ? loot : loot.rows || [];
	const state = {
		raid: (() => {
			try {
				const saved = localStorage.getItem('wishlist-raid');
				if (raids.some((r) => r.name === saved)) return saved;
			} catch {
				/* storage unavailable */
			}
			return raids[0]?.name ?? NO_RAID;
		})(),
		filter: 'all',
	};

	function knownItems(raid, boss) {
		const own = wishes.filter(
			(w) => norm(w.data.raid) === norm(raid) && norm(w.data.boss) === norm(boss),
		);
		const seen = new Set(own.map((w) => norm(w.data.item)));
		const history = [];
		if (boss)
			for (const r of lootRows) {
				const d = r.data || {};
				if (norm(d.boss) !== norm(boss) || !d.item || seen.has(norm(d.item))) continue;
				seen.add(norm(d.item));
				history.push({ item: d.item, date: d.date });
			}
		return { own, history };
	}
	const visible = (status) =>
		state.filter === 'all' ||
		(state.filter === 'selected' && ['BiS', 'Me interesa'].includes(status)) ||
		state.filter === status;

	function itemRow({ entry, item, fromHistory }) {
		const d = entry?.data,
			status = d ? d.status || 'Me interesa' : null,
			name = d ? d.item : item;
		return /* HTML */ `<li
			class="wish-row ${status ? 'is-' + norm(status).replace(/\s+/g, '-') : 'is-unmarked'} ${d?.obtained ? 'is-obtained' : ''}"
		>
			<div class="wish-row-main">
				<strong>${esc(name)}</strong>
				<small>
					${d?.slot ? esc(slotLabels[d.slot] || d.slot) + ' · ' : ''}${fromHistory ? 'Visto en el historial de botín' : `Prioridad ${Number(d.priority)}`}${d?.obtained ? ' · <b>Conseguido</b>' : ''}
				</small>
				${d?.notes ? `<p>${esc(d.notes)}</p>` : ''}
			</div>
			<div class="wish-states" role="group" aria-label="Estado de ${esc(name)}">
				${wishStates
					.map(
						([value, label, mark]) =>
							`<button type="button" class="wish-state" data-state="${esc(value)}" ${entry ? `data-wish="${esc(entry.id)}"` : `data-new-item="${esc(name)}"`} aria-pressed="${status === value}"><span aria-hidden="true">${mark}</span>${label}</button>`,
					)
					.join('')}
			</div>
			${
				entry
					? `<details class="wish-more"><summary aria-label="Más opciones de ${esc(name)}">⋯</summary><div class="hub-menu"><label class="armory-check"><input type="checkbox" data-obtained="${esc(entry.id)}" ${d.obtained ? 'checked' : ''}>Ya lo tengo</label><button type="button" class="is-danger" data-remove-wish="${esc(entry.id)}">Quitar de la wishlist</button></div></details>`
					: ''
			}
		</li>`;
	}

	function bossCard(raid, boss) {
		const { own, history } = knownItems(raid, boss);
		const rows = [
			...own.filter((w) => visible(w.data.status || 'Me interesa')).map((entry) => ({ entry })),
			...(state.filter === 'all' ? history.map((h) => ({ item: h.item, fromHistory: true })) : []),
		];
		const marked = own.filter((w) => w.data.status !== 'Pasar').length;
		if (state.filter !== 'all' && !rows.length) return '';
		const slots = gameVersions[character.game_version || 'forever']?.slots || [];
		return /* HTML */ `<article class="boss-card">
			<header>
				${bossIcon(boss, raid)}
				<div>
					<h3>${esc(boss || 'Jefe sin indicar')}</h3>
					<small
						>${marked ? `${marked} marcados` : 'Nada marcado'} · ${own.length + history.length}
						conocidos</small
					>
				</div>
			</header>
			${
				rows.length
					? `<ul class="wish-rows">${rows.map(itemRow).join('')}</ul>`
					: '<p class="muted boss-empty">Todavía no hay botín conocido de este jefe: ni en tu wishlist ni en el historial de la hermandad.</p>'
			}
			<details class="wish-add">
				<summary>Añadir objeto</summary>
				<form class="form" data-add-boss="${esc(boss)}">
					<div class="form-grid">
						<label class="wide"
							>Nombre del objeto<input name="item" required maxlength="160"
						/></label>
						<label
							>Hueco<select name="slot">
								<option value="">Sin indicar</option>
								${slots.map((s) => `<option value="${s}">${esc(slotLabels[s] || s)}</option>`).join('')}
							</select></label
						>
						<label
							>Estado<select name="status">
								${wishStates.map(([v, l]) => `<option value="${esc(v)}">${l}</option>`).join('')}
							</select></label
						>
						<label
							>Prioridad<select name="priority">
								${[1, 2, 3, 4, 5].map((n) => `<option ${n === 3 ? 'selected' : ''}>${n}</option>`).join('')}
							</select></label
						>
						<label class="wide">Notas para el consejo<input name="notes" maxlength="1000" /></label>
					</div>
					<button type="submit">Añadir</button>
				</form>
			</details>
		</article>`;
	}

	function render() {
		const raid = raids.find((r) => r.name === state.raid);
		const total = wishes.filter((w) => w.data.status !== 'Pasar').length,
			bis = wishes.filter((w) => w.data.status === 'BiS').length;
		host.innerHTML = /* HTML */ `<div class="wishlist-heading">
				<div>
					<span class="eyebrow">Wishlist y BiS de ${esc(character.name)}</span>
					<h2>¿Qué quieres de cada jefe?</h2>
					<p>
						Marca cada objeto como BiS, Me interesa o Pasar. Es tu prioridad personal, no una
						asignación de botín.
					</p>
				</div>
				<dl class="wish-counts">
					<div>
						<dt>BiS</dt>
						<dd>${bis}</dd>
					</div>
					<div>
						<dt>Marcados</dt>
						<dd>${total}</dd>
					</div>
				</dl>
			</div>
			${
				raids.length
					? `<div class="raid-tabs" role="tablist" aria-label="Raids">${raids
							.map(
								(r) =>
									`<button type="button" role="tab" data-raid="${esc(r.name)}" aria-selected="${r.name === state.raid}">${esc(r.name || 'Sin raid indicada')}</button>`,
							)
							.join('')}</div>`
					: ''
			}
			<div class="wish-filters" role="group" aria-label="Filtrar objetos">
				${filters
					.map(
						([id, label]) =>
							`<button type="button" class="chip" data-filter="${id}" aria-pressed="${state.filter === id}">${label}</button>`,
					)
					.join('')}
			</div>
			<div class="boss-grid">
				${raid ? raid.bosses.map((b) => bossCard(raid.name, b)).join('') || '<p class="muted">Ningún objeto coincide con el filtro.</p>' : ''}
				${
					!raids.length
						? '<div class="empty-note" role="status"><strong>Aún no hay raids registradas</strong><p>Cuando la hermandad registre su progreso aparecerán aquí sus jefes. Mientras, puedes añadir una raid y un jefe a mano.</p></div>'
						: ''
				}
			</div>
			<details class="card wish-new-raid">
				<summary>Otra raid o jefe</summary>
				<form class="form" data-add-free>
					<div class="form-grid">
						<label
							>Raid<input name="raid" maxlength="120" value="${esc(state.raid || '')}"
						/></label>
						<label>Jefe<input name="boss" maxlength="120" /></label>
						<label class="wide"
							>Nombre del objeto<input name="item" required maxlength="160"
						/></label>
						<label
							>Estado<select name="status">
								${wishStates.map(([v, l]) => `<option value="${esc(v)}">${l}</option>`).join('')}
							</select></label
						>
					</div>
					<button type="submit">Añadir</button>
				</form>
			</details>
			<details class="catalog-note">
				<summary>¿De dónde sale el botín de cada jefe?</summary>
				<p>
					No existe todavía un catálogo verificado de botín de WoW Forever. Los jefes salen del
					progreso registrado por la hermandad y los objetos, de tu propia wishlist y del historial
					de botín repartido. Nada se rellena con datos de otras versiones del juego.
				</p>
			</details>`;
		bind();
	}

	const create = (value) =>
		api('/api/wishlists', 'POST', {
			characterId: character.id,
			priority: value.status === 'BiS' ? 1 : 3,
			...value,
		});
	async function run(task, message) {
		try {
			await task();
			if (message) toast(message);
			await refresh();
		} catch (error) {
			toast(error.message);
		}
	}
	function bind() {
		host.querySelectorAll('[data-raid]').forEach(
			(b) =>
				(b.onclick = () => {
					state.raid = b.dataset.raid;
					try {
						localStorage.setItem('wishlist-raid', state.raid);
					} catch {
						/* storage unavailable */
					}
					render();
				}),
		);
		host.querySelectorAll('[data-filter]').forEach(
			(b) =>
				(b.onclick = () => {
					state.filter = b.dataset.filter;
					render();
				}),
		);
		host.querySelectorAll('.wish-state').forEach(
			(b) =>
				(b.onclick = () => {
					b.closest('.wish-states')
						.querySelectorAll('button')
						.forEach((x) => (x.disabled = true));
					if (b.dataset.wish)
						void run(() =>
							api('/api/wishlists/' + encodeURIComponent(b.dataset.wish), 'PATCH', {
								status: b.dataset.state,
							}),
						);
					else
						void run(() =>
							create({
								item: b.dataset.newItem,
								raid: state.raid,
								boss: b.closest('.boss-card').querySelector('[data-add-boss]').dataset.addBoss,
								status: b.dataset.state,
							}),
						);
				}),
		);
		host.querySelectorAll('[data-obtained]').forEach(
			(c) =>
				(c.onchange = () =>
					void run(() =>
						api('/api/wishlists/' + encodeURIComponent(c.dataset.obtained), 'PATCH', {
							obtained: c.checked,
						}),
					)),
		);
		host.querySelectorAll('[data-remove-wish]').forEach(
			(b) =>
				(b.onclick = () => {
					if (confirm('¿Quitar este objeto de tu wishlist?'))
						void run(
							() => api('/api/wishlists/' + encodeURIComponent(b.dataset.removeWish), 'DELETE', {}),
							'Objeto quitado',
						);
				}),
		);
		host.querySelectorAll('[data-add-boss]').forEach(
			(f) =>
				(f.onsubmit = (e) => {
					e.preventDefault();
					const v = Object.fromEntries(new FormData(f));
					void run(
						() =>
							create({
								...v,
								priority: Number(v.priority),
								raid: state.raid,
								boss: f.dataset.addBoss,
							}),
						'Añadido a tu wishlist',
					);
				}),
		);
		const free = host.querySelector('[data-add-free]');
		free.onsubmit = (e) => {
			e.preventDefault();
			const v = Object.fromEntries(new FormData(free));
			state.raid = v.raid;
			try {
				localStorage.setItem('wishlist-raid', v.raid);
			} catch {
				/* storage unavailable */
			}
			void run(() => create(v), 'Añadido a tu wishlist');
		};
	}
	render();
}
