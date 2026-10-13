import { randomUUID } from 'node:crypto';
import { characterInput, HttpError, ranks } from './domain.mjs';
import { audit, transaction } from './database-core.mjs';

const normalize = (s) => s.normalize('NFKC').trim().toLocaleLowerCase('es');

// This import edits character data, never the permissions of an authenticated account.
export function importRoster(db, actor, input) {
	if (!Array.isArray(input) || !input.length || input.length > 100)
		throw new HttpError(400, 'Se esperan entre 1 y 100 personajes.');
	const entries = input.map((row) => {
		if (!row || typeof row !== 'object') throw new HttpError(400, 'Personaje no válido.');
		const value = characterInput(row);
		if (!ranks.includes(row.rank)) throw new HttpError(400, 'Rango no válido.');
		return { ...value, rank: row.rank };
	});
	const keys = entries.map((r) => normalize(r.name + ' ' + r.surname));
	if (new Set(keys).size !== keys.length)
		throw new HttpError(409, 'Hay nombres duplicados en el archivo.');
	return transaction(db, () => {
		const current = db
			.prepare(
				'SELECT c.*,u.rank FROM characters c JOIN users u ON u.id=c.user_id WHERE c.archived_at IS NULL',
			)
			.all();
		let created = 0,
			updated = 0;
		for (const row of entries) {
			const matches = current.filter(
				(c) => normalize(c.name + ' ' + c.surname) === normalize(row.name + ' ' + row.surname),
			);
			if (matches.length > 1) throw new HttpError(409, 'Nombre ambiguo: ' + row.name);
			const existing = matches[0];
			const manual = existing?.source === 'staff' && existing.user_id.startsWith('manual:');
			if (existing && !manual && existing.rank !== row.rank)
				throw new HttpError(
					409,
					'El rango de la cuenta de ' + row.name + ' debe gestionarse por separado.',
				);
			if ((!existing || manual) && !['visitor', 'member', 'raider'].includes(row.rank))
				throw new HttpError(400, 'Un registro manual no puede recibir permisos de administración.');
			const now = new Date().toISOString();
			const id = existing?.id || randomUUID();
			if (!existing) {
				const owner = 'manual:' + randomUUID();
				db.prepare('INSERT INTO users(id,display_name,rank,updated_at) VALUES(?,?,?,?)').run(
					owner,
					row.name,
					row.rank,
					now,
				);
				db.prepare(
					"INSERT INTO characters(id,user_id,name,surname,class,role,is_main,source,created_at) VALUES(?,?,?,?,?,?,1,'staff',?)",
				).run(id, owner, row.name, row.surname, row.class, row.role, now);
				created++;
			} else {
				db.prepare('UPDATE characters SET class=?,role=? WHERE id=?').run(row.class, row.role, id);
				if (manual)
					db.prepare('UPDATE users SET rank=?,updated_at=? WHERE id=?').run(
						row.rank,
						now,
						existing.user_id,
					);
				updated++;
			}
			audit(db, actor.id, 'roster.imported', id, {
				created: !existing,
				class: row.class,
				role: row.role,
				rank: row.rank,
			});
		}
		return { created, updated };
	});
}
