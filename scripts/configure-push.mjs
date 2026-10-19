import { spawnSync } from 'node:child_process';

// Installs the VAPID private key used to sign app notifications. The public key
// lives in wrangler.jsonc; this secret never appears in logs or the repository.
const value = process.env.VAPID_PRIVATE_JWK || '';
let jwk;
try {
	jwk = JSON.parse(value);
} catch {
	throw new Error('VAPID_PRIVATE_JWK must be the JSON key created for app notifications.');
}
if (jwk.kty !== 'EC' || jwk.crv !== 'P-256' || !jwk.d)
	throw new Error('VAPID_PRIVATE_JWK is not a P-256 private key.');
for (const name of ['CLOUDFLARE_API_TOKEN', 'CLOUDFLARE_ACCOUNT_ID'])
	if (!process.env[name]) throw new Error(`Missing ${name}.`);
const result = spawnSync(
	process.execPath,
	['node_modules/wrangler/bin/wrangler.js', 'secret', 'bulk'],
	{
		input: JSON.stringify({ VAPID_PRIVATE_JWK: value }),
		encoding: 'utf8',
		env: process.env,
		timeout: 120000,
	},
);
if (result.error || result.status !== 0)
	throw new Error('Could not install the app notification key in the existing Worker.');
console.log('App notification key installed; other Worker secrets are unchanged.');
