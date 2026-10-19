// Minimal service worker: makes the site installable as an app and shows a
// themed page when there is no connection. Pages, API responses and sessions are
// never cached, so members always see live data and a deploy shows at once.
const CACHE = 'dotf-offline-v1';
const ICON = '/assets/app-icon-192.png';

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
			.then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
			.then(() => self.clients.claim()),
	);
});

self.addEventListener('fetch', (event) => {
	const { request } = event;
	if (request.method !== 'GET') return;
	if (request.mode === 'navigate') {
		event.respondWith(
			fetch(request).catch(
				() =>
					new Response(offlinePage, {
						headers: { 'Content-Type': 'text/html; charset=utf-8' },
					}),
			),
		);
	} else if (new URL(request.url).pathname === ICON) {
		event.respondWith(caches.match(ICON).then((hit) => hit || fetch(request)));
	}
});
