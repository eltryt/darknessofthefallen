// Run before the first paint. Without JavaScript, the server overview stays visible.
document.documentElement.classList.add('site-booting');
// A broken module or a stalled request must not hide useful public content forever.
window.setTimeout(() => document.documentElement.classList.remove('site-booting'), 8000);

// Every page starts from the guild data and the session. Ask for both now, while
// the modules load, instead of after them; api() in app.js takes each one once.
window.dotfPrefetch = {};
for (const path of ['/api/public', '/api/me']) {
	const response = fetch(path, { headers: { 'Content-Type': 'application/json' } });
	response.catch(() => {});
	window.dotfPrefetch[path] = response;
}

// Home: the cinematic intro plays once per browser session and doubles as the
// loading screen. It is built here, before the modules load, so it shows from the
// first frame even on a slow phone: the emblem lights up, the curtain stays closed
// while the site loads and opens once it is ready. A click or key skips it.
(() => {
	const home = location.pathname.replace(/\/+$/, '').split('/').pop() === '';
	if (!home || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
	try {
		if (sessionStorage.getItem('dotf-intro')) return;
		sessionStorage.setItem('dotf-intro', '1');
	} catch {
		return;
	}
	const root = document.documentElement;
	const started = Date.now();
	// The emblem and name need this long to appear; a stalled load never traps the page.
	const MIN_MS = 1600,
		MAX_MS = 9000;
	// Covers the page until the body exists and the intro is built.
	root.classList.add('intro-pending');
	const logo = new URL('assets/guild-logo-320.webp', document.currentScript?.src || location.href)
		.href;
	const link = document.createElement('link');
	link.rel = 'preload';
	link.as = 'image';
	link.href = logo;
	document.head.append(link);

	const build = () => {
		// Delays the hero's entrance until the curtain has opened.
		root.style.setProperty('--intro', '1.75s');
		const intro = document.createElement('div');
		intro.className = 'intro';
		intro.setAttribute('aria-hidden', 'true');
		intro.innerHTML = `<div class="intro-panel intro-top"></div>
			<div class="intro-panel intro-bottom"></div>
			<div class="intro-core">
				<span class="intro-glow"></span>
				<img src="${logo}" alt="" width="320" height="320" />
				<span class="intro-line"></span>
				<p class="intro-name">Darkness of the Fallen</p>
				<p class="intro-tag">WoW Forever · Alianza</p>
			</div>`;
		document.body.append(intro);
		root.classList.remove('intro-pending');
		root.classList.add('intro-playing');
		let opened = false,
			done = false;
		const finish = () => {
			if (done) return;
			done = true;
			root.classList.remove('intro-playing');
			intro.remove();
			removeEventListener('keydown', skip, true);
		};
		const open = (fast = false) => {
			if (opened) return;
			opened = true;
			observer.disconnect();
			// After a slow load the hero was drawn behind the curtain just now: enter sooner.
			if (!fast && Date.now() - started > MIN_MS + 400) root.style.setProperty('--intro', '0.9s');
			intro.classList.add('is-opening');
			setTimeout(finish, fast ? 450 : 1100);
		};
		const skip = () => {
			if (intro.classList.contains('is-skipping')) return;
			intro.classList.add('is-skipping');
			root.style.setProperty('--intro', '0.2s');
			open(true);
		};
		// app.js removes site-booting once the page is drawn (or boot gives up after 8s).
		const tryOpen = () => {
			if (!root.classList.contains('site-booting') && Date.now() - started >= MIN_MS) open();
		};
		const observer = new MutationObserver(tryOpen);
		observer.observe(root, { attributes: true, attributeFilter: ['class'] });
		setTimeout(tryOpen, MIN_MS);
		setTimeout(() => open(), MAX_MS);
		intro.addEventListener('click', skip);
		addEventListener('keydown', skip, true);
	};
	// The body exists once parsing ends, before the module scripts run.
	if (document.body) build();
	else
		document.addEventListener('readystatechange', function ready() {
			if (!document.body) return;
			document.removeEventListener('readystatechange', ready);
			build();
		});
})();

// The main illustration of each page lives in the CSS, so the browser would only
// ask for it after drawing the text. Request it now, and fade it in once it is here.
(() => {
	const root = document.documentElement;
	const base = document.currentScript?.src || location.href;
	const page = location.pathname.replace(/\/+$/, '').split('/').pop() || '';
	const art = {
		'': 'castle',
		nosotros: 'tavern',
		raids: 'raid-journey',
		roster: 'war-room',
		progreso: 'raid-expedition',
		reclutamiento: 'recruiting',
		contacto: 'tavern',
		perfil: 'campfire',
		panel: 'war-room',
		armeria: 'war-room',
	}[page];
	const ready = () => root.classList.add('hero-art-ready');
	if (!art) return ready();
	const link = document.createElement('link');
	link.rel = 'preload';
	link.as = 'image';
	link.type = 'image/webp';
	link.setAttribute('fetchpriority', 'high');
	// Phones get the lighter version, as theme.css does (same query as public/art-variants.js).
	const phone = matchMedia('(max-width: 600px)').matches;
	link.href = new URL(`assets/art/${art}${phone ? '-m' : ''}.webp`, base).href;
	link.onload = link.onerror = ready;
	document.head.append(link);
	// Never keep the illustration hidden if the network is slow.
	window.setTimeout(ready, 2500);
})();

// Large images marked with .fade-in appear softly instead of popping in.
document.addEventListener(
	'load',
	(e) => e.target.classList?.contains('fade-in') && e.target.classList.add('is-loaded'),
	true,
);
document.addEventListener(
	'error',
	(e) => e.target.classList?.contains('fade-in') && e.target.classList.add('is-loaded'),
	true,
);
