import { loadItemNames, itemKey, itemLink, wowheadItemUrl, loadTooltips } from './wowhead.js';
import { windowNotice, ownRequests } from './wishlist-rules-ui.js';
import { wishMarks, wishLabel, isWanted, wishClass } from './wish-states.js';

// One wishlist per character. Every raid of the game, its bosses as portraits and, for
// the boss you open, its loot as a grid of icons: click one to mark it as BiS, Mejora
// mayor or Mejora menor with a priority and notes for the officers. The loot tables
// come from public/catalog/raids.json (scripts/build-raid-loot.mjs): Classic loot,
// orientative for WoW Forever.
const filters = [
	['all', 'Todo'],
	['marked', 'Marcados'],
	['BiS', 'Solo BiS'],
];
const PRIORITIES = [1, 2, 3, 4, 5];
const iconUrl = (icon) =>
	`https://wow.zamimg.com/images/wow/icons/large/${encodeURIComponent(icon || 'inv_misc_questionmark')}.jpg`;
const portrait = (boss, esc) =>
	boss.portrait
		? `<img src="/assets/bosses/${boss.npc}.webp" alt="" width="96" height="96" loading="lazy" decoding="async">`
		: `<span class="boss-initial" aria-hidden="true">${esc(boss.name.replace(/^(Sum[ao] Sacerdot\w+|Los|El|La)\s+/i, '').slice(0, 1))}</span>`;

let catalogRequest;
function loadRaidCatalog() {
	catalogRequest ??= fetch('/catalog/raids.json')
		.then((r) => {
			if (!r.ok) throw new Error('No se pudo cargar el botín de las raids.');
			return r.json();
		})
		.catch((error) => {
			catalogRequest = undefined;
			throw error;
		});
	return catalogRequest;
}
// Which raid, boss and item were open: saving reloads the section, and it reopens here.
const memory = { raid: null, boss: null, item: null };
function savedRaid() {
	try {
		return localStorage.getItem('wishlist-raid-id');
	} catch {
		return null;
	}
}
function rememberRaid(id) {
	try {
		localStorage.setItem('wishlist-raid-id', id);
	} catch {
		/* storage unavailable */
	}
}

export async function mountWishlist(host, character, refresh, ctx) {
	const { api, esc, toast, data } = ctx;
	if (!character) {
		host.innerHTML =
			'<div class="hub-empty"><h2>Elige o registra un personaje</h2><p>La wishlist se guarda por personaje.</p><a class="button" href="#personajes">Añadir personaje</a></div>';
		return;
	}
	const [catalog, allWishes, itemIds, win, requests] = await Promise.all([
		loadRaidCatalog(),
		api('/api/wishlists'),
		loadItemNames(),
		api('/api/wishlist-window').catch(() => ({ state: 'free' })),
		api('/api/wishlist-requests').catch(() => []),
	]);
	if (!host.isConnected) return;
	// After the tier deadline only removals and notes are direct; the rest is a request.
	const locked = win.state === 'closed';
	const raids = catalog.raids;
	const wishes = allWishes.filter(
		(w) => w.data.characterId === character.id && isWanted(w.data.status),
	);

	// Each wish finds its item in the catalogue by name; the boss it was saved under wins
	// when an item drops from several bosses. Wishes for items outside the catalogue are
	// listed apart.
	const bossesByItem = new Map();
	for (const raid of raids)
		for (const boss of raid.bosses)
			for (const item of boss.items) {
				const key = itemKey(item.name);
				if (!bossesByItem.has(key)) bossesByItem.set(key, []);
				bossesByItem.get(key).push({ raid, boss, item });
			}
	const wishByItem = new Map();
	const others = [];
	for (const w of wishes) {
		const key = itemKey(w.data.item);
		if (bossesByItem.has(key)) wishByItem.set(key, w);
		else others.push(w);
	}
	const wishOf = (item) => wishByItem.get(itemKey(item.name));
	const homeOf = (w) => {
		const places = bossesByItem.get(itemKey(w.data.item)) || [];
		return places.find((p) => itemKey(p.boss.name) === itemKey(w.data.boss)) || places[0];
	};
	const markedIn = (boss) => boss.items.filter((i) => wishOf(i)).length;
	const raidMarks = (raid) =>
		wishes.filter((w) => wishByItem.has(itemKey(w.data.item)) && homeOf(w)?.raid === raid).length;

	// Open the raid you were on, else the raid the guild is progressing, else the first.
	const progressRaid = raids.find((r) =>
		(data.progress || []).some((p) =>
			p.bosses?.some((b) => r.bosses.some((x) => itemKey(x.name) === itemKey(b.name))),
		),
	);
	const state = {
		raid:
			[memory.raid, savedRaid()].find((id) => raids.some((r) => r.id === id)) ||
			progressRaid?.id ||
			raids[0].id,
		boss: memory.boss,
		item: memory.item,
		filter: 'all',
		draft: null,
	};
	const currentRaid = () => raids.find((r) => r.id === state.raid);
	const currentBoss = () => currentRaid().bosses.find((b) => b.id === state.boss);
	const currentItem = () => currentBoss()?.items.find((i) => i.id === state.item);
	const shows = (item) => {
		const w = wishOf(item);
		if (state.filter === 'marked') return Boolean(w);
		if (state.filter === 'BiS') return w?.data.status === 'BiS';
		return true;
	};
	function newDraft(item) {
		const w = item && wishOf(item);
		return w
			? {
					status: wishLabel(w.data.status),
					priority: Number(w.data.priority) || 3,
					notes: w.data.notes || '',
				}
			: { status: '', priority: 3, notes: '' };
	}

	function raidPicker() {
		return `<div class="raid-picker" role="tablist" aria-label="Raids">${raids
			.map((r) => {
				const marks = raidMarks(r);
				return `<button type="button" role="tab" class="raid-pick" data-raid="${esc(r.id)}" aria-selected="${r.id === state.raid}"><strong>${esc(r.name)}</strong><small>${r.size} jugadores · ${r.bosses.length} ${r.bosses.length === 1 ? 'jefe' : 'jefes'}</small>${marks ? `<span class="raid-pick-count" title="Objetos marcados">${marks}</span>` : ''}</button>`;
			})
			.join('')}</div>`;
	}

	function bossRoster(raid) {
		const bosses = raid.bosses.filter((b) => state.filter === 'all' || b.items.some(shows));
		if (!bosses.length)
			return '<p class="muted wish-none">Nada marcado en esta raid con este filtro.</p>';
		return `<ol class="boss-roster">${bosses
			.map((b) => {
				const marks = markedIn(b);
				const open = b.id === state.boss;
				return `<li><button type="button" class="boss-pick${open ? ' is-open' : ''}${marks ? ' has-marks' : ''}" data-boss="${esc(b.id)}" aria-expanded="${open}" aria-controls="loot-panel"><span class="boss-portrait">${portrait(b, esc)}${marks ? `<span class="boss-marks" title="${marks} marcados">${marks}</span>` : ''}</span><strong>${esc(b.name)}</strong><small>${b.items.length} objetos</small></button></li>`;
			})
			.join('')}</ol>`;
	}

	function itemTile(item) {
		const w = wishOf(item);
		const selected = item.id === state.item;
		const mark = w && wishMarks.find(([v]) => v === wishLabel(w.data.status));
		return `<li><a href="${wowheadItemUrl(item.id)}" class="loot-item quality-${esc(item.quality)}${w ? ' is-marked ' + wishClass(w.data.status) : ''}${selected ? ' is-selected' : ''}${w?.data.obtained ? ' is-obtained' : ''}" data-item="${item.id}" role="button" aria-pressed="${selected}"><span class="loot-icon"><img src="${iconUrl(item.icon)}" alt="" width="56" height="56" loading="lazy" decoding="async">${mark ? `<span class="loot-mark" title="${esc(mark[1])}">${mark[2]}</span>` : ''}${w ? `<span class="loot-prio" title="Prioridad ${Number(w.data.priority)}">${Number(w.data.priority)}</span>` : ''}</span><span class="loot-name">${esc(item.name)}</span></a></li>`;
	}

	function editor(boss) {
		const item = currentItem();
		if (!item)
			return `<div class="loot-editor-empty"><span class="boss-portrait is-small">${portrait(boss, esc)}</span><p><strong>Elige un objeto</strong>Haz clic en un icono para marcarlo como BiS o mejora, darle prioridad y dejar una nota a los oficiales.</p></div>`;
		const w = wishOf(item);
		const d = state.draft;
		return `<form class="loot-editor-form" data-editor>
			<div class="loot-editor-head quality-${esc(item.quality)}"><span class="loot-icon is-big"><img src="${iconUrl(item.icon)}" alt="" width="56" height="56"></span><div><strong>${itemLink(item.name, new Map([[itemKey(item.name), item.id]]), esc)}</strong><small>${esc(item.type || 'Ficha u objeto de misión')}</small>${w?.data.obtained ? '<span class="pill">Conseguido</span>' : ''}</div></div>
			<fieldset class="mark-pick"><legend>¿Qué es para ti?</legend><div>${wishMarks
				.map(
					([value, label, sign]) =>
						`<button type="button" class="${wishClass(value)}" data-mark="${esc(value)}" aria-pressed="${d.status === value}"><span aria-hidden="true">${sign}</span>${label}</button>`,
				)
				.join('')}</div></fieldset>
			<fieldset class="prio-pick"><legend>Prioridad <small>1 es lo que más quieres</small></legend><div>${PRIORITIES.map(
				(n) =>
					`<button type="button" data-prio="${n}" aria-pressed="${d.priority === n}" aria-label="Prioridad ${n}">${n}</button>`,
			).join('')}</div></fieldset>
			<label class="loot-notes">Notas para los oficiales<textarea name="notes" maxlength="1000" rows="3" placeholder="Por qué lo necesitas, qué te sustituye, si es para otra especialización…">${esc(d.notes)}</textarea></label>
			${w ? `<label class="armory-check"><input type="checkbox" data-obtained ${w.data.obtained ? 'checked' : ''}>Ya lo tengo</label>` : ''}
			<div class="loot-editor-actions"><button type="submit" ${d.status ? '' : 'disabled'}>${w ? (locked ? 'Pedir el cambio' : 'Guardar cambios') : locked ? 'Pedir que lo añadan' : 'Añadir a mi wishlist'}</button>${w ? '<button type="button" class="secondary" data-remove>Quitar</button>' : ''}</div>
			${d.status ? '' : '<p class="muted loot-hint">Elige BiS, Mejora mayor o Mejora menor para guardarlo.</p>'}
		</form>`;
	}

	function lootPanel(raid) {
		const boss = currentBoss();
		if (!boss) return '';
		const items = boss.items.filter(shows);
		return `<section class="loot-panel" id="loot-panel" aria-label="Botín de ${esc(boss.name)}">
			<header><span class="boss-portrait is-small">${portrait(boss, esc)}</span><div><h3>${esc(boss.name)}</h3><small>${esc(raid.name)} · ${boss.items.length} objetos · ${markedIn(boss)} marcados</small></div><button type="button" class="loot-close" data-close aria-label="Cerrar el botín de ${esc(boss.name)}">✕</button></header>
			<div class="loot-layout">
				${items.length ? `<ul class="loot-grid">${items.map(itemTile).join('')}</ul>` : '<p class="muted wish-none">Nada de este jefe con este filtro.</p>'}
				<aside class="loot-editor">${editor(boss)}</aside>
			</div>
		</section>`;
	}

	function othersList() {
		if (!others.length) return '';
		return `<section class="card wish-others"><h3>Otros objetos de tu wishlist</h3><p class="muted">No están en las tablas de botín de las raids.</p><ul>${others
			.map(
				(w) =>
					`<li><strong>${itemLink(w.data.item, itemIds, esc)}</strong><small>${esc([w.data.boss, w.data.raid].filter(Boolean).join(' · '))}</small><span class="pill ${wishClass(w.data.status)}">${esc(wishLabel(w.data.status))} · ${Number(w.data.priority)}</span><button type="button" class="secondary" data-remove-other="${esc(w.id)}">Quitar</button></li>`,
			)
			.join('')}</ul></section>`;
	}

	function render() {
		const raid = currentRaid();
		const bis = wishes.filter((w) => w.data.status === 'BiS').length;
		const upgrades = wishes.length - bis;
		host.innerHTML = /* HTML */ `<div class="wishlist-heading">
				<div>
					<span class="eyebrow">Wishlist y BiS de ${esc(character.name)}</span>
					<h2>¿Qué quieres de cada jefe?</h2>
					<p>
						Elige una raid, abre un jefe y haz clic en el botín que quieras. Es tu prioridad
						personal para el consejo, no una asignación de botín.
					</p>
				</div>
				<dl class="wish-counts">
					<div>
						<dt>BiS</dt>
						<dd>${bis}</dd>
					</div>
					<div>
						<dt>Mejoras</dt>
						<dd>${upgrades}</dd>
					</div>
				</dl>
			</div>
			${windowNotice(win, esc)}${ownRequests(requests, character, esc)} ${raidPicker()}
			<div class="wish-filters" role="group" aria-label="Filtrar objetos">
				${filters
					.map(
						([id, label]) =>
							`<button type="button" class="chip" data-filter="${id}" aria-pressed="${state.filter === id}">${label}</button>`,
					)
					.join('')}
			</div>
			${bossRoster(raid)} ${lootPanel(raid)} ${othersList()}
			<details class="catalog-note">
				<summary>¿De dónde sale el botín de cada jefe?</summary>
				<p>
					De las tablas de botín de WoW Classic (AtlasLoot Classic), contrastadas con Wowhead
					Classic, con los nombres del cliente en español. WoW Forever parte de Classic, así que es
					orientativo: si algo cambia en Forever, avisa a un oficial.
				</p>
			</details>`;
		bind();
		loadTooltips();
	}

	function renderEditor() {
		const aside = host.querySelector('.loot-editor');
		const boss = currentBoss();
		if (!aside || !boss) return render();
		aside.innerHTML = editor(boss);
		bindEditor();
	}
	function select(patch) {
		Object.assign(state, patch);
		Object.assign(memory, { raid: state.raid, boss: state.boss, item: state.item });
	}

	// Outside the deadline the change goes to the loot officers with a short reason.
	const ask = async (value) => {
		const reason = prompt(
			'El plazo de la wishlist está cerrado. Cuéntale al oficial de loot por qué necesitas este cambio:',
		);
		if (reason === null) return false;
		await api('/api/wishlist-requests', 'POST', { ...value, reason });
		toast('Petición enviada: la revisará un oficial de loot');
		return true;
	};
	async function run(task, message) {
		try {
			const done = await task();
			if (done === false) return;
			if (message) toast(message);
			await refresh();
		} catch (error) {
			toast(error.message);
		}
	}
	async function save() {
		const item = currentItem(),
			boss = currentBoss(),
			raid = currentRaid(),
			d = state.draft;
		const w = wishOf(item);
		if (!w) {
			const entry = {
				characterId: character.id,
				item: item.name,
				raid: raid.name,
				boss: boss.name,
				slot: item.slot || '',
				status: d.status,
				priority: d.priority,
				notes: d.notes,
			};
			return locked
				? ask({ kind: 'add', ...entry })
				: api('/api/wishlists', 'POST', entry).then(() => toast('Añadido a tu wishlist'));
		}
		const path = '/api/wishlists/' + encodeURIComponent(w.id);
		const changes = {};
		if (d.status !== w.data.status) changes.status = d.status;
		if (d.priority !== Number(w.data.priority)) changes.priority = d.priority;
		if (d.notes !== (w.data.notes || '')) await api(path, 'PATCH', { notes: d.notes });
		if (!Object.keys(changes).length) return toast('Guardado');
		if (locked) return ask({ kind: 'change', wishlistId: w.id, ...changes });
		await api(path, 'PATCH', changes);
		toast('Guardado');
	}

	function bindEditor() {
		const form = host.querySelector('[data-editor]');
		if (!form) return;
		const keepNotes = () => (state.draft.notes = form.elements.notes.value);
		form.querySelectorAll('[data-mark]').forEach(
			(b) =>
				(b.onclick = () => {
					keepNotes();
					state.draft.status = b.dataset.mark;
					if (b.dataset.mark === 'BiS' && !wishOf(currentItem())) state.draft.priority = 1;
					renderEditor();
				}),
		);
		form.querySelectorAll('[data-prio]').forEach(
			(b) =>
				(b.onclick = () => {
					keepNotes();
					state.draft.priority = Number(b.dataset.prio);
					renderEditor();
				}),
		);
		form.onsubmit = (e) => {
			e.preventDefault();
			keepNotes();
			form.querySelector('[type=submit]').disabled = true;
			void run(save);
		};
		const w = wishOf(currentItem());
		const obtained = form.querySelector('[data-obtained]');
		if (obtained && w)
			obtained.onchange = () =>
				void run(() =>
					api('/api/wishlists/' + encodeURIComponent(w.id), 'PATCH', {
						obtained: obtained.checked,
					}),
				);
		const remove = form.querySelector('[data-remove]');
		if (remove && w)
			remove.onclick = () => {
				if (confirm('¿Quitar este objeto de tu wishlist?'))
					void run(
						() => api('/api/wishlists/' + encodeURIComponent(w.id), 'DELETE', {}),
						'Objeto quitado',
					);
			};
	}

	function bind() {
		host.querySelectorAll('[data-raid]').forEach(
			(b) =>
				(b.onclick = () => {
					select({ raid: b.dataset.raid, boss: null, item: null });
					rememberRaid(state.raid);
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
		host.querySelectorAll('[data-boss]').forEach(
			(b) =>
				(b.onclick = () => {
					const closing = state.boss === b.dataset.boss;
					select({ boss: closing ? null : b.dataset.boss, item: null });
					state.draft = null;
					render();
					if (!closing)
						host
							.querySelector('#loot-panel')
							?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
				}),
		);
		const close = host.querySelector('[data-close]');
		if (close)
			close.onclick = () => {
				select({ boss: null, item: null });
				render();
			};
		host.querySelectorAll('[data-item]').forEach(
			(a) =>
				(a.onclick = (e) => {
					e.preventDefault();
					const id = Number(a.dataset.item);
					select({ item: state.item === id ? null : id });
					state.draft = newDraft(currentItem());
					host.querySelectorAll('[data-item]').forEach((x) => {
						const on = Number(x.dataset.item) === state.item;
						x.classList.toggle('is-selected', on);
						x.setAttribute('aria-pressed', String(on));
					});
					renderEditor();
					if (matchMedia('(max-width: 760px)').matches && state.item)
						host
							.querySelector('.loot-editor')
							?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
				}),
		);
		host.querySelectorAll('[data-remove-other]').forEach(
			(b) =>
				(b.onclick = () => {
					if (confirm('¿Quitar este objeto de tu wishlist?'))
						void run(
							() =>
								api('/api/wishlists/' + encodeURIComponent(b.dataset.removeOther), 'DELETE', {}),
							'Objeto quitado',
						);
				}),
		);
		bindEditor();
	}

	if (!currentBoss()) select({ boss: null, item: null });
	state.draft = newDraft(currentItem());
	render();
}
