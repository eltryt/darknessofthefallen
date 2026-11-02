// Ruleta de la hermandad: the High-Low gold game ("gambling") on a European roulette.
// Everyone at a table spins; the lowest number pays the highest the bet minus that number
// (a 5 at a 100-gold table pays 95). Players in between neither pay nor collect, and nobody
// pays to sit down. Ties at the top or the bottom spin again among the tied players.
// The server draws every number, so nobody can repeat a spin. Gold is paid in the game:
// the web records who owes whom and the winner marks it as collected.
import { randomUUID } from 'node:crypto';
import { HttpError, can } from './domain.mjs';
import { audit, settings, transaction } from './database-core.mjs';

export const POCKETS = 37;
export const DEFAULT_MAX_BET = 1000;
export const MAX_PLAYERS = 40;
const RECENT = 12;
const MAX_ROUNDS = 200;

// The lowest number is at most 35 (the highest is above it), so a bet of 36 or more always
// leaves something to pay; a 0 pays the whole bet.
export const MIN_BET = POCKETS - 1;
export const payout = (stake, low) => stake - low;
export const maxBet = (s) => s.rouletteMaxBet ?? DEFAULT_MAX_BET;

// A uniform pocket 0–36: rejection sampling keeps every number equally likely.
export function spinNumber() {
	const byte = new Uint8Array(1);
	for (;;) {
		crypto.getRandomValues(byte);
		if (byte[0] < 222) return byte[0] % POCKETS;
	}
}

// Plays a whole table for the given player ids, in order. Returns every spin in sequence,
// the winner and loser after tie-breaks, and the first decisive round's high and low.
export function playTable(players, random = spinNumber) {
	const spins = [];
	let round = 0;
	const roll = (ids, kind) => {
		if (++round > MAX_ROUNDS) throw new Error('Demasiados empates seguidos.');
		return ids.map((userId) => {
			const number = random();
			spins.push({ seq: spins.length + 1, round, kind, userId, number });
			return { userId, number };
		});
	};
	const extreme = (rolls, pick) => pick(...rolls.map((r) => r.number));
	let main = roll(players, 'main');
	// Everyone on the same number decides nothing: the whole table spins again.
	while (extreme(main, Math.max) === extreme(main, Math.min)) main = roll(players, 'main');
	const high = extreme(main, Math.max),
		low = extreme(main, Math.min);
	const breakTie = (value, kind, pick) => {
		let tied = main.filter((r) => r.number === value).map((r) => r.userId);
		while (tied.length > 1) {
			const rolls = roll(tied, kind),
				best = extreme(rolls, pick);
			tied = rolls.filter((r) => r.number === best).map((r) => r.userId);
		}
		return tied[0];
	};
	const winner = breakTie(high, 'high', Math.max),
		loser = breakTie(low, 'low', Math.min);
	return { spins, winner, loser, high, low };
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

function tableState(db, user) {
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
			"SELECT id,created_by,stake,created_at FROM roulette_tables WHERE status='open' ORDER BY created_at",
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
				.all(t.id),
			winner: person(players, t.winner_id),
			loser: person(players, t.loser_id),
			high: t.high,
			low: t.low,
			amount: t.amount,
			settledAt: t.settled_at,
			canSettle: t.winner_id === user.id || moderate,
		};
	};
	const spun = (where, ...values) =>
		db
			.prepare(
				`SELECT * FROM roulette_tables WHERE status='spun' AND ${where} ORDER BY closed_at DESC`,
			)
			.all(...values)
			.map(result);
	const recent = db
		.prepare("SELECT * FROM roulette_tables WHERE status='spun' ORDER BY closed_at DESC LIMIT ?")
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
			 WHERE t.status='spun' AND p.left_at IS NULL
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
		send(200, tableState(db, user));
		return true;
	}
	if (path === '/api/roulette' && method === 'POST') {
		const v = await body(),
			stake = Number(v?.stake),
			limit = maxBet(settings(db));
		if (!Number.isInteger(stake) || stake < MIN_BET)
			throw new HttpError(
				400,
				`La apuesta mínima es ${MIN_BET} de oro (el número más alto de la ruleta).`,
			);
		if (stake > limit)
			throw new HttpError(400, `La apuesta máxima de la hermandad es ${limit} de oro.`);
		const id = randomUUID(),
			now = new Date().toISOString(),
			me = seat(db, user);
		transaction(db, () => {
			if (
				db
					.prepare("SELECT 1 FROM roulette_tables WHERE created_by=? AND status='open'")
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
		send(201, tableState(db, user));
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
		send(200, tableState(db, user));
		return true;
	}
	const m = path.match(/^\/api\/roulette\/([^/]+)\/(players|spin|cancel|settled)$/);
	if (!m) return false;
	const id = decodeURIComponent(m[1]),
		action = m[2],
		moderate = can(user, 'members.manage');
	transaction(db, () => {
		const t = db.prepare('SELECT * FROM roulette_tables WHERE id=?').get(id);
		if (!t) throw new HttpError(404, 'Mesa no encontrada.');
		const owner = t.created_by === user.id,
			now = new Date().toISOString();
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
		// Tables opened before the minimum existed could otherwise owe negative gold.
		if (t.stake < MIN_BET)
			throw new HttpError(
				409,
				`La apuesta es menor que el mínimo (${MIN_BET}): cancela la mesa y abre otra.`,
			);
		const game = playTable(players),
			amount = payout(t.stake, game.low);
		const insert = db.prepare(
			'INSERT INTO roulette_spins(table_id,seq,round,kind,user_id,number) VALUES(?,?,?,?,?,?)',
		);
		for (const s of game.spins) insert.run(id, s.seq, s.round, s.kind, s.userId, s.number);
		db.prepare(
			`UPDATE roulette_tables SET status='spun',closed_at=?,closed_by=?,winner_id=?,loser_id=?,high=?,low=?,amount=? WHERE id=?`,
		).run(now, user.id, game.winner, game.loser, game.high, game.low, amount, id);
		audit(db, user.id, 'roulette.spun', id, {
			players: players.length,
			winner: game.winner,
			loser: game.loser,
			amount,
		});
	});
	send(200, tableState(db, user));
	return true;
}
