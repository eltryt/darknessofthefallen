// The two doors of the bot: button presses arriving from Discord, and the editor of the
// website's panel.
import { Buffer } from 'node:buffer';
import { audit, transaction } from './database-core.mjs';
import { HttpError } from './domain.mjs';
import { signupFingerprint } from './raid-events.mjs';
import { ingestRaidEvent } from './raid-sync.mjs';
import {
	applySignup,
	applyTemplate,
	botEnv,
	botError,
	botEvent,
	botIcons,
	botReady,
	botState,
	cleanConfig,
	connectBot,
	defaultConfig,
	emojiOf,
	renderMessage,
	saveDoc,
	signupsOpen,
} from './raid-bot.mjs';

const snowflake = (value) => /^\d{17,20}$/.test(String(value || ''));
// Copies the bot's event into the website's tables right away.
export function ingestBot(db, env, eventId) {
	const event = botEvent(db, eventId);
	return event ? ingestRaidEvent(db, event.doc, botEnv(env, event.doc), eventId) : null;
}

const bytes = (hex) => Uint8Array.from(hex.match(/../g) || [], (pair) => parseInt(pair, 16));
async function signed(key, signature, timestamp, raw) {
	if (
		!/^[0-9a-f]{64}$/i.test(key || '') ||
		!/^[0-9a-f]{128}$/i.test(signature || '') ||
		!/^\d{1,20}$/.test(timestamp || '')
	)
		return false;
	try {
		const imported = await crypto.subtle.importKey('raw', bytes(key), { name: 'Ed25519' }, false, [
			'verify',
		]);
		return await crypto.subtle.verify(
			'Ed25519',
			imported,
			bytes(signature),
			new TextEncoder().encode(timestamp + raw),
		);
	} catch {
		return false;
	}
}
const say = (content, extra = {}) => ({
	type: 4,
	data: { content, flags: 64, allowed_mentions: { parse: [] }, ...extra },
});

// Only characters registered on the website can sign up: a class needs a character of that
// class, and the extra options (bench, tentative, absence) need any character at all.
function registeredCharacter(db, userId, cls) {
	return cls.type === 'default'
		? db
				.prepare(
					'SELECT id,name,surname FROM characters WHERE user_id=? AND archived_at IS NULL ORDER BY is_main DESC,created_at LIMIT 1',
				)
				.get(userId)
		: db
				.prepare(
					'SELECT id,name,surname FROM characters WHERE user_id=? AND class=? AND archived_at IS NULL ORDER BY is_main DESC,created_at LIMIT 1',
				)
				.get(userId, cls.name);
}
function notRegistered(env, cls) {
	const profile = /^https:\/\//.test(env.APP_ORIGIN || '') ? `${env.APP_ORIGIN}/perfil` : null;
	return say(
		(cls.type === 'default'
			? 'Para apuntarte necesitas tener un personaje registrado en la web de la hermandad.'
			: `Para apuntarte como **${cls.name}** necesitas un personaje de esa clase registrado en la web de la hermandad.`) +
			(profile ? `\nRegístralo en ${profile} y vuelve a pulsar el botón.` : ''),
		profile
			? {
					components: [
						{
							type: 1,
							components: [{ type: 2, style: 5, label: 'Registrar personaje', url: profile }],
						},
					],
				}
			: {},
	);
}
function signUp(db, env, eventId, member, cls, specName) {
	const user = member.user;
	{
		const { doc } = botEvent(db, eventId),
			previous = doc.signUps.find((s) => s.userId === user.id);
		const character = registeredCharacter(db, user.id, cls);
		if (!character) return null;
		// Extra options keep the name of the class sign-up they replace.
		const name =
			cls.type === 'default' && previous
				? previous.name
				: [character.name, character.surname].filter(Boolean).join(' ');
		const signup = applySignup(doc, { userId: user.id, name, className: cls.name, specName });
		saveDoc(db, eventId, doc);
		ingestBot(db, env, eventId);
		if (cls.type !== 'default')
			db.prepare('INSERT OR REPLACE INTO raid_character_links VALUES(?,?,?,?,?)').run(
				eventId,
				String(signup.id),
				user.id,
				character.id,
				signupFingerprint(signup),
			);
		return doc.signUps.find((s) => s.id === signup.id);
	}
}
function component(db, env, interaction) {
	const [prefix, kind, eventId, ...rest] = String(interaction.data?.custom_id || '').split(':'),
		className = rest.join(':'),
		member = interaction.member;
	if (prefix !== 'rs' || !snowflake(member?.user?.id)) return say('Acción no reconocida.');
	const event = botEvent(db, eventId),
		row = db.prepare('SELECT state FROM raid_events WHERE id=?').get(eventId);
	if (!event || !row || ['Eliminada', 'Cancelada'].includes(row.state))
		return say('Esta convocatoria ya no existe.');
	if (row.state !== 'Abierta' || !signupsOpen(event.doc))
		return say('🔒 Las inscripciones de esta convocatoria están cerradas.');
	const { emojis } = botState(db),
		message = () => renderMessage(botEvent(db, eventId).doc, eventId, emojis, env.APP_ORIGIN);
	if (kind === 'x') {
		if (!event.doc.signUps.some((s) => s.userId === member.user.id))
			return say('No estabas apuntado a esta convocatoria.');
		const doc = event.doc;
		doc.signUps = doc.signUps.filter((s) => s.userId !== member.user.id);
		saveDoc(db, eventId, doc);
		ingestBot(db, env, eventId);
		return { type: 7, data: message() };
	}
	const cls = event.doc.classes.find((c) => c.name === className);
	if (!cls) return say('Esa opción ya no está disponible. Prueba con los botones actuales.');
	if (['c', 's'].includes(kind) && !registeredCharacter(db, member.user.id, cls))
		return notRegistered(env, cls);
	if (kind === 'c') {
		if (cls.type !== 'default' && cls.specs.length > 1)
			return say(`Elige tu especialización de **${cls.name}**:`, {
				components: [
					{
						type: 1,
						components: [
							{
								type: 3,
								custom_id: `rs:s:${eventId}:${cls.name}`,
								placeholder: 'Especialización',
								options: cls.specs.map((spec) => {
									const emoji = emojiOf(spec.icon, emojis);
									return {
										label: spec.name,
										value: spec.name,
										...(spec.roleName ? { description: spec.roleName } : {}),
										...(emoji ? { emoji } : {}),
									};
								}),
							},
						],
					},
				],
			});
		signUp(db, env, eventId, member, cls, cls.specs[0]?.name || '');
		return { type: 7, data: message() };
	}
	if (kind === 's') {
		const signup = signUp(
			db,
			env,
			eventId,
			member,
			cls,
			String(interaction.data.values?.[0] || ''),
		);
		return {
			type: 7,
			data: {
				content:
					`✅ Apuntado como **${cls.name} · ${signup.specName}** (${signup.name}).` +
					(signup.status === 'queued'
						? '\n⏳ La raid o tu rol están completos: quedas en cola y subes solo si se libera una plaza.'
						: ''),
				components: [],
				allowed_mentions: { parse: [] },
			},
		};
	}
	return say('Acción no reconocida.');
}
// Discord signs every call with the application's key; nothing unsigned gets in.
export async function raidBotInteraction(db, env, req) {
	let raw = '';
	for await (const chunk of req) {
		raw += chunk;
		if (Buffer.byteLength(raw) > 262144) return { status: 413, body: { error: 'too large' } };
	}
	const ok = await signed(
		botState(db).app.verifyKey,
		req.headers['x-signature-ed25519'],
		req.headers['x-signature-timestamp'],
		raw,
	);
	if (!ok) return { status: 401, body: { error: 'invalid request signature' } };
	let interaction;
	try {
		interaction = JSON.parse(raw);
	} catch {
		return { status: 400, body: { error: 'invalid body' } };
	}
	if (interaction.type === 1) return { status: 200, body: { type: 1 } };
	if (interaction.guild_id !== env.DISCORD_GUILD_ID || interaction.type !== 3)
		return { status: 200, body: say('Acción no disponible.') };
	try {
		return { status: 200, body: component(db, env, interaction) };
	} catch (e) {
		return {
			status: 200,
			body: say(e instanceof HttpError ? e.message : 'No se pudo guardar. Inténtalo de nuevo.'),
		};
	}
}

function view(db, env) {
	const { config, app, emojis } = botState(db);
	return {
		config,
		defaults: defaultConfig(),
		tokenReady: botReady(env),
		connected: snowflake(app.id),
		appName: app.name || '',
		icons: botIcons.map((icon) => ({
			name: icon.name,
			file: '/' + icon.file,
			uploaded: Boolean(emojis[icon.name]),
		})),
		defaultChannelId: env.RAID_HELPER_CHANNEL_ID || '',
		inviteUrl: snowflake(app.id)
			? `https://discord.com/oauth2/authorize?client_id=${app.id}&scope=bot&permissions=347136`
			: null,
		openEvents: db
			.prepare(
				"SELECT COUNT(*) n FROM raid_bot_events b JOIN raid_events e ON e.id=b.event_id WHERE b.removed=0 AND e.state='Abierta'",
			)
			.get().n,
		errors: db
			.prepare(
				"SELECT e.title,b.error FROM raid_bot_events b JOIN raid_events e ON e.id=b.event_id WHERE b.removed=0 AND b.error!='' LIMIT 5",
			)
			.all(),
	};
}
export async function raidBotApi({
	db,
	user,
	path,
	method,
	body,
	send,
	env,
	requirePermission,
	readAsset,
	transport,
}) {
	if (path !== '/api/raid-bot' && path !== '/api/raid-bot/connect') return false;
	requirePermission('recruitment.manage');
	if (path === '/api/raid-bot' && method === 'GET') {
		send(200, view(db, env));
		return true;
	}
	if (path === '/api/raid-bot' && method === 'PUT') {
		const v = await body(),
			config = cleanConfig(v.config);
		if (config.enabled && !snowflake(botState(db).app.id))
			throw new HttpError(409, 'Conecta primero el bot con Discord y después actívalo.');
		let updated = [];
		transaction(db, () => {
			db.prepare('UPDATE raid_bot_config SET data=?,updated_at=? WHERE id=1').run(
				JSON.stringify(config),
				new Date().toISOString(),
			);
			if (v.applyToOpen !== false) updated = applyTemplate(db, config);
			audit(db, user.id, 'raid.bot.configured', 'raid-bot', {
				enabled: config.enabled,
				classes: config.classes.length,
				openEvents: updated.length,
			});
		});
		// ingestRaidEvent opens its own transaction, so it runs after this one.
		for (const id of updated) ingestBot(db, env, id);
		send(200, { ...view(db, env), updated: updated.length });
		return true;
	}
	if (path === '/api/raid-bot/connect' && method === 'POST') {
		if (!botReady(env))
			throw new HttpError(
				503,
				'Falta el token del bot en el servidor (secreto DISCORD_BOT_TOKEN). Consulta docs/DISCORD_BOT.md.',
			);
		let report;
		try {
			report = await connectBot(db, env, { transport, readAsset });
		} catch (e) {
			throw new HttpError(502, botError(e));
		}
		audit(db, user.id, 'raid.bot.connected', 'raid-bot', {
			created: report.created,
			failed: report.failed.length,
		});
		send(200, { ...view(db, env), report });
		return true;
	}
	return false;
}
