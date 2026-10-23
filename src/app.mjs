import { manualRosterApi } from './manual-roster.mjs';
import { seoPages, seoHtml, sitemap } from './seo.mjs';
import { iconAssets } from '../public/icon-assets.js';
import { mobileArt } from '../public/art-variants.js';
import { slotIconSources, catalogGroups } from '../public/armory-catalog.js';
import { gmApi, enqueueGM, gmReady } from './gm-notifications.mjs';
import { exportRecovery } from './recovery.mjs';
import { backupApi } from './backup-api.mjs';
import { pushApi, pushReady, enqueuePush } from './push-notifications.mjs';
import { randomUUID, createHash } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { settings, transaction, audit } from './database-core.mjs';
import {
	can,
	HttpError,
	text,
	choice,
	classes,
	combatRoles,
	characterInput,
	armoryInput,
	armoryValues,
	publicCharacter,
	attendanceMetrics,
	classKeys,
} from './domain.mjs';
import { isValidSpecForClass } from '../public/specs.js';
import { armoryApi } from './armory.mjs';
import { achievementsApi, publicGuildAchievements } from './achievements.mjs';
import { journeyApi } from './journey.mjs';
import { raidLineupApi } from './raid-lineup.mjs';
import {
	SESSION_MAX_AGE_SECONDS,
	currentSession,
	startOAuth,
	finishOAuth,
	cookie,
	cookies,
	hash,
	oauthReady,
	memberCheckReady,
	revalidateMember,
	MEMBER_RECHECK_MS,
} from './auth.mjs';
import { deliverRecruitment } from './integrations.mjs';
import { raidEventsApi } from './raid-events.mjs';
import { operations, publicProgress } from './operations.mjs';
async function readLocalAsset(file) {
	const { readFile } = await import('node:fs/promises');
	return readFile(new URL(`../public/${file}`, import.meta.url));
}

const date = () => new Date().toISOString();
const files = {
	'/assets/art/strategy.webp': ['assets/art/strategy.webp', 'image/webp'],
	'/assets/art/tavern.webp': ['assets/art/tavern.webp', 'image/webp'],
	'/assets/art/recruiting.webp': ['assets/art/recruiting.webp', 'image/webp'],
	'/assets/art/castle-journey.webp': ['assets/art/castle-journey.webp', 'image/webp'],
	'/assets/art/castle-overlook.webp': ['assets/art/castle-overlook.webp', 'image/webp'],
	'/assets/art/raid-expedition.webp': ['assets/art/raid-expedition.webp', 'image/webp'],
	'/assets/art/resting-camp.webp': ['assets/art/resting-camp.webp', 'image/webp'],
	'/assets/art/ironforge-gates.webp': ['assets/art/ironforge-gates.webp', 'image/webp'],
	'/assets/art/guild-army.webp': ['assets/art/guild-army.webp', 'image/webp'],

	'/assets/art/castle.webp': ['assets/art/castle.webp', 'image/webp'],
	'/assets/art/onyxia.webp': ['assets/art/onyxia.webp', 'image/webp'],
	'/assets/art/war-room.webp': ['assets/art/war-room.webp', 'image/webp'],
	'/assets/art/raid-journey.webp': ['assets/art/raid-journey.webp', 'image/webp'],
	'/assets/art/campfire.webp': ['assets/art/campfire.webp', 'image/webp'],
	'/assets/art/heroes.webp': ['assets/art/heroes.webp', 'image/webp'],
	'/assets/art/landscape.webp': ['assets/art/landscape.webp', 'image/webp'],
	'/assets/partners/restedxp-leaderboard.webp': [
		'assets/partners/restedxp-leaderboard.webp',
		'image/webp',
	],

	'/manual-roster-ui.js': ['manual-roster-ui.js', 'text/javascript'],
	'/analytics.js': ['analytics.js', 'text/javascript'],
	'/home-events.js': ['home-events.js', 'text/javascript'],
	...Object.fromEntries(iconAssets.map((file) => ['/' + file, [file, 'image/webp']])),
	// Item catalogue built by scripts/sync-items.mjs (one file per slot group).
	...Object.fromEntries(
		[...catalogGroups, 'meta'].map((group) => [
			`/catalog/${group}.json`,
			[`catalog/${group}.json`, 'application/json'],
		]),
	),
	...Object.fromEntries(
		Object.keys(slotIconSources).map((slot) => [
			`/assets/slots/${slot}.webp`,
			[`assets/slots/${slot}.webp`, 'image/webp'],
		]),
	),
	...Object.fromEntries(
		mobileArt.map((name) => [
			`/assets/art/${name}-m.webp`,
			[`assets/art/${name}-m.webp`, 'image/webp'],
		]),
	),
	'/components.js': ['components.js', 'text/javascript'],
	'/specs.js': ['specs.js', 'text/javascript'],
	'/gm-ui.js': ['gm-ui.js', 'text/javascript'],
	'/roster-ui.js': ['roster-ui.js', 'text/javascript'],
	'/wishlist-ui.js': ['wishlist-ui.js', 'text/javascript'],
	'/sheet-parts.js': ['sheet-parts.js', 'text/javascript'],
	'/my-callups.js': ['my-callups.js', 'text/javascript'],
	'/journey-board.js': ['journey-board.js', 'text/javascript'],
	'/item-catalog.js': ['item-catalog.js', 'text/javascript'],
	'/profile-tour.js': ['profile-tour.js', 'text/javascript'],
	'/motion.js': ['motion.js', 'text/javascript'],
	'/medals.js': ['medals.js', 'text/javascript'],
	'/encounter-catalog.js': ['encounter-catalog.js', 'text/javascript'],
	'/public-views.js': ['public-views.js', 'text/javascript'],
	'/public-layout.js': ['public-layout.js', 'text/javascript'],
	'/profile-view.js': ['profile-view.js', 'text/javascript'],
	'/panel-view.js': ['panel-view.js', 'text/javascript'],
	'/raid-events-ui.js': ['raid-events-ui.js', 'text/javascript'],
	'/recruitment-ui.js': ['recruitment-ui.js', 'text/javascript'],
	'/schedule.js': ['schedule.js', 'text/javascript'],
	'/schedule-ui.js': ['schedule-ui.js', 'text/javascript'],
	'/assets/guild-logo.png': ['assets/guild-logo.png', 'image/png'],
	'/assets/guild-logo.webp': ['assets/guild-logo.webp', 'image/webp'],
	'/assets/guild-logo-128.webp': ['assets/guild-logo-128.webp', 'image/webp'],
	'/assets/guild-logo-320.webp': ['assets/guild-logo-320.webp', 'image/webp'],
	'/assets/og-image.jpg': ['assets/og-image.jpg', 'image/jpeg'],
	'/assets/favicon-32.png': ['assets/favicon-32.png', 'image/png'],
	'/assets/favicon-48.png': ['assets/favicon-48.png', 'image/png'],
	'/assets/favicon-96.png': ['assets/favicon-96.png', 'image/png'],
	'/assets/favicon-144.png': ['assets/favicon-144.png', 'image/png'],
	'/favicon.ico': ['favicon.ico', 'image/x-icon'],
	'/assets/apple-touch-icon.png': ['assets/apple-touch-icon.png', 'image/png'],
	'/assets/app-icon-192.png': ['assets/app-icon-192.png', 'image/png'],
	'/assets/app-icon-512.png': ['assets/app-icon-512.png', 'image/png'],
	'/site.webmanifest': ['site.webmanifest', 'application/manifest+json'],
	'/sw.js': ['sw.js', 'text/javascript'],
	'/operations-ui.js': ['operations-ui.js', 'text/javascript'],
	'/character-editor.js': ['character-editor.js', 'text/javascript'],
	'/armory-catalog.js': ['armory-catalog.js', 'text/javascript'],
	'/armory-view.js': ['armory-view.js', 'text/javascript'],
	'/armory-admin-ui.js': ['armory-admin-ui.js', 'text/javascript'],
	'/paperdoll.js': ['paperdoll.js', 'text/javascript'],
	'/lineup-board.js': ['lineup-board.js', 'text/javascript'],
	'/raid-buffs.js': ['raid-buffs.js', 'text/javascript'],
	'/style.css': ['style.css', 'text/css'],
	'/theme.css': ['theme.css', 'text/css'],
	'/assets/night-sanctum.svg': ['assets/night-sanctum.svg', 'image/svg+xml'],
	'/guild-showcase.js': ['guild-showcase.js', 'text/javascript'],
	'/boot-state.js': ['boot-state.js', 'text/javascript'],
	'/app.js': ['app.js', 'text/javascript'],
};
const pages = new Set([
	'/',
	'/nosotros',
	'/progreso',
	'/roster',
	'/reclutamiento',
	'/raids',
	'/mapa',
	'/contacto',
	'/login',
	'/perfil',
	'/panel',
	'/armeria',
]);
// Headers every response carries, whether served by the app or straight from assets.
export function securityHeaders(origin) {
	const headers = {
		'X-Content-Type-Options': 'nosniff',
		'X-Robots-Tag': 'noindex, nofollow',
		'Referrer-Policy': 'no-referrer',
		'Content-Security-Policy':
			"default-src 'self'; script-src 'self' https://www.googletagmanager.com; style-src 'self'; img-src 'self' data: https://render.worldofwarcraft.com; connect-src 'self' https://www.google-analytics.com https://region1.google-analytics.com https://www.googletagmanager.com; frame-src https://wowforevermap.com; frame-ancestors 'none'; base-uri 'none'; form-action 'self'; object-src 'none'",
		'Cache-Control': 'no-store',
		'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
		'Cross-Origin-Opener-Policy': 'same-origin',
		'Cross-Origin-Resource-Policy': 'same-origin',
		'X-Frame-Options': 'DENY',
	};
	if (origin.startsWith('https:')) headers['Strict-Transport-Security'] = 'max-age=31536000';
	return headers;
}
// Static code, styles and images, with the content type and cache policy they are served with.
// Images stay cached for a day and refresh in the background; code and styles revalidate
// with a fingerprint, so a deploy shows at once. HTML pages are not static files.
export function staticFile(path) {
	if (!Object.hasOwn(files, path) || files[path][1].startsWith('text/html')) return null;
	const [file, type] = files[path];
	const binary = type.startsWith('image/');
	return {
		file,
		contentType: binary ? type : `${type}; charset=utf-8`,
		cacheControl: binary ? 'public, max-age=86400, stale-while-revalidate=604800' : 'no-cache',
	};
}
async function body(req) {
	let raw = '';
	for await (const chunk of req) {
		raw += chunk;
		if (Buffer.byteLength(raw) > 32768)
			throw new HttpError(413, 'El formulario es demasiado grande.');
	}
	try {
		const result = JSON.parse(raw);
		if (!result || typeof result !== 'object' || Array.isArray(result)) throw new Error();
		return result;
	} catch {
		throw new HttpError(400, 'JSON no válido.');
	}
}
export function createApp(db, env, { readAsset = readLocalAsset, discordFetch = fetch } = {}) {
	env = { APP_ORIGIN: 'http://localhost:3000', ...env };
	const limits = new Map(),
		memberChecks = new Map(),
		assetTags = new Map();
	function throttle(
		req,
		route,
		max = 15,
		windowMs = 60000,
		message = 'Demasiados intentos. Espera un minuto.',
	) {
		const key = `${req.socket.remoteAddress}:${route}`,
			now = Date.now();
		let item = limits.get(key);
		if (!item || item.until < now) item = { count: 0, until: now + windowMs };
		if (++item.count > max) throw new HttpError(429, message);
		limits.set(key, item);
		if (limits.size > 10000) for (const [k, v] of limits) if (v.until < now) limits.delete(k);
	}
	// Anonymous applications: a tighter limit per address and a ceiling for everyone,
	// so a flood cannot fill the database or the officers' Discord channel.
	const applicationLog = [];
	function throttleApplications(req) {
		throttle(
			req,
			'application',
			3,
			10 * 60000,
			'Ya has enviado varias candidaturas. Espera unos minutos.',
		);
		const now = Date.now();
		while (applicationLog.length && applicationLog[0] < now - 3600000) applicationLog.shift();
		if (applicationLog.length >= 30)
			throw new HttpError(429, 'Hemos recibido muchas candidaturas. Inténtalo dentro de un rato.');
		applicationLog.push(now);
	}
	async function sessionUser(req) {
		const found = currentSession(db, req);
		if (!found || !memberCheckReady(env)) return found;
		const last = memberChecks.get(found.id) || 0;
		if (Date.now() - last < MEMBER_RECHECK_MS) return found;
		memberChecks.set(found.id, Date.now());
		if (memberChecks.size > 5000)
			for (const [k, v] of memberChecks)
				if (Date.now() - v > MEMBER_RECHECK_MS) memberChecks.delete(k);
		return revalidateMember(db, found, env, discordFetch);
	}
	return async (req, res) => {
		const headers = securityHeaders(env.APP_ORIGIN);
		const send = (status, data, extra = {}) => {
			res.writeHead(status, {
				...headers,
				'Content-Type': 'application/json; charset=utf-8',
				...extra,
			});
			res.end(JSON.stringify(data));
		};
		try {
			const url = new URL(req.url, env.APP_ORIGIN),
				path = url.pathname,
				method = req.method;
			if (
				['GET', 'HEAD'].includes(method) &&
				path !== '/' &&
				path.endsWith('/') &&
				pages.has(path.slice(0, -1))
			) {
				res.writeHead(308, { ...headers, Location: path.slice(0, -1) + url.search });
				return res.end();
			}
			if (['GET', 'HEAD'].includes(method) && ['/robots.txt', '/sitemap.xml'].includes(path)) {
				const content =
					path === '/robots.txt'
						? `User-agent: *\nAllow: /\nDisallow: /api/\nAllow: /api/public$\nDisallow: /auth/\nSitemap: ${env.APP_ORIGIN}/sitemap.xml\n`
						: sitemap(env.APP_ORIGIN);
				res.writeHead(200, {
					...headers,
					'Content-Type':
						path === '/robots.txt' ? 'text/plain; charset=utf-8' : 'application/xml; charset=utf-8',
				});
				return res.end(method === 'HEAD' ? '' : content);
			}
			// Token-authenticated, so it runs before cookie sessions and the browser-origin check.
			if (await backupApi({ db, req, path, method, env, send, throttle })) return;
			const user = await sessionUser(req),
				s = settings(db);
			const requireUser = () => {
				if (!user) throw new HttpError(401, 'Entra con Discord para continuar.');
			};
			const requirePermission = (p) => {
				requireUser();
				if (!can(user, p)) throw new HttpError(403, 'Tu rango no permite esta acción.');
			};
			if (!['GET', 'HEAD'].includes(method)) {
				if (req.headers.origin !== env.APP_ORIGIN)
					throw new HttpError(403, 'Origen de solicitud no permitido.');
				if (!req.headers['content-type']?.startsWith('application/json'))
					throw new HttpError(415, 'Se requiere JSON.');
				if (user && req.headers['x-csrf-token'] !== user.csrf)
					throw new HttpError(403, 'La sesión del formulario ha caducado.');
				throttle(req, path);
			}
			if (path === '/api/health') return send(200, { ok: true, version: '0.1.0' });
			if (path === '/api/public' && method === 'GET')
				return send(200, {
					settings: s,
					characters: db
						.prepare(
							'SELECT name,surname,class,role FROM characters WHERE archived_at IS NULL ORDER BY name',
						)
						.all()
						.map(publicCharacter),
					progress: publicProgress(db),
					guildAchievements: publicGuildAchievements(db),
					raids: db
						.prepare(
							"SELECT r.id,r.title,r.starts_at,r.source FROM raids r LEFT JOIN raid_events e ON e.id=r.id WHERE r.starts_at>=? AND (e.id IS NULL OR (e.public=1 AND e.state='Abierta')) ORDER BY r.starts_at LIMIT 100",
						)
						.all(date()),
					authConfigured: oauthReady(env),
				});
			const sendText = (status, value, type, extra = {}) => {
				res.writeHead(status, { ...headers, 'Content-Type': type, ...extra });
				res.end(value);
			};
			if (
				await gmApi({
					db,
					user,
					path,
					method,
					url,
					body: () => body(req),
					send,
					env,
					requirePermission,
				})
			)
				return;
			if (
				await pushApi({
					db,
					user,
					path,
					method,
					env,
					body: () => body(req),
					send,
					requirePermission,
				})
			)
				return;
			if (
				await raidLineupApi({
					db,
					user,
					path,
					method,
					body: () => body(req),
					send,
					env,
					requireUser,
				})
			)
				return;
			if (
				await raidEventsApi({
					db,
					user,
					path,
					method,
					url,
					body: () => body(req),
					send,
					env,
					requirePermission,
					requireUser,
				})
			)
				return;
			if (
				await operations({
					db,
					user,
					s,
					path,
					method,
					url,
					body: () => body(req),
					send,
					sendText,
					requireUser,
					requirePermission,
				})
			)
				return;
			if (path === '/api/me' && method === 'GET')
				return send(200, {
					user: user ? { id: user.id, name: user.display_name, rank: user.rank } : null,
					csrf: user?.csrf,
					permissions: Object.keys((await import('./domain.mjs')).permissions).filter((p) =>
						can(user, p),
					),
				});
			if (path === '/auth/discord' && method === 'GET') {
				throttle(req, path);
				const auth = startOAuth(db, env);
				res.writeHead(302, {
					...headers,
					Location: auth.url,
					'Set-Cookie': cookie('oauth_state', auth.state, env, 600),
				});
				return res.end();
			}
			if (path === '/auth/discord/callback' && method === 'GET') {
				throttle(req, path);
				const session = await finishOAuth(db, req, url, env);
				res.writeHead(302, {
					...headers,
					Location: '/perfil',
					'Set-Cookie': [
						cookie('session', session.raw, env, SESSION_MAX_AGE_SECONDS),
						cookie('oauth_state', '', env, 0),
					],
				});
				return res.end();
			}
			if (path === '/api/logout' && method === 'POST') {
				requireUser();
				db.prepare('DELETE FROM sessions WHERE hash=?').run(hash(cookies(req).session));
				return send(200, { ok: true }, { 'Set-Cookie': cookie('session', '', env, 0) });
			}
			if (await achievementsApi({ db, user, path, method, send, requirePermission })) return;
			if (journeyApi({ db, user, path, method, send, requirePermission })) return;
			if (
				await armoryApi({
					db,
					user,
					path,
					method,
					url,
					body: () => body(req),
					send,
					requireUser,
					requirePermission,
				})
			)
				return;
			if (
				await manualRosterApi({
					db,
					user,
					path,
					method,
					body: () => body(req),
					send,
					requirePermission,
				})
			)
				return;
			if (path === '/api/characters') {
				requireUser();
				if (method === 'GET')
					return send(
						200,
						db
							.prepare(
								'SELECT * FROM characters WHERE user_id=? AND archived_at IS NULL ORDER BY is_main DESC,name',
							)
							.all(user.id),
					);
				if (method === 'POST') {
					requirePermission('character.write');
					const input = await body(req),
						v = characterInput(input),
						sheet = armoryInput(input, v.class),
						id = randomUUID();
					transaction(db, () => {
						const count = db
							.prepare(
								'SELECT count(*) AS n FROM characters WHERE user_id=? AND archived_at IS NULL',
							)
							.get(user.id).n;
						if (count >= 30) throw new HttpError(400, 'Límite de 30 personajes por usuario.');
						if (v.isMain || !count)
							db.prepare('UPDATE characters SET is_main=0 WHERE user_id=?').run(user.id);
						db.prepare(
							'INSERT INTO characters(id,user_id,name,surname,class,role,spec,professions,availability,notes,is_main,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)',
						).run(
							id,
							user.id,
							v.name,
							v.surname,
							v.class,
							v.role,
							v.spec,
							v.professions,
							v.availability,
							v.notes,
							v.isMain || !count ? 1 : 0,
							date(),
						);
						db.prepare(
							'UPDATE characters SET game_version=?,realm=?,region=?,faction=?,race=?,secondary_spec=?,level=?,updated_at=? WHERE id=?',
						).run(...armoryValues(sheet), date(), id);
						audit(db, user.id, 'character.created', id, { name: v.name });
					});
					return send(201, { id });
				}
			}
			if (/^\/api\/characters\/[^/]+$/.test(path) && method === 'PATCH') {
				requirePermission('character.write');
				const id = path.split('/')[3];
				const previous = db
					.prepare('SELECT * FROM characters WHERE id=? AND user_id=? AND archived_at IS NULL')
					.get(id, user.id);
				if (!previous) throw new HttpError(404, 'Personaje no encontrado.');
				const input = await body(req);
				const v = characterInput({ ...previous, ...input }),
					sheet = armoryInput({ ...previous, ...input }, v.class);
				// Main changes use the dedicated atomic endpoint. Ignore client ownership/source fields.
				transaction(db, () => {
					db.prepare(
						'UPDATE characters SET name=?,surname=?,class=?,role=?,spec=?,professions=?,availability=?,notes=?,game_version=?,realm=?,region=?,faction=?,race=?,secondary_spec=?,level=?,updated_at=? WHERE id=? AND user_id=?',
					).run(
						v.name,
						v.surname,
						v.class,
						v.role,
						v.spec,
						v.professions,
						v.availability,
						v.notes,
						...armoryValues(sheet),
						date(),
						id,
						user.id,
					);
					const before = {},
						after = {};
					Object.assign(v, sheet);
					for (const key of [
						'name',
						'surname',
						'class',
						'role',
						'spec',
						'professions',
						'availability',
						'notes',
						...Object.keys(sheet),
					]) {
						if (previous[key] !== v[key]) {
							before[key] = previous[key];
							after[key] = v[key];
						}
					}
					audit(db, user.id, 'character.updated', id, { before, after });
				});
				return send(200, { id });
			}
			if (/^\/api\/characters\/[^/]+\/main$/.test(path) && method === 'POST') {
				requirePermission('character.write');
				const id = path.split('/')[3];
				const c = db
					.prepare('SELECT * FROM characters WHERE id=? AND user_id=? AND archived_at IS NULL')
					.get(id, user.id);
				if (!c) throw new HttpError(404, 'Personaje no encontrado.');
				transaction(db, () => {
					db.prepare('UPDATE characters SET is_main=0 WHERE user_id=?').run(user.id);
					db.prepare('UPDATE characters SET is_main=1 WHERE id=?').run(id);
					audit(db, user.id, 'character.main', id, {});
				});
				return send(200, { ok: true });
			}
			if (path === '/api/roster' && method === 'GET') {
				requirePermission('roster.read');
				return send(
					200,
					db
						.prepare(
							'SELECT c.*,u.display_name,u.rank FROM characters c JOIN users u ON u.id=c.user_id WHERE c.archived_at IS NULL ORDER BY c.is_main DESC,c.name',
						)
						.all(),
				);
			}
			if (path === '/api/applications' && method === 'POST') {
				if (!s.recruitmentOpen)
					throw new HttpError(409, 'El reclutamiento está cerrado en este momento.');
				throttleApplications(req);
				const v = await body(req);
				if (v.website) throw new HttpError(400, 'Formulario no válido.');
				const a = {
					name: text(v.name, 'nombre', 80),
					discord: text(v.discord, 'Discord', 80),
					character: text(v.character, 'personaje', 80),
					class: choice(v.class, classes, 'clase'),
					role: choice(v.role, combatRoles, 'rol'),
					experience: text(v.experience, 'experiencia', 2000),
					availability: text(v.availability, 'disponibilidad', 1000),
					reason: text(v.reason, 'motivación', 2000),
					additional: text(v.additional ?? '', 'información adicional', 2000, false),
				};
				if (v.consent !== true)
					throw new HttpError(400, 'Debes aceptar el tratamiento de tu candidatura.');
				const id = randomUUID();
				transaction(db, () => {
					db.prepare('INSERT INTO applications(id,data,created_at,updated_at) VALUES(?,?,?,?)').run(
						id,
						JSON.stringify(a),
						date(),
						date(),
					);
					if (pushReady(env)) enqueuePush(db, 'recruitment', id);
					if (gmReady(env)) enqueueGM(db, 'recruitment', id);
					else if (
						env.RECRUITMENT_NOTIFICATIONS_ENABLED === 'true' &&
						env.DISCORD_RECRUITMENT_WEBHOOK
					)
						db.prepare('INSERT INTO outbox(id,application_id) VALUES(?,?)').run(randomUUID(), id);
					audit(db, user?.id || 'candidate', 'application.created', id, {});
				});
				return send(201, { id, message: 'Candidatura recibida. Los oficiales la revisarán.' });
			}
			if (path === '/api/applications' && method === 'GET') {
				requirePermission('recruitment.manage');
				return send(
					200,
					db
						.prepare('SELECT * FROM applications ORDER BY created_at DESC LIMIT 500')
						.all()
						.map((r) => ({ ...r, data: JSON.parse(r.data) })),
				);
			}
			if (/^\/api\/applications\/[^/]+$/.test(path) && method === 'DELETE') {
				requirePermission('recruitment.manage');
				const id = path.split('/')[3];
				transaction(db, () => {
					if (!db.prepare('SELECT id FROM applications WHERE id=?').get(id))
						throw new HttpError(404, 'Candidatura no encontrada.');
					db.prepare('DELETE FROM outbox WHERE application_id=?').run(id);
					db.prepare("DELETE FROM gm_notifications WHERE kind='recruitment' AND target_id=?").run(
						id,
					);
					db.prepare('DELETE FROM applications WHERE id=?').run(id);
					audit(db, user.id, 'application.deleted', id, {});
				});
				return send(200, { ok: true });
			}
			if (path.startsWith('/api/applications/') && method === 'PATCH') {
				requirePermission('recruitment.manage');
				const id = path.split('/')[3],
					v = await body(req),
					status = choice(
						v.status,
						['Nuevo', 'Contactado', 'Prueba', 'Aceptado', 'Rechazado'],
						'estado',
					),
					notes = text(v.notes ?? '', 'notas', 4000, false);
				transaction(db, () => {
					const prev = db.prepare('SELECT status,notes FROM applications WHERE id=?').get(id);
					if (!prev) throw new HttpError(404, 'Candidatura no encontrada.');
					db.prepare('UPDATE applications SET status=?,notes=?,updated_at=? WHERE id=?').run(
						status,
						notes,
						date(),
						id,
					);
					audit(db, user.id, 'application.updated', id, { before: prev, after: { status, notes } });
				});
				return send(200, { ok: true });
			}
			if (path === '/api/settings' && method === 'PUT') {
				requirePermission('settings.manage');
				const v = await body(req),
					next = { ...s };
				for (const k of ['name', 'description', 'faction', 'region', 'server', 'about'])
					if (k in v) next[k] = text(v[k], k, k === 'about' ? 4000 : 500);
				if ('ruleset' in v)
					next.ruleset = choice(v.ruleset, ['Por confirmar', 'PvP', 'PvE'], 'ruleset');
				for (const k of ['raidStart', 'raidEnd'])
					if (k in v) {
						if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(v[k]))
							throw new HttpError(400, 'Horario no válido.');
						next[k] = v[k];
					}
				if ('raidDays' in v) {
					if (!Array.isArray(v.raidDays) || v.raidDays.length > 7)
						throw new HttpError(400, 'Días no válidos.');
					next.raidDays = [
						...new Set(
							v.raidDays.map((d) =>
								choice(
									d,
									['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'],
									'día',
								),
							),
						),
					];
				}
				if ('discordUrl' in v) {
					if (
						v.discordUrl &&
						!/^https:\/\/(discord\.gg\/|discord\.com\/invite\/)[\w-]+$/.test(v.discordUrl)
					)
						throw new HttpError(400, 'Invitación Discord no válida.');
					next.discordUrl = v.discordUrl;
				}
				if ('recruitmentOpen' in v) {
					if (typeof v.recruitmentOpen !== 'boolean') throw new HttpError(400, 'Estado no válido.');
					next.recruitmentOpen = v.recruitmentOpen;
				}
				for (const [key, allowed] of [
					['soughtClasses', classes],
					['soughtRoles', combatRoles],
				])
					if (key in v) {
						if (!Array.isArray(v[key]) || v[key].length > allowed.length)
							throw new HttpError(400, 'Necesidades de reclutamiento no válidas.');
						next[key] = [
							...new Set(
								v[key].map((value) => choice(value, allowed, 'necesidad de reclutamiento')),
							),
						];
					}
				if ('classPriorities' in v) {
					if (
						!v.classPriorities ||
						typeof v.classPriorities !== 'object' ||
						Array.isArray(v.classPriorities)
					)
						throw new HttpError(400, 'Prioridades no válidas.');
					next.classPriorities = {};
					for (const [name, priority] of Object.entries(v.classPriorities)) {
						choice(name, classes, 'clase');
						next.classPriorities[name] = choice(
							priority,
							['abierta', 'alta', 'media', 'baja'],
							'prioridad',
						);
					}
				}
				// Per-specialization priorities, keyed "Clase:specId"; unset specs inherit the class.
				if ('specPriorities' in v) {
					if (
						!v.specPriorities ||
						typeof v.specPriorities !== 'object' ||
						Array.isArray(v.specPriorities) ||
						Object.keys(v.specPriorities).length > 60
					)
						throw new HttpError(400, 'Prioridades no válidas.');
					next.specPriorities = {};
					for (const [key, priority] of Object.entries(v.specPriorities)) {
						const [name, spec] = String(key).split(':');
						choice(name, classes, 'clase');
						if (!isValidSpecForClass(spec, classKeys[name]))
							throw new HttpError(400, 'Especialización no válida.');
						next.specPriorities[`${name}:${spec}`] = choice(
							priority,
							['abierta', 'alta', 'media', 'baja'],
							'prioridad',
						);
					}
				}
				if ('rosterTargets' in v) {
					next.rosterTargets = {};
					for (const k of ['tanks', 'healers', 'dps']) {
						const n = v.rosterTargets[k];
						if (!Number.isInteger(n) || n < 0 || n > 100)
							throw new HttpError(400, 'Objetivo no válido.');
						next.rosterTargets[k] = n;
					}
				}
				if ('lootMethod' in v)
					next.lootMethod = choice(
						v.lootMethod,
						['Loot Council', 'Roll', 'Soft Reserve', 'DKP', 'Híbrido'],
						'loot',
					);
				transaction(db, () => {
					db.prepare('UPDATE settings SET data=? WHERE id=1').run(JSON.stringify(next));
					audit(db, user.id, 'settings.updated', 'guild', { before: s, after: next });
				});
				return send(200, next);
			}
			if (path === '/api/audit' && method === 'GET') {
				requirePermission('audit.read');
				return send(200, db.prepare('SELECT * FROM audit ORDER BY id DESC LIMIT 200').all());
			}
			if (path === '/api/export' && method === 'GET') {
				requirePermission('backup.export');
				const data = exportRecovery(db);
				audit(db, user.id, 'data.exported', 'guild', {});
				return send(200, data, {
					'Content-Disposition': 'attachment; filename="darkness-export.json"',
				});
			}
			if (path === '/api/notifications/retry' && method === 'POST') {
				requirePermission('recruitment.manage');
				await deliverRecruitment(db, env);
				return send(200, { ok: true });
			}
			if (path.startsWith('/api/')) throw new HttpError(404, 'Endpoint no encontrado.');
			if (!['GET', 'HEAD'].includes(method)) throw new HttpError(405, 'Método no permitido.');
			if (path === '/panel') {
				requireUser();
				if (!can(user, 'roster.read'))
					throw new HttpError(403, 'Tu rango no permite entrar al panel.');
			}
			if (path === '/perfil' || path === '/armeria') requireUser();
			const asset = staticFile(path);
			if (asset) {
				const { file } = asset;
				const content = await readAsset(file);
				let tag = assetTags.get(file);
				if (!tag) {
					tag = `"${createHash('sha1').update(content).digest('base64url')}"`;
					assetTags.set(file, tag);
				}
				const common = { ...headers, ETag: tag, 'Cache-Control': asset.cacheControl };
				if (req.headers['if-none-match'] === tag) {
					res.writeHead(304, common);
					return res.end();
				}
				res.writeHead(200, { ...common, 'Content-Type': asset.contentType });
				return res.end(method === 'HEAD' ? '' : content);
			}
			if (files[path] || pages.has(path)) {
				const [file, type] = files[path] || ['index.html', 'text/html'];
				res.writeHead(200, {
					...headers,
					'X-Robots-Tag': seoPages[path] ? 'index, follow' : 'noindex, nofollow',
					'Content-Type': `${type}; charset=utf-8`,
				});
				const content = method === 'HEAD' ? '' : await readAsset(file);
				return res.end(
					method === 'HEAD'
						? ''
						: type === 'text/html'
							? seoHtml(Buffer.from(content).toString('utf8'), path, env.APP_ORIGIN, s)
							: content,
				);
			}
			throw new HttpError(404, 'Página no encontrada.');
		} catch (e) {
			send(e.status || 500, {
				error: e.status ? e.message : 'No se pudo completar la operación. Inténtalo de nuevo.',
			});
		}
	};
}
