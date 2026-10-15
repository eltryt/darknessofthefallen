import { spawnSync } from 'node:child_process';
import { dmReady } from '../src/raid-lineup.mjs';

// Validates the bot token against Discord and installs it as a Worker secret.
// Never prints the token, member names or ids.
const env = { ...process.env, DISCORD_DM_ENABLED: 'true' };
if (!dmReady(env))
	throw new Error('Missing or malformed DISCORD_BOT_TOKEN in GitHub Actions secrets.');
if (!/^\d{17,20}$/.test(env.DISCORD_GUILD_ID || ''))
	throw new Error('Missing DISCORD_GUILD_ID in GitHub Actions secrets.');
const call = async (path) => {
	const response = await fetch('https://discord.com/api/v10' + path, {
		headers: { Authorization: `Bot ${env.DISCORD_BOT_TOKEN}` },
		redirect: 'manual',
	});
	return { status: response.status, data: await response.json().catch(() => ({})) };
};
const me = await call('/users/@me');
if (me.status !== 200 || !me.data.bot)
	throw new Error(`Discord rejected the bot token (HTTP ${me.status}).`);
const guild = await call(`/guilds/${env.DISCORD_GUILD_ID}`);
if (guild.status !== 200)
	throw new Error(
		`The bot is not in the guild server yet (HTTP ${guild.status}). Invite it before enabling private messages.`,
	);
console.log('Discord bot authenticated and present in the guild server.');
for (const name of ['CLOUDFLARE_API_TOKEN', 'CLOUDFLARE_ACCOUNT_ID'])
	if (!env[name]) throw new Error(`Missing ${name}.`);
const result = spawnSync(
	process.execPath,
	['node_modules/wrangler/bin/wrangler.js', 'secret', 'bulk'],
	{
		input: JSON.stringify({ DISCORD_BOT_TOKEN: env.DISCORD_BOT_TOKEN, DISCORD_DM_ENABLED: 'true' }),
		encoding: 'utf8',
		env: process.env,
		timeout: 120000,
	},
);
if (result.error || result.status !== 0)
	throw new Error('Could not install the Discord bot secret in the existing Worker.');
console.log('Discord bot secret installed; call-up private messages are enabled.');
