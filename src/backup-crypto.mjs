import {
	createCipheriv,
	createDecipheriv,
	createHash,
	privateDecrypt,
	publicEncrypt,
	randomBytes,
	constants,
} from 'node:crypto';
import { gzipSync, gunzipSync } from 'node:zlib';

// Off-site copies live in a public repository's artifacts, so only the owner's
// private key can read them: a fresh AES key per copy, sealed with RSA-OAEP.
export const BACKUP_FORMAT = 'darkness-backup-v1';
const oaep = (key) => ({ key, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' });

export function encryptBackup(snapshot, publicKeyPem) {
	const key = randomBytes(32),
		iv = randomBytes(12);
	const cipher = createCipheriv('aes-256-gcm', key, iv);
	const data = Buffer.concat([
		cipher.update(gzipSync(Buffer.from(JSON.stringify(snapshot)))),
		cipher.final(),
	]);
	return {
		format: BACKUP_FORMAT,
		algorithm: 'RSA-OAEP-SHA256 + AES-256-GCM + gzip',
		exportedAt: snapshot.exportedAt,
		keyId: createHash('sha256').update(publicKeyPem.trim()).digest('hex').slice(0, 16),
		key: publicEncrypt(oaep(publicKeyPem), key).toString('base64'),
		iv: iv.toString('base64'),
		tag: cipher.getAuthTag().toString('base64'),
		data: data.toString('base64'),
	};
}

export function decryptBackup(envelope, privateKeyPem) {
	if (!envelope || envelope.format !== BACKUP_FORMAT)
		throw new Error('No es una copia cifrada de Darkness of the Fallen.');
	let key;
	try {
		key = privateDecrypt(oaep(privateKeyPem), Buffer.from(envelope.key, 'base64'));
	} catch {
		throw new Error('La clave privada no corresponde a esta copia.');
	}
	const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(envelope.iv, 'base64'));
	decipher.setAuthTag(Buffer.from(envelope.tag, 'base64'));
	let plain;
	try {
		plain = Buffer.concat([
			decipher.update(Buffer.from(envelope.data, 'base64')),
			decipher.final(),
		]);
	} catch {
		throw new Error('La copia cifrada está dañada o ha sido modificada.');
	}
	return JSON.parse(gunzipSync(plain).toString('utf8'));
}
