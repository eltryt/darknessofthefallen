// Run before the first paint. Without JavaScript, the server overview stays visible.
document.documentElement.classList.add('site-booting');
// A broken module or a stalled request must not hide useful public content forever.
window.setTimeout(() => document.documentElement.classList.remove('site-booting'), 8000);

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
	link.href = new URL(`assets/art/${art}.webp`, base).href;
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
