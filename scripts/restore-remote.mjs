import { readFileSync } from 'node:fs';
import { validateRecovery } from '../src/recovery.mjs';

// Disaster recovery into the production Durable Object. The server refuses unless
// its database is empty, so this cannot merge into or overwrite live guild data.
const [input, ...flags] = process.argv.slice(2);
if (!input || flags.join(' ') !== '--confirmo-restaurar-produccion') {
	console.error(
		'Uso: npm run backup:restore-remote -- copia.json --confirmo-restaurar-produccion\nAntes, ensaya la copia con npm run restore.',
	);
	process.exit(1);
}
const origin = process.env.BACKUP_URL || 'https://darknessofthefallen.com';
const token = process.env.BACKUP_TOKEN;
if (!token) throw new Error('Falta BACKUP_TOKEN (está en tu carpeta privada, backup-token.txt).');
const raw = readFileSync(input, 'utf8');
validateRecovery(JSON.parse(raw));
const response = await fetch(new URL('/api/restore', origin), {
	method: 'POST',
	headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
	body: raw,
});
const result = await response.json().catch(() => ({}));
if (!response.ok)
	throw new Error(`Restauración rechazada (HTTP ${response.status}): ${result.error || ''}`);
console.log(JSON.stringify(result, null, 2));
