import { createHash } from 'node:crypto';
import { transaction } from './database-core.mjs';

// Ordered by foreign-key dependencies. Authentication material is never exported.
export const recoveryTables = [
	'users',
	'characters',
	'applications',
	'raids',
	'attendance',
	'loot',
	'wishlists',
	'progress',
	'council_members',
	'audit',
	'raid_events',
	'raid_character_links',
	'raid_signup_cancellations',
	'raid_jobs',
	'raid_sync',
	'outbox',
];
const digest = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const content = (s) => ({
	schemaVersion: s.schemaVersion,
	databaseVersion: s.databaseVersion,
	exportedAt: s.exportedAt,
	settings: s.settings,
	...Object.fromEntries(recoveryTables.map((t) => [t, s[t]])),
});
export function exportRecovery(db) {
	return transaction(db, () => {
		const snapshot = {
			schemaVersion: 2,
			databaseVersion: 5,
			exportedAt: new Date().toISOString(),
			settings: JSON.parse(db.prepare('SELECT data FROM settings WHERE id=1').get().data),
		};
		for (const table of recoveryTables)
			snapshot[table] = db.prepare(`SELECT * FROM ${table}`).all();
		snapshot.integrity = { algorithm: 'sha256', digest: digest(content(snapshot)) };
		return snapshot;
	});
}
export function validateRecovery(snapshot) {
	if (!snapshot || snapshot.schemaVersion !== 2 || snapshot.databaseVersion !== 5)
		throw new Error('Formato no compatible: descarga una nueva exportación JSON desde el panel.');
	if (
		!snapshot.settings ||
		typeof snapshot.settings !== 'object' ||
		Array.isArray(snapshot.settings)
	)
		throw new Error('Configuración inválida.');
	for (const table of recoveryTables)
		if (!Array.isArray(snapshot[table])) throw new Error(`Falta la tabla ${table}.`);
	if (
		snapshot.integrity?.algorithm !== 'sha256' ||
		snapshot.integrity.digest !== digest(content(snapshot))
	)
		throw new Error('La copia está incompleta o ha cambiado: checksum incorrecto.');
}
export function restoreRecovery(db, snapshot) {
	validateRecovery(snapshot);
	// Refuse to merge into an existing database, even one containing only sessions.
	for (const table of [...recoveryTables, 'sessions', 'oauth_states']) {
		if (table === 'raid_sync') continue;
		if (
			db
				.prepare(
					`SELECT COUNT(*) AS n FROM ${table}${table === 'audit' ? " WHERE actor_id NOT IN ('migration:003','migration:004')" : ''}`,
				)
				.get().n
		)
			throw new Error('La base de destino debe estar vacía.');
	}
	return transaction(db, () => {
		db.prepare('UPDATE settings SET data=? WHERE id=1').run(JSON.stringify(snapshot.settings));
		db.exec('DELETE FROM raid_sync; DELETE FROM audit;');
		for (const table of recoveryTables) {
			const columns = db
				.prepare(`PRAGMA table_info(${table})`)
				.all()
				.map((c) => c.name);
			const insert = db.prepare(
				`INSERT INTO ${table} (${columns.map((c) => `"${c}"`).join(',')}) VALUES (${columns.map(() => '?').join(',')})`,
			);
			for (const original of snapshot[table]) {
				if (
					!original ||
					typeof original !== 'object' ||
					Object.keys(original).length !== columns.length ||
					columns.some((c) => !Object.hasOwn(original, c))
				)
					throw new Error(`Columnas incompatibles en ${table}.`);
				const row = { ...original };
				// Restoring a backup must never replay side effects against Discord.
				if (table === 'raid_jobs' && row.status !== 'done') {
					row.status = 'blocked';
					row.error = 'Recuperado de copia: revisar en Discord antes de reintentar.';
				}
				if (table === 'outbox' && !row.delivered_at) row.attempts = Math.max(5, row.attempts);
				if (table === 'raid_sync') {
					row.next_at = 0;
					row.busy_until = 0;
					row.cursor = 0;
					row.last_success = null;
					row.error = 'Copia restaurada: sincronización pendiente de revisión.';
				}
				insert.run(...columns.map((c) => row[c]));
			}
		}
		if (db.prepare('PRAGMA foreign_key_check').all().length)
			throw new Error('Referencias inválidas en la copia.');
		if (db.prepare('PRAGMA integrity_check').get().integrity_check !== 'ok')
			throw new Error('Integridad SQLite incorrecta.');
		return {
			verified: true,
			counts: Object.fromEntries(
				recoveryTables.map((t) => [t, db.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get().n]),
			),
			sessionsRestored: 0,
			pendingWritesPaused: true,
		};
	});
}
