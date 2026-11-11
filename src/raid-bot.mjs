// Raid sign-ups published by the guild's own Discord bot. The website owns each event
// (same shape Raid-Helper returns, so line-ups, attendance and profiles work unchanged)
// and the Discord message is a rendering of it: every change marks the message dirty and
// deliverBotRenders() edits it.
import { Buffer } from 'node:buffer';
import { specs as specCatalog } from '../public/specs.js';
import { iconAssets } from '../public/icon-assets.js';
import { HttpError } from './domain.mjs';
import { ProviderError } from './raid-helper.mjs';

const API = 'https://discord.com/api/v10';
const snowflake = (value) => /^\d{17,20}$/.test(String(value || ''));
export const botReady = (env) =>
	typeof env.DISCORD_BOT_TOKEN === 'string' &&
	/^[\w.-]{50,120}$/.test(env.DISCORD_BOT_TOKEN) &&
	snowflake(env.DISCORD_GUILD_ID);

// Class and specialization icons of the website, uploaded as emojis of the bot's
// application (they do not use the server's emoji slots).
export const botIcons = iconAssets
	.filter((file) => /^assets\/icons\/((spec|role)\/)?\w+\.webp$/.test(file))
	.map((file) => ({ name: file.match(/(\w+)\.webp$/)[1], file }));
const iconNames = new Set(botIcons.map((icon) => icon.name));

export const classKeys = {
	warrior: 'Guerrero',
	paladin: 'Paladín',
	hunter: 'Cazador',
	rogue: 'Pícaro',
	priest: 'Sacerdote',
	shaman: 'Chamán',
	mage: 'Mago',
	warlock: 'Brujo',
	druid: 'Druida',
};
export const optionKinds = ['bench', 'tentative', 'absence'];
export function defaultConfig() {
	return {
		enabled: false,
		channelId: '',
		mentionRoleId: '',
		color: '#8b1e2d',
		description: '',
		imageUrl: '',
		footer: 'Darkness of the Fallen',
		closeMinutes: 0,
		groupBy: 'class',
		buttonLabels: true,
		showWebLink: true,
		classes: [
			...Object.entries(classKeys).map(([key, name]) => ({
				name,
				icon: key,
				type: 'primary',
				limit: null,
				specs: Object.entries(specCatalog[key]).map(([id, spec]) => ({
					name: spec.name,
					icon: 'spec_' + (spec.icon || id),
					roleName: spec.category,
				})),
			})),
			{ name: 'Suplente', icon: '🪑', type: 'default', kind: 'bench', limit: null, specs: [] },
			{ name: 'Tentativo', icon: '❔', type: 'default', kind: 'tentative', limit: null, specs: [] },
			{ name: 'Ausente', icon: '🚫', type: 'default', kind: 'absence', limit: null, specs: [] },
		],
		roles: [
			{ name: 'Tanque', icon: 'role_tank', limit: null },
			{ name: 'Sanador', icon: 'role_healer', limit: null },
			{ name: 'DPS melee', icon: 'role_dps', limit: null },
			{ name: 'DPS distancia', icon: 'role_dps', limit: null },
		],
	};
}

const bad = (message) => new HttpError(400, message);
function label(value, what) {
	const name = typeof value === 'string' ? value.trim() : '';
	if (!name || name.length > 32 || /[:\n\r`]/.test(name))
		throw bad(`Nombre no válido en ${what} (1–32 caracteres, sin «:» ni saltos de línea).`);
	return name;
}
// An icon is one of the website's icons (by name), a server emoji written as
// <:name:id>, a standard emoji, or nothing.
function iconValue(value) {
	const icon = typeof value === 'string' ? value.trim() : '';
	if (!icon) return '';
	if (/^<a?:\w{2,32}:\d{17,20}>$/.test(icon) || iconNames.has(icon)) return icon;
	if (icon.length <= 16 && !/[\w<>:\s]/.test(icon)) return icon;
	throw bad(`Icono no válido: «${icon.slice(0, 40)}».`);
}
function limitValue(value) {
	if (value === null || value === undefined || value === '') return null;
	if (!Number.isInteger(value) || value < 1 || value > 1000)
		throw bad('Los límites deben ser un número entre 1 y 1000, o quedar vacíos.');
	return value;
}
const unique = (names, what) => {
	if (new Set(names.map((n) => n.toLowerCase())).size !== names.length)
		throw bad(`Hay ${what} con el nombre repetido.`);
};
export function cleanConfig(v) {
	if (!v || typeof v !== 'object') throw bad('Configuración no válida.');
	const base = defaultConfig();
	const id = (value, what) => {
		if (value === '' || value === undefined || value === null) return '';
		if (!snowflake(value)) throw bad(`El ID de ${what} debe ser el número que copia Discord.`);
		return String(value);
	};
	const line = (value, max) => {
		if (typeof (value ?? '') !== 'string' || (value ?? '').length > max)
			throw bad('Texto demasiado largo.');
		return (value ?? '').trim();
	};
	if (!Array.isArray(v.roles) || v.roles.length > 8) throw bad('Roles no válidos (máximo 8).');
	const roles = v.roles.map((r) => ({
		name: label(r?.name, 'un rol'),
		icon: iconValue(r?.icon),
		limit: limitValue(r?.limit),
	}));
	unique(
		roles.map((r) => r.name),
		'roles',
	);
	if (!Array.isArray(v.classes)) throw bad('Clases no válidas.');
	const classes = v.classes.map((c) => {
		const type = c?.type === 'default' ? 'default' : 'primary',
			name = label(c?.name, 'una clase u opción');
		if (!Array.isArray(c.specs ?? []) || (c.specs ?? []).length > 25)
			throw bad(`Especializaciones no válidas en ${name} (máximo 25).`);
		const specs =
			type === 'default'
				? []
				: (c.specs ?? []).map((s) => {
						const roleName = typeof s?.roleName === 'string' ? s.roleName.trim() : '';
						if (roleName && !roles.some((r) => r.name === roleName))
							throw bad(`El rol «${roleName.slice(0, 40)}» de ${name} no existe en la lista.`);
						return { name: label(s?.name, name), icon: iconValue(s?.icon), roleName };
					});
		unique(
			specs.map((s) => s.name),
			`especializaciones de ${name}`,
		);
		return {
			name,
			icon: iconValue(c.icon),
			type,
			...(type === 'default' ? { kind: optionKinds.includes(c.kind) ? c.kind : 'tentative' } : {}),
			limit: limitValue(c.limit),
			specs,
		};
	});
	unique(
		classes.map((c) => c.name),
		'clases u opciones',
	);
	const primary = classes.filter((c) => c.type === 'primary').length;
	if (primary < 1 || primary > 15) throw bad('Tiene que haber entre 1 y 15 clases.');
	if (classes.length - primary > 3)
		throw bad('Como máximo 3 opciones extra (suplente, tentativo, ausente).');
	const imageUrl = line(v.imageUrl, 300);
	if (imageUrl && !/^https:\/\/[^\s<>"]+$/.test(imageUrl))
		throw bad('La imagen debe ser una dirección https://.');
	const color = v.color ?? base.color;
	if (!/^#[0-9a-f]{6}$/i.test(color)) throw bad('Color no válido.');
	const closeMinutes = v.closeMinutes ?? 0;
	if (!Number.isInteger(closeMinutes) || closeMinutes < 0 || closeMinutes > 10080)
		throw bad('El cierre de inscripciones debe estar entre 0 y 10080 minutos.');
	return {
		enabled: v.enabled === true,
		channelId: id(v.channelId, 'canal'),
		mentionRoleId: id(v.mentionRoleId, 'rol'),
		color: color.toLowerCase(),
		description: line(v.description, 1500),
		imageUrl,
		footer: line(v.footer, 200),
		closeMinutes,
		groupBy: v.groupBy === 'role' ? 'role' : 'class',
		buttonLabels: v.buttonLabels !== false,
		showWebLink: v.showWebLink !== false,
		classes,
		roles,
	};
}

export function botState(db) {
	const row = db.prepare('SELECT data,app,emojis FROM raid_bot_config WHERE id=1').get();
	return {
		config: { ...defaultConfig(), ...JSON.parse(row.data) },
		app: JSON.parse(row.app),
		emojis: JSON.parse(row.emojis),
	};
}
// New events go out through the bot once it is connected and switched on.
export function botActive(db, env) {
	return botReady(env) && snowflake(botState(db).app.id);
}
export const botChannel = (config, env) => config.channelId || env.RAID_HELPER_CHANNEL_ID || '';
// ingestRaidEvent() checks the channel against the configured one; the bot's channel
// is chosen on the website.
export const botEnv = (env, doc) => ({ ...env, RAID_HELPER_CHANNEL_ID: doc.channelId });
const lookOf = (config) => ({
	color: config.color,
	imageUrl: config.imageUrl,
	footer: config.footer,
	groupBy: config.groupBy,
	buttonLabels: config.buttonLabels,
	showWebLink: config.showWebLink,
});

export async function botRest(env, transport, method, path, payload) {
	if (!botReady(env)) {
		const error = new ProviderError(401);
		error.service = 'bot';
		throw error;
	}
	const response = await transport(API + path, {
		method,
		redirect: 'manual',
		headers: {
			Authorization: `Bot ${env.DISCORD_BOT_TOKEN}`,
			'Content-Type': 'application/json',
			'User-Agent': 'DarknessOfTheFallen (https://darknessofthefallen.com, 1)',
		},
		...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
		signal: AbortSignal.timeout(10000),
	});
	let data = {};
	try {
		if (response.status !== 204) data = await response.json();
	} catch {
		/* Empty or non-JSON bodies keep the HTTP status. */
	}
	if (response.ok) return data;
	const wait = Number(data.retry_after) || Number(response.headers?.get?.('retry-after')) || 60;
	const error = new ProviderError(response.status, Math.max(1, Math.min(Math.ceil(wait), 3600)));
	error.service = 'bot';
	error.code = Number(data.code) || 0;
	throw error;
}
export function botError(e) {
	if (e instanceof HttpError) return e.message;
	if (!(e instanceof ProviderError))
		return 'No se pudo confirmar la respuesta de Discord. Se volverá a intentar.';
	if (e.status === 401) return 'Falta el token del bot o no es válido (secreto DISCORD_BOT_TOKEN).';
	if (e.status === 403 || [50001, 50013].includes(e.code))
		return 'El bot no tiene permiso en el canal de convocatorias. Dale «Ver canal», «Enviar mensajes», «Insertar enlaces» y «Usar emojis externos».';
	if (e.status === 404)
		return 'Discord no encuentra el canal o el mensaje de la convocatoria. Revisa el canal configurado.';
	if (e.status === 429) return 'Discord pide esperar un momento. Se volverá a intentar solo.';
	return `Discord respondió HTTP ${e.status}.`;
}

export function emojiOf(icon, emojis) {
	if (!icon) return null;
	const custom = /^<(a?):(\w{2,32}):(\d{17,20})>$/.exec(icon);
	if (custom) return { name: custom[2], id: custom[3], ...(custom[1] ? { animated: true } : {}) };
	if (/^\w+$/.test(icon)) return emojis[icon] ? { name: icon, id: emojis[icon] } : null;
	return { name: icon };
}
const emojiText = (e) => (!e ? '' : e.id ? `<${e.animated ? 'a' : ''}:${e.name}:${e.id}>` : e.name);
const plain = (value) => String(value ?? '').replace(/([\\*_~`|>#[\]()@:])/g, '\\$1');

export const closesAt = (doc) =>
	(doc.startTime - (Number(doc.advancedSettings?.closeMinutes) || 0) * 60) * 1000;
export const signupsOpen = (doc) => Date.now() < closesAt(doc);
const classOf = (doc, name) => doc.classes.find((c) => c.name === name);
const ordered = (doc) =>
	[...doc.signUps].sort((a, b) => a.entryTime - b.entryTime || Number(a.id) - Number(b.id));

// Places go in order of arrival: over the event, class or role limit, a sign-up waits in
// the queue and moves up by itself when someone leaves.
export function settle(doc) {
	const limit = Number(doc.advancedSettings?.limit) || Infinity,
		perRole = {},
		perClass = {};
	let total = 0;
	for (const signup of ordered(doc)) {
		const cls = classOf(doc, signup.className);
		const target = doc.signUps.find((s) => s.id === signup.id);
		if (cls?.type === 'default') {
			target.status = 'primary';
			continue;
		}
		const roleLimit = doc.roles.find((r) => r.name === signup.roleName)?.limit || Infinity,
			classLimit = cls?.limit || Infinity,
			role = signup.roleName || '',
			fits =
				total < limit &&
				(perRole[role] || 0) < roleLimit &&
				(perClass[signup.className] || 0) < classLimit;
		target.status = fits ? 'primary' : 'queued';
		if (fits) {
			total++;
			perRole[role] = (perRole[role] || 0) + 1;
			perClass[signup.className] = (perClass[signup.className] || 0) + 1;
		}
	}
	return doc;
}
export function applySignup(doc, { userId, name, className, specName }) {
	const cls = classOf(doc, className);
	if (!cls) throw new HttpError(400, 'Esa opción ya no está en la plantilla de la convocatoria.');
	const spec = (cls.specs || []).find((s) => s.name === specName),
		previous = doc.signUps.find((s) => s.userId === userId),
		wasPlaced = previous && classOf(doc, previous.className)?.type !== 'default';
	if (cls.type !== 'default' && cls.specs?.length && !spec)
		throw new HttpError(400, 'Elige una especialización de la plantilla.');
	const signup = {
		id: previous?.id ?? String(doc.nextSignup++),
		userId,
		name: String(name).slice(0, 60),
		className: cls.name,
		specName: spec?.name || '',
		roleName: spec?.roleName || '',
		status: 'primary',
		// Changing class keeps the place; coming back from «ausente» goes to the end.
		entryTime: wasPlaced ? previous.entryTime : Date.now(),
	};
	doc.signUps = [...doc.signUps.filter((s) => s.userId !== userId), signup];
	return signup;
}

function clip(lines) {
	const kept = [];
	let size = 0;
	for (const text of lines) {
		if (size + text.length + 1 > 980) break;
		kept.push(text);
		size += text.length + 1;
	}
	if (kept.length < lines.length) kept.push(`… y ${lines.length - kept.length} más`);
	return kept.join('\n') || '—';
}
// The Discord message of an event: embed with the sign-ups and the sign-up buttons.
export function renderMessage(doc, eventId, emojis, origin, closed = false) {
	const look = doc.look || {},
		icon = (value) => emojiText(emojiOf(value, emojis)),
		all = ordered(doc),
		placed = all.filter((s) => classOf(doc, s.className)?.type !== 'default'),
		active = placed.filter((s) => s.status === 'primary'),
		queued = placed.filter((s) => s.status !== 'primary'),
		limit = Number(doc.advancedSettings?.limit) || null,
		position = new Map(active.map((s, i) => [s.id, String(i + 1).padStart(2, '0')]));
	const specIcon = (s) =>
			icon(classOf(doc, s.className)?.specs?.find((x) => x.name === s.specName)?.icon),
		classIcon = (s) => icon(classOf(doc, s.className)?.icon);
	const lines = [];
	if (doc.description) lines.push(doc.description, '');
	lines.push(`📅 <t:${doc.startTime}:F> · <t:${doc.startTime}:R>`);
	if (Number.isFinite(doc.endTime)) lines.push(`⏱️ Termina <t:${doc.endTime}:t>`);
	const tags = [doc.category, doc.roster].filter(Boolean).map(plain).join(' · ');
	if (tags) lines.push(`🏷️ ${tags}`);
	if (doc.leaderName) lines.push(`👑 ${plain(doc.leaderName)}`);
	lines.push(
		`👥 **${active.length}${limit ? '/' + limit : ''}** inscritos` +
			(queued.length ? ` · ⏳ ${queued.length} en cola` : ''),
	);
	const roleLine = doc.roles
		.map((r) => {
			const count = active.filter((s) => s.roleName === r.name).length;
			return `${icon(r.icon)} ${plain(r.name)} **${count}${r.limit ? '/' + r.limit : ''}**`.trim();
		})
		.join(' · ');
	if (roleLine) lines.push(roleLine);
	if (closed) lines.push('', '🔒 **Inscripciones cerradas**');
	else
		lines.push(
			'',
			'📝 Para apuntarte necesitas **entrar en la web con Discord** y tener tu personaje **vinculado con Battle.net** (Mi perfil → Battle.net).',
		);
	const fields = [];
	const group = (title, members, line) => {
		if (members.length && fields.length < 24)
			fields.push({
				name: `${title} (${members.length})`.slice(0, 256),
				value: clip(members.map(line)),
				inline: true,
			});
	};
	if (look.groupBy === 'role') {
		for (const role of doc.roles)
			group(
				`${icon(role.icon)} ${role.name}`.trim(),
				active.filter((s) => s.roleName === role.name),
				(s) => `${classIcon(s)}${specIcon(s)} \`${position.get(s.id)}\` ${plain(s.name)}`,
			);
		group(
			'Sin rol',
			active.filter((s) => !doc.roles.some((r) => r.name === s.roleName)),
			(s) => `${classIcon(s)} \`${position.get(s.id)}\` ${plain(s.name)}`,
		);
	} else {
		for (const cls of doc.classes.filter((c) => c.type !== 'default'))
			group(
				`${icon(cls.icon)} ${cls.name}`.trim(),
				active.filter((s) => s.className === cls.name),
				(s) => `${specIcon(s)} \`${position.get(s.id)}\` ${plain(s.name)}`.trim(),
			);
		group(
			'Otros',
			active.filter((s) => !classOf(doc, s.className)),
			(s) => `\`${position.get(s.id)}\` ${plain(s.name)} · ${plain(s.className)}`,
		);
	}
	group('⏳ En cola', queued, (s) => `${classIcon(s)}${specIcon(s)} ${plain(s.name)}`.trim());
	for (const cls of doc.classes.filter((c) => c.type === 'default'))
		group(
			`${icon(cls.icon)} ${cls.name}`.trim(),
			all.filter((s) => s.className === cls.name),
			(s) => plain(s.name),
		);
	const embed = {
		title: String(doc.title).slice(0, 256),
		description: lines.join('\n').slice(0, 4000),
		color: parseInt((look.color || '#8b1e2d').slice(1), 16),
		fields,
		...(look.footer ? { footer: { text: look.footer.slice(0, 200) } } : {}),
		...(look.imageUrl ? { image: { url: look.imageUrl } } : {}),
	};
	// One button signs up with the player's own character: its class comes from the web.
	const button = (cls) => {
		const emoji = emojiOf(cls.icon, emojis);
		return {
			type: 2,
			style: 2,
			custom_id: `rs:c:${eventId}:${cls.name}`,
			disabled: closed,
			label: cls.name,
			...(emoji ? { emoji } : {}),
		};
	};
	const main = [
		{
			type: 2,
			style: 3,
			custom_id: `rs:a:${eventId}`,
			label: 'Apuntarme',
			emoji: { name: '✅' },
			disabled: closed,
		},
		...doc.classes.filter((c) => c.type === 'default').map(button),
		{ type: 2, style: 4, custom_id: `rs:x:${eventId}`, label: 'Retirarme', disabled: closed },
	].slice(0, 5);
	const rows = [{ type: 1, components: main }];
	if (look.showWebLink !== false && /^https:\/\//.test(origin || ''))
		rows.push({
			type: 1,
			components: [
				{ type: 2, style: 5, label: 'Mi perfil (Battle.net)', url: `${origin}/perfil` },
				{ type: 2, style: 5, label: 'Ver en la web', url: `${origin}/raids` },
			],
		});
	return { embeds: [embed], components: rows, allowed_mentions: { parse: [] } };
}

// Saves the event and queues the edit of its Discord message. `bump` marks an edit of the
// event itself (not a sign-up), which is what a concurrent website edit checks against.
export function saveDoc(db, eventId, doc, bump = false) {
	settle(doc);
	if (bump) doc.lastUpdated = Math.max(Math.floor(Date.now() / 1000), (doc.lastUpdated || 0) + 1);
	const closes = closesAt(doc),
		time = Date.now();
	db.prepare(
		'UPDATE raid_bot_events SET data=?,dirty=1,next_at=?,closes_at=?,closed=CASE WHEN ?>? THEN 0 ELSE closed END WHERE event_id=?',
	).run(JSON.stringify(doc), time, closes, closes, time, eventId);
	return doc;
}
export function botEvent(db, eventId) {
	const row = db
		.prepare(
			'SELECT * FROM raid_bot_events WHERE event_id=? AND removed=0 AND message_id IS NOT NULL',
		)
		.get(eventId);
	return row ? { row, doc: JSON.parse(row.data) } : null;
}

// Same interface as raidHelper(): the sync job runner drives both the same way.
export function botProvider(db, env, transport = fetch) {
	const load = (messageId) => {
		const row = db
			.prepare('SELECT * FROM raid_bot_events WHERE message_id=? AND removed=0')
			.get(String(messageId));
		if (!row) {
			const error = new ProviderError(404);
			error.service = 'bot';
			throw error;
		}
		return row;
	};
	const change = (messageId, bump, fn) => {
		const row = load(messageId),
			doc = JSON.parse(row.data);
		fn(doc);
		return saveDoc(db, row.event_id, doc, bump);
	};
	return {
		list: async () => [],
		get: async (messageId) => JSON.parse(load(messageId).data),
		async create(payload, eventId, retry = false) {
			const existing = db.prepare('SELECT * FROM raid_bot_events WHERE event_id=?').get(eventId);
			if (existing?.message_id) return JSON.parse(existing.data);
			const { config, emojis } = botState(db),
				channel = botChannel(config, env);
			if (!snowflake(channel))
				throw new HttpError(409, 'Falta indicar el canal de Discord de las convocatorias.');
			const start = Number(payload.date),
				event = db.prepare('SELECT category,roster FROM raid_events WHERE id=?').get(eventId);
			const doc = settle({
				id: null,
				serverId: env.DISCORD_GUILD_ID,
				channelId: channel,
				leaderId: payload.leaderId,
				leaderName:
					db.prepare('SELECT display_name FROM users WHERE id=?').get(payload.leaderId)
						?.display_name || '',
				title: payload.title,
				description: String(payload.description || ''),
				category: event?.category || '',
				roster: event?.roster || '',
				startTime: start,
				endTime: start + Number(payload.advancedSettings.duration) * 60,
				lastUpdated: Math.floor(Date.now() / 1000),
				advancedSettings: {
					limit: payload.advancedSettings.limit,
					closeMinutes: config.closeMinutes,
				},
				classes: config.classes,
				roles: config.roles,
				look: lookOf(config),
				signUps: [],
				nextSignup: 1,
			});
			let messageId = null;
			// A repeated attempt first looks for the message a lost answer may have left.
			if (retry) {
				const recent = await botRest(
					env,
					transport,
					'GET',
					`/channels/${channel}/messages?limit=50`,
				);
				messageId =
					(Array.isArray(recent) ? recent : []).find((m) =>
						JSON.stringify(m.components || []).includes(`rs:x:${eventId}`),
					)?.id || null;
			}
			if (!messageId) {
				const mention = snowflake(config.mentionRoleId) ? config.mentionRoleId : null;
				const message = await botRest(env, transport, 'POST', `/channels/${channel}/messages`, {
					...renderMessage(doc, eventId, emojis, env.APP_ORIGIN),
					...(mention ? { content: `<@&${mention}>` } : {}),
					allowed_mentions: mention ? { roles: [mention] } : { parse: [] },
					nonce: eventId.replace(/-/g, '').slice(0, 25),
					enforce_nonce: true,
				});
				messageId = message.id;
			}
			if (!snowflake(messageId)) throw new ProviderError(502);
			doc.id = messageId;
			db.prepare(
				'INSERT OR REPLACE INTO raid_bot_events(event_id,message_id,channel_id,data,closes_at) VALUES(?,?,?,?,?)',
			).run(eventId, messageId, channel, JSON.stringify(doc), closesAt(doc));
			return doc;
		},
		update: async (messageId, payload) =>
			change(messageId, true, (doc) => {
				doc.title = payload.title;
				doc.startTime = payload.startTime;
				doc.endTime = payload.endTime;
				doc.advancedSettings.limit = payload.advancedSettings.limit;
				if (typeof payload.description === 'string') doc.description = payload.description;
				for (const role of payload.roles || []) {
					const target = doc.roles.find((r) => r.name === role.name);
					if (target) target.limit = role.limit;
				}
			}),
		async remove(messageId) {
			const row = load(messageId);
			try {
				await botRest(
					env,
					transport,
					'DELETE',
					`/channels/${row.channel_id}/messages/${row.message_id}`,
				);
			} catch (e) {
				if (e.status !== 404) throw e;
			}
			db.prepare('UPDATE raid_bot_events SET removed=1,dirty=0 WHERE event_id=?').run(row.event_id);
		},
		signup: async (messageId, value) => change(messageId, false, (doc) => applySignup(doc, value)),
		editSignup: async (messageId, _signup, value) =>
			change(messageId, false, (doc) => applySignup(doc, value)),
		removeSignup: async (messageId, signupId) =>
			change(messageId, false, (doc) => {
				doc.signUps = doc.signUps.filter((s) => String(s.id) !== String(signupId));
			}),
	};
}

// Category and roster live on the website; the message shows them.
export function botMeta(db, eventId, meta) {
	const event = botEvent(db, eventId);
	if (!event) return;
	saveDoc(db, eventId, { ...event.doc, category: meta.category, roster: meta.roster });
}
// A template saved on the website reaches the open events and their Discord messages.
export function applyTemplate(db, config) {
	const rows = db
		.prepare(
			"SELECT b.event_id,b.data FROM raid_bot_events b JOIN raid_events e ON e.id=b.event_id WHERE b.removed=0 AND b.message_id IS NOT NULL AND e.state='Abierta' AND e.starts_at>?",
		)
		.all(new Date().toISOString());
	for (const row of rows) {
		const doc = JSON.parse(row.data);
		doc.classes = config.classes;
		doc.roles = config.roles;
		doc.look = lookOf(config);
		doc.advancedSettings.closeMinutes = config.closeMinutes;
		saveDoc(db, row.event_id, doc, true);
	}
	return rows.map((row) => row.event_id);
}

export function nextBotRenderAt(db) {
	return (
		db
			.prepare(
				'SELECT MIN(CASE WHEN dirty=1 THEN next_at ELSE closes_at END) due FROM raid_bot_events WHERE removed=0 AND message_id IS NOT NULL AND (dirty=1 OR closed=0)',
			)
			.get().due ?? null
	);
}
const rendering = new WeakSet();
// Brings the Discord messages up to date: changed events, and events whose sign-ups
// have just closed (their buttons switch off).
export async function deliverBotRenders(db, env, transport = fetch, limit = 5) {
	if (!botReady(env) || rendering.has(db)) return 0;
	rendering.add(db);
	let done = 0;
	try {
		const time = Date.now(),
			{ emojis } = botState(db);
		const rows = db
			.prepare(
				'SELECT b.*,e.state FROM raid_bot_events b JOIN raid_events e ON e.id=b.event_id WHERE b.removed=0 AND b.message_id IS NOT NULL AND ((b.dirty=1 AND b.next_at<=?) OR (b.closed=0 AND b.closes_at<=?)) ORDER BY b.next_at LIMIT ?',
			)
			.all(time, time, limit);
		for (const row of rows) {
			const doc = JSON.parse(row.data),
				closed = row.state !== 'Abierta' || !signupsOpen(doc);
			try {
				await botRest(
					env,
					transport,
					'PATCH',
					`/channels/${row.channel_id}/messages/${row.message_id}`,
					renderMessage(doc, row.event_id, emojis, env.APP_ORIGIN, closed),
				);
				// A sign-up that arrived meanwhile keeps the message pending.
				db.prepare(
					"UPDATE raid_bot_events SET dirty=CASE WHEN data=? THEN 0 ELSE 1 END,closed=?,error='' WHERE event_id=?",
				).run(row.data, Number(closed), row.event_id);
				done++;
			} catch (e) {
				if (e.status === 404 && e.code !== 10003) {
					// The message was deleted in Discord: the next sync cancels the event.
					db.prepare(
						"UPDATE raid_bot_events SET removed=1,dirty=0,error='Mensaje borrado en Discord.' WHERE event_id=?",
					).run(row.event_id);
					continue;
				}
				db.prepare('UPDATE raid_bot_events SET next_at=?,error=? WHERE event_id=?').run(
					Date.now() + (e.status === 429 ? e.retryAfter : 60) * 1000,
					botError(e),
					row.event_id,
				);
				if (e.status === 429) break;
			}
		}
	} finally {
		rendering.delete(db);
	}
	return done;
}

// One press on the website: reads the application, uploads the class and specialization
// icons as its emojis, points Discord's button presses at the website and checks the channel.
export async function connectBot(db, env, { transport = fetch, readAsset }) {
	const app = await botRest(env, transport, 'GET', '/applications/@me');
	if (!snowflake(app.id) || !/^[0-9a-f]{64}$/i.test(app.verify_key || ''))
		throw new ProviderError(502);
	db.prepare('UPDATE raid_bot_config SET app=?,updated_at=? WHERE id=1').run(
		JSON.stringify({ id: app.id, name: String(app.name || ''), verifyKey: app.verify_key }),
		new Date().toISOString(),
	);
	const report = { app: String(app.name || ''), created: 0, failed: [], endpoint: '', channel: '' };
	const listed = await botRest(env, transport, 'GET', `/applications/${app.id}/emojis`),
		have = Object.fromEntries((listed.items || []).map((e) => [e.name, e.id]));
	for (const icon of botIcons) {
		if (have[icon.name]) continue;
		try {
			const bytes = await readAsset(icon.file);
			const created = await botRest(env, transport, 'POST', `/applications/${app.id}/emojis`, {
				name: icon.name,
				image: `data:image/webp;base64,${Buffer.from(bytes).toString('base64')}`,
			});
			have[icon.name] = created.id;
			report.created++;
		} catch (e) {
			report.failed.push(icon.name);
			if (e.status === 429 || e.status === 401) break;
		}
	}
	db.prepare('UPDATE raid_bot_config SET emojis=? WHERE id=1').run(JSON.stringify(have));
	const endpoint = `${env.APP_ORIGIN}/api/discord/interactions`;
	if (!endpoint.startsWith('https://'))
		report.endpoint = 'Solo se puede activar en la web publicada (https).';
	else if (app.interactions_endpoint_url === endpoint) report.endpoint = 'ok';
	else
		try {
			// Discord calls the address before accepting it; the verify key is already saved.
			await botRest(env, transport, 'PATCH', '/applications/@me', {
				interactions_endpoint_url: endpoint,
			});
			report.endpoint = 'ok';
		} catch (e) {
			report.endpoint = `Discord no aceptó la dirección de los botones (${botError(e)})`;
		}
	const channel = botChannel(botState(db).config, env);
	if (!snowflake(channel)) report.channel = 'Falta indicar el canal de las convocatorias.';
	else
		try {
			await botRest(env, transport, 'GET', `/channels/${channel}`);
			report.channel = 'ok';
		} catch (e) {
			report.channel = botError(e);
		}
	return report;
}
