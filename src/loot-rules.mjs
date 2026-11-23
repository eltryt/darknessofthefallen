import { randomUUID } from 'node:crypto';
import { audit, transaction } from './database-core.mjs';
import { HttpError, text, choice, can } from './domain.mjs';

// Raid rules of 22/11/2026 (Normas de raid): the wishlist opens for a few days at the
// start of each tier and then only accepts removals; any other change goes through an
// officer. Loot officers see a history of every change and a warning when someone
// touches a slot they already received loot for through their wishlist.

// What a player asks for when an item drops (RCLootCouncil), in priority order.
export const requestTypes = ['BiS', 'Mejora mayor', 'Mejora menor', 'Offspec'];
const wishStates = ['BiS', 'Me interesa', 'Pasar'];
const now = () => new Date().toISOString();
const norm = (value) =>
	String(value || '')
		.trim()
		.toLocaleLowerCase('es');
// Both rings, both trinkets and both hands count as one slot: a rogue who got two
// swords and then swaps them for daggers is changing the same "slot".
const groups = {
	finger1: 'finger',
	finger2: 'finger',
	trinket1: 'trinket',
	trinket2: 'trinket',
	main_hand: 'weapon',
	off_hand: 'weapon',
};
export const slotGroup = (slot) => (slot ? groups[slot] || slot : '');
const groupLabels = {
	finger: 'anillos',
	trinket: 'abalorios',
	weapon: 'armas',
	head: 'cabeza',
	neck: 'cuello',
	shoulders: 'hombros',
	back: 'espalda',
	chest: 'pecho',
	shirt: 'camisa',
	tabard: 'tabardo',
	wrist: 'muñecas',
	hands: 'manos',
	waist: 'cintura',
	legs: 'piernas',
	feet: 'pies',
	ranged: 'a distancia / reliquia',
};
const groupLabel = (group) => groupLabels[group] || group;

// "free" until the first deadline is ever opened, so nothing changes on deploy day.
export function wishlistWindow(db, at = now()) {
	const last = db.prepare('SELECT * FROM wishlist_windows ORDER BY opened_at DESC LIMIT 1').get();
	if (!last) return { state: 'free', closesAt: null, openedAt: null, id: null };
	const open = !last.closed_at && last.closes_at > at;
	return {
		state: open ? 'open' : 'closed',
		id: last.id,
		openedAt: last.opened_at,
		closesAt: open ? last.closes_at : last.closed_at || last.closes_at,
		note: last.note,
	};
}

// The wishlist itself (operations.mjs) asks here before adding or changing an entry.
// Removing and marking "Ya lo tengo" or notes stay allowed after the deadline.
const LOCKED_FIELDS = ['status', 'slot', 'priority', 'item', 'raid', 'boss'];
export function assertWishlistEditable(db, change = null) {
	if (wishlistWindow(db).state !== 'closed') return;
	if (change && !LOCKED_FIELDS.some((key) => key in change)) return;
	throw new HttpError(
		409,
		'El plazo de la wishlist está cerrado: solo puedes quitar objetos. Para añadir o cambiar algo, pide el cambio y lo revisará un oficial de loot.',
	);
}

// Slots this character already received loot for through the wishlist: entries marked
// "Ya lo tengo", plus registered loot that matches an item of their wishlist (now or in
// its history). Voided assignments do not count.
function receivedSlots(db, characterId) {
	const received = new Map();
	const slotOf = new Map();
	const entries = db
		.prepare("SELECT data FROM wishlists WHERE json_extract(data,'$.characterId')=?")
		.all(characterId)
		.map((row) => JSON.parse(row.data));
	for (const e of entries) {
		if (e.slot) slotOf.set(norm(e.item), e.slot);
		if (e.obtained && e.slot) received.set(slotGroup(e.slot), e.item);
	}
	for (const row of db
		.prepare("SELECT item,slot FROM wishlist_changes WHERE character_id=? AND slot<>''")
		.all(characterId))
		if (!slotOf.has(norm(row.item))) slotOf.set(norm(row.item), row.slot);
	for (const row of db
		.prepare("SELECT data FROM loot WHERE json_extract(data,'$.recipientCharacterId')=?")
		.all(characterId)) {
		const d = JSON.parse(row.data);
		if (d.status === 'Anulado') continue;
		const slot = slotOf.get(norm(d.item));
		if (slot && !received.has(slotGroup(slot))) received.set(slotGroup(slot), d.item);
	}
	return received;
}

const meaningful = (before, after) =>
	LOCKED_FIELDS.some((key) => String(before?.[key] ?? '') !== String(after?.[key] ?? ''));

// The warning text for officers, or null when the change touches no received slot.
export function wishAlert(db, characterId, before, after) {
	const action = !before ? 'added' : !after ? 'removed' : 'changed';
	if (action === 'changed' && !meaningful(before, after)) return null;
	const received = receivedSlots(db, characterId);
	if (before?.obtained && before.slot) received.set(slotGroup(before.slot), before.item);
	const touched = [...new Set([slotGroup(before?.slot), slotGroup(after?.slot)])].filter(Boolean);
	const hit = touched.find((group) => received.has(group));
	if (!hit) return null;
	const got = received.get(hit);
	const verb =
		action === 'added'
			? `añade «${after.item}»`
			: action === 'removed'
				? `quita «${before.item}»`
				: `cambia «${before.item}»${after.item !== before.item ? ` por «${after.item}»` : ''}`;
	return `Ya se llevó «${got}» (${groupLabel(hit)}) por wishlist y ahora ${verb}.`;
}

// Officers who handle loot and have a device registered for app notifications.
function notifyLootOfficers(db, kind, targetId) {
	const devices = db
		.prepare('SELECT DISTINCT u.id,u.rank FROM push_subscriptions s JOIN users u ON u.id=s.user_id')
		.all()
		.filter((u) => can(u, 'loot.manage'));
	for (const u of devices)
		db.prepare(
			'INSERT OR IGNORE INTO push_jobs(id,kind,target_id,user_id,dedupe_key,created_at) VALUES(?,?,?,?,?,?)',
		).run(randomUUID(), kind, targetId, u.id, `${kind}:${targetId}:${u.id}`, now());
}

// History row for every add, change or removal; runs inside the caller's transaction.
export function recordWishChange(db, { actorId, entryId, ownerId, before, after, requestId }) {
	const action = !before ? 'added' : !after ? 'removed' : 'changed';
	if (action === 'changed' && !meaningful(before, after) && !!before.obtained === !!after.obtained)
		return null;
	const current = after || before;
	const alert = wishAlert(db, current.characterId, before, after);
	const id = randomUUID();
	db.prepare(
		`INSERT INTO wishlist_changes(id,wishlist_id,owner_id,character_id,character_name,item,slot,action,actor_id,request_id,before,after,alert,alert_seen_at,created_at)
		 VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
	).run(
		id,
		entryId,
		ownerId,
		current.characterId,
		current.characterName || '',
		current.item,
		current.slot || '',
		action,
		actorId,
		requestId || null,
		before ? JSON.stringify(before) : null,
		after ? JSON.stringify(after) : null,
		alert,
		// An approved request was already reviewed with its warning: keep it, as seen.
		alert && requestId ? now() : null,
		now(),
	);
	if (alert && !requestId) notifyLootOfficers(db, 'wishlist-alert', id);
	return { id, alert };
}

const priorityOf = (value) => {
	const priority = Number(value);
	if (!Number.isInteger(priority) || priority < 1 || priority > 5)
		throw new HttpError(400, 'La prioridad debe estar entre 1 y 5.');
	return priority;
};
function newEntry(v, character) {
	return {
		characterId: character.id,
		characterName: character.name,
		item: text(v.item, 'objeto', 160),
		raid: text(v.raid ?? '', 'raid', 120, false),
		boss: text(v.boss ?? '', 'boss', 120, false),
		slot: text(v.slot ?? '', 'hueco', 40, false),
		priority: priorityOf(v.priority ?? 3),
		status: choice(v.status ?? 'Me interesa', wishStates, 'estado'),
		obtained: false,
		notes: text(v.notes ?? '', 'notas', 1000, false),
	};
}
function changeInput(v) {
	const changes = {};
	if ('status' in v) changes.status = choice(v.status, wishStates, 'estado');
	if ('slot' in v) changes.slot = text(v.slot ?? '', 'hueco', 40, false);
	if ('priority' in v) changes.priority = priorityOf(v.priority);
	if (!Object.keys(changes).length) throw new HttpError(400, 'Indica qué quieres cambiar.');
	return changes;
}
const requestRow = (r) => ({
	...r,
	payload: JSON.parse(r.payload),
});

// Excused absences leave the monthly percentage (attendanceMetrics in domain.mjs).
export function excuseAttendance(db, user, id, v) {
	const row = db.prepare('SELECT id,status FROM attendance WHERE id=?').get(id);
	if (!row) throw new HttpError(404, 'Registro no encontrado.');
	const previous = db.prepare('SELECT * FROM attendance_excuses WHERE attendance_id=?').get(id);
	const excused = v.excused === true;
	if (excused && row.status !== 'Ausente')
		throw new HttpError(400, 'Solo se puede justificar una ausencia.');
	const reason = excused ? text(v.reason, 'motivo', 300) : '';
	return transaction(db, () => {
		if (excused)
			db.prepare(
				`INSERT INTO attendance_excuses(attendance_id,reason,excused_by,excused_at) VALUES(?,?,?,?)
				 ON CONFLICT(attendance_id) DO UPDATE SET reason=excluded.reason,excused_by=excluded.excused_by,excused_at=excluded.excused_at`,
			).run(id, reason, user.id, now());
		else db.prepare('DELETE FROM attendance_excuses WHERE attendance_id=?').run(id);
		audit(db, user.id, excused ? 'attendance.excused' : 'attendance.unexcused', id, {
			before: previous ? { excused: true, reason: previous.reason } : { excused: false },
			after: { excused, reason },
		});
		return { id, excused, reason };
	});
}

export async function lootRulesApi({ db, user, path, method, url, body, send, requirePermission }) {
	const log = (action, target, before, after) =>
		audit(db, user.id, action, target, { before, after });

	if (path === '/api/wishlist-window') {
		requirePermission('community.read');
		if (method === 'GET') {
			const result = wishlistWindow(db);
			if (can(user, 'loot.manage'))
				result.history = db
					.prepare('SELECT * FROM wishlist_windows ORDER BY opened_at DESC LIMIT 10')
					.all();
			send(200, result);
			return true;
		}
		if (method === 'POST') {
			requirePermission('loot.manage');
			const v = await body();
			const closes = text(v.closesAt, 'fecha de cierre', 40);
			if (!/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(closes) || !Date.parse(closes))
				throw new HttpError(400, 'Fecha de cierre: indica fecha, hora y zona horaria.');
			const closesAt = new Date(closes).toISOString();
			if (closesAt <= now()) throw new HttpError(400, 'La fecha de cierre tiene que ser futura.');
			const id = randomUUID(),
				note = text(v.note ?? '', 'nota', 200, false);
			transaction(db, () => {
				const at = now();
				db.prepare(
					'UPDATE wishlist_windows SET closed_at=?,closed_by=? WHERE closed_at IS NULL AND closes_at>?',
				).run(at, user.id, at);
				db.prepare(
					'INSERT INTO wishlist_windows(id,opened_at,opened_by,closes_at,note) VALUES(?,?,?,?,?)',
				).run(id, at, user.id, closesAt, note);
				log('wishlist.window_opened', id, null, { closesAt, note });
			});
			send(201, wishlistWindow(db));
			return true;
		}
	}
	if (path === '/api/wishlist-window/close' && method === 'POST') {
		requirePermission('loot.manage');
		const current = wishlistWindow(db);
		if (current.state !== 'open') throw new HttpError(409, 'No hay ningún plazo abierto.');
		transaction(db, () => {
			db.prepare('UPDATE wishlist_windows SET closed_at=?,closed_by=? WHERE id=?').run(
				now(),
				user.id,
				current.id,
			);
			log('wishlist.window_closed', current.id, { closesAt: current.closesAt }, null);
		});
		send(200, wishlistWindow(db));
		return true;
	}

	if (path === '/api/wishlist-requests') {
		requirePermission('community.read');
		if (method === 'GET') {
			const all = url.searchParams.get('all') === 'true';
			if (all) requirePermission('loot.manage');
			const rows = all
				? db
						.prepare(
							`SELECT r.*,u.display_name AS user_name,d.display_name AS decided_by_name FROM wishlist_requests r
							 JOIN users u ON u.id=r.user_id LEFT JOIN users d ON d.id=r.decided_by
							 WHERE r.status='pending' OR r.created_at>? ORDER BY r.status='pending' DESC,r.created_at DESC LIMIT 200`,
						)
						.all(new Date(Date.now() - 60 * 86400000).toISOString())
				: db
						.prepare(
							'SELECT * FROM wishlist_requests WHERE user_id=? ORDER BY created_at DESC LIMIT 50',
						)
						.all(user.id);
			send(200, rows.map(requestRow));
			return true;
		}
		if (method === 'POST') {
			if (wishlistWindow(db).state !== 'closed')
				throw new HttpError(
					409,
					'El plazo de la wishlist está abierto: haz el cambio directamente.',
				);
			const v = await body(),
				kind = choice(v.kind, ['add', 'change'], 'tipo de petición'),
				reason = text(v.reason ?? '', 'motivo', 500, false);
			let character,
				payload,
				before,
				after,
				wishlistId = null;
			if (kind === 'add') {
				character = db
					.prepare('SELECT * FROM characters WHERE id=? AND archived_at IS NULL')
					.get(text(v.characterId, 'personaje', 80));
				if (!character) throw new HttpError(404, 'Personaje activo no encontrado.');
				if (character.user_id !== user.id)
					throw new HttpError(403, 'Solo puedes pedir cambios en la wishlist de tus personajes.');
				payload = newEntry(v, character);
				after = payload;
			} else {
				wishlistId = text(v.wishlistId, 'objeto de la wishlist', 80);
				const row = db
					.prepare('SELECT * FROM wishlists WHERE id=? AND user_id=?')
					.get(wishlistId, user.id);
				if (!row) throw new HttpError(404, 'Ese objeto ya no está en tu wishlist.');
				before = JSON.parse(row.data);
				payload = changeInput(v);
				after = { ...before, ...payload };
				character = { id: before.characterId, name: before.characterName };
			}
			const pending = db
				.prepare(
					"SELECT 1 FROM wishlist_requests WHERE user_id=? AND status='pending' AND kind=? AND (wishlist_id=? OR (wishlist_id IS NULL AND json_extract(payload,'$.item')=?))",
				)
				.get(user.id, kind, wishlistId, payload.item ?? null);
			if (pending) throw new HttpError(409, 'Ya tienes una petición pendiente para ese objeto.');
			const id = randomUUID(),
				alert = wishAlert(db, character.id, before || null, after);
			transaction(db, () => {
				db.prepare(
					`INSERT INTO wishlist_requests(id,user_id,character_id,character_name,kind,wishlist_id,payload,reason,alert,created_at)
					 VALUES(?,?,?,?,?,?,?,?,?,?)`,
				).run(
					id,
					user.id,
					character.id,
					character.name || '',
					kind,
					wishlistId,
					JSON.stringify(payload),
					reason,
					alert,
					now(),
				);
				log('wishlist.request_created', id, null, { kind, wishlistId, payload, reason, alert });
				notifyLootOfficers(db, 'wishlist-request', id);
			});
			send(201, { id, alert });
			return true;
		}
	}
	const cancel = path.match(/^\/api\/wishlist-requests\/([^/]+)\/cancel$/);
	if (cancel && method === 'POST') {
		requirePermission('community.read');
		const row = db
			.prepare("SELECT * FROM wishlist_requests WHERE id=? AND user_id=? AND status='pending'")
			.get(cancel[1], user.id);
		if (!row) throw new HttpError(404, 'Petición pendiente no encontrada.');
		transaction(db, () => {
			db.prepare("UPDATE wishlist_requests SET status='cancelled',decided_at=? WHERE id=?").run(
				now(),
				row.id,
			);
			log('wishlist.request_cancelled', row.id, { status: 'pending' }, { status: 'cancelled' });
		});
		send(200, { ok: true });
		return true;
	}
	const decision = path.match(/^\/api\/wishlist-requests\/([^/]+)\/decision$/);
	if (decision && method === 'POST') {
		requirePermission('loot.manage');
		const v = await body(),
			approve = v.approve === true,
			note = text(v.note ?? '', 'nota', 500, false);
		const row = db
			.prepare("SELECT * FROM wishlist_requests WHERE id=? AND status='pending'")
			.get(decision[1]);
		if (!row) throw new HttpError(404, 'Petición pendiente no encontrada.');
		if (!approve && !note) throw new HttpError(400, 'Indica el motivo del rechazo.');
		const payload = JSON.parse(row.payload);
		const result = transaction(db, () => {
			let entryId = row.wishlist_id;
			if (approve && row.kind === 'add') {
				const character = db
					.prepare('SELECT id FROM characters WHERE id=? AND archived_at IS NULL')
					.get(row.character_id);
				if (!character) throw new HttpError(409, 'El personaje ya no está activo.');
				entryId = randomUUID();
				db.prepare('INSERT INTO wishlists(id,user_id,data) VALUES(?,?,?)').run(
					entryId,
					row.user_id,
					JSON.stringify(payload),
				);
				log('wishlist.created', entryId, null, payload);
				recordWishChange(db, {
					actorId: user.id,
					entryId,
					ownerId: row.user_id,
					before: null,
					after: payload,
					requestId: row.id,
				});
			}
			if (approve && row.kind === 'change') {
				const current = db
					.prepare('SELECT data FROM wishlists WHERE id=? AND user_id=?')
					.get(row.wishlist_id, row.user_id);
				if (!current) throw new HttpError(409, 'El objeto ya no está en su wishlist.');
				const before = JSON.parse(current.data),
					next = { ...before, ...payload };
				db.prepare('UPDATE wishlists SET data=? WHERE id=?').run(
					JSON.stringify(next),
					row.wishlist_id,
				);
				log('wishlist.updated', row.wishlist_id, before, next);
				recordWishChange(db, {
					actorId: user.id,
					entryId: row.wishlist_id,
					ownerId: row.user_id,
					before,
					after: next,
					requestId: row.id,
				});
			}
			const status = approve ? 'approved' : 'rejected';
			db.prepare(
				'UPDATE wishlist_requests SET status=?,decided_by=?,decided_at=?,decision_note=? WHERE id=?',
			).run(status, user.id, now(), note, row.id);
			log('wishlist.request_' + status, row.id, { status: 'pending' }, { status, note });
			return { id: row.id, status, wishlistId: entryId };
		});
		send(200, result);
		return true;
	}

	if (path === '/api/wishlist-history' && method === 'GET') {
		requirePermission('loot.manage');
		const characterId = url.searchParams.get('characterId');
		const alertsOnly = url.searchParams.get('alerts') === 'true';
		const where = [],
			params = [];
		if (characterId) {
			where.push('c.character_id=?');
			params.push(characterId);
		}
		if (alertsOnly) where.push('c.alert IS NOT NULL AND c.alert_seen_at IS NULL');
		const rows = db
			.prepare(
				`SELECT c.id,c.wishlist_id,c.owner_id,c.character_id,c.character_name,c.item,c.slot,c.action,c.request_id,c.before,c.after,c.alert,c.alert_seen_at,c.created_at,
				 a.display_name AS actor_name,o.display_name AS owner_name
				 FROM wishlist_changes c JOIN users a ON a.id=c.actor_id JOIN users o ON o.id=c.owner_id
				 ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY c.created_at DESC LIMIT 300`,
			)
			.all(...params)
			.map((r) => ({
				...r,
				before: r.before ? JSON.parse(r.before) : null,
				after: r.after ? JSON.parse(r.after) : null,
			}));
		send(200, rows);
		return true;
	}
	const seen = path.match(/^\/api\/wishlist-alerts\/([^/]+)\/seen$/);
	if (seen && method === 'POST') {
		requirePermission('loot.manage');
		const changed = db
			.prepare(
				'UPDATE wishlist_changes SET alert_seen_at=? WHERE id=? AND alert IS NOT NULL AND alert_seen_at IS NULL',
			)
			.run(now(), seen[1]).changes;
		if (!changed) throw new HttpError(404, 'Aviso no encontrado.');
		log('wishlist.alert_seen', seen[1], null, { seen: true });
		send(200, { ok: true });
		return true;
	}

	const excuse = path.match(/^\/api\/attendance\/([^/]+)\/excuse$/);
	if (excuse && method === 'PUT') {
		requirePermission('attendance.manage');
		send(200, excuseAttendance(db, user, excuse[1], await body()));
		return true;
	}
	return false;
}
