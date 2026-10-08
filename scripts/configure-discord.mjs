import {spawnSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';

export function discordSecrets(env) {
  const names = ['DISCORD_CLIENT_ID', 'DISCORD_CLIENT_SECRET', 'DISCORD_GUILD_ID', 'DISCORD_LEADER_ID'];
  const missing = names.filter(name => !env[name]?.trim());
  if (missing.length) throw new Error(`Missing GitHub Actions secrets: ${missing.join(', ')}`);
  const values = Object.fromEntries(names.map(name => [name, env[name].trim()]));
  for (const name of names.filter(name => name !== 'DISCORD_CLIENT_SECRET')) {
    if (!/^\d{17,20}$/.test(values[name])) throw new Error(`${name} must be a Discord numeric ID.`);
  }
  if (env.DISCORD_ROLE_MAP?.trim()) {
    let map;
    try { map = JSON.parse(env.DISCORD_ROLE_MAP); } catch { throw new Error('DISCORD_ROLE_MAP must be valid JSON.'); }
    const roles = ['member', 'raider', 'raid_leader', 'officer', 'leader'];
    if (!map || Array.isArray(map) || typeof map !== 'object' || Object.entries(map).some(([id, rank]) => !/^\d{17,20}$/.test(id) || !roles.includes(rank))) {
      throw new Error('DISCORD_ROLE_MAP must map Discord role IDs to supported web ranks.');
    }
    values.DISCORD_ROLE_MAP = JSON.stringify(map);
  }
  // An omitted role map preserves the remote value; never reset existing roles.
  return values;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const values = discordSecrets(process.env);
  for (const name of ['CLOUDFLARE_API_TOKEN', 'CLOUDFLARE_ACCOUNT_ID']) {
    if (!process.env[name]) throw new Error(`Missing GitHub Actions configuration: ${name}`);
  }
  const result = spawnSync(process.execPath, ['node_modules/wrangler/bin/wrangler.js', 'secret', 'bulk'], {
    input: JSON.stringify(values), encoding: 'utf8', env: process.env, timeout: 120000
  });
  // Never relay command output or serialize errors that may include secret input.
  if (result.error || result.status !== 0) throw new Error('Cloudflare secret upload failed. Check token permissions and account configuration.');
  console.log('Discord secrets installed in the existing Cloudflare Worker.');
}
