// Ruleta de la hermandad: the High-Low gold game ("gambling") on a European roulette.
// A table has a maximum value M in gold. Each pocket r (0–36) is worth
// 1 + round(r × (M − 1) / 36) gold, so the 0 is 1 and the 36 is M. The highest result
// wins and the lowest pays the difference between the two; players in between neither pay
// nor collect, and nobody pays to sit down. Tied players at the top or the bottom spin
// again and their new result replaces the old one; then everyone is compared again.
// The server draws every pocket, so nobody can repeat a spin. Gold is paid in the game:
// the web records who owes whom and the winner marks it as collected.
import { randomUUID } from 'node:crypto';
import { HttpError, can } from './domain.mjs';
import { audit, settings, transaction } from './database-core.mjs';
import { discord, dmReady } from './raid-lineup.mjs';

export const POCKETS = 37;
export const DEFAULT_MAX_BET = 1000;
export const MAX_PLAYERS = 40;
export const MIN_BET = 2;
const RECENT = 12;
// Who has the section open: every poll is a heartbeat. Kept in memory only (the Durable
// Object or the local server); a restart simply empties the room for a few seconds.
const PRESENCE_MS = 10000;
const viewers = new Map();
const MAX_ROUNDS = 5000;

export const maxBet = (s) => s.rouletteMaxBet ?? DEFAULT_MAX_BET;
// The gold a pocket is worth at a table of value M, rounding halves up (in integers).
export const rollOf = (pocket, M) =>
	1 + Math.floor((2 * pocket * (M - 1) + (POCKETS - 1)) / (2 * (POCKETS - 1)));
// Middle players need a value strictly between the highest and the lowest.
export const playable = (players, M) => players === 2 || Math.min(M, POCKETS) >= 3;

// A uniform pocket 0–36: rejection sampling keeps every number equally likely.
export function spinNumber() {
	const byte = new Uint8Array(1);
	for (;;) {
		crypto.getRandomValues(byte);
		if (byte[0] < 222) return byte[0] % POCKETS;
	}
}

// Plays a whole table of value M for the given player ids, in order. Returns every spin in
// sequence (pocket and its gold), the winner and loser, and their final results.
export function playTable(players, M, random = spinNumber) {
	const spins = [],
		current = new Map();
	let round = 0;
	const roll = (ids, kindOf) => {
		if (++round > MAX_ROUNDS) throw new Error('Demasiados empates seguidos.');
		for (const userId of ids) {
			const number = random(),
				value = rollOf(number, M);
			spins.push({
				seq: spins.length + 1,
				round,
				kind: kindOf(userId),
				userId,
				number,
				roll: value,
			});
			current.set(userId, value);
		}
	};
	roll(players, () => 'main');
	for (;;) {
		const values = [...current.values()],
			high = Math.max(...values),
			low = Math.min(...values);
		// Everyone on the same result decides nothing: the whole table spins again.
		if (high === low) {
			roll(players, () => 'main');
			continue;
		}
		const top = players.filter((id) => current.get(id) === high),
			bottom = players.filter((id) => current.get(id) === low);
		if (top.length === 1 && bottom.length === 1)
			return { spins, winner: top[0], loser: bottom[0], high, low };
		const tied = [...(top.length > 1 ? top : []), ...(bottom.length > 1 ? bottom : [])];
		roll(tied, (id) => (current.get(id) === high ? 'high' : 'low'));
	}
}

// The name shown at the table: the main character, else any active one, else the account.
function seat(db, user) {
	const c = db
		.prepare(
			'SELECT name,class FROM characters WHERE user_id=? AND archived_at IS NULL ORDER BY is_main DESC,created_at LIMIT 1',
		)
		.get(user.id);
	return c ? { name: c.name, class: c.class } : { name: user.display_name, class: '' };
}

function present(db, user) {
	const now = Date.now();
	viewers.set(user.id, { ...seat(db, user), at: now });
	for (const [id, v] of viewers) if (now - v.at > PRESENCE_MS) viewers.delete(id);
	return [...viewers]
		.map(([id, v]) => ({ id, name: v.name, class: v.class, me: id === user.id }))
		.sort((a, b) => a.name.localeCompare(b.name, 'es'));
}

function tableState(db, user, watching = []) {
	const s = settings(db),
		moderate = can(user, 'members.manage');
	const playersOf = (id) =>
		db
			.prepare(
				'SELECT user_id,name,class FROM roulette_players WHERE table_id=? AND left_at IS NULL ORDER BY joined_at,user_id',
			)
			.all(id)
			.map((p) => ({ id: p.user_id, name: p.name, class: p.class, me: p.user_id === user.id }));
	const person = (players, id) => players.find((p) => p.id === id) || null;
	const open = db
		.prepare(
			"SELECT id,created_by,stake,created_at FROM roulette_tables WHERE status='open' AND deleted_at IS NULL ORDER BY created_at",
		)
		.all()
		.map((t) => {
			const players = playersOf(t.id),
				owner = t.created_by === user.id;
			return {
				id: t.id,
				stake: t.stake,
				createdAt: t.created_at,
				host: person(players, t.created_by),
				players,
				joined: players.some((p) => p.me),
				canSpin: (owner || moderate) && players.length >= 2,
				canCancel: owner || moderate,
				canDelete: moderate,
			};
		});
	const result = (t) => {
		const players = playersOf(t.id);
		return {
			id: t.id,
			stake: t.stake,
			closedAt: t.closed_at,
			players,
			spins: db
				.prepare(
					'SELECT seq,round,kind,user_id AS userId,number FROM roulette_spins WHERE table_id=? ORDER BY seq',
				)
				.all(t.id)
				.map((x) => ({ ...x, roll: rollOf(x.number, t.stake) })),
			winner: person(players, t.winner_id),
			loser: person(players, t.loser_id),
			high: t.high,
			low: t.low,
			amount: t.amount,
			settledAt: t.settled_at,
			canSettle: t.winner_id === user.id || moderate,
			canDelete: moderate,
			// Whether the winner's private message went out: shown to them and to officers.
			dm: t.winner_id === user.id || moderate ? t.dm_status : null,
		};
	};
	const spun = (where, ...values) =>
		db
			.prepare(
				`SELECT * FROM roulette_tables WHERE status='spun' AND deleted_at IS NULL AND ${where} ORDER BY closed_at DESC`,
			)
			.all(...values)
			.map(result);
	const recent = db
		.prepare(
			"SELECT * FROM roulette_tables WHERE status='spun' AND deleted_at IS NULL ORDER BY closed_at DESC LIMIT ?",
		)
		.all(RECENT)
		.map(result);
	// Totals per player over every table played; the name is the latest one they used.
	const ranking = db
		.prepare(
			`SELECT p.user_id,
				(SELECT name FROM roulette_players WHERE user_id=p.user_id ORDER BY joined_at DESC LIMIT 1) AS name,
				(SELECT class FROM roulette_players WHERE user_id=p.user_id ORDER BY joined_at DESC LIMIT 1) AS class,
				COUNT(*) AS played,
				SUM(CASE WHEN t.winner_id=p.user_id THEN 1 ELSE 0 END) AS wins,
				SUM(CASE WHEN t.loser_id=p.user_id THEN 1 ELSE 0 END) AS losses,
				SUM(CASE WHEN t.winner_id=p.user_id THEN t.amount ELSE 0 END) AS won,
				SUM(CASE WHEN t.loser_id=p.user_id THEN t.amount ELSE 0 END) AS lost,
				MAX(CASE WHEN t.winner_id=p.user_id THEN t.amount ELSE 0 END) AS best
			 FROM roulette_players p JOIN roulette_tables t ON t.id=p.table_id
			 WHERE t.status='spun' AND t.deleted_at IS NULL AND p.left_at IS NULL
			 GROUP BY p.user_id
			 ORDER BY won-lost DESC, won DESC, name`,
		)
		.all()
		.map((r) => ({
			id: r.user_id,
			name: r.name,
			class: r.class,
			played: r.played,
			wins: r.wins,
			losses: r.losses,
			won: r.won,
			lost: r.lost,
			net: r.won - r.lost,
			best: r.best,
			me: r.user_id === user.id,
		}));
	return {
		me: user.id,
		serverTime: new Date().toISOString(),
		watching,
		canDelete: moderate,
		maxBet: maxBet(s),
		minBet: MIN_BET,
		maxPlayers: MAX_PLAYERS,
		canConfigure: can(user, 'settings.manage'),
		open,
		recent,
		pending: spun('settled_at IS NULL'),
		ranking,
	};
}

export async function rouletteApi({ db, user, path, method, body, send, requirePermission }) {
	if (path !== '/api/roulette' && !path.startsWith('/api/roulette/')) return false;
	requirePermission('community.read');
	if (path === '/api/roulette' && method === 'GET') {
		send(200, tableState(db, user, present(db, user)));
		return true;
	}
	if (path === '/api/roulette' && method === 'POST') {
		const v = await body(),
			stake = Number(v?.stake),
			limit = maxBet(settings(db));
		if (!Number.isInteger(stake) || stake < MIN_BET)
			throw new HttpError(400, `El valor de la mesa debe ser un entero de ${MIN_BET} o más.`);
		if (stake > limit) throw new HttpError(400, `El valor máximo de una mesa es ${limit} de oro.`);
		const id = randomUUID(),
			now = new Date().toISOString(),
			me = seat(db, user);
		transaction(db, () => {
			if (
				db
					.prepare(
						"SELECT 1 FROM roulette_tables WHERE created_by=? AND status='open' AND deleted_at IS NULL",
					)
					.get(user.id)
			)
				throw new HttpError(409, 'Ya tienes una mesa abierta: lánzala o cancélala primero.');
			db.prepare('INSERT INTO roulette_tables(id,created_by,stake,created_at) VALUES(?,?,?,?)').run(
				id,
				user.id,
				stake,
				now,
			);
			db.prepare(
				'INSERT INTO roulette_players(table_id,user_id,name,class,joined_at) VALUES(?,?,?,?,?)',
			).run(id, user.id, me.name, me.class, now);
			audit(db, user.id, 'roulette.opened', id, { stake });
		});
		send(201, tableState(db, user, present(db, user)));
		return true;
	}
	if (path === '/api/roulette/settings' && method === 'PUT') {
		requirePermission('settings.manage');
		const v = await body(),
			value = Number(v?.maxBet);
		if (!Number.isInteger(value) || value < MIN_BET || value > 1000000)
			throw new HttpError(400, `El tope debe estar entre ${MIN_BET} y 1000000 de oro.`);
		transaction(db, () => {
			const s = settings(db);
			db.prepare('UPDATE settings SET data=? WHERE id=1').run(
				JSON.stringify({ ...s, rouletteMaxBet: value }),
			);
			audit(db, user.id, 'roulette.limit', 'guild', { before: maxBet(s), after: value });
		});
		send(200, tableState(db, user, present(db, user)));
		return true;
	}
	const m = path.match(/^\/api\/roulette\/([^/]+)(?:\/(players|spin|cancel|settled))?$/);
	if (!m) return false;
	const id = decodeURIComponent(m[1]),
		action = m[2] || 'table',
		moderate = can(user, 'members.manage');
	transaction(db, () => {
		const t = db.prepare('SELECT * FROM roulette_tables WHERE id=? AND deleted_at IS NULL').get(id);
		if (!t) throw new HttpError(404, 'Mesa no encontrada.');
		const owner = t.created_by === user.id,
			now = new Date().toISOString();
		// Officers remove tables (test ones, mistakes): hidden everywhere, kept in the database.
		if (action === 'table') {
			if (method !== 'DELETE') throw new HttpError(405, 'Método no permitido.');
			if (!moderate) throw new HttpError(403, 'Solo los oficiales pueden borrar mesas.');
			db.prepare('UPDATE roulette_tables SET deleted_at=?,deleted_by=? WHERE id=?').run(
				now,
				user.id,
				id,
			);
			audit(db, user.id, 'roulette.deleted', id, { status: t.status, amount: t.amount });
			return;
		}
		if (action === 'settled') {
			if (!['PUT', 'DELETE'].includes(method)) throw new HttpError(405, 'Método no permitido.');
			if (t.status !== 'spun') throw new HttpError(409, 'Esta mesa no tiene deuda.');
			if (t.winner_id !== user.id && !moderate)
				throw new HttpError(403, 'Solo quien ganó (o un oficial) marca el cobro.');
			const at = method === 'PUT' ? now : null;
			db.prepare('UPDATE roulette_tables SET settled_at=?,settled_by=? WHERE id=?').run(
				at,
				at ? user.id : null,
				id,
			);
			audit(db, user.id, at ? 'roulette.settled' : 'roulette.unsettled', id, {
				amount: t.amount,
			});
			return;
		}
		if (t.status !== 'open') throw new HttpError(409, 'Esta mesa ya está cerrada.');
		if (action === 'players') {
			if (method === 'PUT') {
				const count = db
					.prepare(
						'SELECT COUNT(*) AS n FROM roulette_players WHERE table_id=? AND left_at IS NULL AND user_id<>?',
					)
					.get(id, user.id).n;
				if (count >= MAX_PLAYERS)
					throw new HttpError(409, `La mesa está llena (${MAX_PLAYERS} jugadores).`);
				const me = seat(db, user);
				db.prepare(
					`INSERT INTO roulette_players(table_id,user_id,name,class,joined_at) VALUES(?,?,?,?,?)
					 ON CONFLICT(table_id,user_id) DO UPDATE SET left_at=NULL,name=excluded.name,class=excluded.class`,
				).run(id, user.id, me.name, me.class, now);
				return;
			}
			if (method === 'DELETE') {
				if (owner) throw new HttpError(409, 'Quien abre la mesa no puede salir: cancélala.');
				db.prepare(
					'UPDATE roulette_players SET left_at=? WHERE table_id=? AND user_id=? AND left_at IS NULL',
				).run(now, id, user.id);
				return;
			}
			throw new HttpError(405, 'Método no permitido.');
		}
		if (method !== 'POST') throw new HttpError(405, 'Método no permitido.');
		if (!owner && !moderate)
			throw new HttpError(403, 'Solo quien abrió la mesa (o un oficial) puede hacerlo.');
		if (action === 'cancel') {
			db.prepare(
				"UPDATE roulette_tables SET status='cancelled',closed_at=?,closed_by=? WHERE id=?",
			).run(now, user.id, id);
			audit(db, user.id, 'roulette.cancelled', id, {});
			return;
		}
		const players = db
			.prepare(
				'SELECT user_id FROM roulette_players WHERE table_id=? AND left_at IS NULL ORDER BY joined_at,user_id',
			)
			.all(id)
			.map((p) => p.user_id);
		if (players.length < 2) throw new HttpError(409, 'Hacen falta al menos dos jugadores.');
		if (!playable(players.length, t.stake))
			throw new HttpError(
				409,
				'Con 3 o más jugadores la mesa debe valer al menos 3 de oro: si no, siempre hay empate.',
			);
		const game = playTable(players, t.stake),
			amount = game.high - game.low;
		const insert = db.prepare(
			'INSERT INTO roulette_spins(table_id,seq,round,kind,user_id,number) VALUES(?,?,?,?,?,?)',
		);
		for (const s of game.spins) insert.run(id, s.seq, s.round, s.kind, s.userId, s.number);
		db.prepare(
			`UPDATE roulette_tables SET status='spun',closed_at=?,closed_by=?,winner_id=?,loser_id=?,high=?,low=?,amount=?,dm_status='pending',dm_next_at=? WHERE id=?`,
		).run(now, user.id, game.winner, game.loser, game.high, game.low, amount, Date.now(), id);
		audit(db, user.id, 'roulette.spun', id, {
			players: players.length,
			winner: game.winner,
			loser: game.loser,
			amount,
		});
	});
	send(200, tableState(db, user, present(db, user)));
	return true;
}

// The winner's private message: what they won, the two results and who owes it. It is the
// guild's record of the debt, so it names the table and links to it.
const madrid = new Intl.DateTimeFormat('es-ES', {
	timeZone: 'Europe/Madrid',
	day: 'numeric',
	month: 'long',
	hour: '2-digit',
	minute: '2-digit',
});
export function winnerMessage(db, t, origin) {
	const seatOf = (id) =>
		db.prepare('SELECT name FROM roulette_players WHERE table_id=? AND user_id=?').get(t.id, id)
			?.name || 'Un jugador';
	const lastSpin = (id) =>
		db
			.prepare(
				'SELECT number FROM roulette_spins WHERE table_id=? AND user_id=? ORDER BY seq DESC LIMIT 1',
			)
			.get(t.id, id)?.number;
	const players = db
		.prepare('SELECT COUNT(*) AS n FROM roulette_players WHERE table_id=? AND left_at IS NULL')
		.get(t.id).n;
	const loser = seatOf(t.loser_id);
	const content = [
		'🎰 **Darkness of the Fallen · Ruleta**',
		`¡Has ganado **${t.amount} de oro**!`,
		`Mesa de hasta ${t.stake} de oro · ${players} jugadores · ${madrid.format(new Date(t.closed_at))} (hora de Madrid)`,
		`Tu resultado: casilla ${lastSpin(t.winner_id)} → **${t.high}** · El más bajo: ${loser}, casilla ${lastSpin(t.loser_id)} → **${t.low}**`,
		`**${loser} te debe ${t.amount} de oro** (${t.high} − ${t.low}). Cuando te lo pague en el juego, márcalo como «Cobrado».`,
		`Referencia: ${t.id.slice(0, 8)} · ${origin}/perfil#ruleta`,
	].join('\n');
	return { content: content.slice(0, 1900), allowed_mentions: { parse: [] } };
}

const MAX_DM_ATTEMPTS = 5;
const sending = new WeakSet();
// Sends pending winner messages one by one with the call-up bot. A failure after Discord
// may have received the message is marked uncertain and never replayed automatically.
export async function deliverRouletteDMs(db, env, transport = fetch, limit = 10) {
	if (!dmReady(env) || sending.has(db)) return 0;
	sending.add(db);
	let delivered = 0;
	try {
		db.prepare(
			"UPDATE roulette_tables SET dm_status='uncertain',dm_error='Envío interrumpido: comprueba con el jugador.' WHERE dm_status='sending' AND dm_next_at<=?",
		).run(Date.now());
		for (let i = 0; i < limit; i++) {
			const t = db
				.prepare(
					"SELECT * FROM roulette_tables WHERE dm_status='pending' AND dm_next_at<=? ORDER BY dm_next_at LIMIT 1",
				)
				.get(Date.now());
			if (!t) break;
			const set = (status, error, retryIn) => {
				const attempts = t.dm_attempts + 1,
					retry = retryIn !== undefined && attempts < MAX_DM_ATTEMPTS;
				db.prepare(
					'UPDATE roulette_tables SET dm_status=?,dm_error=?,dm_attempts=?,dm_next_at=? WHERE id=?',
				).run(retry ? 'pending' : status, error, attempts, retry ? Date.now() + retryIn : 0, t.id);
			};
			// A table deleted before the message left is not announced.
			if (t.deleted_at || t.status !== 'spun') {
				db.prepare("UPDATE roulette_tables SET dm_status='skipped' WHERE id=?").run(t.id);
				continue;
			}
			db.prepare("UPDATE roulette_tables SET dm_status='sending',dm_next_at=? WHERE id=?").run(
				Date.now() + 120000,
				t.id,
			);
			let channel;
			try {
				channel = await discord(transport, env, '/users/@me/channels', {
					recipient_id: t.winner_id,
				});
			} catch {
				set('failed', 'Discord no respondió al abrir el privado.', 60000 * (t.dm_attempts + 1));
				continue;
			}
			if (channel.status === 429) {
				set(
					'failed',
					'Límite de Discord: se reintentará.',
					Math.ceil((channel.data.retry_after || 5) * 1000),
				);
				break;
			}
			if (channel.status >= 500) {
				set('failed', `Discord HTTP ${channel.status}.`, 60000 * (t.dm_attempts + 1));
				continue;
			}
			if (channel.status !== 200 || !channel.data.id) {
				set(
					'failed',
					channel.status === 401
						? 'El token del bot no es válido.'
						: 'No se pudo abrir un privado con el ganador.',
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
					winnerMessage(db, t, env.APP_ORIGIN),
				);
			} catch {
				db.prepare(
					"UPDATE roulette_tables SET dm_status='uncertain',dm_error='Respuesta no confirmada.' WHERE id=?",
				).run(t.id);
				continue;
			}
			if (message.status === 200) {
				db.prepare(
					"UPDATE roulette_tables SET dm_status='sent',dm_error='',dm_attempts=dm_attempts+1,dm_sent_at=? WHERE id=?",
				).run(new Date().toISOString(), t.id);
				delivered++;
			} else if (message.status === 429) {
				set(
					'failed',
					'Límite de Discord: se reintentará.',
					Math.ceil((message.data.retry_after || 5) * 1000),
				);
				break;
			} else if (message.status >= 500)
				set('failed', `Discord HTTP ${message.status}.`, 60000 * (t.dm_attempts + 1));
			else
				set(
					'failed',
					message.data.code === 50007
						? 'El ganador no admite mensajes privados de miembros del servidor.'
						: `Discord rechazó el mensaje (HTTP ${message.status}).`,
				);
		}
	} finally {
		sending.delete(db);
	}
	return delivered;
}
export const nextRouletteDMAt = (db) =>
	db.prepare("SELECT MIN(dm_next_at) due FROM roulette_tables WHERE dm_status='pending'").get().due;
