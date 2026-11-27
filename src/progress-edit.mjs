import { randomUUID } from 'node:crypto';
import { audit, transaction } from './database-core.mjs';
import { HttpError, text } from './domain.mjs';

// Editing a progress raid: its name, its difficulty and its bosses (rename, reorder, add,
// or drop one that was never attempted). Bosses keep their id, state and first kill, so
// renaming «Onixya» or replacing provisional names never loses progress.
export async function progressEditApi({ db, user, path, method, body, send, requirePermission }) {
	const match = path.match(/^\/api\/progress\/([^/]+)$/);
	if (!match || method !== 'PATCH') return false;
	requirePermission('progress.manage');
	const id = decodeURIComponent(match[1]);
	const row = db.prepare('SELECT data FROM progress WHERE id=?').get(id);
	if (!row) throw new HttpError(404, 'Raid de progreso no encontrada.');
	const before = JSON.parse(row.data),
		v = await body();
	const next = { ...before };
	if ('name' in v) next.name = text(v.name, 'raid de progreso', 120);
	if ('difficulty' in v) next.difficulty = text(v.difficulty ?? '', 'dificultad', 80, false);
	if ('bosses' in v) {
		if (!Array.isArray(v.bosses) || !v.bosses.length || v.bosses.length > 40)
			throw new HttpError(400, 'Añade entre 1 y 40 bosses.');
		const known = new Map(before.bosses.map((b) => [b.id, b]));
		const kept = new Set();
		next.bosses = v.bosses.map((entry) => {
			const name = text(entry?.name, 'boss', 100);
			const old = entry?.id && known.get(entry.id);
			if (entry?.id && !old) throw new HttpError(400, 'Ese boss no pertenece a esta raid.');
			if (old) {
				kept.add(old.id);
				return { ...old, name };
			}
			return { id: randomUUID(), name, status: 'No intentado', firstKill: null };
		});
		const names = next.bosses.map((b) => b.name.toLowerCase());
		if (new Set(names).size !== names.length) throw new HttpError(400, 'Hay bosses repetidos.');
		const dropped = before.bosses.filter((b) => !kept.has(b.id));
		if (dropped.some((b) => b.status !== 'No intentado'))
			throw new HttpError(
				400,
				'Solo se pueden quitar bosses que no se han intentado: los demás guardan el progreso.',
			);
	}
	transaction(db, () => {
		db.prepare('UPDATE progress SET data=? WHERE id=?').run(JSON.stringify(next), id);
		audit(db, user.id, 'progress.edited', id, {
			before: {
				name: before.name,
				difficulty: before.difficulty,
				bosses: before.bosses.map((b) => b.name),
			},
			after: {
				name: next.name,
				difficulty: next.difficulty,
				bosses: next.bosses.map((b) => b.name),
			},
		});
	});
	send(200, { id });
	return true;
}
