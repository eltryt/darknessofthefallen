import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { encryptBackup } from '../src/backup-crypto.mjs';
import { validateRecovery } from '../src/recovery.mjs';

// Downloads the production export, verifies it and stores it only in encrypted form.
// Prints counts, never guild data.
const outDir = process.argv[2] || 'backups';
const origin = process.env.BACKUP_URL || 'https://darknessofthefallen.com';
const token = process.env.BACKUP_TOKEN;
if (!token) throw new Error('Falta BACKUP_TOKEN.');
const response = await fetch(new URL('/api/backup', origin), {
	headers: { Authorization: `Bearer ${token}` },
});
if (!response.ok) throw new Error(`La web rechazó la copia (HTTP ${response.status}).`);
const snapshot = await response.json();
validateRecovery(snapshot);
const envelope = encryptBackup(snapshot, readFileSync('backup/public-key.pem', 'utf8'));
mkdirSync(outDir, { recursive: true, mode: 0o700 });
const file = join(
	outDir,
	`darkness-backup-${snapshot.exportedAt.replaceAll(':', '-').replace(/\.\d+Z$/, 'Z')}.json.enc`,
);
writeFileSync(file, JSON.stringify(envelope), { mode: 0o600, flag: 'wx' });
const rows = Object.entries(snapshot)
	.filter(([, value]) => Array.isArray(value))
	.reduce((sum, [, value]) => sum + value.length, 0);
console.log(
	`Copia verificada y cifrada: ${file} (${rows} filas, base v${snapshot.databaseVersion}).`,
);
