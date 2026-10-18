import { iconAssets } from '../public/icon-assets.js';
import { mkdirSync, readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { defaults } from '../src/database-core.mjs';

// Only approved public defaults and public assets: never export a database or sessions.
const destination = resolve(process.argv[2] || 'dist/showcase');
const memberApp = process.env.MEMBER_APP_URL || '';
if (memberApp) {
	const url = new URL(memberApp);
	if (url.protocol !== 'https:' || url.origin !== memberApp || url.username || url.password)
		throw Error('MEMBER_APP_URL must be an HTTPS origin without a path.');
}
mkdirSync(join(destination, 'assets/icons/spec'), { recursive: true });
mkdirSync(join(destination, 'assets/art'), { recursive: true });
mkdirSync(join(destination, 'assets/partners'), { recursive: true });
mkdirSync(join(destination, 'assets/portraits'), { recursive: true });
const source = new URL('../public/', import.meta.url);
for (const file of [
	'theme.css',
	'assets/night-sanctum.svg',
	'assets/art/castle.webp',
	'assets/art/strategy.webp',
	'assets/art/tavern.webp',
	'assets/art/recruiting.webp',
	'assets/art/castle-journey.webp',
	'assets/art/castle-overlook.webp',
	'assets/art/raid-expedition.webp',
	'assets/art/resting-camp.webp',
	'assets/art/ironforge-gates.webp',
	'assets/art/guild-army.webp',

	'assets/art/onyxia.webp',
	'assets/art/war-room.webp',
	'assets/art/raid-journey.webp',
	'assets/art/campfire.webp',
	'assets/art/heroes.webp',
	'assets/art/landscape.webp',
	'assets/partners/restedxp-leaderboard.webp',

	'guild-showcase.js',
	'boot-state.js',
	'manual-roster-ui.js',
	'analytics.js',
	'home-events.js',
	'roster-ui.js',
	'wishlist-ui.js',
	'sheet-parts.js',
	'my-callups.js',
	'profile-tour.js',
	'motion.js',
	'medals.js',
	'encounter-catalog.js',
	'gm-ui.js',
	'public-views.js',
	'public-layout.js',
	'profile-view.js',
	'panel-view.js',
	'raid-events-ui.js',
	'recruitment-ui.js',
	'schedule.js',
	'schedule-ui.js',
	'style.css',
	'character-editor.js',
	'paperdoll.js',
	'lineup-board.js',
	'raid-buffs.js',
	'armory-catalog.js',
	'armory-view.js',
	'armory-admin-ui.js',
	'operations-ui.js',
	'components.js',
	'specs.js',
	...iconAssets,
	'assets/guild-logo.png',
	'assets/guild-logo.webp',
	'assets/guild-logo-128.webp',
	'assets/guild-logo-320.webp',
	'assets/og-image.jpg',
	'assets/favicon-32.png',
	'assets/favicon-48.png',
	'assets/favicon-96.png',
	'assets/favicon-144.png',
	'favicon.ico',
	'assets/apple-touch-icon.png',
	'assets/app-icon-192.png',
	'assets/app-icon-512.png',
	'site.webmanifest',
]) {
	if (file.endsWith('.js') && memberApp) {
		const code = readFileSync(new URL(file, source), 'utf8').replaceAll(
			'href="/reclutamiento"',
			`href="${memberApp}/reclutamiento"`,
		);
		writeFileSync(join(destination, file), code);
	} else copyFileSync(new URL(file, source), join(destination, file));
}
let app = readFileSync(new URL('app.js', source), 'utf8');
const start = app.indexOf('async function api('),
	end = app.indexOf('\nfunction field(', start);
if (start < 0 || end < 0)
	throw Error('Public application structure changed; review showcase export.');
app =
	app.slice(0, start) +
	`async function api(path,method='GET'){if(method==='GET'&&path==='/api/public'){const response=await fetch('/site-data.json');if(!response.ok)throw Error('No se pudo cargar la presentación.');return response.json();}if(method==='GET'&&path==='/api/me')return {user:null,permissions:[]};throw Error('El área de miembros estará disponible cuando se active el acceso con Discord.');}\n` +
	app.slice(end);
if (memberApp) app = app.replaceAll('href="/reclutamiento"', `href="${memberApp}/reclutamiento"`);
writeFileSync(join(destination, 'app.js'), app);
writeFileSync(
	join(destination, 'site-data.json'),
	JSON.stringify({
		settings: defaults,
		characters: [],
		raids: [],
		progress: [],
		authConfigured: false,
	}),
);
let html = readFileSync(new URL('index.html', source), 'utf8');
html = html.replace(
	/<main\b/,
	'<aside class="showcase-notice">Versión de presentación · El acceso de miembros con Discord estará disponible próximamente.</aside><main',
);
if (memberApp)
	html = html
		.replace('<body>', `<body data-application-url="${memberApp}/reclutamiento">`)
		.replaceAll('href="/reclutamiento"', `href="${memberApp}/reclutamiento"`)
		.replaceAll('href="/login"', `href="${memberApp}/login"`)
		.replace(
			'Versión de presentación · El acceso de miembros con Discord estará disponible próximamente.',
			`Visita la aplicación de la hermandad para consultar los datos actuales. <a href="${memberApp}/login">Abrir el área de miembros</a>`,
		);
html = html.replace('<body', '<body data-showcase="true"');
html = html.replace('</head>', '<meta name="robots" content="noindex,follow"></head>');
const origin = memberApp || 'https://darknessofthefallen.com';
const escapeMeta = (value) =>
	String(value).replace(
		/[&<>"]/g,
		(c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c],
	);
const description = escapeMeta(
	`Hermandad ${defaults.faction} de WoW Forever en servidor ${defaults.ruleset}. Raids ${defaults.raidDays.join(', ')}, ${defaults.raidStart}–${defaults.raidEnd}, hora de Madrid.`,
);
const titles = {
	'': 'Inicio',
	nosotros: 'Hermandad',
	progreso: 'Progreso PvE',
	roster: 'Roster',
	raids: 'Raids',
	reclutamiento: 'Reclutamiento',
	contacto: 'Contacto',
	login: 'Entrar con Discord',
};
for (const [route, label] of Object.entries(titles)) {
	const title = label + ' · Darkness of the Fallen',
		url = origin + (route ? '/' + route : '/');
	const meta = `<link rel="canonical" href="${url}"><meta property="og:type" content="website"><meta property="og:site_name" content="Darkness of the Fallen"><meta property="og:title" content="${title}"><meta property="og:description" content="${description}"><meta property="og:url" content="${url}"><meta property="og:image" content="${origin}/assets/og-image.jpg"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta property="og:image:alt" content="Emblema de Darkness of the Fallen y aventureros ante una fortaleza"><meta name="twitter:card" content="summary_large_image">`;
	const page = html
		.replace('<title>Darkness of the Fallen</title>', `<title>${title}</title>`)
		.replace('</head>', meta + '</head>');
	mkdirSync(join(destination, route), { recursive: true });
	writeFileSync(join(destination, route, 'index.html'), page);
}
console.log('Public showcase exported without private data: ' + destination);
