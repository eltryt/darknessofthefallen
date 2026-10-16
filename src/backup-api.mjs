import { createHash, timingSafeEqual } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { audit } from './database-core.mjs';
import { HttpError } from './domain.mjs';
import { exportRecovery, restoreRecovery } from './recovery.mjs';

const MAX_RESTORE_BYTES = 64 * 1024 * 1024;
const digest = (value) => createHash('sha256').update(String(value)).digest();

export const backupReady = (env) =>
	typeof env.BACKUP_TOKEN === 'string' && env.BACKUP_TOKEN.length >= 32;

export function backupAuthorized(req, env) {
	const header = req.headers.authorization || '';
	return (
		backupReady(env) &&
		header.startsWith('Bearer ') &&
		timingSafeEqual(digest(header.slice(7)), digest(env.BACKUP_TOKEN))
	);
}

async function snapshotBody(req) {
	const chunks = [];
	let size = 0;
	for await (const chunk of req) {
		size += chunk.length;
		if (size > MAX_RESTORE_BYTES) throw new HttpError(413, 'La copia es demasiado grande.');
		chunks.push(Buffer.from(chunk));
	}
	try {
		return JSON.parse(Buffer.concat(chunks).toString('utf8'));
	} catch {
		throw new HttpError(400, 'JSON no válido.');
	}
}

// Machine-only routes for the scheduled off-site copy and disaster recovery.
// They use a dedicated token instead of a Discord session and never exist without it.
export async function backupApi({ db, req, path, method, env, send, throttle }) {
	if (path !== '/api/backup' && path !== '/api/restore') return false;
	if (!backupReady(env)) throw new HttpError(404, 'Endpoint no encontrado.');
	throttle(req, 'backup', 10);
	if (!backupAuthorized(req, env)) throw new HttpError(401, 'Token de copia no válido.');
	if (path === '/api/backup' && method === 'GET') {
		const data = exportRecovery(db);
		audit(db, 'system:backup', 'data.exported', 'guild', { automatic: true });
		send(200, data);
		return true;
	}
	if (path === '/api/restore' && method === 'POST') {
		const snapshot = await snapshotBody(req);
		let report;
		try {
			// Refuses any database that already holds guild data or sessions.
			report = restoreRecovery(db, snapshot);
		} catch (e) {
			throw new HttpError(409, e.message);
		}
		audit(db, 'system:backup', 'data.restored', 'guild', { exportedAt: snapshot.exportedAt });
		send(200, report);
		return true;
	}
	throw new HttpError(405, 'Método no permitido.');
}
