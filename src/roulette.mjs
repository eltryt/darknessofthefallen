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
// Chat: the latest messages travel with every poll; one message per second per player.
// Messages are never removed, not even by officers.
const CHAT_SHOWN = 50,
	CHAT_LENGTH = 300,
	CHAT_GAP_MS = 1000;
const lastMessage = new Map();
// Who has the section open: every poll is a heartbeat. Kept in memory only (the Durable
// Object or the local server); a restart simply empties the room for a few seconds.
const PRESENCE_MS = 10000;
const viewers = new Map();
// The ranking goes over every table ever played, and the room asks for it every two
// seconds: it is kept until a roulette change (any write through rouletteApi) or a minute.
const RANKING_TTL_MS = 60000;
const rankingCache = new WeakMap();
// What each person last got from the room. Polls in between reuse it (with the clock and
// who is watching refreshed) until a roulette change, a private message sent, or STATE_TTL_MS.
const STATE_TTL_MS = 20000;
const stateCache = new WeakMap();
const forget = (db) => {
	rankingCache.delete(db);
	stateCache.delete(db);
};
function roomFor(db, user) {
	const watching = present(db, user);
	let mine = stateCache.get(db);
	if (!mine) stateCache.set(db, (mine = new Map()));
	const cached = mine.get(user.id);
	if (cached && Date.now() - cached.at < STATE_TTL_MS)
		return { ...cached.state, serverTime: new Date().toISOString(), watching };
	const state = tableState(db, user, watching);
	mine.set(user.id, { at: Date.now(), state });
	return state;
}
function rankingRows(db) {
	const cached = rankingCache.get(db);
	if (cached && Date.now() - cached.at < RANKING_TTL_MS) return cached.rows;
	const rows = db
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
		.all();
	rankingCache.set(db, { at: Date.now(), rows });
	return rows;
}
const MAX_ROUNDS = 5000;
// "Otra ronda" seats everyone again, so it can't be spun until the room has watched the
// previous table land and had this long to retire.
export const REMATCH_WAIT_MS = 15000;

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
	// The seat name is looked up once a minute, not on every poll.
	const prev = viewers.get(user.id);
	const fresh = prev && now - prev.seatAt < 60000;
	viewers.set(user.id, {
		...(fresh ? { name: prev.name, class: prev.class } : seat(db, user)),
		seatAt: fresh ? prev.seatAt : now,
		at: now,
	});
	for (const [id, v] of viewers) if (now - v.at > PRESENCE_MS) viewers.delete(id);
	return [...viewers]
		.map(([id, v]) => ({ id, name: v.name, class: v.class, me: id === user.id }))
		.sort((a, b) => a.name.localeCompare(b.name, 'es'));
}

// When a table may be spun: at once, or for a rematch once the previous table's animation
// has ended (as public/roulette.js plays it) plus REMATCH_WAIT_MS.
function readyAt(db, t) {
	if (!t.rematch_of) return 0;
	const prev = db.prepare('SELECT closed_at FROM roulette_tables WHERE id=?').get(t.rematch_of),
		spins = db
			.prepare('SELECT COUNT(*) AS n FROM roulette_spins WHERE table_id=?')
			.get(t.rematch_of).n;
	const shown = prev?.closed_at
		? Date.parse(prev.closed_at) + revealDelay(spins || 1) - DM_MARGIN
		: 0;
	return Math.max(Date.parse(t.created_at), shown) + REMATCH_WAIT_MS;
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
			"SELECT id,created_by,stake,created_at,rematch_of FROM roulette_tables WHERE status='open' AND deleted_at IS NULL ORDER BY created_at",
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
				rematchOf: t.rematch_of,
				readyAt: t.rematch_of ? new Date(readyAt(db, t)).toISOString() : null,
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
			// "Otra ronda": any player of the table (or an officer) opens it once.
			rematchId:
				db
					.prepare('SELECT id FROM roulette_tables WHERE rematch_of=? AND deleted_at IS NULL')
					.get(t.id)?.id || null,
			canRematch: moderate || players.some((p) => p.me),
			// Whether the private messages went out: each player sees their own, officers both.
			dm: {
				winner: t.winner_id === user.id || moderate ? t.dm_status : null,
				loser: t.loser_id === user.id || moderate ? t.loser_dm_status : null,
			},
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
	const ranking = rankingRows(db).map((r) => ({
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
		chat: db
			.prepare(
				'SELECT id,user_id,name,class,body,created_at FROM roulette_chat WHERE deleted_at IS NULL ORDER BY id DESC LIMIT ?',
			)
			.all(CHAT_SHOWN)
			.reverse()
			.map((m) => ({
				id: m.id,
				name: m.name,
				class: m.class,
				body: m.body,
				at: m.created_at,
				me: m.user_id === user.id,
			})),
	};
}

export async function rouletteApi({ db, user, path, method, body, send, requirePermission }) {
	if (path !== '/api/roulette' && !path.startsWith('/api/roulette/')) return false;
	requirePermission('community.read');
	// Anything but reading may change who won what.
	if (method !== 'GET') forget(db);
	if (path === '/api/roulette' && method === 'GET') {
		send(200, roomFor(db, user));
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
	if (path === '/api/roulette/chat' && method === 'POST') {
		const v = await body(),
			text = String(v?.body ?? '')
				.replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '')
				.replace(/\s+/g, ' ')
				.trim();
		if (!text) throw new HttpError(400, 'Escribe un mensaje.');
		if (text.length > CHAT_LENGTH)
			throw new HttpError(400, `Máximo ${CHAT_LENGTH} caracteres por mensaje.`);
		if (Date.now() - (lastMessage.get(user.id) || 0) < CHAT_GAP_MS)
			throw new HttpError(429, 'Despacio: un mensaje por segundo.');
		lastMessage.set(user.id, Date.now());
		const me = seat(db, user);
		db.prepare(
			'INSERT INTO roulette_chat(user_id,name,class,body,created_at) VALUES(?,?,?,?,?)',
		).run(user.id, me.name, me.class, text, new Date().toISOString());
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
	const m = path.match(/^\/api\/roulette\/([^/]+)(?:\/(players|spin|cancel|settled|rematch))?$/);
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
		// Another round of a played table: same bet, every player seated again (each can
		// retire before the spin). Whoever asks for it hosts it.
		if (action === 'rematch') {
			if (method !== 'POST') throw new HttpError(405, 'Método no permitido.');
			if (t.status !== 'spun') throw new HttpError(409, 'Solo se repite una mesa ya jugada.');
			const seats = db
				.prepare(
					'SELECT user_id,name,class FROM roulette_players WHERE table_id=? AND left_at IS NULL ORDER BY joined_at,user_id',
				)
				.all(id);
			if (!moderate && !seats.some((p) => p.user_id === user.id))
				throw new HttpError(403, 'Solo quien jugó la mesa (o un oficial) abre otra ronda.');
			if (
				db
					.prepare('SELECT 1 FROM roulette_tables WHERE rematch_of=? AND deleted_at IS NULL')
					.get(id)
			)
				throw new HttpError(409, 'Ya hay otra ronda de esta mesa.');
			if (
				db
					.prepare(
						"SELECT 1 FROM roulette_tables WHERE created_by=? AND status='open' AND deleted_at IS NULL",
					)
					.get(user.id)
			)
				throw new HttpError(409, 'Ya tienes una mesa abierta: lánzala o cancélala primero.');
			const limit = maxBet(settings(db));
			if (t.stake > limit)
				throw new HttpError(409, `El valor máximo de una mesa es ahora ${limit} de oro.`);
			const next = randomUUID();
			db.prepare(
				'INSERT INTO roulette_tables(id,created_by,stake,created_at,rematch_of) VALUES(?,?,?,?,?)',
			).run(next, user.id, t.stake, now, id);
			const insert = db.prepare(
				'INSERT INTO roulette_players(table_id,user_id,name,class,joined_at) VALUES(?,?,?,?,?)',
			);
			// The host sits first; then everyone else in the order they played.
			const me = seats.find((p) => p.user_id === user.id) || {
				user_id: user.id,
				...seat(db, user),
			};
			insert.run(next, me.user_id, me.name, me.class, now);
			seats
				.filter((p) => p.user_id !== user.id)
				.slice(0, MAX_PLAYERS - 1)
				.forEach((p, i) =>
					insert.run(
						next,
						p.user_id,
						p.name,
						p.class,
						new Date(Date.parse(now) + i + 1).toISOString(),
					),
				);
			audit(db, user.id, 'roulette.rematch', next, {
				from: id,
				stake: t.stake,
				players: seats.length,
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
			// Retiring before the spin. When the host retires, the next player in order hosts
			// the table; with nobody left it is cancelled.
			if (method === 'DELETE') {
				db.prepare(
					'UPDATE roulette_players SET left_at=? WHERE table_id=? AND user_id=? AND left_at IS NULL',
				).run(now, id, user.id);
				if (owner) {
					const heir = db
						.prepare(
							'SELECT user_id FROM roulette_players WHERE table_id=? AND left_at IS NULL ORDER BY joined_at,user_id LIMIT 1',
						)
						.get(id);
					if (heir) {
						db.prepare('UPDATE roulette_tables SET created_by=? WHERE id=?').run(heir.user_id, id);
						audit(db, user.id, 'roulette.host_changed', id, { to: heir.user_id });
					} else {
						db.prepare(
							"UPDATE roulette_tables SET status='cancelled',closed_at=?,closed_by=? WHERE id=?",
						).run(now, user.id, id);
						audit(db, user.id, 'roulette.cancelled', id, { reason: 'empty' });
					}
				}
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
		const wait = readyAt(db, t) - Date.now();
		if (wait > 0)
			throw new HttpError(
				409,
				`Espera ${Math.ceil(wait / 1000)} s: los jugadores aún pueden retirarse de esta ronda.`,
			);
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
			`UPDATE roulette_tables SET status='spun',closed_at=?,closed_by=?,winner_id=?,loser_id=?,high=?,low=?,amount=?,dm_status='pending',dm_next_at=?,loser_dm_status='pending',loser_dm_next_at=? WHERE id=?`,
		).run(
			now,
			user.id,
			game.winner,
			game.loser,
			game.high,
			game.low,
			amount,
			Date.now() + revealDelay(game.spins.length),
			Date.now() + revealDelay(game.spins.length),
			id,
		);
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

// The private messages wait until the room has watched the spins (countdown, every spin
// and its pause, as public/roulette.js plays them) plus a margin, so nobody learns the
// result from Discord before seeing the ball land. Never less than 15 seconds.
export const DM_MARGIN = 10000;
export function revealDelay(spins) {
	const ms = Math.min(4200, Math.max(700, 30000 / spins)),
		pause = Math.min(900, ms / 3);
	return Math.max(15000, Math.round(4000 + spins * (ms + pause) + DM_MARGIN));
}

// Private messages after a table: the winner learns what they won and who pays it, the
// loser what they owe and to whom, both with the link to the roulette.
function tableFacts(db, t) {
	const seatOf = (id) =>
		db.prepare('SELECT name FROM roulette_players WHERE table_id=? AND user_id=?').get(t.id, id)
			?.name || 'Un jugador';
	return { winner: seatOf(t.winner_id), loser: seatOf(t.loser_id) };
}
// Kept short on purpose: the amount, who pays whom and the link to mark it collected.
const message = (lines, origin) => ({
	content: ['🎰 ' + lines[0], ...lines.slice(1), `${origin}/perfil#ruleta`]
		.join('\n')
		.slice(0, 1900),
	allowed_mentions: { parse: [] },
});
export function winnerMessage(db, t, origin) {
	const f = tableFacts(db, t);
	return message(
		[`¡Has ganado **${t.amount} de oro**! Te paga **${f.loser}**.`, 'Márcalo como cobrado aquí:'],
		origin,
	);
}
export function loserMessage(db, t, origin) {
	const f = tableFacts(db, t);
	return message(
		[`Has perdido **${t.amount} de oro**. Se los pagas a **${f.winner}**.`, 'Ver el cobro:'],
		origin,
	);
}

// Each recipient has its own delivery columns (migrations 017 and 018).
const RECIPIENTS = [
	{ column: 'dm', user: 'winner_id', who: 'el ganador', build: winnerMessage },
	{ column: 'loser_dm', user: 'loser_id', who: 'quien paga', build: loserMessage },
];
const MAX_DM_ATTEMPTS = 5;
const sending = new WeakSet();
// Sends pending messages one by one with the call-up bot. A failure after Discord may
// have received the message is marked uncertain and never replayed automatically.
export async function deliverRouletteDMs(db, env, transport = fetch, limit = 10) {
	if (!dmReady(env) || sending.has(db)) return 0;
	sending.add(db);
	let delivered = 0,
		stop = false;
	try {
		for (const { column: c, user, who, build } of RECIPIENTS) {
			if (stop) break;
			db.prepare(
				`UPDATE roulette_tables SET ${c}_status='uncertain',${c}_error='Envío interrumpido: comprueba con el jugador.' WHERE ${c}_status='sending' AND ${c}_next_at<=?`,
			).run(Date.now());
			for (let i = 0; i < limit; i++) {
				const t = db
					.prepare(
						`SELECT * FROM roulette_tables WHERE ${c}_status='pending' AND ${c}_next_at<=? ORDER BY ${c}_next_at LIMIT 1`,
					)
					.get(Date.now());
				if (!t) break;
				// The room shows whether each message went out.
				forget(db);
				const tries = t[`${c}_attempts`];
				const set = (status, error, retryIn) => {
					const attempts = tries + 1,
						retry = retryIn !== undefined && attempts < MAX_DM_ATTEMPTS;
					db.prepare(
						`UPDATE roulette_tables SET ${c}_status=?,${c}_error=?,${c}_attempts=?,${c}_next_at=? WHERE id=?`,
					).run(
						retry ? 'pending' : status,
						error,
						attempts,
						retry ? Date.now() + retryIn : 0,
						t.id,
					);
				};
				// A table deleted before the message left is not announced.
				if (t.deleted_at || t.status !== 'spun') {
					db.prepare(`UPDATE roulette_tables SET ${c}_status='skipped' WHERE id=?`).run(t.id);
					continue;
				}
				db.prepare(
					`UPDATE roulette_tables SET ${c}_status='sending',${c}_next_at=? WHERE id=?`,
				).run(Date.now() + 120000, t.id);
				let channel;
				try {
					channel = await discord(transport, env, '/users/@me/channels', {
						recipient_id: t[user],
					});
				} catch {
					set('failed', 'Discord no respondió al abrir el privado.', 60000 * (tries + 1));
					continue;
				}
				if (channel.status === 429) {
					set(
						'failed',
						'Límite de Discord: se reintentará.',
						Math.ceil((channel.data.retry_after || 5) * 1000),
					);
					stop = true;
					break;
				}
				if (channel.status >= 500) {
					set('failed', `Discord HTTP ${channel.status}.`, 60000 * (tries + 1));
					continue;
				}
				if (channel.status !== 200 || !channel.data.id) {
					set(
						'failed',
						channel.status === 401
							? 'El token del bot no es válido.'
							: `No se pudo abrir un privado con ${who}.`,
					);
					if (channel.status === 401) {
						stop = true;
						break;
					}
					continue;
				}
				let sent;
				try {
					sent = await discord(
						transport,
						env,
						`/channels/${channel.data.id}/messages`,
						build(db, t, env.APP_ORIGIN),
					);
				} catch {
					db.prepare(
						`UPDATE roulette_tables SET ${c}_status='uncertain',${c}_error='Respuesta no confirmada.' WHERE id=?`,
					).run(t.id);
					continue;
				}
				if (sent.status === 200) {
					db.prepare(
						`UPDATE roulette_tables SET ${c}_status='sent',${c}_error='',${c}_attempts=${c}_attempts+1,${c}_sent_at=? WHERE id=?`,
					).run(new Date().toISOString(), t.id);
					delivered++;
				} else if (sent.status === 429) {
					set(
						'failed',
						'Límite de Discord: se reintentará.',
						Math.ceil((sent.data.retry_after || 5) * 1000),
					);
					stop = true;
					break;
				} else if (sent.status >= 500)
					set('failed', `Discord HTTP ${sent.status}.`, 60000 * (tries + 1));
				else
					set(
						'failed',
						sent.data.code === 50007
							? `${who[0].toUpperCase()}${who.slice(1)} no admite mensajes privados de miembros del servidor.`
							: `Discord rechazó el mensaje (HTTP ${sent.status}).`,
					);
			}
		}
	} finally {
		sending.delete(db);
	}
	return delivered;
}
export const nextRouletteDMAt = (db) =>
	db
		.prepare(
			`SELECT MIN(due) due FROM (
				SELECT dm_next_at due FROM roulette_tables WHERE dm_status='pending'
				UNION ALL SELECT loser_dm_next_at FROM roulette_tables WHERE loser_dm_status='pending')`,
		)
		.get().due;
