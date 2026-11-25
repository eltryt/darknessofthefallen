import { characterLink } from './roster-ui.js';
import { ClassIcon } from './components.js';
import { classOf, roleKind, roleLabels, spanishClass } from './lineup-board.js';

// The player's call-ups. The next raid opens as a cover with its countdown, your state in
// three steps and the composition; every other call-up is a small card that brings it to
// the cover. Three facts stay apart on purpose: the Raid-Helper sign-up, the slot in the
// lineup planned on the web and the attendance recorded after the raid. Every state
// carries text, never colour alone.
const STALE_MS = 30 * 60 * 1000;
const HOUR = 3600 * 1000;
const DAY = 24 * HOUR;
const madrid = (value, options) =>
	new Date(value).toLocaleString('es-ES', { timeZone: 'Europe/Madrid', ...options });
const when = (value) =>
	madrid(value, {
		weekday: 'long',
		day: 'numeric',
		month: 'long',
		hour: '2-digit',
		minute: '2-digit',
	});
const ago = (value) =>
	value
		? madrid(value, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
		: 'nunca';
const slotName = (slot) =>
	slot === 'bench' ? 'Banquillo' : /^group:(\d)$/.test(slot) ? 'Grupo ' + slot.slice(6) : slot;
const roleOrder = ['tank', 'healer', 'melee', 'ranged'];
const roleIcons = {
	tank: 'role_tank',
	healer: 'role_healer',
	melee: 'role_dps',
	ranged: 'role_dps',
};
const plural = { tank: 'Tanques', healer: 'Sanadores', melee: 'Melee', ranged: 'Distancia' };
const bossStates = {
	in: ['✓', 'Dentro', 'is-in'],
	bench: ['⏸', 'Reserva', 'is-bench'],
	pending: ['…', 'Pendiente', 'is-pending'],
};
// Kept between re-renders of the section: the call-up on the cover.
let selectedId = null;

function countdown(startsAt, now) {
	const diff = Date.parse(startsAt) - now;
	if (diff < -6 * HOUR)
		return { big: 'Terminada', small: madrid(startsAt, { day: 'numeric', month: 'long' }) };
	if (diff <= 0)
		return {
			big: 'En curso',
			small: 'Empezó a las ' + madrid(startsAt, { hour: '2-digit', minute: '2-digit' }),
		};
	const time = madrid(startsAt, { hour: '2-digit', minute: '2-digit' });
	if (diff < DAY) {
		const hours = Math.floor(diff / HOUR);
		return {
			big: hours ? `${hours} h` : `${Math.max(1, Math.round(diff / 60000))} min`,
			small: `Hoy a las ${time}`,
		};
	}
	const days = Math.round(diff / DAY);
	return {
		big: `${days} ${days === 1 ? 'día' : 'días'}`,
		small: `${madrid(startsAt, { weekday: 'long' })} a las ${time}`,
	};
}

export async function mountMyCallups(host, ctx) {
	const { api, esc } = ctx;
	const [result, callups] = await Promise.all([api('/api/events'), api('/api/callups/mine')]);
	if (!host.isConnected) return;
	const byEvent = new Map(callups.map((c) => [c.event_id, c]));
	const relevant = result.events.filter(
		(e) => e.mine?.length || e.lineup?.players.some((p) => p.own) || byEvent.has(e.id),
	);
	const now = Date.now();
	const upcoming = relevant
		.filter((e) => Date.parse(e.starts_at) > now - 6 * HOUR)
		.sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at));
	const past = relevant
		.filter((e) => !upcoming.includes(e))
		.sort((a, b) => Date.parse(b.starts_at) - Date.parse(a.starts_at))
		.slice(0, 5);
	const sync = result.sync || {};
	const stale =
		result.configured &&
		(sync.healthy === false ||
			!sync.last_success ||
			now - Date.parse(sync.last_success) > STALE_MS);
	const all = [...upcoming, ...past];
	if (!all.some((e) => e.id === selectedId)) selectedId = all[0]?.id || null;

	function status(e) {
		const signup = e.mine?.[0],
			callup = byEvent.get(e.id),
			own = e.lineup?.players.find((p) => p.own);
		const started = Date.parse(e.starts_at) <= now;
		const signupState = !signup
			? 'is-out'
			: signup.status === 'Confirmado'
				? 'is-done'
				: signup.status === 'Ausente'
					? 'is-out'
					: 'is-pending';
		let slot;
		if (!e.lineup) slot = ['Pendiente', 'La alineación aún no se ha publicado', 'is-pending'];
		else if (own)
			slot = [
				slotName(own.slot),
				own.slot === 'bench' ? 'Estás en el banquillo' : 'Tu grupo en la alineación',
				own.slot === 'bench' ? 'is-pending' : 'is-done',
			];
		else slot = ['Fuera', 'No estás en la alineación publicada', 'is-out'];
		const attendance = callup?.attendance || null;
		return {
			steps: [
				{
					label: 'Inscripción',
					value: signup ? signup.status : 'Sin inscripción',
					hint: 'En Raid-Helper',
					cls: signupState,
				},
				{ label: 'Plaza', value: slot[0], hint: slot[1], cls: slot[2] },
				{
					label: 'Asistencia',
					value: attendance || (started ? 'Por registrar' : 'Tras la raid'),
					hint: attendance ? 'Registrada' : 'Se registra después',
					cls: attendance ? 'is-done' : 'is-pending',
				},
			],
			pill: own ? slotName(own.slot) : signup ? signup.status : e.lineup ? 'Fuera' : 'Pendiente',
			pillCls: own ? (own.slot === 'bench' ? 'is-pending' : 'is-done') : signupState,
		};
	}
	const stepMark = { 'is-done': '✓', 'is-pending': '…', 'is-out': '✕' };

	function chip(p) {
		const key = classOf(p);
		return `<li class="cu-chip class-${key}${p.own ? ' is-self' : ''}">${spanishClass[key] ? ClassIcon({ className: spanishClass[key], size: 'small' }) : '<span class="cu-noicon" aria-hidden="true">?</span>'}<span class="cu-chip-name">${characterLink(p.characterId, esc(p.name))}</span>${p.own ? '<b class="cu-self">Tú</b>' : ''}</li>`;
	}
	function roleMeter(counts, total, capacity) {
		const max = Math.max(total, capacity || 0, 1);
		return `<div class="cu-meter" role="img" aria-label="${roleOrder
			.filter((k) => counts[k])
			.map((k) => `${counts[k]} ${plural[k].toLowerCase()}`)
			.join(', ')}">${roleOrder
			.filter((k) => counts[k])
			.map(
				(k) =>
					`<span class="cu-meter-part cu-r-${k}" data-bar="${Math.round((counts[k] / max) * 100)}"></span>`,
			)
			.join('')}</div><ul class="cu-legend">${roleOrder
			.map(
				(k) =>
					`<li class="cu-r-${k}"><img src="/assets/icons/role/${roleIcons[k]}.webp" alt="" width="22" height="22"><strong>${counts[k] || 0}</strong><span>${plural[k]}</span></li>`,
			)
			.join('')}</ul>`;
	}
	function composition(e) {
		if (e.lineup) {
			const groups = new Map();
			for (const p of e.lineup.players) {
				if (!groups.has(p.slot)) groups.set(p.slot, []);
				groups.get(p.slot).push(p);
			}
			const order = [...groups.keys()].sort((a, b) =>
				a === 'bench' ? 1 : b === 'bench' ? -1 : a.localeCompare(b),
			);
			const counts = {};
			for (const p of e.lineup.players)
				if (p.slot !== 'bench') counts[roleKind(p)] = (counts[roleKind(p)] || 0) + 1;
			const inRaid = e.lineup.players.filter((p) => p.slot !== 'bench').length;
			return `<section class="cu-panel"><header><h4>Alineación</h4><span>${inRaid} en grupos${e.capacity ? ` de ${e.capacity}` : ''}</span></header>${roleMeter(counts, inRaid, e.capacity)}<div class="cu-groups">${order
				.map(
					(slot) =>
						`<section class="cu-group${slot === 'bench' ? ' is-bench' : ''}${groups.get(slot).some((p) => p.own) ? ' has-self' : ''}"><h5>${esc(slotName(slot))}<small>${groups.get(slot).length}</small></h5><ul>${groups.get(slot).map(chip).join('')}</ul></section>`,
				)
				.join(
					'',
				)}</div><p class="cu-source">Publicada en la web el ${esc(ago(e.lineup.sentAt))}${e.lineup.pendingChanges ? ' · Los responsables están preparando cambios.' : ''}</p></section>`;
		}
		const confirmed = (e.signups || []).filter((s) => s.status === 'Confirmado');
		if (!confirmed.length)
			return '<section class="cu-panel"><p class="muted">Todavía no hay inscripciones confirmadas.</p></section>';
		const roles = new Map();
		for (const s of confirmed) {
			const kind = roleKind(s);
			if (!roles.has(kind)) roles.set(kind, []);
			roles.get(kind).push({ ...s, characterClass: s.registeredClass });
		}
		const counts = Object.fromEntries([...roles].map(([k, list]) => [k, list.length]));
		return `<section class="cu-panel"><header><h4>Composición</h4><span>${confirmed.length} confirmados${e.capacity ? ` de ${e.capacity}` : ''}</span></header>${roleMeter(counts, confirmed.length, e.capacity)}<div class="cu-roles">${roleOrder
			.filter((k) => roles.has(k))
			.map(
				(k) =>
					`<section class="cu-role cu-r-${k}"><h5><img src="/assets/icons/role/${roleIcons[k]}.webp" alt="" width="20" height="20">${roleLabels[k]}<small>${roles.get(k).length}</small></h5><ul>${roles.get(k).map(chip).join('')}</ul></section>`,
			)
			.join(
				'',
			)}</div><p class="cu-source">Inscripciones confirmadas en Raid-Helper. La alineación por grupos aún no se ha publicado.</p></section>`;
	}
	function bosses(e) {
		if (!e.bossPlan?.length) return '';
		return `<section class="cu-panel"><header><h4>Jefe a jefe</h4><span>Planificado en la web</span></header><ul class="cu-bosses">${e.bossPlan
			.map((b) => {
				const [mark, label, cls] = bossStates[b.mine] || bossStates.pending;
				return `<li class="${cls}"><span aria-hidden="true">${mark}</span><strong>${esc(b.boss)}</strong><small>${label}</small></li>`;
			})
			.join('')}</ul></section>`;
	}
	function cover(e) {
		const s = status(e);
		const c = countdown(e.starts_at, now);
		const isPast = !upcoming.includes(e);
		return /* HTML */ `<article class="cu-hero${isPast ? ' is-past' : ''}">
				<div class="cu-hero-top">
					<div class="cu-hero-text">
						<span class="cu-tags"
							><span>${esc(e.category)}</span><span>${esc(e.state)}</span>${
								isPast ? '<span>Anterior</span>' : ''
							}</span
						>
						<h3>${esc(e.title)}</h3>
						<p>
							<time datetime="${esc(e.starts_at)}">${esc(when(e.starts_at))}</time> · hora de Madrid
						</p>
						${
							e.discordUrl
								? `<a class="button secondary cu-discord" href="${esc(e.discordUrl)}" target="_blank" rel="noopener noreferrer">Ver en Discord ↗</a>`
								: ''
						}
					</div>
					<div class="cu-count" aria-label="${esc(c.big)}, ${esc(c.small)}">
						${isPast || /En curso|Terminada/.test(c.big) ? '' : '<small>Faltan</small>'}<strong
							>${esc(c.big)}</strong
						><span>${esc(c.small)}</span>
					</div>
				</div>
				<ol class="cu-steps" aria-label="Tu estado">
					${s.steps
						.map(
							(step) =>
								`<li class="${step.cls}"><span class="cu-step-mark" aria-hidden="true">${stepMark[step.cls]}</span><div><small>${step.label}</small><strong>${esc(step.value)}</strong><span>${esc(step.hint)}</span></div></li>`,
						)
						.join('')}
				</ol>
			</article>
			${bosses(e)} ${composition(e)}`;
	}
	function mini(e) {
		const s = status(e);
		const day = madrid(e.starts_at, { day: 'numeric' }),
			month = madrid(e.starts_at, { month: 'short' }).replace('.', '');
		return `<li><button type="button" class="cu-mini${e.id === selectedId ? ' is-current' : ''}${upcoming.includes(e) ? '' : ' is-past'}" data-callup="${esc(e.id)}" aria-pressed="${e.id === selectedId}"><span class="cu-date"><strong>${esc(day)}</strong><small>${esc(month)}</small></span><span class="cu-mini-text"><strong>${esc(e.title)}</strong><small>${esc(madrid(e.starts_at, { weekday: 'long', hour: '2-digit', minute: '2-digit' }))}</small></span><span class="cu-pill ${s.pillCls}">${esc(s.pill)}</span></button></li>`;
	}

	function render() {
		const current = all.find((e) => e.id === selectedId);
		host.innerHTML = /* HTML */ `<div class="cu">
			<div class="cu-head">
				<div>
					<h2>Mis convocatorias</h2>
					<p>Tus raids, tu plaza y tu grupo, de un vistazo.</p>
				</div>
				${
					result.configured
						? `<span class="cu-sync${stale ? ' is-stale' : ''}" role="status"><i aria-hidden="true"></i>${stale ? 'Datos posiblemente desactualizados · ' : 'Raid-Helper · '}${esc(ago(sync.last_success))}</span>`
						: ''
				}
			</div>
			${
				result.configured
					? ''
					: '<p class="notice">La conexión con Raid-Helper está pendiente de activación. No se muestran inscripciones simuladas.</p>'
			}
			${
				current
					? cover(current)
					: '<div class="cu-empty" role="status"><strong>No tienes convocatorias próximas</strong><p>Cuando te inscribas en una raid con Raid-Helper o te coloquen en una alineación, aparecerá aquí.</p><a class="button secondary" href="/raids">Ver raids de la hermandad</a></div>'
			}
			${
				upcoming.length > 1 || (past.length && current)
					? `<section class="cu-others">${upcoming.length > 1 ? `<h4>Próximas · ${upcoming.length}</h4><ul class="cu-minis">${upcoming.map(mini).join('')}</ul>` : ''}${past.length ? `<h4>Anteriores · ${past.length}</h4><ul class="cu-minis">${past.map(mini).join('')}</ul>` : ''}</section>`
					: ''
			}
			<details class="cu-help">
				<summary>¿Qué significa cada dato?</summary>
				<dl>
					<dt>Inscripción</dt>
					<dd>
						Lo que marcaste en Discord con Raid-Helper: confirmado, suplente, tentativo o ausente.
					</dd>
					<dt>Plaza</dt>
					<dd>
						El grupo o el banquillo en el que te colocan los responsables en la web. Hasta que la
						publican, aparece como pendiente.
					</dd>
					<dt>Asistencia</dt>
					<dd>Lo que se registra después de la raid. Inscribirse no equivale a asistir.</dd>
					<dt>Jefe a jefe</dt>
					<dd>
						Si los responsables planifican jefe a jefe, verás si estás dentro, en reserva o
						pendiente de asignación. Sin asignación significa pendiente, no fuera.
					</dd>
				</dl>
			</details>
		</div>`;
		host.querySelectorAll('[data-callup]').forEach(
			(b) =>
				(b.onclick = () => {
					selectedId = b.dataset.callup;
					render();
					host.querySelector('.cu-hero')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
				}),
		);
	}
	render();
}
