import { characterLink } from './roster-ui.js';
import { slotLabels } from './armory-catalog.js';

// Wishlist deadline per tier (Normas de raid, 22/11/2026): the notice on each player's
// wishlist and the loot officers' tools in the panel (deadline, requests, warnings,
// history of changes).
export const when = (value) =>
	value
		? new Date(value).toLocaleString('es-ES', {
				timeZone: 'Europe/Madrid',
				day: 'numeric',
				month: 'long',
				hour: '2-digit',
				minute: '2-digit',
			})
		: '';
const slotName = (slot) => (slot ? slotLabels[slot] || slot : 'sin hueco');
const actions = { added: 'Añadido', removed: 'Quitado', changed: 'Cambiado' };
const requestStates = {
	pending: 'Pendiente',
	approved: 'Aprobada',
	rejected: 'Rechazada',
	cancelled: 'Cancelada',
};

// The notice above a player's wishlist.
export function windowNotice(win, esc) {
	if (!win || win.state === 'free') return '';
	return win.state === 'open'
		? `<p class="notice wish-window is-open" role="status"><strong>Plazo de wishlist abierto</strong> hasta el ${esc(when(win.closesAt))}. Después solo se podrán quitar objetos.</p>`
		: `<p class="notice wish-window is-closed" role="status"><strong>Plazo de wishlist cerrado</strong>${win.closesAt ? ' desde el ' + esc(when(win.closesAt)) : ''}. Puedes quitar objetos y marcar «Ya lo tengo»; para añadir o cambiar algo, envía una petición y la revisará un oficial de loot.</p>`;
}

// What a request asks for, in one line.
export function requestSummary(r, esc) {
	const p = r.payload || {};
	if (r.kind === 'add')
		return `Añadir «${esc(p.item)}» · ${esc(slotName(p.slot))} · ${esc(p.status)} · prioridad ${Number(p.priority)}`;
	const parts = [];
	if ('status' in p) parts.push('estado ' + esc(p.status));
	if ('slot' in p) parts.push('hueco ' + esc(slotName(p.slot)));
	if ('priority' in p) parts.push('prioridad ' + Number(p.priority));
	return `Cambiar un objeto: ${parts.join(', ')}`;
}

// The player's own requests for one character, under the notice.
export function ownRequests(requests, character, esc) {
	const mine = requests
		.filter((r) => r.character_id === character.id)
		.filter((r) => r.status === 'pending' || Date.now() - Date.parse(r.decided_at) < 14 * 86400000)
		.slice(0, 10);
	if (!mine.length) return '';
	return /* HTML */ `<section class="wish-requests">
		<h3>Tus peticiones</h3>
		<ul>
			${mine
				.map(
					(r) =>
						/* HTML */ `<li>
							<span>${requestSummary(r, esc)}</span>
							<small
								><b>${requestStates[r.status]}</b
								>${r.decision_note ? ' · ' + esc(r.decision_note) : ''}</small
							>
							${r.status === 'pending' ? `<button type="button" class="secondary" data-cancel-request="${esc(r.id)}">Cancelar</button>` : ''}
						</li>`,
				)
				.join('')}
		</ul>
	</section>`;
}

// Panel → Wishlists: the loot officers' side.
export async function mountWishlistAdmin(host, ctx, refresh) {
	const { api, esc, table, toast } = ctx;
	const [win, requests, history] = await Promise.all([
		api('/api/wishlist-window'),
		api('/api/wishlist-requests?all=true'),
		api('/api/wishlist-history'),
	]);
	const pending = requests.filter((r) => r.status === 'pending');
	const alerts = history.filter((h) => h.alert && !h.alert_seen_at);
	const characters = [
		...new Map(history.map((h) => [h.character_id, h.character_name])).entries(),
	].sort((a, b) => a[1].localeCompare(b[1], 'es'));
	const state = { character: '' };
	const stateLine =
		win.state === 'free'
			? 'Todavía no se ha abierto ningún plazo: cada uno edita su wishlist libremente.'
			: win.state === 'open'
				? `Abierto hasta el ${esc(when(win.closesAt))}.`
				: `Cerrado${win.closesAt ? ' desde el ' + esc(when(win.closesAt)) : ''}: solo se pueden quitar objetos; los cambios llegan como peticiones.`;
	const historyRows = () =>
		history
			.filter((h) => !state.character || h.character_id === state.character)
			.map(
				(h) =>
					/* HTML */ `<tr class="${h.alert ? 'has-alert' : ''}">
						<td>${esc(when(h.created_at))}</td>
						<td>
							${characterLink(h.character_id, esc(h.character_name))}<small class="cell-detail"
								>${esc(h.owner_name)}</small
							>
						</td>
						<td>
							${actions[h.action]}${h.action === 'changed' && h.before && h.after ? `<small class="cell-detail">${esc(changeDetail(h.before, h.after))}</small>` : ''}
						</td>
						<td>${esc(h.item)}</td>
						<td>${esc(slotName(h.slot))}</td>
						<td>
							${esc(h.actor_name)}${h.request_id ? '<small class="cell-detail">Petición aprobada</small>' : ''}
						</td>
						<td>${h.alert ? `<span class="error">${esc(h.alert)}</span>` : ''}</td>
					</tr>`,
			);
	function render() {
		host.innerHTML = /* HTML */ `<section class="section wish-admin">
				<h3>Plazo de wishlist</h3>
				<p class="notice">${stateLine}</p>
				<form id="wish-window-form" class="card form">
					<div class="form-grid">
						<label
							>Cierre del plazo (hora del dispositivo)
							<span class="required-mark" aria-hidden="true">*</span
							><input type="datetime-local" name="closesAt" required
						/></label>
						<label>Nota (por ejemplo, el tier)<input name="note" maxlength="200" /></label>
					</div>
					<button type="submit">
						${win.state === 'open' ? 'Cambiar el cierre' : 'Abrir plazo'}
					</button>
					${win.state === 'open' ? '<button type="button" class="secondary danger" id="wish-window-close">Cerrar ahora</button>' : ''}
				</form>
			</section>
			<section class="section">
				<h3>Peticiones fuera de plazo${pending.length ? ` (${pending.length} pendientes)` : ''}</h3>
				${
					requests.length
						? table(
								['Personaje', 'Petición', 'Motivo', 'Estado', ''],
								requests.map(
									(r) =>
										/* HTML */ `<tr class="${r.alert ? 'has-alert' : ''}">
											<td>
												${characterLink(r.character_id, esc(r.character_name))}<small
													class="cell-detail"
													>${esc(r.user_name)} · ${esc(when(r.created_at))}</small
												>
											</td>
											<td>
												${requestSummary(r, esc)}${r.alert ? `<small class="cell-detail error">${esc(r.alert)}</small>` : ''}
											</td>
											<td>${esc(r.reason) || '—'}</td>
											<td>
												${requestStates[r.status]}${r.decided_by_name ? `<small class="cell-detail">${esc(r.decided_by_name)}${r.decision_note ? ' · ' + esc(r.decision_note) : ''}</small>` : ''}
											</td>
											<td>
												${r.status === 'pending' ? `<button type="button" data-approve="${esc(r.id)}">Aprobar</button><button type="button" class="secondary danger" data-reject="${esc(r.id)}">Rechazar</button>` : ''}
											</td>
										</tr>`,
								),
							)
						: '<p class="muted">No hay peticiones.</p>'
				}
			</section>
			<section class="section">
				<h3>Avisos${alerts.length ? ` (${alerts.length})` : ''}</h3>
				<p>
					Cambios en huecos donde el jugador ya se llevó una pieza por wishlist (armas, anillos y
					abalorios cuentan como un solo hueco).
				</p>
				${
					alerts.length
						? `<ul class="wish-alerts">${alerts
								.map(
									(a) =>
										`<li><span><strong>${characterLink(a.character_id, esc(a.character_name))}</strong> · ${esc(when(a.created_at))}<br>${esc(a.alert)}</span><button type="button" class="secondary" data-seen="${esc(a.id)}">Revisado</button></li>`,
								)
								.join('')}</ul>`
						: '<p class="muted">No hay avisos sin revisar.</p>'
				}
			</section>
			<section class="section">
				<h3>Historial de cambios</h3>
				<label
					>Personaje<select id="wish-history-character">
						<option value="">Todos</option>
						${characters.map(([id, name]) => `<option value="${esc(id)}" ${id === state.character ? 'selected' : ''}>${esc(name)}</option>`).join('')}
					</select></label
				>
				${
					history.length
						? table(
								['Fecha', 'Personaje', 'Acción', 'Objeto', 'Hueco', 'Quién', 'Aviso'],
								historyRows(),
							)
						: '<p class="muted">Todavía no hay cambios registrados.</p>'
				}
			</section>`;
		bind();
	}
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
		host.querySelector('#wish-window-form').onsubmit = (e) => {
			e.preventDefault();
			const v = Object.fromEntries(new FormData(e.target));
			void run(
				() =>
					api('/api/wishlist-window', 'POST', {
						closesAt: new Date(v.closesAt).toISOString(),
						note: v.note,
					}),
				'Plazo de wishlist abierto',
			);
		};
		const close = host.querySelector('#wish-window-close');
		if (close)
			close.onclick = () => {
				if (
					confirm(
						'¿Cerrar el plazo de wishlist ahora? Desde ese momento solo se podrán quitar objetos.',
					)
				)
					void run(() => api('/api/wishlist-window/close', 'POST', {}), 'Plazo cerrado');
			};
		host.querySelectorAll('[data-approve]').forEach(
			(b) =>
				(b.onclick = () =>
					void run(
						() =>
							api(
								`/api/wishlist-requests/${encodeURIComponent(b.dataset.approve)}/decision`,
								'POST',
								{
									approve: true,
								},
							),
						'Petición aprobada y aplicada',
					)),
		);
		host.querySelectorAll('[data-reject]').forEach(
			(b) =>
				(b.onclick = () => {
					const note = prompt('Motivo del rechazo (lo verá el jugador):');
					if (note)
						void run(
							() =>
								api(
									`/api/wishlist-requests/${encodeURIComponent(b.dataset.reject)}/decision`,
									'POST',
									{
										approve: false,
										note,
									},
								),
							'Petición rechazada',
						);
				}),
		);
		host
			.querySelectorAll('[data-seen]')
			.forEach(
				(b) =>
					(b.onclick = () =>
						void run(() =>
							api(`/api/wishlist-alerts/${encodeURIComponent(b.dataset.seen)}/seen`, 'POST', {}),
						)),
			);
		host.querySelector('#wish-history-character').onchange = (e) => {
			state.character = e.target.value;
			render();
		};
	}
	render();
}

function changeDetail(before, after) {
	const parts = [];
	if (before.status !== after.status) parts.push(`${before.status} → ${after.status}`);
	if ((before.slot || '') !== (after.slot || ''))
		parts.push(`${slotName(before.slot)} → ${slotName(after.slot)}`);
	if (before.priority !== after.priority)
		parts.push(`prioridad ${before.priority} → ${after.priority}`);
	if (!!before.obtained !== !!after.obtained)
		parts.push(after.obtained ? 'marcado como conseguido' : 'desmarcado como conseguido');
	return parts.join(' · ');
}
