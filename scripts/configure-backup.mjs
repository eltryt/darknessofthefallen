import { spawnSync } from 'node:child_process';
import { backupReady } from '../src/backup-api.mjs';

if (!backupReady(process.env))
	throw new Error('BACKUP_TOKEN must be at least 32 characters (npm run backup:keygen).');
for (const name of ['CLOUDFLARE_API_TOKEN', 'CLOUDFLARE_ACCOUNT_ID'])
	if (!process.env[name]) throw new Error(`Missing ${name}.`);
const result = spawnSync(
	process.execPath,
	['node_modules/wrangler/bin/wrangler.js', 'secret', 'bulk'],
	{
		input: JSON.stringify({ BACKUP_TOKEN: process.env.BACKUP_TOKEN }),
		encoding: 'utf8',
		env: process.env,
		timeout: 120000,
	},
);
if (result.error || result.status !== 0)
	throw new Error('Could not install the backup token in the existing Worker.');
console.log('Backup token installed; other Worker secrets are unchanged.');
