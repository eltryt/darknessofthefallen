import { ClassIcon } from './components.js';
import { buffCoverage, buffSource } from './raid-buffs.js';

// Raid-Helper class names arrive in English; the web shows class colours by key.
const classKeys = {
	warrior: 'warrior',
	paladin: 'paladin',
	hunter: 'hunter',
	rogue: 'rogue',
	priest: 'priest',
	shaman: 'shaman',
	mage: 'mage',
	warlock: 'warlock',
	druid: 'druid',
	guerrero: 'warrior',
	paladín: 'paladin',
	cazador: 'hunter',
	pícaro: 'rogue',
	sacerdote: 'priest',
	chamán: 'shaman',
	mago: 'mage',
	brujo: 'warlock',
	druida: 'druid',
};
export const spanishClass = {
	warrior: 'Guerrero',
	paladin: 'Paladín',
	hunter: 'Cazador',
	rogue: 'Pícaro',
	priest: 'Sacerdote',
	shaman: 'Chamán',
	mage: 'Mago',
	warlock: 'Brujo',
	druid: 'Druida',
};
// Specializations that identify a single class. Forever's Raid-Helper template sends the
// role group (Tank/Melee/Ranged/Healer) as the class, so the spec carries the class.
const specClasses = {
	arms: 'warrior',
	fury: 'warrior',
	retribution: 'paladin',
	beastmastery: 'hunter',
	'beast mastery': 'hunter',
	marksmanship: 'hunter',
	survival: 'hunter',
	assassination: 'rogue',
	combat: 'rogue',
	subtlety: 'rogue',
	discipline: 'priest',
	shadow: 'priest',
	elemental: 'shaman',
	enhancement: 'shaman',
	arcane: 'mage',
	fire: 'mage',
	frost: 'mage',
	affliction: 'warlock',
	demonology: 'warlock',
	destruction: 'warlock',
	balance: 'druid',
	feral: 'druid',
	guardian: 'druid',
};
const webClasses = Object.fromEntries(Object.entries(spanishClass).map(([k, v]) => [v, k]));
// The web character's class wins; then the Raid-Helper class; then an unambiguous spec.
export const classOf = (s) =>
	webClasses[s.characterClass] ||
	classKeys[(s.className || '').toLowerCase()] ||
	specClasses[(s.specName || '').toLowerCase().replace(/\d+$/, '')] ||
	'unknown';
const specOf = (s) => (s.specName || '').toLowerCase().replace(/\d+$/, '').replace(/\s+/g, '');
export const roleKind = (s) => {
	const text = [s.role, s.className].join(' ').toLowerCase();
	if (/tank|tanque/.test(text)) return 'tank';
	if (/heal|sanad/.test(text)) return 'healer';
	if (/ranged|distancia/.test(text)) return 'ranged';
	if (/melee/.test(text)) return 'melee';
	const key = classOf(s);
	return ['mage', 'warlock', 'hunter'].includes(key) ? 'ranged' : 'melee';
};
export const roleLabels = {
	tank: 'Tanque',
	healer: 'Sanador',
	melee: 'Melee',
	ranged: 'Distancia',
};
const dmLabels = {
	pending: 'En cola',
	sending: 'Enviando',
	sent: 'Avisado',
	failed: 'Aviso fallido',
	skipped: 'Sin aviso',
	uncertain: 'Sin confirmar',
};
const slotName = (slot) =>
	slot === 'bench' ? 'Banquillo' : slot === 'removed' ? 'Retirado' : `Grupo ${slot.split(':')[1]}`;

// Drag-and-drop lineup built from the Raid-Helper sign-ups of one event.
export async function mountLineup(target, eventId, { api, esc, toast, data }, onClose) {
	let view,
		assign = new Map(),
		dirty = false,
		drag = null,
		bosses = [],
		bossDirty = false;
	const url = `/api/events/${encodeURIComponent(eventId)}/lineup`;

	async function load(next) {
		view = next || (await api(url));
		assign = new Map(Object.entries(view.slots));
		dirty = false;
		if (!bossDirty)
			bosses = (view.bosses || []).map((b) => ({
				boss: b.boss,
				assignments: { ...b.assignments },
			}));
		render();
	}
	const classKey = classOf;
	const zoneOf = (id) => assign.get(id) || 'pool';
	const members = (zone) =>
		view.signups.filter((s) => zoneOf(s.id) === zone).sort((a, b) => order(a.id) - order(b.id));
	const positions = new Map();
	const order = (id) => positions.get(id) ?? 1e6;
	const groups = () => Array.from({ length: view.event.groups }, (_, i) => `group:${i + 1}`);
	const callupOf = (s) => view.callups.find((c) => c.user_id === s.userId);

	function card(s) {
		const key = classKey(s),
			callup = callupOf(s),
			zone = zoneOf(s.id);
		const options = ['pool', ...groups(), 'bench']
			.map(
				(z) =>
					`<option value="${z}" ${z === zone ? 'selected' : ''}>${z === 'pool' ? 'Sin asignar' : slotName(z)}</option>`,
			)
			.join('');
		return `<article class="lineup-card class-${key}" data-card="${esc(s.id)}" tabindex="-1">
			<span class="lineup-handle" data-handle aria-hidden="true">⠿</span>
			${spanishClass[key] ? ClassIcon({ className: spanishClass[key], size: 'small' }) : '<span class="lineup-noicon" title="Clase sin identificar: especialización compartida por varias clases">?</span>'}
			<span class="lineup-who"><strong>${esc(s.name)}</strong><small>${esc([s.specName, spanishClass[key] || s.className].filter(Boolean).join(' · '))}</small></span>
			<span class="lineup-flags"><span class="lineup-role role-${roleKind(s)}" title="${esc([s.role, s.className].filter(Boolean).join(' · ') || 'Sin rol')}">${roleLabels[roleKind(s)]}</span>${s.status !== 'Confirmado' ? `<span class="lineup-flag">${esc(s.status)}</span>` : ''}
			${s.registered ? '' : '<span class="lineup-flag is-muted" title="Inscrito en Discord sin cuenta en la web: no cuenta para la asistencia">Sin cuenta</span>'}
			${callup && callup.slot !== 'removed' ? `<span class="lineup-dm dm-${esc(callup.dm_status)}" title="${esc(callup.dm_error || (callup.dm_status === 'skipped' ? 'Bot de Discord sin configurar: no se envió mensaje privado' : dmLabels[callup.dm_status]))}">${esc(dmLabels[callup.dm_status])}</span>` : ''}</span>
			<label class="lineup-move"><span class="visually-hidden">Mover a ${esc(s.name)}</span><select data-move="${esc(s.id)}">${options}</select></label>
		</article>`;
	}
	let coverage = null;
	const buffChip = (b, compact = false) =>
		`<span class="buff-chip ${b.covered ? 'is-on' : 'is-off'} class-${b.classKey}" title="${esc(
			b.name +
				(b.covered
					? b.detail
						? ' · ' + b.detail
						: ' · cubierto'
					: ' · falta: nadie de ' + (spanishClass[b.classKey] || b.classKey)) +
				(b.scope === 'group' ? ' en este grupo' : ''),
		)}">${ClassIcon({ className: spanishClass[b.classKey], size: 'small' })}${compact ? '' : `<span>${esc(b.name)}</span>`}</span>`;
	function zone(id, title, list, { capacity = null, extra = '' } = {}) {
		const full = capacity !== null && list.length >= capacity;
		return `<section class="lineup-zone ${id.startsWith('group') ? 'is-group' : 'is-' + id} ${full ? 'is-full' : ''}" data-zone="${id}">
			<header><h4>${title}</h4><span>${capacity === null ? list.length : `${list.length} / ${capacity}`}</span></header>${
				id.startsWith('group') && list.length
					? `<div class="lineup-group-buffs" aria-label="Bufos de grupo">${coverage
							.group(list)
							.map((b) => buffChip(b, true))
							.join('')}</div>`
					: ''
			}
			<div class="lineup-cards">${list.map(card).join('')}${
				capacity !== null
					? '<span class="lineup-free">Hueco libre</span>'.repeat(
							Math.max(0, capacity - list.length),
						)
					: list.length
						? ''
						: `<p class="lineup-empty">${extra || 'Arrastra aquí'}</p>`
			}</div>
		</section>`;
	}
	function render() {
		const placed = view.signups.filter((s) => zoneOf(s.id).startsWith('group'));
		const roles = { tank: 0, healer: 0, melee: 0, ranged: 0 };
		for (const s of placed) roles[roleKind(s)]++;
		coverage = buffCoverage(placed, classOf, specOf);
		const missing = coverage.raid.filter((b) => !b.covered).length;
		const status = dirty
			? 'Cambios sin guardar'
			: view.lineup.pendingChanges
				? 'Cambios sin enviar'
				: view.lineup.status;
		const failed = view.callups.filter((c) => ['failed', 'skipped'].includes(c.dm_status)).length;
		target.innerHTML = /* HTML */ `<section class="lineup">
			<header class="lineup-head">
				<div>
					<span class="eyebrow">Alineación</span>
					<h3>${esc(view.event.title)}</h3>
					<p>
						${esc(new Date(view.event.starts_at).toLocaleString('es-ES', { timeZone: 'Europe/Madrid', dateStyle: 'full', timeStyle: 'short' }))}
						· ${view.event.groups} grupos de ${view.event.groupSize}
					</p>
				</div>
				<div class="lineup-badges">
					<span class="pill ${status === 'Enviada' ? 'gold' : ''}">${esc(status)}</span>
					<span class="lineup-bot ${view.dm.ready ? 'is-ready' : ''}"
						>${view.dm.ready ? 'Bot de Discord activo' : 'Bot de Discord sin configurar'}</span
					>
				</div>
			</header>
			<div class="lineup-toolbar">
				<span class="lineup-count"
					><b>${placed.length}</b> en grupos<span class="lineup-chip role-tank"
						>Tanques ${roles.tank}</span
					><span class="lineup-chip role-healer">Sanadores ${roles.healer}</span
					><span class="lineup-chip role-melee">Melee ${roles.melee}</span
					><span class="lineup-chip role-ranged">Distancia ${roles.ranged}</span></span
				>
				<div class="actions">
					<button type="button" class="secondary" data-auto>Autocompletar</button>
					<button type="button" class="secondary" data-clear>Vaciar</button>
					<button type="button" class="secondary" data-save ${dirty ? '' : 'disabled'}>
						Guardar borrador
					</button>
					<button type="button" data-send>Enviar convocatoria</button>
					${failed && view.dm.ready ? `<button type="button" class="secondary" data-retry>Reintentar ${failed} avisos</button>` : ''}
					<button type="button" class="secondary" data-close>Cerrar</button>
				</div>
			</div>
			<section class="lineup-buffs" aria-label="Bufos de banda">
				<div class="lineup-buffs-head">
					<h4>Bufos de banda</h4>
					<span class="${missing ? 'is-warn' : 'is-ok'}"
						>${missing ? missing + ' sin cubrir' : 'Todos cubiertos'}</span
					>
					<small title="${esc(buffSource)}">Provisional · WoW Forever en beta</small>
				</div>
				<div class="lineup-buffs-list">${coverage.raid.map((b) => buffChip(b)).join('')}</div>
			</section>
			${view.signups.length ? '' : '<div class="empty-note"><strong>Todavía no hay inscripciones</strong><p>Las inscripciones de Raid-Helper aparecerán aquí tras la siguiente sincronización.</p></div>'}
			<div class="lineup-board">
				<div class="lineup-side">
					${zone('pool', 'Inscritos sin asignar', members('pool'), { extra: 'Todos los inscritos están colocados' })}
					${zone('bench', 'Banquillo', members('bench'), { extra: 'Suplentes de la convocatoria' })}
				</div>
				<div class="lineup-groups">
					${groups()
						.map((g) => zone(g, slotName(g), members(g), { capacity: view.event.groupSize }))
						.join('')}
				</div>
			</div>
			${bossPlanner()} ${attendanceForm()}
		</section>`;
		bind();
		bindBosses();
	}
	// Per-boss participation, planned here by the organisers. It is web-only:
	// Raid-Helper and Discord know nothing about it. No assignment = pending.
	const bossCycle = { pending: 'in', in: 'bench', bench: 'pending' };
	const bossLabels = { in: ['✓', 'Dentro'], bench: ['⏸', 'Reserva'], pending: ['…', 'Pendiente'] };
	function bossPlanner() {
		const players = view.signups.filter((s) => zoneOf(s.id) !== 'pool');
		const known = [
			...new Set((data?.progress || []).flatMap((p) => p.bosses.map((b) => b.name))),
		].filter((name) => !bosses.some((b) => b.boss.toLowerCase() === name.toLowerCase()));
		return /* HTML */ `<section class="card boss-planner" aria-label="Participación por jefe">
			<div class="boss-planner-head">
				<div>
					<h4>Participación por jefe</h4>
					<p>
						Planificado en la web. No se sincroniza con Raid-Helper ni con Discord. Sin asignar =
						pendiente.
					</p>
				</div>
				<button type="button" data-boss-save ${bossDirty ? '' : 'disabled'}>
					Guardar plan por jefe
				</button>
			</div>
			<form class="boss-add" data-boss-add>
				<label
					>Añadir jefe<input
						name="boss"
						list="boss-known"
						maxlength="120"
						required
						placeholder="Nombre del jefe"
				/></label>
				<datalist id="boss-known">
					${known.map((n) => `<option value="${esc(n)}"></option>`).join('')}
				</datalist>
				<button type="submit" class="secondary">Añadir</button>
				${known.length ? `<button type="button" class="secondary" data-boss-all>Añadir los ${known.length} del progreso</button>` : ''}
			</form>
			${
				bosses.length && players.length
					? `<div class="boss-table-wrap"><table class="boss-table"><thead><tr><th scope="col">Jugador</th>${bosses
							.map(
								(b, i) =>
									`<th scope="col"><span>${esc(b.boss)}</span><span class="boss-col-actions"><button type="button" class="link" data-boss-fill="${i}">Según grupos</button><button type="button" class="link" data-boss-remove="${i}" aria-label="Quitar ${esc(b.boss)}">Quitar</button></span></th>`,
							)
							.join('')}</tr></thead><tbody>${players
							.map(
								(p) =>
									`<tr class="class-${classKey(p)}"><th scope="row">${esc(p.name)}<small>${esc(slotName(zoneOf(p.id)))}</small></th>${bosses
										.map((b, i) => {
											const st = b.assignments[p.userId] || 'pending';
											return `<td><button type="button" class="boss-cell is-${st}" data-boss-cell="${i}" data-user="${esc(p.userId)}" aria-label="${esc(p.name)} en ${esc(b.boss)}: ${bossLabels[st][1]}. Cambiar"><span aria-hidden="true">${bossLabels[st][0]}</span>${bossLabels[st][1]}</button></td>`;
										})
										.join('')}</tr>`,
							)
							.join('')}</tbody></table></div>`
					: `<p class="muted">${bosses.length ? 'Coloca jugadores en grupos o en el banquillo para planificar cada jefe.' : 'Sin jefes planificados: los jugadores verán su plaza general.'}</p>`
			}
		</section>`;
	}
	function bindBosses() {
		const touch = () => {
			bossDirty = true;
			render();
		};
		const addBoss = (name) => {
			name = name.trim();
			if (!name || bosses.some((b) => b.boss.toLowerCase() === name.toLowerCase())) return false;
			bosses.push({ boss: name, assignments: {} });
			return true;
		};
		target.querySelector('[data-boss-add]')?.addEventListener('submit', (e) => {
			e.preventDefault();
			if (addBoss(new FormData(e.target).get('boss'))) touch();
		});
		target.querySelector('[data-boss-all]')?.addEventListener('click', () => {
			for (const p of data?.progress || []) for (const b of p.bosses) addBoss(b.name);
			touch();
		});
		target.querySelectorAll('[data-boss-remove]').forEach(
			(b) =>
				(b.onclick = () => {
					bosses.splice(Number(b.dataset.bossRemove), 1);
					touch();
				}),
		);
		target.querySelectorAll('[data-boss-fill]').forEach(
			(b) =>
				(b.onclick = () => {
					const plan = bosses[Number(b.dataset.bossFill)];
					plan.assignments = {};
					for (const s of view.signups) {
						const z = zoneOf(s.id);
						if (z.startsWith('group')) plan.assignments[s.userId] = 'in';
						else if (z === 'bench') plan.assignments[s.userId] = 'bench';
					}
					touch();
				}),
		);
		target.querySelectorAll('[data-boss-cell]').forEach(
			(b) =>
				(b.onclick = () => {
					const plan = bosses[Number(b.dataset.bossCell)],
						next = bossCycle[plan.assignments[b.dataset.user] || 'pending'];
					if (next === 'pending') delete plan.assignments[b.dataset.user];
					else plan.assignments[b.dataset.user] = next;
					touch();
					target
						.querySelector(
							`[data-boss-cell="${b.dataset.bossCell}"][data-user="${CSS.escape(b.dataset.user)}"]`,
						)
						?.focus({ preventScroll: true });
				}),
		);
		target.querySelector('[data-boss-save]')?.addEventListener('click', async () => {
			try {
				// Players removed from the lineup drop out of the plan instead of failing validation.
				const placed = new Set(
					view.signups.filter((s) => zoneOf(s.id) !== 'pool').map((s) => s.userId),
				);
				const next = await api(url + '/bosses', 'PUT', {
					bosses: bosses.map((b) => ({
						boss: b.boss,
						assignments: Object.fromEntries(
							Object.entries(b.assignments).filter(([id]) => placed.has(id)),
						),
					})),
				});
				bossDirty = false;
				const keep = dirty ? new Map(assign) : null;
				await load(next);
				if (keep) {
					assign = keep;
					dirty = true;
					render();
				}
				toast('Plan por jefe guardado');
			} catch (e) {
				toast(e.message);
			}
		});
	}
	function attendanceForm() {
		const called = view.callups.filter((c) => c.slot !== 'removed');
		if (!view.started || !called.length) return '';
		const signup = (c) => view.signups.find((s) => s.userId === c.user_id);
		return /* HTML */ `<form class="card lineup-attendance" data-attendance>
			<h4>Confirmar asistencia</h4>
			<p>
				Prerrellenado con la alineación enviada. Solo cuenta para quienes tienen personaje en la
				web.
			</p>
			<div class="lineup-attendance-list">
				${called
					.map((c) => {
						const s = signup(c),
							current = view.attendance[c.user_id] || (c.slot === 'bench' ? 'Reserva' : 'Asistió');
						return `<label><span><strong>${esc(c.name)}</strong><small>${esc(slotName(c.slot))}</small></span>${
							s?.characterId
								? `<select data-attend="${esc(s.characterId)}">${['Asistió', 'Llegó tarde', 'Reserva', 'Ausente'].map((st) => `<option ${st === current ? 'selected' : ''}>${st}</option>`).join('')}</select>`
								: '<em>Sin personaje registrado</em>'
						}</label>`;
					})
					.join('')}
			</div>
			<button type="submit">Guardar asistencia</button>
		</form>`;
	}
	function move(id, to) {
		if (to.startsWith('group') && to !== zoneOf(id) && members(to).length >= view.event.groupSize) {
			toast(`${slotName(to)} ya tiene ${view.event.groupSize} jugadores.`);
			return false;
		}
		if (to === 'pool') assign.delete(id);
		else assign.set(id, to);
		positions.set(id, Date.now());
		dirty = true;
		render();
		target.querySelector(`[data-card="${CSS.escape(id)}"]`)?.focus({ preventScroll: true });
		return true;
	}
	// Fill groups so each gets a tank and a healer first, then damage; the rest go to the bench.
	function autoFill() {
		const pool = view.signups.filter((s) => s.status !== 'Suplente');
		const byRole = { tank: [], healer: [], melee: [], ranged: [] };
		for (const s of pool) byRole[roleKind(s)].push(s);
		assign = new Map();
		const gs = groups(),
			fill = Object.fromEntries(gs.map((g) => [g, 0]));
		const place = (s) => {
			// Least-filled group keeps groups balanced instead of leaving the last ones empty.
			const g = gs
				.filter((x) => fill[x] < view.event.groupSize)
				.sort((x, y) => fill[x] - fill[y])[0];
			if (!g) return assign.set(s.id, 'bench');
			fill[g]++;
			assign.set(s.id, g);
		};
		for (const role of ['tank', 'healer'])
			byRole[role].forEach((s, i) => {
				const g = gs[i % gs.length];
				if (fill[g] < view.event.groupSize) {
					fill[g]++;
					assign.set(s.id, g);
				} else place(s);
			});
		[...byRole.melee, ...byRole.ranged].forEach(place);
		for (const s of view.signups) if (s.status === 'Suplente') assign.set(s.id, 'bench');
		dirty = true;
		render();
	}
	function payload() {
		const zones = [...groups(), 'bench'];
		return zones.flatMap((z) => members(z).map((s) => ({ signupId: s.id, slot: z })));
	}
	async function save() {
		const next = await api(url, 'PUT', { revision: view.lineup.revision, slots: payload() });
		await load(next);
		toast('Alineación guardada');
	}
	function bind() {
		const on = (sel, fn) => target.querySelector(sel)?.addEventListener('click', fn);
		const guard = (fn) => async () => {
			try {
				await fn();
			} catch (e) {
				toast(e.message);
			}
		};
		on('[data-auto]', autoFill);
		on('[data-clear]', () => {
			assign = new Map();
			dirty = true;
			render();
		});
		on('[data-save]', guard(save));
		on(
			'[data-send]',
			guard(async () => {
				const players = payload().length;
				if (
					!confirm(
						view.dm.ready
							? `¿Enviar la convocatoria? Se avisará por mensaje privado de Discord a ${players} jugadores (solo a quienes cambien de puesto si ya se envió).`
							: `¿Enviar la convocatoria a ${players} jugadores? El bot de Discord no está configurado: se verá en sus perfiles, pero no recibirán mensaje privado.`,
					)
				)
					return;
				if (dirty) await save();
				const result = await api(url + '/send', 'POST', { revision: view.lineup.revision });
				await load(result.view);
				toast(
					`Convocatoria enviada · ${result.dmReady ? result.notified + ' avisos por privado' : result.notified + ' jugadores, sin mensaje privado (bot sin configurar)'}${result.unchanged ? ` · ${result.unchanged} sin cambios` : ''}${result.removed ? ` · ${result.removed} retirados` : ''}`,
				);
			}),
		);
		on(
			'[data-retry]',
			guard(async () => {
				const result = await api(url + '/retry', 'POST', {});
				await load(result.view);
				toast(`${result.requeued} avisos vuelven a la cola`);
			}),
		);
		on('[data-close]', () => {
			if (dirty && !confirm('Hay cambios sin guardar. ¿Cerrar igualmente?')) return;
			onClose();
		});
		target.querySelectorAll('[data-move]').forEach((select) =>
			select.addEventListener('change', () => {
				if (!move(select.dataset.move, select.value)) render();
			}),
		);
		target.querySelector('[data-attendance]')?.addEventListener('submit', async (e) => {
			e.preventDefault();
			const entries = [...e.target.querySelectorAll('[data-attend]')].map((s) => ({
				characterId: s.dataset.attend,
				status: s.value,
			}));
			try {
				await api(`/api/raids/${encodeURIComponent(eventId)}/attendance`, 'PUT', { entries });
				toast('Asistencia guardada');
				await load();
			} catch (error) {
				toast(error.message);
			}
		});
		target
			.querySelectorAll('[data-card]')
			.forEach((el) => el.addEventListener('pointerdown', start));
		target.querySelector('.lineup-board')?.addEventListener('dragstart', (e) => e.preventDefault());
	}
	// Pointer-based drag: mouse drags the whole card, touch uses the handle so pages still scroll.
	function start(e) {
		if (e.button > 0 || e.target.closest('select, label')) return;
		if (e.pointerType !== 'mouse' && !e.target.closest('[data-handle]')) return;
		// Stops the browser's own image drag and text selection, which would cancel ours.
		e.preventDefault();
		const el = e.currentTarget;
		drag = { id: el.dataset.card, el, x: e.clientX, y: e.clientY, ghost: null, over: null };
		el.setPointerCapture(e.pointerId);
		el.addEventListener('pointermove', moveDrag);
		el.addEventListener('pointerup', endDrag);
		el.addEventListener('pointercancel', endDrag);
	}
	function moveDrag(e) {
		if (!drag) return;
		if (!drag.ghost) {
			if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 6) return;
			const rect = drag.el.getBoundingClientRect();
			drag.ghost = drag.el.cloneNode(true);
			drag.ghost.classList.add('lineup-ghost');
			drag.ghost.style.width = rect.width + 'px';
			drag.dx = e.clientX - rect.left;
			drag.dy = e.clientY - rect.top;
			document.body.append(drag.ghost);
			drag.el.classList.add('is-dragging');
		}
		e.preventDefault();
		drag.ghost.style.transform = `translate(${e.clientX - drag.dx}px, ${e.clientY - drag.dy}px)`;
		const zoneEl = document.elementFromPoint(e.clientX, e.clientY)?.closest('[data-zone]');
		if (zoneEl !== drag.over) {
			drag.over?.classList.remove('is-over');
			zoneEl?.classList.add('is-over');
			drag.over = zoneEl;
		}
	}
	function endDrag(e) {
		if (!drag) return;
		const { el, ghost, over, id } = drag;
		drag = null;
		el.removeEventListener('pointermove', moveDrag);
		el.removeEventListener('pointerup', endDrag);
		el.removeEventListener('pointercancel', endDrag);
		ghost?.remove();
		el.classList.remove('is-dragging');
		over?.classList.remove('is-over');
		if (ghost && over && e.type === 'pointerup') move(id, over.dataset.zone);
	}
	await load();
}
