// Only consume events already filtered by the server for the current visitor.
export function upcomingEvents(events, now = Date.now()) {
	return events
		.filter((event) => event.state === 'Abierta' && Date.parse(event.starts_at) > now)
		.sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at))
		.slice(0, 3);
}
export function eventDate(value) {
	return new Intl.DateTimeFormat('es-ES', {
		timeZone: 'Europe/Madrid',
		dateStyle: 'medium',
		timeStyle: 'short',
	}).format(new Date(value));
}
export async function mountHomeEvents(host, { api, esc }) {
	if (!host) return;
	if (document.body.dataset.showcase) {
		host.innerHTML = `<p>Consulta las convocatorias actualizadas en la web de la hermandad.</p><a class="button secondary" href="${esc(new URL('/raids', document.body.dataset.applicationUrl || 'https://darknessofthefallen.eltryt-darknessofthefallen.workers.dev').href)}">Ver convocatorias ↗</a>`;
		return;
	}
	async function load() {
		host.setAttribute('aria-busy', 'true');
		host.innerHTML = '<p role="status">Cargando próximas convocatorias…</p>';
		try {
			const result = await api('/api/events');
			if (!Array.isArray(result.events)) throw new Error('Invalid event list');
			const events = upcomingEvents(result.events);
			host.innerHTML = events.length
				? `<div class="grid home-events-grid">${events.map((event) => `<article class="card"><span class="eyebrow">${esc(event.category)} · ${esc(event.state)}</span><h3>${esc(event.title)}</h3><p><time datetime="${esc(event.starts_at)}">${esc(eventDate(event.starts_at))}</time> · hora peninsular</p><p>${esc(event.roster)}</p>${Number.isInteger(event.occupied) && Number.isInteger(event.capacity) ? `<p>${event.occupied} / ${event.capacity} plazas ocupadas</p>` : ''}<a href="/raids">Ver convocatorias →</a></article>`).join('')}</div>`
				: '<p role="status">No hay próximas convocatorias abiertas disponibles para ti.</p><a href="/raids">Consultar el calendario →</a>';
		} catch {
			host.innerHTML =
				'<p role="status">No se pudieron cargar las convocatorias. Puedes volver a intentarlo.</p><button type="button" class="secondary" data-home-retry>Reintentar</button>';
			host.querySelector('[data-home-retry]').onclick = load;
		} finally {
			host.setAttribute('aria-busy', 'false');
		}
	}
	await load();
}
