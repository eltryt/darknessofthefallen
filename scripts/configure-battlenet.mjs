import { spawnSync } from 'node:child_process';

// Installs the Battle.net application used by "Conectar con Battle.net" in the profile.
// The same BLIZZARD_CLIENT_ID / BLIZZARD_CLIENT_SECRET the data scripts use; the values
// never appear in logs or the repository.
const id = process.env.BLIZZARD_CLIENT_ID || '',
	secret = process.env.BLIZZARD_CLIENT_SECRET || '';
if (!id || !secret) throw new Error('Missing BLIZZARD_CLIENT_ID or BLIZZARD_CLIENT_SECRET.');
for (const name of ['CLOUDFLARE_API_TOKEN', 'CLOUDFLARE_ACCOUNT_ID'])
	if (!process.env[name]) throw new Error(`Missing ${name}.`);
const result = spawnSync(
	process.execPath,
	['node_modules/wrangler/bin/wrangler.js', 'secret', 'bulk'],
	{
		input: JSON.stringify({ BLIZZARD_CLIENT_ID: id, BLIZZARD_CLIENT_SECRET: secret }),
		encoding: 'utf8',
		env: process.env,
		timeout: 120000,
	},
);
if (result.error || result.status !== 0)
	throw new Error('Could not install the Battle.net application in the existing Worker.');
console.log('Battle.net application installed; other Worker secrets are unchanged.');
