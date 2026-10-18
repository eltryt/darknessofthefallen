import { randomUUID } from 'node:crypto';
import { audit, transaction } from './database-core.mjs';
import { HttpError } from './domain.mjs';
import { canManageEvent, eventRaw, signupStatus } from './raid-events.mjs';

const now = () => new Date().toISOString();
export const GROUP_SIZE = 5;
const MAX_ATTEMPTS = 5;
const DISCORD_API = 'https://discord.com/api/v10';

// Groups follow the event capacity (20 → 4 groups, 40 → 8), between 1 and 8.
export const groupCount = (capacity) =>
	Math.min(8, Math.max(1, Math.ceil((Number(capacity) || 20) / GROUP_SIZE)));
export function slotLabel(slot) {
	if (slot === 'bench') return 'Banquillo';
	if (slot === 'removed') return 'Retirado de la alineación';
	const group = /^group:(\d)$/.exec(slot);
	return group ? `Grupo ${group[1]}` : slot;
}
// Private messages need a bot token installed as a Worker secret and an explicit switch.
export const dmReady = (env) =>
	env.DISCORD_DM_ENABLED === 'true' &&
	typeof env.DISCORD_BOT_TOKEN === 'string' &&
	/^[\w.-]{50,120}$/.test(env.DISCORD_BOT_TOKEN);

function managedEvent(db, user, id) {
	const row = db.prepare('SELECT * FROM raid_events WHERE id=?').get(id);
	if (!row || row.state === 'Eliminada') throw new HttpError(404, 'Convocatoria no encontrada.');
	if (!user || !canManageEvent(user, row))
		throw new HttpError(
			403,
			'Solo el responsable de la convocatoria, los oficiales y el Líder pueden gestionar la alineación.',
		);
	return row;
}
// Sign-ups that can be placed: everyone except declared absences.
function eligibleSignups(row) {
	const raw = eventRaw(row);
	return (raw.signUps || [])
		.filter((s) => s.userId && signupStatus(s, raw) !== 'Ausente')
		.map((s) => ({
			id: String(s.id),
			userId: String(s.userId),
			name: s.name,
			className: s.className,
			specName: s.specName || '',
			role: s.roleName || '',
			status: signupStatus(s, raw),
		}));
}
function lineupRow(db, row, user) {
	let lineup = db.prepare('SELECT * FROM raid_lineups WHERE event_id=?').get(row.id);
	if (!lineup && user) {
		db.prepare('INSERT INTO raid_lineups(event_id,updated_at,updated_by) VALUES(?,?,?)').run(
			row.id,
			now(),
			user.id,
		);
		lineup = db.prepare('SELECT * FROM raid_lineups WHERE event_id=?').get(row.id);
	}
	return lineup;
}
// Character used for attendance: the one linked to the sign-up, otherwise the member's Main.
function characterFor(db, eventId, signup) {
	const link = db
		.prepare(
			'SELECT c.id,c.class FROM raid_character_links l JOIN characters c ON c.id=l.character_id WHERE l.event_id=? AND l.signup_id=? AND l.user_id=? AND c.archived_at IS NULL',
		)
		.get(eventId, signup.id, signup.userId);
	return (
		link ||
		db
			.prepare(
				'SELECT id,class FROM characters WHERE user_id=? AND archived_at IS NULL ORDER BY is_main DESC,created_at LIMIT 1',
			)
			.get(signup.userId) ||
		null
	);
}
export function lineupView(db, row, user, env) {
	const lineup = lineupRow(db, row, user),
		signups = eligibleSignups(row);
	const slots = Object.fromEntries(
		db
			.prepare('SELECT signup_id,slot FROM raid_lineup_slots WHERE event_id=? ORDER BY position')
			.all(row.id)
			.map((s) => [s.signup_id, s.slot]),
	);
	const users = new Set(
		db
			.prepare(`SELECT id FROM users WHERE id IN (${signups.map(() => '?').join(',') || "''"})`)
			.all(...signups.map((s) => s.userId))
			.map((u) => u.id),
	);
	return {
		event: {
			id: row.id,
			title: row.title,
			starts_at: row.starts_at,
			capacity: row.capacity,
			groups: groupCount(row.capacity),
			groupSize: GROUP_SIZE,
		},
		lineup: {
			status: lineup.status,
			revision: lineup.revision,
			sentRevision: lineup.sent_revision,
			sentAt: lineup.sent_at,
			sentBy: lineup.sent_by
				? db.prepare('SELECT display_name FROM users WHERE id=?').get(lineup.sent_by)?.display_name
				: null,
			pendingChanges: lineup.sent_revision !== null && lineup.revision !== lineup.sent_revision,
		},
		signups: signups.map((s) => {
			const character = characterFor(db, row.id, s);
			return {
				...s,
				registered: users.has(s.userId),
				characterId: character?.id || null,
				characterClass: character?.class || null,
			};
		}),
		slots,
		callups: db
			.prepare(
				'SELECT user_id,name,slot,dm_status,dm_error,sent_at,updated_at FROM raid_callups WHERE event_id=? ORDER BY name',
			)
			.all(row.id),
		attendance: Object.fromEntries(
			db
				.prepare('SELECT user_id,status FROM attendance WHERE raid_id=?')
				.all(row.id)
				.map((a) => [a.user_id, a.status]),
		),
		dm: { ready: dmReady(env) },
		started: Date.parse(row.starts_at) <= Date.now(),
		bosses: bossAssignments(db, row.id),
	};
}
function bossAssignments(db, eventId) {
	const rows = db
		.prepare('SELECT boss,user_id,status FROM raid_boss_assignments WHERE event_id=?')
		.all(eventId);
	return db
		.prepare('SELECT boss FROM raid_boss_plans WHERE event_id=? ORDER BY position')
		.all(eventId)
		.map(({ boss }) => ({
			boss,
			assignments: Object.fromEntries(
				rows.filter((r) => r.boss === boss).map((r) => [r.user_id, r.status]),
			),
		}));
}
const MAX_BOSSES = 20;
function validBosses(row, value) {
	if (!Array.isArray(value) || value.length > MAX_BOSSES)
		throw new HttpError(400, `Indica como máximo ${MAX_BOSSES} jefes.`);
	const users = new Set(eligibleSignups(row).map((s) => s.userId)),
		names = new Set();
	return value.map((entry) => {
		const boss = String(entry?.boss ?? '').trim();
		if (!boss || boss.length > 120) throw new HttpError(400, 'Nombre de jefe no válido.');
		if (names.has(boss.toLowerCase())) throw new HttpError(400, `${boss} aparece dos veces.`);
		names.add(boss.toLowerCase());
		const assignments = Object.entries(entry.assignments || {});
		for (const [userId, status] of assignments) {
			if (!users.has(userId))
				throw new HttpError(400, 'Hay un jugador que ya no está inscrito. Recarga la alineación.');
			if (!['in', 'bench'].includes(status)) throw new HttpError(400, 'Estado no válido.');
		}
		return { boss, assignments };
	});
}
function validSlots(row, value) {
	if (!Array.isArray(value) || value.length > 200)
		throw new HttpError(400, 'Alineación no válida.');
	const signups = new Map(eligibleSignups(row).map((s) => [s.id, s])),
		groups = groupCount(row.capacity),
		counts = {},
		users = new Set();
	return value.map((entry, position) => {
		const signup = signups.get(String(entry?.signupId));
		if (!signup)
			throw new HttpError(400, 'Hay una inscripción que ya no existe. Recarga la alineación.');
		const slot = String(entry.slot);
		const group = /^group:(\d)$/.exec(slot);
		if (slot !== 'bench' && !(group && Number(group[1]) >= 1 && Number(group[1]) <= groups))
			throw new HttpError(400, 'Grupo no válido.');
		if (group && (counts[slot] = (counts[slot] || 0) + 1) > GROUP_SIZE)
			throw new HttpError(400, `Cada grupo admite ${GROUP_SIZE} jugadores.`);
		if (users.has(signup.userId))
			throw new HttpError(400, `${signup.name} aparece dos veces en la alineación.`);
		users.add(signup.userId);
		return { signup, slot, position };
	});
}
function requireRevision(lineup, value) {
	if (!Number.isInteger(value) || value !== lineup.revision)
		throw new HttpError(409, 'Otra persona ha cambiado la alineación. Recarga antes de continuar.');
}

export async function raidLineupApi({ db, user, path, method, body, send, env, requireUser }) {
	let m;
	if (path === '/api/callups/mine' && method === 'GET') {
		requireUser();
		send(
			200,
			db
				.prepare(
					`SELECT c.event_id,c.slot,c.dm_status,c.updated_at,e.title,e.starts_at,e.state,a.status AS attendance
					 FROM raid_callups c JOIN raid_events e ON e.id=c.event_id
					 LEFT JOIN attendance a ON a.raid_id=c.event_id AND a.user_id=c.user_id
					 WHERE c.user_id=? AND e.state!='Eliminada' ORDER BY e.starts_at DESC LIMIT 30`,
				)
				.all(user.id)
				.map((c) => ({ ...c, slotLabel: slotLabel(c.slot) })),
		);
		return true;
	}
	if (!(m = path.match(/^\/api\/events\/([^/]+)\/lineup(?:\/(send|retry|bosses))?$/))) return false;
	requireUser();
	const row = managedEvent(db, user, m[1]),
		action = m[2];
	if (action === 'bosses' && method === 'PUT') {
		const bosses = validBosses(row, (await body()).bosses);
		transaction(db, () => {
			db.prepare('DELETE FROM raid_boss_assignments WHERE event_id=?').run(row.id);
			db.prepare('DELETE FROM raid_boss_plans WHERE event_id=?').run(row.id);
			const plan = db.prepare('INSERT INTO raid_boss_plans(event_id,position,boss) VALUES(?,?,?)'),
				assign = db.prepare(
					'INSERT INTO raid_boss_assignments(event_id,boss,user_id,status) VALUES(?,?,?,?)',
				);
			bosses.forEach((b, position) => {
				plan.run(row.id, position, b.boss);
				for (const [userId, status] of b.assignments) assign.run(row.id, b.boss, userId, status);
			});
			audit(db, user.id, 'raid.bosses.saved', row.id, { bosses: bosses.map((b) => b.boss) });
		});
		send(200, lineupView(db, row, user, env));
		return true;
	}
	if (!action && method === 'GET') {
		send(200, lineupView(db, row, user, env));
		return true;
	}
	if (!action && method === 'PUT') {
		const v = await body(),
			entries = validSlots(row, v.slots);
		transaction(db, () => {
			const lineup = lineupRow(db, row, user);
			requireRevision(lineup, v.revision);
			db.prepare('DELETE FROM raid_lineup_slots WHERE event_id=?').run(row.id);
			const insert = db.prepare(
				'INSERT INTO raid_lineup_slots(event_id,signup_id,user_id,slot,position) VALUES(?,?,?,?,?)',
			);
			for (const e of entries) insert.run(row.id, e.signup.id, e.signup.userId, e.slot, e.position);
			db.prepare(
				'UPDATE raid_lineups SET revision=revision+1,updated_at=?,updated_by=? WHERE event_id=?',
			).run(now(), user.id, row.id);
			audit(db, user.id, 'raid.lineup.saved', row.id, { players: entries.length });
		});
		send(200, lineupView(db, row, user, env));
		return true;
	}
	if (action === 'send' && method === 'POST') {
		const v = await body(),
			ready = dmReady(env),
			signups = new Map(eligibleSignups(row).map((s) => [s.id, s]));
		const result = transaction(db, () => {
			const lineup = lineupRow(db, row, user);
			requireRevision(lineup, v.revision);
			const slots = db
				.prepare('SELECT * FROM raid_lineup_slots WHERE event_id=? ORDER BY position')
				.all(row.id)
				.filter((s) => signups.has(s.signup_id));
			if (!slots.some((s) => s.slot !== 'bench'))
				throw new HttpError(400, 'Coloca al menos un jugador en un grupo antes de enviar.');
			const delivery = ready
				? { status: 'pending', error: '' }
				: { status: 'skipped', error: 'Bot de Discord no configurado: aviso no enviado.' };
			const existing = new Map(
				db
					.prepare('SELECT * FROM raid_callups WHERE event_id=?')
					.all(row.id)
					.map((c) => [c.user_id, c]),
			);
			const counts = { notified: 0, unchanged: 0, removed: 0 };
			const update = db.prepare(
				'UPDATE raid_callups SET signup_id=?,name=?,slot=?,revision=?,dm_status=?,dm_error=?,attempts=0,next_at=0,updated_at=? WHERE id=?',
			);
			for (const s of slots) {
				const signup = signups.get(s.signup_id),
					previous = existing.get(s.user_id);
				existing.delete(s.user_id);
				if (previous && previous.slot === s.slot && previous.dm_status === 'sent') {
					counts.unchanged++;
					continue;
				}
				counts.notified++;
				if (previous)
					update.run(
						s.signup_id,
						signup.name,
						s.slot,
						lineup.revision,
						delivery.status,
						delivery.error,
						now(),
						previous.id,
					);
				else
					db.prepare(
						'INSERT INTO raid_callups(id,event_id,user_id,signup_id,name,slot,revision,dm_status,dm_error,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)',
					).run(
						randomUUID(),
						row.id,
						s.user_id,
						s.signup_id,
						signup.name,
						s.slot,
						lineup.revision,
						delivery.status,
						delivery.error,
						now(),
						now(),
					);
			}
			// Players taken out of a lineup that was already sent are told once.
			for (const previous of existing.values())
				if (previous.slot !== 'removed') {
					counts.removed++;
					update.run(
						previous.signup_id,
						previous.name,
						'removed',
						lineup.revision,
						delivery.status,
						delivery.error,
						now(),
						previous.id,
					);
				}
			db.prepare(
				"UPDATE raid_lineups SET status='Enviada',sent_revision=revision,sent_at=?,sent_by=? WHERE event_id=?",
			).run(now(), user.id, row.id);
			audit(db, user.id, 'raid.lineup.sent', row.id, { ...counts, dm: ready });
			return counts;
		});
		send(200, { ...result, dmReady: ready, view: lineupView(db, row, user, env) });
		return true;
	}
	if (action === 'retry' && method === 'POST') {
		if (!dmReady(env)) throw new HttpError(503, 'El bot de Discord todavía no está configurado.');
		const changes = transaction(db, () => {
			const n = db
				.prepare(
					"UPDATE raid_callups SET dm_status='pending',dm_error='',attempts=0,next_at=0,updated_at=? WHERE event_id=? AND dm_status IN ('failed','skipped')",
				)
				.run(now(), row.id).changes;
			audit(db, user.id, 'raid.callups.retry', row.id, { callups: n });
			return n;
		});
		send(200, { requeued: changes, view: lineupView(db, row, user, env) });
		return true;
	}
	throw new HttpError(405, 'Método no permitido.');
}

const madrid = new Intl.DateTimeFormat('es-ES', {
	timeZone: 'Europe/Madrid',
	weekday: 'long',
	day: 'numeric',
	month: 'long',
	hour: '2-digit',
	minute: '2-digit',
});
export function callupMessage(callup, event, origin) {
	const when = madrid.format(new Date(event.starts_at));
	const link = `${origin}/perfil#convocatorias`;
	const content =
		callup.slot === 'removed'
			? `⚔️ **Darkness of the Fallen · Cambio de convocatoria**\nYa no figuras en la alineación de **${event.title}** (${when}, hora de Madrid).\nDetalles: ${link}`
			: `⚔️ **Darkness of the Fallen · Convocatoria**\n**${event.title}**\n${when} (hora de Madrid)\nTu puesto: **${slotLabel(callup.slot)}**\nDetalles: ${link}`;
	return { content: content.slice(0, 1900), allowed_mentions: { parse: [] } };
}
async function discord(transport, env, path, payload) {
	const response = await transport(DISCORD_API + path, {
		method: 'POST',
		redirect: 'manual',
		headers: {
			Authorization: `Bot ${env.DISCORD_BOT_TOKEN}`,
			'Content-Type': 'application/json',
			'User-Agent':
				'DarknessOfTheFallen (https://darknessofthefallen.com, 1)',
		},
		body: JSON.stringify(payload),
	});
	let data = {};
	try {
		data = await response.json();
	} catch {
		/* Empty or non-JSON error bodies keep the HTTP status. */
	}
	return { status: response.status, data };
}
const busy = new WeakSet();
// Sends pending call-ups one by one. A failure after Discord may have received the
// message is marked uncertain and never replayed automatically.
export async function deliverCallups(db, env, transport = fetch, limit = 10) {
	if (!dmReady(env) || busy.has(db)) return 0;
	busy.add(db);
	let delivered = 0;
	try {
		db.prepare(
			"UPDATE raid_callups SET dm_status='uncertain',dm_error='Envío interrumpido: comprueba con el jugador antes de reintentar.' WHERE dm_status='sending' AND next_at<=?",
		).run(Date.now());
		for (let i = 0; i < limit; i++) {
			const callup = db
				.prepare(
					"SELECT * FROM raid_callups WHERE dm_status='pending' AND next_at<=? ORDER BY updated_at LIMIT 1",
				)
				.get(Date.now());
			if (!callup) break;
			const event = db.prepare('SELECT * FROM raid_events WHERE id=?').get(callup.event_id);
			if (!event || event.state === 'Eliminada') {
				db.prepare(
					"UPDATE raid_callups SET dm_status='failed',dm_error='La convocatoria ya no existe.' WHERE id=?",
				).run(callup.id);
				continue;
			}
			const fail = (error, retryIn) => {
				const attempts = callup.attempts + 1;
				const retry = retryIn !== undefined && attempts < MAX_ATTEMPTS;
				db.prepare(
					'UPDATE raid_callups SET dm_status=?,dm_error=?,attempts=?,next_at=?,updated_at=? WHERE id=?',
				).run(
					retry ? 'pending' : 'failed',
					error,
					attempts,
					retry ? Date.now() + retryIn : 0,
					now(),
					callup.id,
				);
			};
			// The lease also marks the row so a crash mid-send is detected next run.
			db.prepare("UPDATE raid_callups SET dm_status='sending',next_at=? WHERE id=?").run(
				Date.now() + 120000,
				callup.id,
			);
			let channel;
			try {
				channel = await discord(transport, env, '/users/@me/channels', {
					recipient_id: callup.user_id,
				});
			} catch {
				fail('Discord no respondió al abrir el mensaje privado.', 60000 * (callup.attempts + 1));
				continue;
			}
			if (channel.status === 429) {
				fail(
					'Límite de Discord: se reintentará.',
					Math.ceil((channel.data.retry_after || 5) * 1000),
				);
				break;
			}
			if (channel.status >= 500) {
				fail(`Discord HTTP ${channel.status}: se reintentará.`, 60000 * (callup.attempts + 1));
				continue;
			}
			if (channel.status !== 200 || !channel.data.id) {
				fail(
					channel.status === 401
						? 'El token del bot no es válido.'
						: 'No se pudo abrir un mensaje privado con este jugador.',
				);
				if (channel.status === 401) break;
				continue;
			}
			let message;
			try {
				message = await discord(
					transport,
					env,
					`/channels/${channel.data.id}/messages`,
					callupMessage(callup, event, env.APP_ORIGIN),
				);
			} catch {
				db.prepare(
					"UPDATE raid_callups SET dm_status='uncertain',dm_error='Respuesta no confirmada: comprueba con el jugador antes de reintentar.',updated_at=? WHERE id=?",
				).run(now(), callup.id);
				continue;
			}
			if (message.status === 200) {
				db.prepare(
					"UPDATE raid_callups SET dm_status='sent',dm_error='',attempts=attempts+1,sent_at=?,updated_at=? WHERE id=?",
				).run(now(), now(), callup.id);
				delivered++;
			} else if (message.status === 429) {
				fail(
					'Límite de Discord: se reintentará.',
					Math.ceil((message.data.retry_after || 5) * 1000),
				);
				break;
			} else if (message.status >= 500) {
				fail(`Discord HTTP ${message.status}: se reintentará.`, 60000 * (callup.attempts + 1));
			} else
				fail(
					message.data.code === 50007
						? 'El jugador no admite mensajes privados de miembros del servidor.'
						: `Discord rechazó el mensaje (HTTP ${message.status}).`,
				);
		}
	} finally {
		busy.delete(db);
	}
	return delivered;
}
export const nextCallupAt = (db) =>
	db.prepare("SELECT MIN(next_at) due FROM raid_callups WHERE dm_status='pending'").get().due;
