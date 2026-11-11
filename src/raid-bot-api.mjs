// The two doors of the bot: button presses arriving from Discord, and the editor of the
// website's panel.
import { Buffer } from 'node:buffer';
import { audit, transaction } from './database-core.mjs';
import { HttpError } from './domain.mjs';
import { signupFingerprint } from './raid-events.mjs';
import { ingestRaidEvent } from './raid-sync.mjs';
import { normalizeSpecValue, specs as specCatalog } from '../public/specs.js';
import { classKeys } from './raid-bot.mjs';
const classKey = Object.fromEntries(Object.entries(classKeys).map(([key, name]) => [name, key]));
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

// Only validated characters sign up: imported from Battle.net into the website by their
// owner, who therefore entered the website with Discord. Nobody signs up with a name typed
// in Discord.
export const validatedCharacters = (db, userId) =>
	db
		.prepare(
			"SELECT id,name,surname,class,spec FROM characters WHERE user_id=? AND archived_at IS NULL AND source='battlenet' AND synced_at IS NOT NULL ORDER BY is_main DESC,created_at",
		)
		.all(userId);
const fullName = (c) => [c.name, c.surname].filter(Boolean).join(' ');
function notValidated(env, mine) {
	const profile = /^https:\/\//.test(env.APP_ORIGIN || '') ? `${env.APP_ORIGIN}/perfil` : null;
	return say(
		(mine
			? 'Ninguno de tus personajes validados es de una clase de esta convocatoria.'
			: 'Para apuntarte necesitas **entrar en la web con Discord** y **vincular tu personaje con Battle.net**.') +
			'\n1. Entra en la web con tu cuenta de Discord.\n2. En **Mi perfil**, pulsa **Battle.net** e importa tu personaje.\n3. Vuelve aquí y pulsa **Apuntarme**.',
		profile
			? {
					components: [
						{
							type: 1,
							components: [{ type: 2, style: 5, label: 'Ir a Mi perfil', url: profile }],
						},
					],
				}
			: {},
	);
}
// The template's spec that matches the one saved on the character, if any.
function characterSpec(cls, character) {
	if (cls.specs.length === 1) return cls.specs[0].name;
	const key = classKey[character.class],
		id = normalizeSpecValue(character.spec || ''),
		name = key && specCatalog[key]?.[id]?.name;
	return cls.specs.find((s) => s.name === name || s.name === character.spec)?.name || '';
}
function signUp(db, env, eventId, user, cls, character, specName) {
	const { doc } = botEvent(db, eventId),
		previous = doc.signUps.find((s) => s.userId === user.id);
	// Extra options keep the name of the sign-up they replace.
	const name = cls.type === 'default' && previous ? previous.name : fullName(character);
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
	return botEvent(db, eventId).doc.signUps.find((s) => s.id === signup.id);
}
const specMenu = (eventId, cls, character, emojis, current) => ({
	type: 1,
	components: [
		{
			type: 3,
			custom_id: `rs:s:${eventId}:${character.id}`,
			placeholder: current ? `Cambiar especialización (${current})` : 'Elige tu especialización',
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
});
// Signs up with one character, or asks for the spec when the web does not know it.
function join(db, env, eventId, user, character, emojis, specName) {
	const doc = botEvent(db, eventId).doc,
		cls = doc.classes.find((c) => c.type !== 'default' && c.name === character.class);
	if (!cls) return notValidated(env, true);
	const spec = specName || characterSpec(cls, character);
	if (cls.specs.length > 1 && !cls.specs.some((s) => s.name === spec))
		return say(`**${fullName(character)}** (${cls.name}): elige tu especialización.`, {
			components: [specMenu(eventId, cls, character, emojis)],
		});
	const signup = signUp(db, env, eventId, user, cls, character, spec);
	return say(
		`✅ Apuntado con **${signup.name}** · ${cls.name}${signup.specName ? ' · ' + signup.specName : ''}.` +
			(signup.status === 'queued'
				? '\n⏳ La raid o tu rol están completos: quedas en cola y subes solo si se libera una plaza.'
				: ''),
		cls.specs.length > 1
			? { components: [specMenu(eventId, cls, character, emojis, signup.specName)] }
			: {},
	);
}
function component(db, env, interaction) {
	const [prefix, kind, eventId, ...rest] = String(interaction.data?.custom_id || '').split(':'),
		target = rest.join(':'),
		user = interaction.member?.user;
	if (prefix !== 'rs' || !snowflake(user?.id)) return say('Acción no reconocida.');
	const event = botEvent(db, eventId),
		row = db.prepare('SELECT state FROM raid_events WHERE id=?').get(eventId);
	if (!event || !row || ['Eliminada', 'Cancelada'].includes(row.state))
		return say('Esta convocatoria ya no existe.');
	if (row.state !== 'Abierta' || !signupsOpen(event.doc))
		return say('🔒 Las inscripciones de esta convocatoria están cerradas.');
	const { emojis } = botState(db);
	if (kind === 'x') {
		if (!event.doc.signUps.some((s) => s.userId === user.id))
			return say('No estabas apuntado a esta convocatoria.');
		const doc = event.doc;
		doc.signUps = doc.signUps.filter((s) => s.userId !== user.id);
		saveDoc(db, eventId, doc);
		ingestBot(db, env, eventId);
		return say('Te has retirado de la convocatoria.');
	}
	const characters = validatedCharacters(db, user.id);
	if (!characters.length) return notValidated(env, false);
	const playable = characters.filter((c) =>
		event.doc.classes.some((cls) => cls.type !== 'default' && cls.name === c.class),
	);
	const value = String(interaction.data.values?.[0] || '');
	// «Apuntarme»: the only character goes straight in; with several, the player picks one.
	if (kind === 'a') {
		if (!playable.length) return notValidated(env, true);
		if (playable.length === 1) return join(db, env, eventId, user, playable[0], emojis);
		return say('¿Con qué personaje te apuntas?', {
			components: [
				{
					type: 1,
					components: [
						{
							type: 3,
							custom_id: `rs:p:${eventId}`,
							placeholder: 'Elige personaje',
							options: playable.slice(0, 25).map((c) => {
								const emoji = emojiOf(
									event.doc.classes.find((cls) => cls.name === c.class)?.icon,
									emojis,
								);
								return {
									label: fullName(c).slice(0, 100),
									value: c.id,
									description: c.class,
									...(emoji ? { emoji } : {}),
								};
							}),
						},
					],
				},
			],
		});
	}
	if (kind === 'p') {
		const character = playable.find((c) => c.id === value);
		return character
			? join(db, env, eventId, user, character, emojis)
			: say('Ese personaje ya no está disponible.');
	}
	if (kind === 's') {
		const character = playable.find((c) => c.id === target);
		return character
			? join(db, env, eventId, user, character, emojis, value)
			: say('Ese personaje ya no está disponible.');
	}
	if (kind === 'c') {
		const cls = event.doc.classes.find((c) => c.name === target);
		if (!cls) return say('Esa opción ya no está disponible. Prueba con los botones actuales.');
		// Messages published before the single button still carry class buttons.
		if (cls.type !== 'default') {
			const character = playable.find((c) => c.class === cls.name);
			return character ? join(db, env, eventId, user, character, emojis) : notValidated(env, true);
		}
		const signup = signUp(db, env, eventId, user, cls, characters[0], '');
		return say(`Marcado como **${cls.name}** (${signup.name}).`);
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
