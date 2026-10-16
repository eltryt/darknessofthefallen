import { readFileSync, writeFileSync } from 'node:fs';
import { decryptBackup } from '../src/backup-crypto.mjs';
import { validateRecovery } from '../src/recovery.mjs';

const [input, keyPath, output, ...extra] = process.argv.slice(2);
if (!input || !keyPath || !output || extra.length) {
	console.error(
		'Uso: npm run backup:decrypt -- copia.json.enc /privado/backup-private-key.pem /privado/NUEVA-copia.json',
	);
	process.exit(1);
}
const snapshot = decryptBackup(
	JSON.parse(readFileSync(input, 'utf8')),
	readFileSync(keyPath, 'utf8'),
);
validateRecovery(snapshot);
// The decrypted copy holds personal data: new file only, readable by the owner.
writeFileSync(output, JSON.stringify(snapshot), { mode: 0o600, flag: 'wx' });
console.log(`Copia descifrada y verificada (${snapshot.exportedAt}): ${output}`);
