// Titles stay under ~60 characters and descriptions around 150, with the terms
// people search for: hermandad/guild, española, WoW Forever, Alianza, raids.
export const seoPages = {
	'/': [
		'Darkness of the Fallen · Hermandad española de WoW Forever',
		'Guild española de la Alianza en WoW Forever, servidor PvP. Raids de noche entre semana, progresión en equipo y buen ambiente. Conócenos y únete.',
		'Inicio',
	],
	'/nosotros': [
		'La hermandad · Darkness of the Fallen · WoW Forever',
		'Quiénes somos: una hermandad española de WoW Forever con compañerismo, progresión en equipo y una organización transparente de raids y botín.',
		'La hermandad',
	],
	'/raids': [
		'Raids y horarios · Darkness of the Fallen · WoW Forever',
		'Horarios de raid y convocatorias públicas de Darkness of the Fallen en WoW Forever. Raids de noche entre semana, en hora de Madrid.',
		'Raids',
	],
	'/roster': [
		'Roster · Darkness of the Fallen · WoW Forever',
		'Los personajes, clases y roles del roster de Darkness of the Fallen, hermandad española de la Alianza en WoW Forever.',
		'Roster',
	],
	'/progreso': [
		'Progreso PvE en WoW Forever · Darkness of the Fallen',
		'Jefes derrotados, primeras victorias y logros de la hermandad Darkness of the Fallen en las raids de WoW Forever.',
		'Progreso',
	],
	'/reclutamiento': [
		'Reclutamiento WoW Forever: únete · Darkness of the Fallen',
		'Buscamos jugadores para raidear en WoW Forever. Mira qué especializaciones necesitamos y presenta tu candidatura a esta guild española de la Alianza.',
		'Reclutamiento',
	],
	'/mapa': [
		'Mapa interactivo de WoW Forever · Darkness of the Fallen',
		'Mapa de Azeroth para WoW Forever: zonas, ciudades, mazmorras, rutas de vuelo, barcos y zepelines. Explóralo desde la web de Darkness of the Fallen.',
		'Mapa',
	],
	'/contacto': [
		'Contacto y Discord · Darkness of the Fallen',
		'Contacta con Darkness of the Fallen, hermandad española de WoW Forever, y entra en nuestro Discord.',
		'Contacto',
	],
};
// Structured data: who the guild is on the home page, and where each page sits.
function structuredData(path, origin, settings) {
	const site = {
		'@type': 'WebSite',
		'@id': origin + '/#website',
		name: 'Darkness of the Fallen',
		url: origin + '/',
		inLanguage: 'es-ES',
		publisher: { '@id': origin + '/#guild' },
	};
	const guild = {
		'@type': 'Organization',
		'@id': origin + '/#guild',
		name: 'Darkness of the Fallen',
		url: origin + '/',
		logo: origin + '/assets/app-icon-512.png',
		image: origin + '/assets/og-image.jpg',
		description: seoPages['/'][1],
		foundingDate: '2026',
		...(typeof settings.discordUrl === 'string' && /^https:\/\//.test(settings.discordUrl)
			? { sameAs: [settings.discordUrl] }
			: {}),
	};
	const graph =
		path === '/'
			? [site, guild]
			: [
					{
						'@type': 'BreadcrumbList',
						itemListElement: [
							{ '@type': 'ListItem', position: 1, name: 'Inicio', item: origin + '/' },
							{ '@type': 'ListItem', position: 2, name: seoPages[path][2], item: origin + path },
						],
					},
				];
	// A data block, not a script: the CSP does not execute it. "<" is escaped so
	// no value can close the element early.
	return `<script type="application/ld+json">${JSON.stringify({ '@context': 'https://schema.org', '@graph': graph }).replace(/</g, '\\u003c')}</script>`;
}
const esc = (value) =>
	String(value ?? '').replace(
		/[&<>"']/g,
		(c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
	);
export function seoHtml(html, path, origin, settings) {
	const entry = seoPages[path];
	if (!entry)
		return html.replace('</head>', '<meta name="robots" content="noindex,nofollow"></head>');
	const [title, description] = entry,
		url = origin + path;
	const head =
		`<link rel="canonical" href="${esc(url)}"><meta name="robots" content="index,follow"><meta property="og:type" content="website"><meta property="og:locale" content="es_ES"><meta property="og:site_name" content="Darkness of the Fallen"><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(description)}"><meta property="og:url" content="${esc(url)}"><meta property="og:image" content="${esc(origin)}/assets/og-image.jpg"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta property="og:image:alt" content="Emblema de Darkness of the Fallen y aventureros ante una fortaleza"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${esc(title)}"><meta name="twitter:description" content="${esc(description)}"><meta name="twitter:image" content="${esc(origin)}/assets/og-image.jpg">` +
		structuredData(path, origin, settings);
	const overview = `<section class="page-title" data-public-overview><h1>${esc(title.split(' · ')[0])}</h1><p>${esc(description)}</p>${['/', '/nosotros', '/raids'].includes(path) ? `<p>Horario habitual: ${esc((settings.raidDays || []).join(', '))}, ${esc(settings.raidStart)}–${esc(settings.raidEnd)} (${esc(settings.timezone || 'Europe/Madrid')}). Confirma cada convocatoria en la sección de raids.</p>` : ''}<p><a href="/raids">Horarios y convocatorias</a> · <a href="/reclutamiento">Reclutamiento</a> · <a href="/contacto">Contacto</a></p></section>`;
	return html
		.replace(/<title>.*?<\/title>/s, () => `<title>${esc(title)}</title>`)
		.replace(
			/<meta\s+name="description"\s+content="[^"]*"\s*\/>/s,
			() => `<meta name="description" content="${esc(description)}" />`,
		)
		.replace('</head>', () => head + '</head>')
		.replace(
			/<div class="loading" role="status">.*?<\/div>/s,
			() =>
				overview +
				'<div class="loading" data-public-loading role="status">Abriendo las puertas de Azeroth…</div>',
		);
}
export function sitemap(origin) {
	return (
		'<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' +
		Object.keys(seoPages)
			.map((path) => `<url><loc>${esc(origin + path)}</loc></url>`)
			.join('') +
		'</urlset>'
	);
}
