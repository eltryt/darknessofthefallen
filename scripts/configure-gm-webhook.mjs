import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { openDatabase } from '../src/db.mjs';
import { gmWebhook, enqueueGM, deliverGM } from '../src/gm-notifications.mjs';
const env = {
	...process.env,
	GM_NOTIFICATIONS_ENABLED: 'true',
	APP_ORIGIN: 'https://darknessofthefallen.com',
};
async function main() {
	for (const name of [
		'DISCORD_GM_WEBHOOK_URL',
		'DISCORD_GUILD_ID',
		'CLOUDFLARE_API_TOKEN',
		'CLOUDFLARE_ACCOUNT_ID',
	])
		if (!env[name]) throw new Error('Missing configuration: ' + name);
	const url = gmWebhook(env);
	if (!url) {
		let reason = 'the value is not a complete URL';
		try {
			const parsed = new URL(env.DISCORD_GM_WEBHOOK_URL);
			reason = !['discord.com', 'discordapp.com'].includes(parsed.hostname)
				? 'the host is not a Discord webhook host'
				: !parsed.pathname.startsWith('/api/webhooks/') &&
					  !parsed.pathname.startsWith('/api/v10/webhooks/')
					? 'the path is not /api/webhooks/ID/TOKEN'
					: 'the webhook ID/token or URL options are invalid';
		} catch {}
		throw new Error(
			'DISCORD_GM_WEBHOOK_URL must be a Discord channel webhook URL: ' +
				reason +
				'. Copy the entire URL from channel settings > Integrations > Webhooks.',
		);
	}
	const response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(10000) });
	if (!response.ok)
		throw new Error('Discord webhook validation failed (HTTP ' + response.status + ').');
	const webhook = await response.json();
	if (webhook.guild_id !== env.DISCORD_GUILD_ID || webhook.type !== 1)
		throw new Error(
			'Webhook must belong to the configured guild and be an incoming channel webhook.',
		);
	// Webhook credentials cannot read channel permission overwrites.
	if (env.DISCORD_BOT_TOKEN) {
		const read = async (path) => {
			const r = await fetch('https://discord.com/api/v10' + path, {
				headers: { Authorization: 'Bot ' + env.DISCORD_BOT_TOKEN },
				redirect: 'error',
				signal: AbortSignal.timeout(10000),
			});
			if (!r.ok) throw new Error('Cannot verify channel permissions with the configured bot.');
			return r.json();
		};
		const channel = await read('/channels/' + webhook.channel_id),
			roles = await read('/guilds/' + webhook.guild_id + '/roles');
		const approved = new Set(['1550998307801927802']);
		const map = JSON.parse(env.DISCORD_ROLE_MAP || '{}');
		for (const [id, rank] of Object.entries(map))
			if (['leader', 'officer'].includes(rank)) approved.add(id);
		const overwrites = channel.permission_overwrites || [],
			view = 1024n,
			admin = 8n;
		const everyone = overwrites.find((o) => o.id === webhook.guild_id);
		if (!everyone || !(BigInt(everyone.deny) & view))
			throw new Error('Channel must deny View Channel to @everyone.');
		for (const role of roles)
			if (BigInt(role.permissions) & admin && !approved.has(role.id))
				throw new Error(
					'An additional administrator role can access the channel; review access manually before activation.',
				);
		for (const overwrite of overwrites)
			if (
				BigInt(overwrite.allow) & view &&
				!(overwrite.type === 0
					? approved.has(overwrite.id)
					: overwrite.id === env.DISCORD_LEADER_ID)
			)
				throw new Error('An additional role or member can view the channel.');
		console.log(
			'Channel permission overwrites checked. Discord server owner retains platform access.',
		);
	} else
		console.log(
			'CHANNEL_PERMISSIONS_NOT_VERIFIED: webhook cannot read channel permissions. Owner must verify @everyone denied and only GM/approved officers allowed; administrator roles bypass channel restrictions.',
		);
	const db = openDatabase(':memory:');
	try {
		const id = randomUUID();
		enqueueGM(db, 'incident', id, 'setup-test:' + id);
		await deliverGM(db, env, async (url, options) => {
			const body = JSON.parse(options.body);
			body.content =
				'🔔 PRUEBA DE AVISOS GM · Darkness of the Fallen\nConexión comprobada. Este mensaje es una prueba, no una incidencia real.\n' +
				env.APP_ORIGIN +
				'/panel?tab=messages';
			return fetch(url, { ...options, body: JSON.stringify(body) });
		});
		const result = db.prepare('SELECT status,message_id FROM gm_notifications').get();
		if (result.status !== 'delivered')
			throw new Error(
				'Discord did not confirm the test message. Review the channel before running this workflow again.',
			);
		const check = await fetch(url.href + '/messages/' + result.message_id, {
			redirect: 'error',
			signal: AbortSignal.timeout(10000),
		});
		if (!check.ok)
			throw new Error(
				'Test was sent but could not be read back. Check the channel before rerunning.',
			);
		console.log(
			'TEST_DELIVERED: Discord confirmed the test and its message was read back successfully.',
		);
	} finally {
		db.close();
	}
	const uploaded = spawnSync(
		process.execPath,
		['node_modules/wrangler/bin/wrangler.js', 'secret', 'bulk'],
		{
			input: JSON.stringify({
				DISCORD_GM_WEBHOOK_URL: env.DISCORD_GM_WEBHOOK_URL,
				GM_NOTIFICATIONS_ENABLED: 'true',
			}),
			encoding: 'utf8',
			env: process.env,
			timeout: 120000,
		},
	);
	if (uploaded.error || uploaded.status !== 0)
		throw new Error('Cloudflare secret installation failed.');
	console.log('GM webhook installed in the existing backend without exposing its URL.');
}
try {
	await main();
} catch (error) {
	// Only our own diagnostic messages are safe. Fetch errors may contain the URL.
	const message = error.message || '';
	console.error(
		/^(Missing configuration:|DISCORD_GM_WEBHOOK_URL must|Discord webhook validation|Webhook must|Cannot verify|Channel must|An additional|Discord did not|Test was sent|Cloudflare secret)/.test(
			message,
		)
			? message
			: 'Configuration could not complete. Check network access and secrets; no credential details logged.',
	);
	process.exitCode = 1;
}
