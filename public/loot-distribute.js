import { itemKey, wowheadItemUrl, loadTooltips } from './wowhead.js';
import { loadRaidCatalog, itemIconUrl, bossPortrait } from './raid-catalog.js';
import { wishLabel, wishClass, isWanted } from './wish-states.js';
import { classKey } from './roster-ui.js';

// Quick loot distribution for loot officers: pick the call-up, then boss and item from
// the raid catalogue; the candidates come from the guild's wishlists, ordered by what
// they asked for (BiS first), their priority, their attendance this month and the loot
// they already got. One click picks the winner; method, request type, reason and the
// council come prefilled. It posts the same record as the full form (POST /api/loot).
const statusRank = { BiS: 0, 'Mejora mayor': 1, 'Mejora menor': 2 };
const requestOf = (status) =>
	statusRank[wishLabel(status)] === undefined ? '' : wishLabel(status);
const memory = { raid: null, boss: null, item: null, event: null };

const localInput = (date = new Date()) => {
	const d = new Date(date);
	d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
	return d.toISOString().slice(0, 16);
};
const shortDate = (value) =>
	new Date(value).toLocaleString('es-ES', {
		timeZone: 'Europe/Madrid',
		weekday: 'short',
		day: 'numeric',
		month: 'short',
		hour: '2-digit',
		minute: '2-digit',
	});

export async function mountLootDistribution(
	host,
	ctx,
	{ raids, roster, council, methods, defaultMethod, onDone },
) {
	const { api, esc, toast } = ctx;
	const [catalog, wishes, lootRows, attendance] = await Promise.all([
		loadRaidCatalog(),
		api('/api/wishlists?all=true'),
		api('/api/loot'),
		api('/api/attendance').catch(() => null),
	]);
	if (!host.isConnected) return;
	const byChar = new Map(roster.map((c) => [c.id, c]));
	const month = new Date().toISOString().slice(0, 7);
	const monthly = new Map(
		(attendance?.metrics.monthly || []).filter((m) => m.month === month).map((m) => [m.userId, m]),
	);
	const lootThisMonth = new Map();
	for (const r of lootRows)
		if (r.data.status !== 'Anulado' && String(r.data.date || '').startsWith(month))
			lootThisMonth.set(
				r.data.recipientUserId,
				(lootThisMonth.get(r.data.recipientUserId) || 0) + 1,
			);
	const wishersOf = new Map();
	for (const w of wishes) {
		if (!isWanted(w.data.status) || !byChar.has(w.data.characterId)) continue;
		const key = itemKey(w.data.item);
		if (!wishersOf.has(key)) wishersOf.set(key, []);
		wishersOf.get(key).push(w);
	}

	// The call-up: the one in progress or that just ended, else the next, else the latest.
	const now = Date.now();
	const sortedRaids = [...raids].sort((a, b) => Date.parse(b.starts_at) - Date.parse(a.starts_at));
	const recent = sortedRaids.find((r) => Date.parse(r.starts_at) <= now + 3 * 3600 * 1000);
	const state = {
		event: raids.some((r) => r.id === memory.event) ? memory.event : (recent || sortedRaids[0]).id,
		raid: catalog.raids.some((r) => r.id === memory.raid) ? memory.raid : null,
		boss: memory.boss,
		item: memory.item,
		winner: null,
		other: false,
	};
	// Guess the catalogue raid from the call-up title («Onyxia», «Núcleo de Magma»…).
	if (!state.raid) {
		const title = itemKey(raids.find((r) => r.id === state.event)?.title);
		state.raid =
			catalog.raids.find(
				(r) =>
					title.includes(itemKey(r.name)) || r.bosses.some((b) => title.includes(itemKey(b.name))),
			)?.id || catalog.raids[0].id;
	}
	const raidOf = () => catalog.raids.find((r) => r.id === state.raid);
	const bossOf = () => raidOf().bosses.find((b) => b.id === state.boss);
	const itemOf = () => bossOf()?.items.find((i) => i.id === state.item);
	const remember = () =>
		Object.assign(memory, {
			raid: state.raid,
			boss: state.boss,
			item: state.item,
			event: state.event,
		});

	function candidates(item) {
		return (wishersOf.get(itemKey(item.name)) || [])
			.map((w) => {
				const c = byChar.get(w.data.characterId);
				const m = monthly.get(c.user_id);
				return {
					wish: w,
					character: c,
					status: wishLabel(w.data.status),
					priority: Number(w.data.priority) || 5,
					attendance: m ? m.percentage : null,
					eligible: m ? m.eligible : null,
					got: lootThisMonth.get(c.user_id) || 0,
				};
			})
			.sort(
				(a, b) =>
					(statusRank[a.status] ?? 9) - (statusRank[b.status] ?? 9) ||
					a.priority - b.priority ||
					(b.attendance ?? -1) - (a.attendance ?? -1) ||
					a.got - b.got ||
					a.character.name.localeCompare(b.character.name, 'es'),
			);
	}
	const reasonFor = (cand) =>
		cand
			? [
					`${cand.status} en su wishlist, prioridad ${cand.priority}`,
					cand.attendance === null ? '' : `asistencia del mes ${cand.attendance} %`,
					cand.got
						? `${cand.got} ${cand.got === 1 ? 'objeto' : 'objetos'} este mes`
						: 'sin botín este mes',
				]
					.filter(Boolean)
					.join(' · ')
			: '';

	function itemTile(item) {
		const count = (wishersOf.get(itemKey(item.name)) || []).length;
		const selected = item.id === state.item;
		return `<li><a href="${wowheadItemUrl(item.id)}" class="loot-item quality-${esc(item.quality)}${selected ? ' is-selected' : ''}${count ? ' is-marked' : ''}" data-ld-item="${item.id}" role="button" aria-pressed="${selected}"><span class="loot-icon"><img src="${itemIconUrl(item.icon)}" alt="" width="56" height="56" loading="lazy" decoding="async">${count ? `<span class="loot-mark ld-wanted" title="${count} lo quieren">${count}</span>` : ''}</span><span class="loot-name">${esc(item.name)}</span></a></li>`;
	}

	function candidateRow(c, i) {
		const chosen = state.winner === c.character.id;
		return `<li><button type="button" class="ld-cand class-${classKey(c.character.class)}${chosen ? ' is-chosen' : ''}" data-winner="${esc(c.character.id)}" aria-pressed="${chosen}">
			<span class="ld-rank">${i + 1}</span>
			<span class="ld-who"><strong>${esc(c.character.name)}</strong><small>${esc(c.character.display_name || '')}</small></span>
			<span class="cu-pill ${wishClass(c.status)}">${esc(c.status)} · P${c.priority}</span>
			<span class="ld-meta">${c.attendance === null ? 'Sin asistencia registrada' : `${c.attendance} %${c.eligible === false ? ' · no llega' : ''}`} · ${c.got} este mes</span>
			${c.wish.data.notes ? `<span class="ld-note">«${esc(c.wish.data.notes)}»</span>` : ''}
		</button></li>`;
	}

	function confirmForm(item, list) {
		const winner = state.winner && byChar.get(state.winner);
		if (!winner) return '';
		const cand = list.find((c) => c.character.id === winner.id);
		const isCouncil = (defaultMethod || methods[0]) === 'Loot Council';
		return `<form class="ld-confirm" data-ld-form>
			<p class="ld-summary"><span class="loot-icon is-small"><img src="${itemIconUrl(item.icon)}" alt="" width="36" height="36"></span><span><strong>${esc(item.name)}</strong> para <strong>${esc(winner.name)}</strong></span></p>
			<div class="ld-fields">
				<label>Método<select name="method">${methods.map((m) => `<option ${m === (defaultMethod || methods[0]) ? 'selected' : ''}>${esc(m)}</option>`).join('')}</select></label>
				<label>Tipo de petición<select name="requestType"><option value="">Sin indicar</option>${['BiS', 'Mejora mayor', 'Mejora menor', 'Offspec'].map((t) => `<option ${t === requestOf(cand?.wish.data.status) ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
				<label>Fecha<input type="datetime-local" name="date" value="${localInput()}" required></label>
			</div>
			<label>Motivo<textarea name="reason" rows="2" required maxlength="1000">${esc(reasonFor(cand) || 'Asignado por el consejo')}</textarea></label>
			<label>Observaciones internas<textarea name="notes" rows="2" maxlength="2000"></textarea></label>
			<fieldset class="ld-council" ${isCouncil ? '' : 'hidden'}><legend>Consejo participante</legend>${
				council.length
					? council
							.map(
								(c) =>
									`<label class="armory-check"><input type="checkbox" name="councilIds" value="${esc(c.user_id)}" checked>${esc(c.display_name)}</label>`,
							)
							.join('')
					: '<p class="muted">El Líder debe configurar el consejo antes de registrar una decisión de Loot Council.</p>'
			}</fieldset>
			<button type="submit">Registrar reparto</button>
		</form>`;
	}

	function aside() {
		const item = itemOf();
		if (!item)
			return '<div class="loot-editor-empty"><p><strong>Elige un objeto</strong>Al hacer clic en un objeto verás quién lo pidió en su wishlist, ordenado por prioridad.</p></div>';
		const list = candidates(item);
		const others = roster.filter((c) => !list.some((x) => x.character.id === c.id));
		return `<div class="ld-head quality-${esc(item.quality)}"><span class="loot-icon is-big"><img src="${itemIconUrl(item.icon)}" alt="" width="56" height="56"></span><div><strong>${esc(item.name)}</strong><small>${esc(item.type || 'Ficha u objeto de misión')}</small></div></div>
			${
				list.length
					? `<h4 class="ld-title">Lo pidieron · ${list.length}</h4><ol class="ld-cands">${list.map(candidateRow).join('')}</ol>`
					: '<p class="muted">Nadie lo tiene en su wishlist.</p>'
			}
			<details class="ld-other" ${state.other || !list.length ? 'open' : ''}><summary>Dárselo a otro personaje</summary>
				<select data-other><option value="">Elige un personaje…</option>${others
					.map(
						(c) =>
							`<option value="${esc(c.id)}" ${state.winner === c.id ? 'selected' : ''}>${esc(c.name)} · ${esc(c.display_name || '')}</option>`,
					)
					.join('')}</select>
			</details>
			${confirmForm(item, list)}`;
	}

	function render() {
		const raid = raidOf();
		const boss = bossOf();
		host.innerHTML = `<section class="ld">
			<header class="ld-top">
				<div><h3>Repartir botín</h3><p>Jefe, objeto y ganador: los candidatos salen de las wishlists de la hermandad.</p></div>
				<label>Convocatoria<select data-ld-event>${sortedRaids
					.map(
						(r) =>
							`<option value="${esc(r.id)}" ${r.id === state.event ? 'selected' : ''}>${esc(r.title)} · ${esc(shortDate(r.starts_at))}</option>`,
					)
					.join('')}</select></label>
			</header>
			<div class="raid-picker" role="tablist" aria-label="Raids">${catalog.raids
				.map(
					(r) =>
						`<button type="button" role="tab" class="raid-pick" data-ld-raid="${esc(r.id)}" aria-selected="${r.id === state.raid}"><strong>${esc(r.name)}</strong><small>${r.bosses.length} ${r.bosses.length === 1 ? 'jefe' : 'jefes'}</small></button>`,
				)
				.join('')}</div>
			<ol class="boss-roster">${raid.bosses
				.map(
					(b) =>
						`<li><button type="button" class="boss-pick${b.id === state.boss ? ' is-open' : ''}" data-ld-boss="${esc(b.id)}" aria-expanded="${b.id === state.boss}"><span class="boss-portrait">${bossPortrait(b, esc)}</span><strong>${esc(b.name)}</strong></button></li>`,
				)
				.join('')}</ol>
			${
				boss
					? `<section class="loot-panel" id="ld-panel"><header><span class="boss-portrait is-small">${bossPortrait(boss, esc)}</span><div><h3>${esc(boss.name)}</h3><small>El número de cada objeto es cuánta gente lo pidió</small></div></header>
						<div class="loot-layout"><ul class="loot-grid">${boss.items.map(itemTile).join('')}</ul><aside class="loot-editor ld-aside">${aside()}</aside></div></section>`
					: '<p class="muted">Elige el jefe que ha caído.</p>'
			}
		</section>`;
		bind();
		loadTooltips();
	}
	function renderAside() {
		const box = host.querySelector('.ld-aside');
		if (!box) return render();
		box.innerHTML = aside();
		bindAside();
	}

	function bindAside() {
		host.querySelectorAll('[data-winner]').forEach(
			(b) =>
				(b.onclick = () => {
					state.winner = state.winner === b.dataset.winner ? null : b.dataset.winner;
					state.other = false;
					renderAside();
					host
						.querySelector('[data-ld-form]')
						?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
				}),
		);
		const other = host.querySelector('[data-other]');
		if (other)
			other.onchange = () => {
				state.winner = other.value || null;
				state.other = true;
				renderAside();
			};
		const form = host.querySelector('[data-ld-form]');
		if (!form) return;
		form.elements.method.onchange = () => {
			form.querySelector('.ld-council').hidden = form.elements.method.value !== 'Loot Council';
		};
		form.onsubmit = async (e) => {
			e.preventDefault();
			const item = itemOf(),
				fd = new FormData(form);
			const list = candidates(item);
			const button = form.querySelector('[type=submit]');
			button.disabled = true;
			try {
				await api('/api/loot', 'POST', {
					item: item.name,
					raidId: state.event,
					boss: bossOf().name,
					recipientCharacterId: state.winner,
					method: fd.get('method'),
					requestType: fd.get('requestType'),
					date: new Date(fd.get('date')).toISOString(),
					reason: fd.get('reason'),
					notes: fd.get('notes'),
					candidateIds: [...new Set([state.winner, ...list.map((c) => c.character.id)])],
					councilIds: fd.get('method') === 'Loot Council' ? fd.getAll('councilIds') : [],
				});
				toast(`${item.name} registrado para ${byChar.get(state.winner).name}`);
				state.item = null;
				state.winner = null;
				remember();
				await onDone();
			} catch (error) {
				button.disabled = false;
				toast(error.message);
			}
		};
	}
	function bind() {
		host.querySelector('[data-ld-event]').onchange = (e) => {
			state.event = e.target.value;
			remember();
		};
		host.querySelectorAll('[data-ld-raid]').forEach(
			(b) =>
				(b.onclick = () => {
					Object.assign(state, { raid: b.dataset.ldRaid, boss: null, item: null, winner: null });
					remember();
					render();
				}),
		);
		host.querySelectorAll('[data-ld-boss]').forEach(
			(b) =>
				(b.onclick = () => {
					const same = state.boss === b.dataset.ldBoss;
					Object.assign(state, { boss: same ? null : b.dataset.ldBoss, item: null, winner: null });
					remember();
					render();
					if (!same)
						host
							.querySelector('#ld-panel')
							?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
				}),
		);
		host.querySelectorAll('[data-ld-item]').forEach(
			(a) =>
				(a.onclick = (e) => {
					e.preventDefault();
					const id = Number(a.dataset.ldItem);
					Object.assign(state, { item: state.item === id ? null : id, winner: null, other: false });
					remember();
					host.querySelectorAll('[data-ld-item]').forEach((x) => {
						const on = Number(x.dataset.ldItem) === state.item;
						x.classList.toggle('is-selected', on);
						x.setAttribute('aria-pressed', String(on));
					});
					renderAside();
				}),
		);
		bindAside();
	}
	render();
}
