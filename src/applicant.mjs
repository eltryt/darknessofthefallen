import { token, hash, cookies } from './auth.mjs';
import { HttpError } from './domain.mjs';
import { audit } from './database-core.mjs';
import { dmReady } from './raid-lineup.mjs';

// Candidates, without an account in the web:
// - Applying needs no sign-in. Optionally they identify with Discord ("identify" scope
//   only), so the application keeps their real Discord id.
// - Each application gets a private link; with it, or by identifying with Discord at
//   /candidatura, the candidate sees what they sent and its status, never officers' notes.
// - One open application per person: by Discord id when known, otherwise by Discord name.
// The candidate sign-in is separate from members' sessions and grants nothing else.
const APPLICANT_MAX_AGE = 7 * 24 * 3600;
const OPEN = ['Nuevo', 'Contactado', 'Prueba'];
const DISCORD_API = 'https://discord.com/api/v10';
export const publicStatus = {
	Nuevo: 'Recibida',
	Contactado: 'En contacto',
	Prueba: 'En periodo de prueba',
	Aceptado: 'Aceptada',
	Rechazado: 'No seleccionada',
};
// "@Name#0" and "name" are the same Discord account name.
export const discordKey = (value) =>
	String(value || '')
		.trim()
		.replace(/^@/, '')
		.replace(/#0$/, '')
		.toLowerCase();
export const trackingUrl = (env, t) => `${env.APP_ORIGIN}/candidatura/${t}`;
const isDiscordId = (id) => /^\d{17,20}$/.test(String(id || ''));

export function startApplicantOAuth(db, env) {
	if (!env.DISCORD_CLIENT_ID || !env.DISCORD_CLIENT_SECRET)
		throw new HttpError(503, 'El acceso con Discord está pendiente de configuración.');
	const state = token();
	db.prepare('DELETE FROM oauth_states WHERE expires<?').run(Date.now());
	db.prepare('INSERT INTO oauth_states VALUES(?,?)').run(
		hash(`applicant:${state}`),
		Date.now() + 600000,
	);
	const params = new URLSearchParams({
		client_id: env.DISCORD_CLIENT_ID,
		response_type: 'code',
		redirect_uri: `${env.APP_ORIGIN}/auth/discord/callback`,
		scope: 'identify',
		state,
	});
	return { state, url: `https://discord.com/oauth2/authorize?${params}` };
}
// A callback belongs to the candidate flow when it carries the candidate's state cookie.
export const isApplicantCallback = (req, url) =>
	!!cookies(req).applicant_state && url.searchParams.get('state') === cookies(req).applicant_state;

export async function finishApplicantOAuth(db, req, url, env, fetcher = fetch) {
	if (url.searchParams.get('error'))
		throw new HttpError(400, 'Has cancelado la autorización en Discord.');
	const state = url.searchParams.get('state'),
		code = url.searchParams.get('code');
	if (!state || !code || state !== cookies(req).applicant_state)
		throw new HttpError(400, 'La autorización de Discord no corresponde a este intento.');
	if (
		!db
			.prepare('DELETE FROM oauth_states WHERE hash=? AND expires>? RETURNING hash')
			.get(hash(`applicant:${state}`), Date.now())
	)
		throw new HttpError(400, 'La autorización ha caducado (dura 10 minutos). Vuelve a intentarlo.');
	const r = await fetcher(`${DISCORD_API}/oauth2/token`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
		body: new URLSearchParams({
			client_id: env.DISCORD_CLIENT_ID,
			client_secret: env.DISCORD_CLIENT_SECRET,
			grant_type: 'authorization_code',
			code,
			redirect_uri: `${env.APP_ORIGIN}/auth/discord/callback`,
		}),
		signal: AbortSignal.timeout(10000),
	});
	if (!r.ok) throw new HttpError(502, 'Discord no ha podido completar la autorización.');
	const { access_token: access } = await r.json();
	const p = await fetcher(`${DISCORD_API}/users/@me`, {
		headers: { Authorization: `Bearer ${access}` },
		signal: AbortSignal.timeout(10000),
	});
	const profile = p.ok ? await p.json().catch(() => null) : null;
	if (!isDiscordId(profile?.id) || !profile.username)
		throw new HttpError(502, 'Discord no nos ha dado tu cuenta. Vuelve a intentarlo.');
	const raw = token();
	db.prepare('DELETE FROM applicant_sessions WHERE expires<? OR discord_id=?').run(
		Date.now(),
		profile.id,
	);
	db.prepare('INSERT INTO applicant_sessions VALUES(?,?,?,?)').run(
		hash(raw),
		profile.id,
		profile.username,
		Date.now() + APPLICANT_MAX_AGE * 1000,
	);
	return { raw, maxAge: APPLICANT_MAX_AGE };
}
export function currentApplicant(db, req) {
	const raw = cookies(req).applicant;
	if (!raw) return null;
	const row = db
		.prepare('SELECT discord_id,username FROM applicant_sessions WHERE hash=? AND expires>?')
		.get(hash(raw), Date.now());
	return row ? { discordId: row.discord_id, username: row.username } : null;
}
export function endApplicant(db, req) {
	const raw = cookies(req).applicant;
	if (raw) db.prepare('DELETE FROM applicant_sessions WHERE hash=?').run(hash(raw));
}

// Who is applying: an identified candidate, or a member signed in (their id is Discord's).
export function applicantIdentity(db, req, user) {
	const a = currentApplicant(db, req);
	if (a) return a;
	return user && isDiscordId(user.id) ? { discordId: user.id, username: '' } : null;
}
export function requireNoOpenApplication(db, key, discordId) {
	const open = db
		.prepare(
			`SELECT a.id FROM application_tracking t JOIN applications a ON a.id=t.application_id
			 WHERE a.status IN (${OPEN.map(() => '?').join(',')})
			 AND ((t.discord_key<>'' AND t.discord_key=?) OR (t.discord_id IS NOT NULL AND t.discord_id=?))`,
		)
		.get(...OPEN, key, discordId || '');
	if (open)
		throw new HttpError(
			409,
			discordId
				? 'Ya tienes una candidatura en revisión. Puedes verla en /candidatura entrando con Discord.'
				: 'Ya hay una candidatura en revisión con ese usuario de Discord. Si es tuya, usa el enlace privado que recibiste o entra en /candidatura con Discord.',
		);
}
export function trackApplication(db, id, key, discordId) {
	const t = token();
	db.prepare(
		'INSERT INTO application_tracking(application_id,token,discord_key,discord_id) VALUES(?,?,?,?)',
	).run(id, t, key, discordId || null);
	return t;
}

const applicationColumns =
	'a.id,a.data,a.status,a.created_at,a.updated_at,t.token FROM applications a JOIN application_tracking t ON t.application_id=a.id';
export function applicationByToken(db, t) {
	if (!/^[\w-]{20,80}$/.test(String(t || ''))) return null;
	return db.prepare(`SELECT ${applicationColumns} WHERE t.token=?`).get(t) || null;
}
// The Discord sign-in proves the account name, so applications sent without identifying
// also show when the name written matches.
export function applicationsOf(db, applicant) {
	return db
		.prepare(
			`SELECT ${applicationColumns} WHERE t.discord_id=? OR (t.discord_key<>'' AND t.discord_key=?) ORDER BY a.created_at DESC LIMIT 20`,
		)
		.all(applicant.discordId, discordKey(applicant.username));
}

// Officers: send the candidate a private message with their link and an optional note.
// With a Discord id it goes straight to them; otherwise only to the one server member
// whose account name matches exactly, never to a guess.
export async function notifyApplicant(db, env, id, officer, note, fetcher = fetch) {
	const row = db
		.prepare(
			'SELECT a.data,a.status,t.token,t.discord_key,t.discord_id FROM applications a JOIN application_tracking t ON t.application_id=a.id WHERE a.id=?',
		)
		.get(id);
	if (!row) throw new HttpError(404, 'Candidatura no encontrada.');
	if (!dmReady(env) || !isDiscordId(env.DISCORD_GUILD_ID))
		throw new HttpError(503, 'El bot de Discord no está configurado para mensajes privados.');
	const headers = {
		Authorization: `Bot ${env.DISCORD_BOT_TOKEN}`,
		'Content-Type': 'application/json',
		'User-Agent': 'DarknessOfTheFallen (https://darknessofthefallen.com, 1)',
	};
	const record = (status) => {
		db.prepare(
			'UPDATE application_tracking SET notice_status=?,notified_at=?,notified_by=? WHERE application_id=?',
		).run(status, new Date().toISOString(), officer.id, id);
		audit(db, officer.id, 'application.notified', id, { status });
		return status;
	};
	let recipient = row.discord_id;
	if (!recipient) {
		if (!row.discord_key) throw new HttpError(409, record('Sin usuario de Discord'));
		const s = await fetcher(
			`${DISCORD_API}/guilds/${env.DISCORD_GUILD_ID}/members/search?query=${encodeURIComponent(row.discord_key)}&limit=10`,
			{ headers, signal: AbortSignal.timeout(10000) },
		);
		const found = s.ok
			? ((await s.json().catch(() => [])) || []).filter(
					(m) => String(m?.user?.username || '').toLowerCase() === row.discord_key,
				)
			: [];
		if (found.length !== 1) {
			record(s.ok ? 'No encontrado en el servidor' : `Búsqueda fallida (${s.status})`);
			throw new HttpError(
				404,
				s.ok
					? `No encontramos a «${row.discord_key}» en el servidor de Discord. Copia su enlace y envíaselo a mano.`
					: 'Discord no nos deja buscar miembros ahora mismo. Copia su enlace y envíaselo a mano.',
			);
		}
		recipient = found[0].user.id;
	}
	const data = JSON.parse(row.data);
	const content = [
		`Hola, ${data.name}. Te escribimos de Darkness of the Fallen sobre tu candidatura: ${publicStatus[row.status] || row.status}.`,
		String(note || '')
			.trim()
			.slice(0, 1500),
		`Puedes verla aquí: ${trackingUrl(env, row.token)}`,
	]
		.filter(Boolean)
		.join('\n\n');
	const channel = await fetcher(`${DISCORD_API}/users/@me/channels`, {
		method: 'POST',
		headers,
		body: JSON.stringify({ recipient_id: recipient }),
		signal: AbortSignal.timeout(10000),
	});
	const dm = channel.ok ? await channel.json().catch(() => null) : null;
	const sent = dm?.id
		? await fetcher(`${DISCORD_API}/channels/${dm.id}/messages`, {
				method: 'POST',
				headers,
				body: JSON.stringify({ content, allowed_mentions: { parse: [] } }),
				signal: AbortSignal.timeout(10000),
			})
		: null;
	if (!sent?.ok) {
		record(`No entregado (${sent?.status || channel.status})`);
		throw new HttpError(
			502,
			'Discord no ha entregado el mensaje (puede tener los privados cerrados). Copia su enlace y envíaselo a mano.',
		);
	}
	return { status: record('Avisado por Discord') };
}

// The candidate's page: their applications, or how to reach them.
const steps = ['Nuevo', 'Contactado', 'Prueba', 'Aceptado'];
const fields = {
	character: 'Personaje',
	class: 'Clase',
	role: 'Rol',
	discord: 'Discord',
	availability: 'Disponibilidad',
	experience: 'Experiencia',
	reason: 'Motivación',
	additional: 'Información adicional',
};
export function applicantPage(
	esc,
	{ rows = [], applicant = null, byLink = false, missing = false },
) {
	const when = (v) =>
		new Date(v).toLocaleString('es-ES', {
			timeZone: 'Europe/Madrid',
			dateStyle: 'long',
			timeStyle: 'short',
		});
	const card = (r) => {
		const d = JSON.parse(r.data),
			rejected = r.status === 'Rechazado',
			at = steps.indexOf(r.status);
		return `<article class="applicant-card${rejected ? ' is-rejected' : ''}"><header><h2>${esc(d.name)}</h2><span class="applicant-status">${esc(publicStatus[r.status] || r.status)}</span></header>
		<ol class="applicant-steps">${(rejected ? ['Nuevo', 'Rechazado'] : steps).map((s, i) => `<li class="${rejected ? (i ? 'is-now' : 'is-done') : i < at ? 'is-done' : i === at ? 'is-now' : ''}">${esc(publicStatus[s])}</li>`).join('')}</ol>
		<p class="applicant-meta">Enviada el ${esc(when(r.created_at))}${r.updated_at !== r.created_at ? ` · Actualizada el ${esc(when(r.updated_at))}` : ''}</p>
		<details><summary>Lo que enviaste</summary><dl>${Object.entries(fields)
			.map(([k, label]) => `<dt>${label}</dt><dd>${esc(d[k] || 'Sin indicar')}</dd>`)
			.join('')}</dl></details>
		${byLink ? '' : `<p class="applicant-link">Enlace privado: <code>/candidatura/${esc(r.token)}</code></p>`}</article>`;
	};
	const body = missing
		? '<p>Este enlace no corresponde a ninguna candidatura. Comprueba que lo has copiado entero, o entra con Discord para ver las tuyas.</p>'
		: rows.length
			? rows.map(card).join('')
			: applicant
				? `<p>No encontramos candidaturas de <strong>${applicant.member ? '' : '@'}${esc(applicant.username)}</strong>. Si la enviaste con otro usuario de Discord, usa tu enlace privado.</p><a class="button" href="/reclutamiento#application">Presentar candidatura</a>`
				: '<p>Entra con Discord para ver tus candidaturas, o abre el enlace privado que te dimos al enviarla. No necesitas estar en nuestro servidor ni tener cuenta en la web.</p>';
	const actions = applicant
		? `<p class="applicant-who">Has entrado como <strong>${applicant.member ? '' : '@'}${esc(applicant.username)}</strong>${applicant.member ? '' : ' · <a href="/auth/candidato/salir">Salir</a>'}</p>`
		: byLink
			? ''
			: '<a class="button" href="/auth/candidato?next=%2Fcandidatura">Entrar con Discord</a>';
	return `<!doctype html><html lang="es"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><meta name="robots" content="noindex" /><title>Tu candidatura · Darkness of the Fallen</title><link rel="stylesheet" href="/style.css" /><link rel="stylesheet" href="/theme.css" /><link rel="icon" href="/favicon.ico" sizes="any" /></head><body class="gate-body"><main class="gate-page applicant-page"><img src="/assets/app-icon-512.png" alt="" width="96" height="96" /><span class="eyebrow">Darkness of the Fallen</span><h1>Tu candidatura</h1>${body}<div class="gate-actions">${actions}<a class="button secondary" href="/">Volver al inicio</a></div><p class="applicant-note">Solo tú ves esta página. Las notas internas de los oficiales no se muestran.</p></main></body></html>`;
}
