export const seoPages = {
	'/': [
		'Darkness of the Fallen · Hermandad WoW Forever',
		'Hermandad de la Alianza fundada en 2026 en WoW Forever, servidor PvP. Comunidad, progresión en equipo y raids en horario de noche.',
	],
	'/nosotros': [
		'Nuestra hermandad · Darkness of the Fallen',
		'Conoce Darkness of the Fallen: compañerismo, progresión en equipo y una organización transparente de raids y loot.',
	],
	'/raids': [
		'Raids y horarios · Darkness of the Fallen',
		'Consulta los horarios y las convocatorias públicas de Darkness of the Fallen en WoW Forever. Horarios en Europe/Madrid.',
	],
	'/roster': [
		'Roster de la hermandad · Darkness of the Fallen',
		'Consulta los personajes, clases y roles del roster público de Darkness of the Fallen, hermandad de WoW Forever.',
	],
	'/progreso': [
		'Progreso PvE · Darkness of the Fallen',
		'Sigue el progreso PvE registrado por la hermandad Darkness of the Fallen en WoW Forever.',
	],
	'/reclutamiento': [
		'Reclutamiento WoW Forever · Darkness of the Fallen',
		'Conoce la hermandad Darkness of the Fallen y presenta tu candidatura para jugar en equipo en WoW Forever.',
	],
	'/contacto': [
		'Contacto y Discord · Darkness of the Fallen',
		'Contacta con Darkness of the Fallen y encuentra el acceso a su comunidad de Discord.',
	],
};
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
	const head = `<link rel="canonical" href="${esc(url)}"><meta name="robots" content="index,follow"><meta property="og:type" content="website"><meta property="og:locale" content="es_ES"><meta property="og:site_name" content="Darkness of the Fallen"><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(description)}"><meta property="og:url" content="${esc(url)}"><meta property="og:image" content="${esc(origin)}/assets/guild-logo.png"><meta property="og:image:alt" content="Emblema de Darkness of the Fallen"><meta name="twitter:card" content="summary"><meta name="twitter:title" content="${esc(title)}"><meta name="twitter:description" content="${esc(description)}"><meta name="twitter:image" content="${esc(origin)}/assets/guild-logo.png">`;
	const overview = `<section class="page-title" data-public-overview><h1>${esc(title.split(' · ')[0])}</h1><p>${esc(description)}</p>${['/', '/nosotros', '/raids'].includes(path) ? `<p>Horario habitual: ${esc((settings.raidDays || []).join(', '))}, ${esc(settings.raidStart)}–${esc(settings.raidEnd)} (${esc(settings.timezone || 'Europe/Madrid')}). Confirma cada convocatoria en la sección de raids.</p>` : ''}<p><a href="/raids">Horarios y convocatorias</a> · <a href="/reclutamiento">Reclutamiento</a> · <a href="/contacto">Contacto</a></p></section>`;
	return html
		.replace(/<title>.*?<\/title>/s, () => `<title>${esc(title)}</title>`)
		.replace(
			/<meta\s+name="description"\s+content="[^"]*"\s*\/>/s,
			() => `<meta name="description" content="${esc(description)}" />`,
		)
		.replace('</head>', () => head + '</head>')
		.replace(/<div class="loading" role="status">.*?<\/div>/s, () => overview);
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
