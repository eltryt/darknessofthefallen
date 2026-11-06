// Panel → Auditoría: who did what, by name and in words, with the detail of each entry.
// "Fallos" shows only what went wrong (failed Discord sign-ins, Battle.net errors).
const actions = {
	'auth.discord_failed': 'No pudo entrar con Discord',
	'character.battlenet_import': 'Importó personajes de Battle.net',
	'character.battlenet_sync': 'Actualización automática de Battle.net',
	'character.created': 'Creó un personaje',
	'character.updated': 'Editó un personaje',
	'character.main': 'Cambió su personaje principal',
	'application.created': 'Nueva candidatura',
	'application.updated': 'Revisó una candidatura',
	'application.deleted': 'Borró una candidatura',
	'raid.lineup.saved': 'Guardó una alineación',
	'raid.lineup.sent': 'Envió las convocatorias',
	'raid.bosses.saved': 'Guardó el plan de jefes',
	'raid.deleted': 'Borró una convocatoria',
	'raid.sync.completed': 'Sincronizó las convocatorias',
	'roster.imported': 'Importó el roster',
	'roster.character.restored': 'Recuperó un personaje del roster',
	'roster.character.archived': 'Archivó un personaje del roster',
	'roster.character.updated': 'Editó un personaje del roster',
	'roster.manual.created': 'Añadió un miembro a mano',
	'roster.manual.updated': 'Editó un miembro añadido a mano',
	'roster.manual.archived': 'Archivó un miembro añadido a mano',
	'member.removed': 'Sacó a un miembro de la hermandad',
	'attendance.updated': 'Registró asistencia',
	'attendance.deleted': 'Borró una asistencia',
	'settings.updated': 'Cambió la configuración',
	'data.exported': 'Descargó la exportación',
	'data.restored': 'Restauró una copia',
	'message.created': 'Envió un mensaje',
	'push.subscribed': 'Activó los avisos',
	'push.unsubscribed': 'Desactivó los avisos',
	'roulette.opened': 'Abrió una mesa de ruleta',
	'roulette.spun': 'Tiró en la ruleta',
	'roulette.cancelled': 'Canceló una mesa de ruleta',
	'roulette.deleted': 'Borró una tirada de ruleta',
	'roulette.rematch': 'Abrió otra ronda de ruleta',
};
const actors = {
	'battlenet:sync': 'Web · Battle.net',
	'login:discord': 'Intento de entrada',
};
const reasons = {
	not_in_guild: 'su cuenta de Discord no está en el servidor de la hermandad',
	rate_limited: 'Discord pidió esperar (demasiados intentos)',
	cancelled: 'canceló la autorización en Discord',
	browser: 'empezó en un navegador y terminó en otro (app de Discord)',
	state: 'la autorización no correspondía a su intento',
	expired: 'la autorización caducó o ya se había usado',
	token: 'Discord no completó la autorización',
	profile: 'Discord no dio su perfil',
	member: 'Discord no confirmó que esté en el servidor',
};
const filters = [
	['', 'Todo'],
	['failed', 'Fallos'],
	['login', 'Entradas con Discord'],
	['battlenet', 'Battle.net'],
];

function detail(r) {
	let c = {};
	try {
		c = JSON.parse(r.changes || '{}') || {};
	} catch {}
	if (r.action === 'auth.discord_failed')
		return [c.name && `Cuenta «${c.name}»`, reasons[c.reason] || c.reason]
			.filter(Boolean)
			.join(': ');
	if (r.action === 'character.battlenet_import')
		return `${c.added ?? 0} nuevos, ${c.updated ?? 0} actualizados, ${c.skipped ?? 0} omitidos`;
	if (r.action === 'character.battlenet_sync')
		return c.error
			? `Error: ${c.error}`
			: `${c.checked ?? 0} revisados, ${c.updated ?? 0} actualizados, ${c.missing ?? 0} sin ficha en Blizzard`;
	const keys = Object.keys(c);
	// Other entries: their values when short, otherwise the fields that changed.
	return keys
		.slice(0, 6)
		.map((k) =>
			['string', 'number', 'boolean'].includes(typeof c[k]) && String(c[k]).length <= 40
				? `${k}: ${c[k]}`
				: k,
		)
		.join(', ');
}
const when = (iso) => {
	const d = new Date(iso);
	return Number.isNaN(d.getTime())
		? iso
		: d.toLocaleString('es-ES', {
				timeZone: 'Europe/Madrid',
				day: '2-digit',
				month: '2-digit',
				hour: '2-digit',
				minute: '2-digit',
				second: '2-digit',
			});
};

export async function auditTab(el, { api, esc, table }, state = { kind: '', q: '' }) {
	const params = new URLSearchParams();
	if (state.kind) params.set('kind', state.kind);
	if (state.q) params.set('q', state.q);
	const rows = await api('/api/audit' + (params.size ? `?${params}` : ''));
	el.innerHTML = /* HTML */ `<form class="audit-filters">
			<div class="audit-kinds" role="group" aria-label="Filtrar">
				${filters
					.map(
						([k, label]) =>
							`<button type="button" class="button ${state.kind === k ? '' : 'secondary'}" data-kind="${k}" aria-pressed="${state.kind === k}">${label}</button>`,
					)
					.join('')}
			</div>
			<input
				name="q"
				type="search"
				value="${esc(state.q)}"
				placeholder="Buscar por nombre o personaje…"
				aria-label="Buscar en la auditoría"
			/>
		</form>
		${
			rows.length
				? table(
						['Fecha', 'Quién', 'Qué', 'Sobre', 'Detalle'],
						rows.map(
							(r) =>
								/* HTML */ `<tr
									class="${/failed/.test(r.action) || (r.action === 'character.battlenet_sync' && /"error"/.test(r.changes || '')) ? 'audit-failed' : ''}"
								>
									<td><time datetime="${esc(r.created_at)}">${esc(when(r.created_at))}</time></td>
									<td title="${esc(r.actor_id)}">
										${esc(r.actor_name || actors[r.actor_id] || r.actor_id)}
									</td>
									<td title="${esc(r.action)}">${esc(actions[r.action] || r.action)}</td>
									<td title="${esc(r.target)}">
										${esc(r.target_name || (r.target === r.actor_id || r.target === 'characters' ? '—' : r.target))}
									</td>
									<td>${esc(detail(r))}</td>
								</tr>`,
						),
					)
				: '<p class="notice">No hay entradas con este filtro.</p>'
		}`;
	const form = el.querySelector('.audit-filters');
	form.addEventListener('click', (e) => {
		const k = e.target.closest('[data-kind]');
		if (k) auditTab(el, { api, esc, table }, { ...state, kind: k.dataset.kind });
	});
	form.addEventListener('submit', (e) => {
		e.preventDefault();
		auditTab(el, { api, esc, table }, { ...state, q: form.elements.q.value.trim() });
	});
}
