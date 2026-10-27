import { importRoster } from './roster-import.mjs';
import { randomUUID } from 'node:crypto';
import { characterInput, text, HttpError } from './domain.mjs';
import { audit, transaction } from './database-core.mjs';
const normalize = (value) => value.normalize('NFKC').trim().toLocaleLowerCase('es');
export async function manualRosterApi({ db, user, path, method, body, send, requirePermission }) {
	if (path === '/api/roster/import') {
		requirePermission('roster.manage');
		if (method !== 'POST') throw new HttpError(405, 'Método no permitido.');
		send(200, importRoster(db, user, (await body()).characters));
		return true;
	}
	if (path === '/api/roster/archived') {
		requirePermission('roster.manage');
		if (method !== 'GET') throw new HttpError(405, 'Método no permitido.');
		send(
			200,
			db
				.prepare(
					'SELECT c.id,c.name,c.surname,c.class,c.archived_at,u.display_name FROM characters c JOIN users u ON u.id=c.user_id WHERE c.archived_at IS NOT NULL ORDER BY c.archived_at DESC LIMIT 100',
				)
				.all(),
		);
		return true;
	}
	const restoreMatch = path.match(/^\/api\/roster\/characters\/([^/]+)\/restore$/);
	if (restoreMatch) {
		requirePermission('roster.manage');
		if (method !== 'POST') throw new HttpError(405, 'Método no permitido.');
		const result = transaction(db, () => {
			const c = db
				.prepare('SELECT * FROM characters WHERE id=? AND archived_at IS NOT NULL')
				.get(restoreMatch[1]);
			if (!c) throw new HttpError(404, 'Personaje archivado no encontrado.');
			const full = normalize(c.name + ' ' + c.surname);
			if (
				db
					.prepare('SELECT name,surname FROM characters WHERE archived_at IS NULL')
					.all()
					.some((o) => normalize(o.name + ' ' + o.surname) === full)
			)
				throw new HttpError(409, 'Ya hay un personaje activo con ese nombre.');
			// The owner gets back a main if the restored character is their only one.
			const hasMain = db
				.prepare('SELECT 1 FROM characters WHERE user_id=? AND is_main=1 AND archived_at IS NULL')
				.get(c.user_id);
			db.prepare('UPDATE characters SET archived_at=NULL,is_main=? WHERE id=?').run(
				hasMain ? 0 : 1,
				c.id,
			);
			audit(db, user.id, 'roster.character.restored', c.id, { name: c.name });
			return { id: c.id };
		});
		send(200, result);
		return true;
	}
	const characterMatch = path.match(/^\/api\/roster\/characters\/([^/]+)$/);
	const match = characterMatch || path.match(/^\/api\/roster\/manual(?:\/([^/]+))?$/);
	if (!match) return false;
	requirePermission('roster.manage');
	const id = match[1];
	if (characterMatch && !['PATCH', 'DELETE'].includes(method))
		throw new HttpError(405, 'Método no permitido.');
	if ((!id && method !== 'POST') || (id && !['PATCH', 'DELETE'].includes(method)))
		throw new HttpError(405, 'Método no permitido.');
	const input = method === 'DELETE' ? null : await body();
	const value = input ? characterInput(input) : null;
	const label = input ? text(input.playerName || value.name, 'nombre del jugador', 80) : null;
	const result = transaction(db, () => {
		const existing = id
			? db.prepare('SELECT * FROM characters WHERE id=? AND archived_at IS NULL').get(id)
			: null;
		if (
			id &&
			(!existing ||
				(!characterMatch &&
					(existing.source !== 'staff' || !existing.user_id.startsWith('manual:'))))
		)
			throw new HttpError(404, 'Personaje no encontrado.');
		if (method === 'DELETE') {
			db.prepare('UPDATE characters SET archived_at=?,is_main=0 WHERE id=?').run(
				new Date().toISOString(),
				id,
			);
			// Staff can also retire a Discord member's character; history stays.
			audit(
				db,
				user.id,
				characterMatch ? 'roster.character.archived' : 'roster.manual.archived',
				id,
				{
					name: existing.name,
				},
			);
			return { id };
		}
		const full = normalize(value.name + ' ' + value.surname);
		if (
			db
				.prepare('SELECT id,name,surname FROM characters WHERE archived_at IS NULL')
				.all()
				.some((c) => c.id !== id && normalize(c.name + ' ' + c.surname) === full)
		)
			throw new HttpError(
				409,
				'Ya existe un personaje con ese nombre. Revisa el roster antes de añadirlo.',
			);
		const characterId = id || randomUUID(),
			owner = existing?.user_id || 'manual:' + randomUUID(),
			now = new Date().toISOString();
		if (!existing) {
			db.prepare("INSERT INTO users(id,display_name,rank,updated_at) VALUES(?,?,'visitor',?)").run(
				owner,
				label,
				now,
			);
			db.prepare(
				"INSERT INTO characters(id,user_id,name,class,role,is_main,source,created_at) VALUES(?,?,?,?,?,1,'staff',?)",
			).run(characterId, owner, value.name, value.class, value.role, now);
		} else if (!characterMatch)
			db.prepare('UPDATE users SET display_name=?,updated_at=? WHERE id=?').run(label, now, owner);
		db.prepare(
			'UPDATE characters SET name=?,surname=?,class=?,role=?,spec=?,professions=?,availability=?,notes=? WHERE id=?',
		).run(
			value.name,
			value.surname,
			value.class,
			value.role,
			value.spec,
			value.professions,
			value.availability,
			value.notes,
			characterId,
		);
		audit(
			db,
			user.id,
			characterMatch
				? 'roster.character.updated'
				: existing
					? 'roster.manual.updated'
					: 'roster.manual.created',
			characterId,
			{
				name: value.name,
				class: value.class,
				role: value.role,
			},
		);
		return { id: characterId };
	});
	send(id ? 200 : 201, result);
	return true;
}
