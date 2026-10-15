import { ClassIcon } from './components.js';
import { classOf, roleKind, roleLabels, spanishClass } from './lineup-board.js';

// The player's call-ups at a glance. Three facts are kept apart on purpose:
// the Raid-Helper sign-up, the slot in the lineup planned on the web, and the
// attendance recorded after the raid. Every state carries text, never colour alone.
const STALE_MS = 30 * 60 * 1000;
const when = (value) =>
	new Date(value).toLocaleString('es-ES', {
		timeZone: 'Europe/Madrid',
		weekday: 'long',
		day: 'numeric',
		month: 'long',
		hour: '2-digit',
		minute: '2-digit',
	});
const ago = (value) =>
	value
		? new Date(value).toLocaleString('es-ES', {
				timeZone: 'Europe/Madrid',
				day: 'numeric',
				month: 'short',
				hour: '2-digit',
				minute: '2-digit',
			})
		: 'nunca';
const slotName = (slot) =>
	slot === 'bench' ? 'Banquillo' : /^group:(\d)$/.test(slot) ? 'Grupo ' + slot.slice(6) : slot;
const bossStates = {
	in: ['✓', 'Dentro', 'is-in'],
	bench: ['⏸', 'Reserva', 'is-bench'],
	pending: ['…', 'Pendiente de asignación', 'is-pending'],
};

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
		.filter((e) => Date.parse(e.starts_at) > now - 6 * 3600 * 1000)
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

	function status(e) {
		const signup = e.mine?.[0],
			callup = byEvent.get(e.id),
			own = e.lineup?.players.find((p) => p.own);
		const signupText = signup ? signup.status : 'Sin inscripción';
		let slotText, slotClass;
		if (!e.lineup) {
			slotText = 'Pendiente: la alineación aún no se ha publicado';
			slotClass = 'is-pending';
		} else if (own) {
			slotText = slotName(own.slot);
			slotClass = own.slot === 'bench' ? 'is-bench' : 'is-in';
		} else {
			slotText = 'No incluido en la alineación publicada';
			slotClass = 'is-out';
		}
		const attendance = callup?.attendance || null;
		const started = Date.parse(e.starts_at) <= now;
		return {
			signupText,
			slotText,
			slotClass,
			attendance,
			attendanceText:
				attendance || (started ? 'Pendiente de registrar' : 'Se registra tras la raid'),
			summary: [
				own ? slotName(own.slot) : e.lineup ? 'Fuera de la alineación' : 'Plaza pendiente',
				signup ? signup.status + ' en Raid-Helper' : 'Sin inscripción en Raid-Helper',
			].join(' · '),
		};
	}

	function player(p) {
		const key = classOf(p);
		return `<li class="callup-player class-${key} ${p.own ? 'is-self' : ''}">${spanishClass[key] ? ClassIcon({ className: spanishClass[key], size: 'small' }) : '<span class="callup-noicon" aria-hidden="true">?</span>'}<span>${esc(p.name)}</span>${p.own ? '<b class="self-tag">Tú</b>' : ''}<small>${esc(roleLabels[roleKind(p)] || '')}</small></li>`;
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
			return `<div class="callup-groups">${order
				.map(
					(slot) =>
						`<section class="callup-group ${slot === 'bench' ? 'is-bench' : ''} ${groups.get(slot).some((p) => p.own) ? 'has-self' : ''}"><h4>${esc(slotName(slot))}</h4><ul>${groups.get(slot).map(player).join('')}</ul></section>`,
				)
				.join(
					'',
				)}</div><p class="muted callup-source">Alineación publicada en la web el ${esc(ago(e.lineup.sentAt))}${e.lineup.pendingChanges ? ' · Los responsables están preparando cambios.' : ''}</p>`;
		}
		const confirmed = (e.signups || []).filter((s) => s.status === 'Confirmado');
		if (!confirmed.length) return '';
		const roles = new Map();
		for (const s of confirmed) {
			const kind = roleKind(s);
			if (!roles.has(kind)) roles.set(kind, []);
			roles.get(kind).push({ ...s, characterClass: s.registeredClass });
		}
		return `<div class="callup-groups">${['tank', 'healer', 'melee', 'ranged']
			.filter((k) => roles.has(k))
			.map(
				(k) =>
					`<section class="callup-group"><h4>${roleLabels[k]} · ${roles.get(k).length}</h4><ul>${roles.get(k).map(player).join('')}</ul></section>`,
			)
			.join(
				'',
			)}</div><p class="muted callup-source">Inscripciones confirmadas en Raid-Helper. La alineación por grupos aún no se ha publicado.</p>`;
	}
	function bosses(e) {
		if (!e.bossPlan?.length) return '';
		return `<section class="callup-bosses"><h4>Participación por jefe <small>· Planificado en la web</small></h4><ul>${e.bossPlan
			.map((b) => {
				const [mark, label, cls] = bossStates[b.mine] || bossStates.pending;
				return `<li class="${cls}"><span class="boss-state" aria-hidden="true">${mark}</span><strong>${esc(b.boss)}</strong><span>${label}</span></li>`;
			})
			.join('')}</ul></section>`;
	}
	function card(e, open) {
		const s = status(e);
		return /* HTML */ `<article class="callup-card ${s.slotClass}">
			<header>
				<div>
					<span class="eyebrow">${esc(e.category)} · ${esc(e.state)}</span>
					<h3>${esc(e.title)}</h3>
					<p class="callup-when">
						<time datetime="${esc(e.starts_at)}">${esc(when(e.starts_at))}</time> · hora de Madrid
					</p>
				</div>
				${e.discordUrl ? `<a class="button secondary" href="${esc(e.discordUrl)}" target="_blank" rel="noopener noreferrer">Ver en Discord ↗</a>` : ''}
			</header>
			<p class="callup-summary"><strong>Tu estado:</strong> ${esc(s.summary)}</p>
			<dl class="callup-facts">
				<div>
					<dt>Inscripción · Raid-Helper</dt>
					<dd>${esc(s.signupText)}</dd>
				</div>
				<div class="${s.slotClass}">
					<dt>Plaza · alineación web</dt>
					<dd>${esc(s.slotText)}</dd>
				</div>
				<div>
					<dt>Asistencia</dt>
					<dd>${esc(s.attendanceText)}</dd>
				</div>
			</dl>
			${bosses(e)}
			<details class="callup-comp" ${open ? 'open' : ''}>
				<summary>Composición</summary>
				${composition(e) || '<p class="muted">Todavía no hay inscripciones confirmadas.</p>'}
			</details>
		</article>`;
	}

	host.innerHTML = /* HTML */ `<div class="hub-section-head">
			<div>
				<h2>Mis convocatorias</h2>
				<p>Tus raids, tu plaza y tu grupo, de un vistazo.</p>
			</div>
		</div>
		${
			result.configured
				? `<p class="callup-sync ${stale ? 'is-stale' : ''}" role="status">${stale ? '<strong>⚠ Datos posiblemente desactualizados.</strong> ' : ''}Última sincronización con Raid-Helper: ${esc(ago(sync.last_success))}.</p>`
				: '<p class="notice">La conexión con Raid-Helper está pendiente de activación. No se muestran inscripciones simuladas.</p>'
		}
		<details class="callup-help">
			<summary>¿Qué significa cada dato?</summary>
			<dl>
				<dt>Inscripción · Raid-Helper</dt>
				<dd>
					Lo que marcaste en Discord con Raid-Helper: confirmado, suplente, tentativo o ausente.
				</dd>
				<dt>Plaza · alineación web</dt>
				<dd>
					El grupo o el banquillo en el que te colocan los responsables en la web. Hasta que la
					publican, aparece como pendiente.
				</dd>
				<dt>Asistencia</dt>
				<dd>Lo que se registra después de la raid. Inscribirse no equivale a asistir.</dd>
				<dt>Participación por jefe</dt>
				<dd>
					Si los responsables planifican jefe a jefe, verás si estás dentro, en reserva o pendiente
					de asignación. Sin asignación significa pendiente, no fuera.
				</dd>
			</dl>
		</details>
		${
			upcoming.length
				? `<div class="callup-list">${upcoming.map((e, i) => card(e, i === 0)).join('')}</div>`
				: '<div class="empty-note" role="status"><strong>No tienes convocatorias próximas</strong><p>Cuando te inscribas en una raid con Raid-Helper o te coloquen en una alineación, aparecerá aquí.</p><a class="button secondary" href="/raids">Ver raids de la hermandad</a></div>'
		}
		${
			past.length
				? `<details class="callup-past"><summary>Anteriores · ${past.length}</summary><div class="callup-list">${past.map((e) => card(e, false)).join('')}</div></details>`
				: ''
		}`;
}
