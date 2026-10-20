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
// Global launch shown on the official site: 4 Nov 2026 15:00 PST, 00:00 on 5 Nov in Madrid.
export const FOREVER_LAUNCH = Date.parse('2026-11-04T23:00:00Z');
const LAUNCH_BANNER_DAYS = 7;
export function launchCountdown(now = Date.now(), launch = FOREVER_LAUNCH) {
	const total = Math.max(0, Math.floor((launch - now) / 1000));
	return {
		live: total === 0,
		expired: now >= launch + LAUNCH_BANNER_DAYS * 86400000,
		days: Math.floor(total / 86400),
		hours: Math.floor((total % 86400) / 3600),
		minutes: Math.floor((total % 3600) / 60),
		seconds: total % 60,
	};
}
export function mountLaunchCountdown(host) {
	if (!host) return;
	const units = Object.fromEntries(
		[...host.querySelectorAll('[data-unit]')].map((el) => [el.dataset.unit, el]),
	);
	const render = () => {
		const left = launchCountdown();
		if (!host.isConnected || left.expired) {
			clearInterval(timer);
			if (left.expired) host.remove();
			return;
		}
		if (left.live) {
			host.classList.add('is-live');
			host.querySelector('[data-launch-title]').textContent =
				'¡World of Warcraft: Forever ya está aquí!';
			host.querySelector('[data-launch-note]').textContent =
				'Nos vemos en Azeroth. Por la Alianza.';
			clearInterval(timer);
			return;
		}
		for (const unit of ['days', 'hours', 'minutes', 'seconds'])
			units[unit].textContent = String(left[unit]).padStart(2, '0');
	};
	const timer = setInterval(render, 1000);
	render();
}
// Easter egg: enough quick clicks on the title bring back the owner's old guild.
export const PACT_CLICKS = 7;
const PACT_GAP_MS = 1200;
export function countPactClick(state, now) {
	const clicks = now - state.last < PACT_GAP_MS ? state.clicks + 1 : 1;
	return { clicks, last: now, ready: clicks >= PACT_CLICKS };
}
function titleWord(h1) {
	// The animated title is split into words; the plain one starts with a text node.
	const split = h1.querySelector('.title-word');
	if (split) return split;
	const word = document.createElement('span');
	word.className = 'title-word';
	word.textContent = h1.firstChild.textContent.trim();
	h1.firstChild.replaceWith(word);
	return word;
}
function revealPact(h1) {
	const old = titleWord(h1),
		pact = document.createElement('span');
	pact.className = 'title-word pact-word';
	pact.setAttribute('aria-hidden', 'true');
	pact.textContent = 'Pact';
	h1.setAttribute('aria-label', 'Pact of the Fallen');
	h1.classList.add('pact-revealed');
	let swapped = false;
	const swap = () => {
		if (swapped) return;
		swapped = true;
		old.replaceWith(pact);
	};
	if (matchMedia('(prefers-reduced-motion: reduce)').matches) return swap();
	old.classList.add('pact-fall');
	// Letters bubble their own entrance animations; only the word's fall counts.
	old.addEventListener('animationend', (e) => e.target === old && swap());
	setTimeout(swap, 1400);
}
// After a while on the home page the old name starts bleeding through the title,
// and a whisper hints at how to wake it.
export const PACT_GLITCH_SECONDS = 300;
const PACT_HINT_KEY = 'dotf-pact-hint';
function showPactHint() {
	try {
		if (sessionStorage.getItem(PACT_HINT_KEY)) return null;
		sessionStorage.setItem(PACT_HINT_KEY, '1');
	} catch {}
	const hint = document.createElement('aside');
	hint.className = 'pact-hint';
	hint.setAttribute('role', 'status');
	hint.innerHTML =
		'<span class="eyebrow">Un susurro</span><p>«Darkness» no siempre se llamó así. Llama a su nombre una y otra vez, sin pausa… y quizá despierte lo que duerme debajo.</p><button type="button" class="secondary" data-pact-hint-close>Cerrar</button>';
	hint.querySelector('[data-pact-hint-close]').onclick = () => hint.remove();
	document.body.append(hint);
	setTimeout(() => hint.remove(), 45000);
	return hint;
}
function startPactGlitch(h1, isFound) {
	let seen = 0,
		hint = null;
	const timer = setInterval(() => {
		if (!h1.isConnected || isFound()) return clearInterval(timer);
		// Only time actually spent looking at the page counts.
		if (document.visibilityState !== 'visible') return;
		if (++seen < PACT_GLITCH_SECONDS) return;
		clearInterval(timer);
		const word = titleWord(h1);
		word.dataset.glitch = 'Pact';
		word.classList.add('pact-glitching');
		hint = showPactHint();
	}, 1000);
	return () => {
		clearInterval(timer);
		h1.querySelector('.pact-glitching')?.classList.remove('pact-glitching');
		hint?.remove();
	};
}
export function mountPactEgg(h1, { api, toast, me }) {
	if (!h1) return;
	let state = { clicks: 0, last: 0 },
		found = false;
	const stopGlitch = startPactGlitch(h1, () => found);
	h1.addEventListener('click', () => {
		if (found) return;
		state = countPactClick(state, Date.now());
		if (!state.ready) return;
		found = true;
		stopGlitch();
		revealPact(h1);
		if (!me?.user)
			return toast('Has despertado un viejo pacto. Entra con Discord para guardar este secreto.');
		if (!me.permissions?.includes('community.read')) return toast('Has despertado un viejo pacto.');
		api('/api/achievements/pact', 'POST', {})
			.then((r) =>
				toast(
					r.first
						? 'Logro secreto desbloqueado: Pacto de los Caídos.'
						: 'El pacto ya te reconoce: tienes este logro.',
				),
			)
			.catch(() => toast('Has despertado un viejo pacto, pero no se pudo guardar el logro.'));
	});
}
export async function mountHomeEvents(host, { api, esc }) {
	if (!host) return;
	if (document.body.dataset.showcase) {
		host.innerHTML = `<p>Consulta las convocatorias actualizadas en la web de la hermandad.</p><a class="button secondary" href="${esc(new URL('/raids', document.body.dataset.applicationUrl || 'https://darknessofthefallen.com').href)}">Ver convocatorias ↗</a>`;
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
