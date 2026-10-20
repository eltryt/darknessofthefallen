// Service worker: makes the site installable as an app, shows a themed page when
// there is no connection and keeps the code on the device. Pages, API responses
// and sessions are never cached, so members always see live data.
//
// Code and styles: every page response names the deploy it belongs to
// (X-App-Version). While it does not change, scripts and styles come from the
// device without asking the server; a new deploy drops them before the page that
// announced it requests any, so a deploy still shows at once and never mixes versions.
const CACHE = 'dotf-offline-v1';
const META = 'dotf-meta';
const CODE = 'dotf-code-';
const ICON = '/assets/app-icon-192.png';
let version = null;

async function currentVersion() {
	if (version) return version;
	const stored = await (await caches.open(META)).match('/__version');
	version = stored ? await stored.text() : null;
	return version;
}
async function useVersion(next) {
	if (next === (await currentVersion())) return;
	version = next;
	await (await caches.open(META)).put('/__version', new Response(next));
	const keys = await caches.keys();
	await Promise.all(
		keys.filter((k) => k.startsWith(CODE) && k !== CODE + next).map((k) => caches.delete(k)),
	);
}
const isCode = (url) =>
	url.origin === self.location.origin &&
	url.pathname !== '/sw.js' &&
	!url.search &&
	/\.(js|css)$/.test(url.pathname);
async function page(request) {
	try {
		const response = await fetch(request);
		const next = response.headers.get('X-App-Version');
		if (next) await useVersion(next);
		return response;
	} catch {
		return new Response(offlinePage, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
	}
}
async function code(request) {
	const current = await currentVersion();
	if (!current) return fetch(request);
	const cache = await caches.open(CODE + current);
	const hit = await cache.match(request);
	if (hit) return hit;
	const response = await fetch(request);
	// Only a complete answer for the deploy still in use is kept.
	if (response.status === 200 && current === version) await cache.put(request, response.clone());
	return response;
}

const offlinePage = `<!doctype html><html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Sin conexión · Darkness of the Fallen</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#101013;color:#f4f0f1;font-family:system-ui,sans-serif;text-align:center;padding:24px}
img{width:96px;height:96px;border-radius:20px}h1{font-family:Georgia,serif;font-weight:400;margin:20px 0 8px}
p{color:#b8b2ba;max-width:320px;margin:0 auto 24px;line-height:1.5}a{display:inline-block;padding:12px 22px;border-radius:6px;background:#8e2f45;color:#fff;text-decoration:none}</style>
</head><body><main><img src="${ICON}" alt=""><h1>Sin conexión</h1>
<p>No hay internet ahora mismo. Cuando vuelva la conexión, Azeroth seguirá aquí.</p>
<a href="">Reintentar</a></main></body></html>`;

self.addEventListener('install', (event) => {
	event.waitUntil(caches.open(CACHE).then((cache) => cache.add(ICON)));
	self.skipWaiting();
});

self.addEventListener('activate', (event) => {
	event.waitUntil(
		caches
			.keys()
			// A new worker starts with empty code caches; the deploy version is kept.
			.then((keys) =>
				Promise.all(keys.filter((k) => k !== CACHE && k !== META).map((k) => caches.delete(k))),
			)
			.then(() => self.clients.claim()),
	);
});

self.addEventListener('fetch', (event) => {
	const { request } = event;
	if (request.method !== 'GET') return;
	const url = new URL(request.url);
	if (request.mode === 'navigate') event.respondWith(page(request));
	else if (isCode(url)) event.respondWith(code(request));
	else if (url.pathname === ICON) {
		event.respondWith(caches.match(ICON).then((hit) => hit || fetch(request)));
	}
});

// App notifications for GM and officers (new applications, messages, incidents).
self.addEventListener('push', (event) => {
	let data = {};
	try {
		data = event.data ? event.data.json() : {};
	} catch {
		/* Malformed payload: show a generic notice. */
	}
	event.waitUntil(
		self.registration.showNotification(data.title || 'Darkness of the Fallen', {
			body: data.body || 'Tienes un aviso nuevo en el panel.',
			icon: ICON,
			badge: ICON,
			tag: data.tag,
			data: { url: data.url || '/panel' },
		}),
	);
});

self.addEventListener('notificationclick', (event) => {
	event.notification.close();
	const url = new URL(event.notification.data?.url || '/panel', self.location.origin).href;
	event.waitUntil(
		self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
			const open = windows.find((w) => new URL(w.url).origin === self.location.origin);
			if (open) return open.navigate(url).then((w) => (w || open).focus());
			return self.clients.openWindow(url);
		}),
	);
});
