import { randomBytes, createHash } from 'node:crypto';
import { HttpError, roleFromDiscord } from './domain.mjs';
import { audit } from './database-core.mjs';
export const SESSION_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;
export const token = () => randomBytes(32).toString('base64url');
export const hash = (value) => createHash('sha256').update(value).digest('hex');
export function cookies(req) {
	return Object.fromEntries((req.headers.cookie || '').split(';').map((v) => v.trim().split('=')));
}
export function cookie(name, value, env, maxAge) {
	return `${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${env.APP_ORIGIN.startsWith('https:') ? '; Secure' : ''}`;
}
export function currentSession(db, req) {
	const raw = cookies(req).session;
	if (!raw) return null;
	return (
		db
			.prepare(
				'SELECT u.id,u.display_name,u.rank,s.csrf FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.hash=? AND s.expires>?',
			)
			.get(hash(raw), Date.now()) || null
	);
}
export function issueSession(db, id) {
	if (String(id).startsWith('manual:'))
		throw new HttpError(403, 'Los registros manuales no tienen acceso a la web.');
	const raw = token(),
		csrf = token();
	db.prepare('INSERT INTO sessions VALUES(?,?,?,?)').run(
		hash(raw),
		id,
		csrf,
		Date.now() + SESSION_MAX_AGE_SECONDS * 1000,
	);
	return { raw, csrf };
}
export function oauthReady(env) {
	return !!(env.DISCORD_CLIENT_ID && env.DISCORD_CLIENT_SECRET && env.DISCORD_GUILD_ID);
}
export function startOAuth(db, env) {
	if (!oauthReady(env))
		throw new HttpError(503, 'El acceso con Discord está pendiente de configuración.');
	const state = token();
	db.prepare('DELETE FROM oauth_states WHERE expires<?').run(Date.now());
	db.prepare('INSERT INTO oauth_states VALUES(?,?)').run(hash(state), Date.now() + 600000);
	const params = new URLSearchParams({
		client_id: env.DISCORD_CLIENT_ID,
		response_type: 'code',
		redirect_uri: `${env.APP_ORIGIN}/auth/discord/callback`,
		scope: 'identify guilds.members.read',
		state,
	});
	return { state, url: `https://discord.com/oauth2/authorize?${params}` };
}
// A failed sign-in is recorded for the officers (Panel → Auditoría) with what went wrong
// and, once Discord has said who it is, the account's id and name; never a token.
function loginFailed(db, status, reason, message, who = {}) {
	audit(db, 'login:discord', 'auth.discord_failed', who.id || 'desconocido', {
		reason,
		...(who.name ? { name: who.name } : {}),
		...(who.status ? { discordStatus: who.status } : {}),
	});
	return new HttpError(status, message);
}
export async function finishOAuth(db, req, url, env, fetcher = fetch) {
	const state = url.searchParams.get('state'),
		code = url.searchParams.get('code');
	if (url.searchParams.get('error'))
		throw loginFailed(
			db,
			400,
			'cancelled',
			'Has cancelado la autorización en Discord. Vuelve a intentarlo y pulsa «Autorizar».',
		);
	if (!state || !code || !cookies(req).oauth_state)
		// The sign-in started in another browser: typically Discord's own, which loses our cookie.
		throw loginFailed(
			db,
			400,
			'browser',
			'El inicio de sesión no terminó en el mismo navegador en el que empezó. Si abriste la web desde la app de Discord, ábrela en Chrome o Safari y vuelve a entrar.',
		);
	if (state !== cookies(req).oauth_state)
		throw loginFailed(
			db,
			400,
			'state',
			'La autorización de Discord no corresponde a este intento. Vuelve a entrar desde la web.',
		);
	const found = db
		.prepare('DELETE FROM oauth_states WHERE hash=? AND expires>? RETURNING hash')
		.get(hash(state), Date.now());
	if (!found)
		throw loginFailed(
			db,
			400,
			'expired',
			'La autorización ha caducado (dura 10 minutos) o ya se usó. Vuelve a entrar.',
		);
	const r = await fetcher('https://discord.com/api/v10/oauth2/token', {
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
	if (!r.ok)
		throw loginFailed(
			db,
			502,
			'token',
			'Discord no ha podido completar la autorización. Vuelve a intentarlo en un minuto.',
			{ status: r.status },
		);
	const access = await r.json();
	const opts = {
		headers: { Authorization: `Bearer ${access.access_token}` },
		signal: AbortSignal.timeout(10000),
	};
	const [profileRes, memberRes] = await Promise.all([
		fetcher('https://discord.com/api/v10/users/@me', opts),
		fetcher(
			`https://discord.com/api/v10/users/@me/guilds/${encodeURIComponent(env.DISCORD_GUILD_ID)}/member`,
			opts,
		),
	]);
	const profile = profileRes.ok ? await profileRes.json() : null;
	const who = {
		id: profile?.id,
		name: profile?.global_name || profile?.username,
		status: memberRes.status,
	};
	if (memberRes.status === 429 || profileRes.status === 429)
		throw loginFailed(
			db,
			503,
			'rate_limited',
			'Discord nos ha pedido esperar un momento. Vuelve a intentarlo dentro de un minuto.',
			who,
		);
	if (!profile)
		throw loginFailed(
			db,
			502,
			'profile',
			'Discord no nos ha dado tu perfil. Vuelve a intentarlo en un minuto.',
			{ status: profileRes.status },
		);
	if (!memberRes.ok)
		throw loginFailed(
			db,
			403,
			memberRes.status === 404 ? 'not_in_guild' : 'member',
			memberRes.status === 404
				? `La cuenta de Discord «${who.name || profile.username}» no está en el servidor de la hermandad. Si usas otra cuenta en el servidor, cierra sesión en discord.com y entra con esa.`
				: 'Discord no ha confirmado que estés en el servidor de la hermandad. Vuelve a intentarlo en un minuto.',
			who,
		);
	const member = await memberRes.json();
	const rank = roleFromDiscord(profile.id, member.roles || [], env);
	db.prepare(
		'INSERT INTO users VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET display_name=excluded.display_name,rank=excluded.rank,updated_at=excluded.updated_at',
	).run(profile.id, profile.global_name || profile.username, rank, new Date().toISOString());
	db.prepare('DELETE FROM sessions WHERE user_id=? OR expires<?').run(profile.id, Date.now());
	return issueSession(db, profile.id);
}

// Ranks come from Discord roles. A session lasts days, so the bot re-reads the
// member every few minutes: leaving the server or losing a role takes effect
// without waiting for the session to expire. Network failures keep the session.
export const MEMBER_RECHECK_MS = 10 * 60 * 1000;
export const memberCheckReady = (env) =>
	typeof env.DISCORD_BOT_TOKEN === 'string' &&
	/^[\w.-]{50,120}$/.test(env.DISCORD_BOT_TOKEN) &&
	/^\d{17,20}$/.test(env.DISCORD_GUILD_ID || '');
export async function revalidateMember(db, user, env, fetcher = fetch) {
	if (!/^\d{17,20}$/.test(user.id)) return user;
	let r;
	try {
		r = await fetcher(
			`https://discord.com/api/v10/guilds/${env.DISCORD_GUILD_ID}/members/${user.id}`,
			{
				headers: { Authorization: `Bot ${env.DISCORD_BOT_TOKEN}` },
				signal: AbortSignal.timeout(5000),
			},
		);
	} catch {
		return user;
	}
	// 404 also means "unknown guild" if the bot was removed; only Discord's
	// Unknown Member code (10007) proves the player left.
	const body = r.status === 404 ? await r.json().catch(() => null) : null;
	if (r.status === 404 && body?.code === 10007) {
		// No longer in the guild: end every session of this account.
		db.prepare('DELETE FROM sessions WHERE user_id=?').run(user.id);
		db.prepare("UPDATE users SET rank='visitor',updated_at=? WHERE id=?").run(
			new Date().toISOString(),
			user.id,
		);
		return null;
	}
	if (!r.ok) return user;
	const member = await r.json().catch(() => null);
	if (!member || !Array.isArray(member.roles)) return user;
	const rank = roleFromDiscord(user.id, member.roles, env);
	if (rank !== user.rank)
		db.prepare('UPDATE users SET rank=?,updated_at=? WHERE id=?').run(
			rank,
			new Date().toISOString(),
			user.id,
		);
	return { ...user, rank };
}
