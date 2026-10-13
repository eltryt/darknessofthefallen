import { randomUUID } from 'node:crypto';
import { characterInput, text, HttpError } from './domain.mjs';
import { audit, transaction } from './database-core.mjs';
const normalize = (value) => value.normalize('NFKC').trim().toLocaleLowerCase('es');
export async function manualRosterApi({ db, user, path, method, body, send, requirePermission }) {
	const match = path.match(/^\/api\/roster\/manual(?:\/([^/]+))?$/);
	if (!match) return false;
	requirePermission('roster.manage');
	const id = match[1];
	if ((!id && method !== 'POST') || (id && !['PATCH', 'DELETE'].includes(method)))
		throw new HttpError(405, 'Método no permitido.');
	const input = method === 'DELETE' ? null : await body();
	const value = input ? characterInput(input) : null;
	const label = input ? text(input.playerName || value.name, 'nombre del jugador', 80) : null;
	const result = transaction(db, () => {
		const existing = id
			? db
					.prepare("SELECT * FROM characters WHERE id=? AND source='staff' AND archived_at IS NULL")
					.get(id)
			: null;
		if (id && (!existing || !existing.user_id.startsWith('manual:')))
			throw new HttpError(404, 'Registro manual no encontrado.');
		if (method === 'DELETE') {
			db.prepare('UPDATE characters SET archived_at=?,is_main=0 WHERE id=?').run(
				new Date().toISOString(),
				id,
			);
			audit(db, user.id, 'roster.manual.archived', id, { name: existing.name });
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
		} else
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
		audit(db, user.id, existing ? 'roster.manual.updated' : 'roster.manual.created', characterId, {
			name: value.name,
			class: value.class,
			role: value.role,
		});
		return { id: characterId };
	});
	send(id ? 200 : 201, result);
	return true;
}
