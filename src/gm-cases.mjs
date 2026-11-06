import { HttpError, can, text, choice } from './domain.mjs';
import { audit, transaction } from './database-core.mjs';

// Panel → Mensajes y avisos: each contact or incident is a case with a status, a priority,
// an officer in charge and an internal thread. Only the team (recruitment.manage) sees
// or changes it; the person who wrote the message never sees the thread.
export const caseStatuses = ['Nueva', 'En curso', 'Resuelta', 'Descartada'];
export const casePriorities = ['Normal', 'Urgente'];
const NOTE_LENGTH = 2000;

// The officers a case can be given to.
function team(db) {
	return db
		.prepare(
			"SELECT id,display_name AS name,rank FROM users WHERE rank<>'visitor' ORDER BY display_name",
		)
		.all()
		.filter((u) => can(u, 'recruitment.manage'))
		.map(({ id, name }) => ({ id, name }));
}

export function caseInbox(db) {
	const messages = db
		.prepare(
			`SELECT m.*, a.display_name AS author_name,
				COALESCE(c.status,'Nueva') AS status, COALESCE(c.priority,'Normal') AS priority,
				c.assignee_id, s.display_name AS assignee_name, c.resolved_at, c.updated_at AS case_updated_at
			 FROM gm_messages m
			 LEFT JOIN users a ON a.id=m.user_id
			 LEFT JOIN gm_cases c ON c.message_id=m.id
			 LEFT JOIN users s ON s.id=c.assignee_id
			 ORDER BY m.created_at DESC LIMIT 200`,
		)
		.all();
	const notes = new Map(messages.map((m) => [m.id, []]));
	if (messages.length)
		for (const n of db
			.prepare(
				`SELECT n.id,n.message_id,n.user_id,n.kind,n.body,n.created_at,u.display_name AS author_name
				 FROM gm_case_notes n JOIN users u ON u.id=n.user_id
				 WHERE n.deleted_at IS NULL AND n.message_id IN (${messages.map(() => '?').join(',')})
				 ORDER BY n.id`,
			)
			.all(...messages.map((m) => m.id)))
			notes.get(n.message_id)?.push(n);
	return {
		messages: messages.map((m) => ({ ...m, notes: notes.get(m.id) })),
		team: team(db),
		statuses: caseStatuses,
	};
}

function requireMessage(db, id) {
	const m = db.prepare('SELECT id FROM gm_messages WHERE id=?').get(id);
	if (!m) throw new HttpError(404, 'Mensaje no encontrado.');
	return m;
}
const event = (db, id, user, body, now) =>
	db
		.prepare(
			"INSERT INTO gm_case_notes(message_id,user_id,kind,body,created_at) VALUES(?,?,'event',?,?)",
		)
		.run(id, user.id, body, now);

export function updateCase(db, id, user, value) {
	requireMessage(db, id);
	const now = new Date().toISOString();
	return transaction(db, () => {
		const prev = db.prepare('SELECT * FROM gm_cases WHERE message_id=?').get(id) || {
			status: 'Nueva',
			priority: 'Normal',
			assignee_id: null,
			resolved_at: null,
		};
		const next = { ...prev };
		const changes = [];
		if ('status' in value) {
			next.status = choice(value.status, caseStatuses, 'estado');
			if (next.status !== prev.status) changes.push(`cambió el estado a «${next.status}»`);
			next.resolved_at =
				next.status === 'Resuelta'
					? prev.resolved_at || now
					: next.status === 'Descartada'
						? prev.resolved_at
						: null;
		}
		if ('priority' in value) {
			next.priority = choice(value.priority, casePriorities, 'prioridad');
			if (next.priority !== prev.priority)
				changes.push(next.priority === 'Urgente' ? 'lo marcó como urgente' : 'quitó la urgencia');
		}
		if ('assigneeId' in value) {
			const target = value.assigneeId ? team(db).find((u) => u.id === value.assigneeId) : null;
			if (value.assigneeId && !target)
				throw new HttpError(400, 'Solo se puede asignar a alguien del equipo.');
			next.assignee_id = target?.id || null;
			if (next.assignee_id !== prev.assignee_id)
				changes.push(
					!target
						? 'lo dejó sin responsable'
						: target.id === user.id
							? 'se encarga del caso'
							: `se lo asignó a ${target.name}`,
				);
			// Taking a new case starts it.
			if (target && next.status === 'Nueva' && !('status' in value)) {
				next.status = 'En curso';
				changes.push('cambió el estado a «En curso»');
			}
		}
		if (!changes.length) return { changed: false };
		db.prepare(
			`INSERT INTO gm_cases(message_id,status,priority,assignee_id,resolved_at,updated_at,updated_by) VALUES(?,?,?,?,?,?,?)
			 ON CONFLICT(message_id) DO UPDATE SET status=excluded.status,priority=excluded.priority,assignee_id=excluded.assignee_id,resolved_at=excluded.resolved_at,updated_at=excluded.updated_at,updated_by=excluded.updated_by`,
		).run(id, next.status, next.priority, next.assignee_id, next.resolved_at, now, user.id);
		event(db, id, user, changes.join(' y '), now);
		audit(db, user.id, 'message.case_updated', id, {
			before: { status: prev.status, priority: prev.priority, assignee: prev.assignee_id },
			after: { status: next.status, priority: next.priority, assignee: next.assignee_id },
		});
		return { changed: true };
	});
}

export function addNote(db, id, user, value) {
	requireMessage(db, id);
	const body = text(value.body, 'nota', NOTE_LENGTH);
	const now = new Date().toISOString();
	transaction(db, () => {
		db.prepare(
			"INSERT INTO gm_case_notes(message_id,user_id,kind,body,created_at) VALUES(?,?,'note',?,?)",
		).run(id, user.id, body, now);
		// Writing in a new case means someone is on it.
		const c = db.prepare('SELECT status FROM gm_cases WHERE message_id=?').get(id);
		if (!c)
			db.prepare(
				"INSERT INTO gm_cases(message_id,status,updated_at,updated_by) VALUES(?,'En curso',?,?)",
			).run(id, now, user.id);
		if (!c) event(db, id, user, 'cambió el estado a «En curso»', now);
	});
}

// Only the author hides their own note; it stays in the database.
export function hideNote(db, noteId, user) {
	const n = db
		.prepare("SELECT * FROM gm_case_notes WHERE id=? AND kind='note' AND deleted_at IS NULL")
		.get(noteId);
	if (!n) throw new HttpError(404, 'Nota no encontrada.');
	if (n.user_id !== user.id)
		throw new HttpError(403, 'Solo quien escribió la nota puede quitarla.');
	db.prepare('UPDATE gm_case_notes SET deleted_at=? WHERE id=?').run(
		new Date().toISOString(),
		n.id,
	);
}

export async function gmCasesApi({ db, path, method, user, body, send, requirePermission }) {
	const m = path.match(/^\/api\/gm-messages\/([^/]+)(\/notes)?$/);
	const note = path.match(/^\/api\/gm-notes\/(\d+)$/);
	if (path === '/api/gm-cases' && method === 'GET') {
		requirePermission('recruitment.manage');
		send(200, caseInbox(db));
		return true;
	}
	if (m && !m[2] && method === 'PATCH') {
		requirePermission('recruitment.manage');
		send(200, updateCase(db, m[1], user, await body()));
		return true;
	}
	if (m && m[2] && method === 'POST') {
		requirePermission('recruitment.manage');
		addNote(db, m[1], user, await body());
		send(201, { ok: true });
		return true;
	}
	if (note && method === 'DELETE') {
		requirePermission('recruitment.manage');
		hideNote(db, Number(note[1]), user);
		send(200, { ok: true });
		return true;
	}
	return false;
}
