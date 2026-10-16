// Guided tour of Mi perfil. It only starts from its button, moves between the
// profile sections by itself, and can go back, skip ahead or close at any step.
const steps = [
	{
		target: '.hub-hero',
		title: 'Tu espacio en la hermandad',
		text: 'Aquí ves tu rango, tu asistencia registrada y cuántos personajes tienes. Todo lo de este perfil es tuyo y solo tú lo editas.',
	},
	{
		target: '.hub-chars',
		title: 'Elige personaje',
		text: 'Cada sección muestra el personaje seleccionado. Se marca si es Main o Alter, y la web lo recuerda aunque recargues.',
	},
	{
		target: '.hub-nav',
		title: 'Las cinco secciones',
		text: 'Armería, Personajes, Wishlist / BiS, Botín y Convocatorias. Todo está a un clic desde aquí.',
	},
	{
		section: 'armeria',
		target: '.paperdoll .doll-stage',
		title: 'Tu equipo',
		text: 'Pulsa cualquier hueco para ver el objeto. Como aún no hay un catálogo oficial de WoW Forever, lo registras tú a mano.',
	},
	{
		section: 'armeria',
		target: '[data-armory-mode]',
		closest: '.hub-segment',
		title: 'Equipo actual u objetivo BiS',
		text: 'Cambia entre lo que llevas puesto y los objetos que marcaste como BiS en tu wishlist, hueco por hueco.',
	},
	{
		section: 'armeria',
		target: '.hub-sheet',
		title: 'Datos de la ficha',
		text: 'Reino, raza, nivel y especializaciones. Despliégalo para ver lo que falta y editarlo.',
	},
	{
		section: 'armeria',
		target: '.hub-guides',
		title: 'Guías comprobadas',
		text: 'Enlaces a guías de tu clase y especialización que la hermandad ha revisado. Se abren en su web original.',
	},
	{
		section: 'personajes',
		target: '.hub-char-grid, .hub-section-head',
		title: 'Tus personajes',
		text: 'Main y Alters en tarjetas. El botón de ajustes permite editar datos, marcar un Main o archivar sin perder el historial.',
	},
	{
		section: 'personajes',
		target: '.hub-new',
		title: 'Añadir personaje',
		text: 'Registra un personaje nuevo. Se incorpora al roster de la hermandad automáticamente.',
	},
	{
		section: 'wishlist',
		target: '.raid-tabs, .wishlist-heading',
		title: 'Wishlist por raid',
		text: 'Elige la raid y verás sus jefes con el botín conocido por la hermandad.',
	},
	{
		section: 'wishlist',
		target: '.wish-states, .boss-card',
		closest: '.wish-row, .boss-card',
		title: 'BiS, Me interesa o Pasar',
		text: 'Marca cada objeto con un toque. Es tu prioridad personal: ayuda al consejo, pero no asigna el botín.',
	},
	{
		section: 'wishlist',
		target: '.wish-filters',
		title: 'Filtros rápidos',
		text: 'Muestra solo lo que has seleccionado, solo tus BiS o lo que has decidido pasar.',
	},
	{
		section: 'botin',
		target: '.loot-council',
		title: 'Consejo de botín',
		text: 'Quién decide el reparto ahora mismo. Si tienes una duda, envíala desde «¿Dudas sobre el botín?».',
	},
	{
		section: 'botin',
		target: '.loot-history',
		title: 'Historial de botín',
		text: 'Todo lo que se ha repartido, con fecha, jefe y método.',
	},
	{
		section: 'convocatorias',
		target: '.callup-facts, .hub-section-head',
		closest: '.callup-card',
		title: 'Tus convocatorias',
		text: 'Cada raid separa tres datos: tu inscripción en Raid-Helper, tu plaza en la alineación y la asistencia registrada.',
	},
	{
		section: 'convocatorias',
		target: '.callup-help',
		title: '¿Dudas con los estados?',
		text: 'Despliega esta ayuda cuando quieras. Y si los responsables planifican jefe a jefe, aquí verás si entras en cada uno.',
	},
	{
		section: 'logros',
		target: '.ach-grid',
		closest: '.ach-group',
		title: 'Tus medallas',
		text: 'Se consiguen solas con lo que registra la hermandad: asistencia, primeras victorias, convocatorias y tu ficha. Bronce, plata y oro suman puntos para la clasificación.',
	},
	{
		target: '[data-tour-start]',
		title: '¡Listo!',
		text: 'Puedes repetir esta guía cuando quieras desde este botón.',
	},
];
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const visible = (el) => {
	if (!el) return false;
	const r = el.getBoundingClientRect();
	return r.width > 0 && r.height > 0;
};

export function startProfileTour() {
	if (document.querySelector('.tour')) return;
	const startHash = location.hash;
	let index = 0,
		target = null,
		token = 0;
	const root = document.createElement('div');
	root.className = 'tour';
	root.innerHTML = /* HTML */ `<div class="tour-blocker"></div>
		<div class="tour-spot" aria-hidden="true"></div>
		<section
			class="tour-pop"
			role="dialog"
			aria-modal="true"
			aria-labelledby="tour-title"
			aria-describedby="tour-text"
		>
			<header>
				<span class="tour-count" aria-live="polite"></span>
				<button type="button" class="tour-close" data-tour="close" aria-label="Cerrar la guía">
					×
				</button>
			</header>
			<h2 id="tour-title"></h2>
			<p id="tour-text"></p>
			<div class="tour-dots" role="group" aria-label="Ir a un paso"></div>
			<footer>
				<button type="button" class="secondary" data-tour="back">← Atrás</button>
				<button type="button" class="tour-skip" data-tour="skip">Saltar sección</button>
				<button type="button" data-tour="next">Siguiente →</button>
			</footer>
		</section>`;
	document.body.append(root);
	document.body.classList.add('tour-open');
	const spot = root.querySelector('.tour-spot'),
		pop = root.querySelector('.tour-pop'),
		opener = document.activeElement;

	function place() {
		if (!target || !target.isConnected) return;
		const r = target.getBoundingClientRect(),
			pad = 8;
		Object.assign(spot.style, {
			top: `${r.top - pad}px`,
			left: `${r.left - pad}px`,
			width: `${r.width + pad * 2}px`,
			height: `${r.height + pad * 2}px`,
		});
		const vw = innerWidth,
			vh = innerHeight;
		if (vw < 640) {
			// Phones: a bottom sheet, moved to the top when the target sits low.
			pop.dataset.dock = r.top + r.height / 2 > vh * 0.55 ? 'top' : 'bottom';
			pop.style.top = pop.style.left = '';
			return;
		}
		delete pop.dataset.dock;
		const pw = pop.offsetWidth,
			ph = pop.offsetHeight,
			gap = 18;
		let top =
			r.bottom + gap + ph < vh
				? r.bottom + gap
				: r.top - gap - ph > 0
					? r.top - gap - ph
					: vh - ph - 16;
		let left = Math.min(Math.max(16, r.left + r.width / 2 - pw / 2), vw - pw - 16);
		// Targets taller than the screen: pin the window to the bottom-right corner.
		if (r.height > vh * 0.7) {
			top = vh - ph - 16;
			left = vw - pw - 24;
		}
		if (top < 16) top = 16;
		pop.style.top = `${top}px`;
		pop.style.left = `${left}px`;
	}
	// Smooth scrolling has no end event everywhere: wait until the page stops moving.
	async function settled() {
		let last = -1,
			still = 0;
		for (let i = 0; i < 40 && still < 3; i++) {
			await new Promise((r) => requestAnimationFrame(r));
			const now = Math.round(scrollY);
			still = now === last ? still + 1 : 0;
			last = now;
		}
	}
	async function locate(step) {
		if (step.section && location.hash.slice(1) !== step.section) location.hash = step.section;
		// Sections load their data first; wait for the element instead of guessing.
		for (let i = 0; i < 40; i++) {
			// Selectors are alternatives in order of preference, not document order.
			const el = step.target
				.split(',')
				.map((sel) => [...document.querySelectorAll(sel.trim())].find(visible))
				.find(Boolean);
			if (el && !document.querySelector('#hub-body .hub-skeleton'))
				return step.closest ? el.closest(step.closest) || el : el;
			await sleep(100);
		}
		return null;
	}
	async function go(next, direction = 1) {
		const mine = ++token;
		if (next < 0) return;
		if (next >= steps.length) return close();
		pop.classList.add('is-moving');
		const step = steps[next],
			el = await locate(step);
		if (mine !== token) return;
		if (!el) {
			// The element does not exist for this player (no characters, no call-ups…).
			const after = next + direction;
			return after < 0 ? go(next + 1, 1) : go(after, direction);
		}
		index = next;
		target = el;
		el.scrollIntoView({
			block: el.getBoundingClientRect().height > innerHeight * 0.7 ? 'start' : 'center',
			behavior: reduced() ? 'auto' : 'smooth',
		});
		await settled();
		if (mine !== token) return;
		root.querySelector('.tour-count').textContent = `Paso ${index + 1} de ${steps.length}`;
		root.querySelector('#tour-title').textContent = step.title;
		root.querySelector('#tour-text').textContent = step.text;
		root.querySelector('.tour-dots').innerHTML = steps
			.map(
				(s, i) =>
					`<button type="button" data-tour-go="${i}" aria-label="Paso ${i + 1}: ${s.title}" ${i === index ? 'aria-current="step"' : ''}></button>`,
			)
			.join('');
		root.querySelector('[data-tour="back"]').disabled = index === 0;
		root.querySelector('[data-tour="skip"]').hidden = index === steps.length - 1;
		root.querySelector('[data-tour="next"]').textContent =
			index === steps.length - 1 ? 'Terminar' : 'Siguiente →';
		place();
		pop.classList.remove('is-moving');
		root.querySelector('[data-tour="next"]').focus({ preventScroll: true });
	}
	// First step of the following section (or the last step).
	function nextSection() {
		const here = steps[index].section || 'inicio';
		const i = steps.findIndex((s, n) => n > index && (s.section || 'inicio') !== here);
		return i === -1 ? steps.length - 1 : i;
	}
	function close() {
		token++;
		resized.disconnect();
		removeEventListener('resize', place);
		removeEventListener('scroll', place, true);
		document.removeEventListener('keydown', keys, true);
		root.classList.add('is-leaving');
		document.body.classList.remove('tour-open');
		setTimeout(() => root.remove(), reduced() ? 0 : 220);
		try {
			localStorage.setItem('profile-tour-seen', '1');
		} catch {
			/* storage unavailable */
		}
		if (location.hash !== startHash && startHash) location.hash = startHash;
		opener?.focus?.({ preventScroll: true });
	}
	function keys(e) {
		if (e.key === 'Escape') {
			e.preventDefault();
			close();
		} else if (e.key === 'ArrowRight') void go(index + 1, 1);
		else if (e.key === 'ArrowLeft') void go(index - 1, -1);
		else if (e.key === 'Tab') {
			// Keep keyboard focus inside the tour window.
			const items = [...pop.querySelectorAll('button:not([disabled]):not([hidden])')];
			const first = items[0],
				last = items.at(-1);
			if (e.shiftKey && document.activeElement === first) {
				e.preventDefault();
				last.focus();
			} else if (!e.shiftKey && document.activeElement === last) {
				e.preventDefault();
				first.focus();
			}
		}
	}
	root.addEventListener('click', (e) => {
		const action = e.target.closest('[data-tour]')?.dataset.tour,
			jump = e.target.closest('[data-tour-go]')?.dataset.tourGo;
		if (action === 'close') close();
		if (action === 'back') void go(index - 1, -1);
		if (action === 'next') void go(index + 1, 1);
		if (action === 'skip') void go(nextSection(), 1);
		if (jump !== undefined) void go(Number(jump), Number(jump) >= index ? 1 : -1);
	});
	addEventListener('resize', place);
	addEventListener('scroll', place, true);
	// Sections keep loading after the step starts; follow layout changes too.
	const resized = new ResizeObserver(() => place());
	resized.observe(document.body);
	document.addEventListener('keydown', keys, true);
	requestAnimationFrame(() => root.classList.add('is-on'));
	void go(0);
}
