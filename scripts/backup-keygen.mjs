import { generateKeyPairSync, randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, relative, resolve, isAbsolute } from 'node:path';

// One-time setup: the public key goes in the repository; the private key and the
// backup token stay with the owner, outside the repository, and are never printed.
const [target] = process.argv.slice(2);
if (!target) {
	console.error('Uso: npm run backup:keygen -- /carpeta/privada/fuera/del/repositorio');
	process.exit(1);
}
const dir = resolve(target),
	inside = relative(process.cwd(), dir);
if (!inside.startsWith('..') && !isAbsolute(inside))
	throw new Error('La carpeta privada debe estar fuera del repositorio.');
const privatePath = join(dir, 'backup-private-key.pem'),
	tokenPath = join(dir, 'backup-token.txt'),
	publicPath = 'backup/public-key.pem';
for (const path of [privatePath, tokenPath])
	if (existsSync(path)) throw new Error(`Ya existe ${path}; no se sobrescribe.`);
const { publicKey, privateKey } = generateKeyPairSync('rsa', {
	modulusLength: 4096,
	publicKeyEncoding: { type: 'spki', format: 'pem' },
	privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});
mkdirSync(dir, { recursive: true, mode: 0o700 });
mkdirSync('backup', { recursive: true });
writeFileSync(privatePath, privateKey, { mode: 0o600, flag: 'wx' });
writeFileSync(tokenPath, randomBytes(32).toString('base64url') + '\n', { mode: 0o600, flag: 'wx' });
writeFileSync(publicPath, publicKey);
console.log(`Clave pública: ${publicPath}\nClave privada y token: ${dir}`);
