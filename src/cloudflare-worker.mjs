import gmSchema from '../migrations/006_gm_notifications.sql';
import {
	deliverGM,
	gmReady,
	captureRaidIncidents,
	repairGMRedirectFailures,
} from './gm-notifications.mjs';
import { DurableObject } from 'cloudflare:workers';
import { Buffer } from 'node:buffer';
import { createApp, securityHeaders, staticFile } from './app.mjs';
import { durableDatabase } from './cloudflare-database.mjs';
import { deliverRecruitment } from './integrations.mjs';
import initialSchema from '../migrations/001_initial.sql';
import operationsSchema from '../migrations/002_operations.sql';
import invitationSchema from '../migrations/003_discord_invite.sql';
import recruitmentSchema from '../migrations/004_open_recruitment.sql';
import raidEventsSchema from '../migrations/005_raid_events.sql';
import armorySchema from '../migrations/007_armory.sql';
import statsSchema from '../migrations/008_character_stats.sql';
import lineupSchema from '../migrations/009_raid_lineups.sql';
import wishlistSchema from '../migrations/010_unified_wishlist.sql';
import achievementsSchema from '../migrations/011_achievements.sql';
import pushSchema from '../migrations/012_push.sql';
import lootOfficerSchema from '../migrations/013_loot_officer.sql';
import { deliverPush, nextPushAt, pushReady } from './push-notifications.mjs';
import { deliverCallups, dmReady, nextCallupAt } from './raid-lineup.mjs';
import { syncRaidEvents } from './raid-sync.mjs';
import { raidHelperReady } from './raid-helper.mjs';

export class Guild extends DurableObject {
	constructor(ctx, env) {
		super(ctx, env);
		this.db = durableDatabase(
			ctx.storage,
			initialSchema,
			operationsSchema,
			invitationSchema,
			recruitmentSchema,
			raidEventsSchema,
			gmSchema,
			armorySchema,
			statsSchema,
			lineupSchema,
			wishlistSchema,
			achievementsSchema,
			pushSchema,
			lootOfficerSchema,
		);
		repairGMRedirectFailures(this.db);
	}

	async fetch(request) {
		const origin = this.env.APP_ORIGIN || new URL(request.url).origin;
		if (new URL(request.url).origin !== origin) {
			return new Response('Use the configured application origin.', { status: 400 });
		}
		if (!this.app) {
			this.appOrigin = origin;
			this.app = createApp(
				this.db,
				{ ...this.env, APP_ORIGIN: origin },
				{
					readAsset: async (file) => {
						const path = file === 'index.html' ? '/' : '/' + file;
						const response = await this.env.ASSETS.fetch(new Request(new URL(path, origin)));
						if (!response.ok) throw new Error('Application asset unavailable.');
						return new Uint8Array(await response.arrayBuffer());
					},
				},
			);
			await this.ctx.storage.put('application-origin', origin);
		}
		if (origin !== this.appOrigin)
			return new Response('Application origin mismatch.', { status: 400 });
		const url = new URL(request.url);
		const req = {
			url: url.pathname + url.search,
			method: request.method,
			headers: Object.fromEntries(request.headers),
			// Cloudflare supplies this header at its trusted edge. The Node server
			// continues using the direct socket address, never forwarded headers.
			socket: { remoteAddress: request.headers.get('CF-Connecting-IP') || 'unknown' },
			async *[Symbol.asyncIterator]() {
				if (request.body) for await (const chunk of request.body) yield Buffer.from(chunk);
			},
		};
		let status = 200,
			headers = new Headers(),
			response;
		const res = {
			writeHead(code, values) {
				status = code;
				headers = new Headers();
				for (const [name, value] of Object.entries(values)) {
					for (const item of Array.isArray(value) ? value : [value])
						headers.append(name, String(item));
				}
			},
			end(body) {
				response = new Response(request.method === 'HEAD' ? null : body, { status, headers });
			},
		};
		await this.app(req, res);
		await this.scheduleNotifications();
		return response || new Response('Application response unavailable.', { status: 500 });
	}

	async scheduleNotifications() {
		if (gmReady(this.env)) {
			const row = this.db
				.prepare(
					"SELECT MIN(next_at) due FROM gm_notifications WHERE status IN ('pending','sending')",
				)
				.get();
			if (row.due !== null) {
				const due = Math.max(Date.now() + 60000, row.due),
					alarm = await this.ctx.storage.getAlarm();
				if (alarm === null || alarm > due) await this.ctx.storage.setAlarm(due);
			}
		}
		if (pushReady(this.env)) {
			const due = nextPushAt(this.db);
			if (due !== null) {
				const at = Math.max(Date.now() + 2000, due),
					alarm = await this.ctx.storage.getAlarm();
				if (alarm === null || alarm > at) await this.ctx.storage.setAlarm(at);
			}
		}
		if (dmReady(this.env)) {
			const due = nextCallupAt(this.db);
			if (due !== null) {
				const at = Math.max(Date.now() + 5000, due),
					alarm = await this.ctx.storage.getAlarm();
				if (alarm === null || alarm > at) await this.ctx.storage.setAlarm(at);
			}
		}
		if (raidHelperReady(this.env)) {
			const sync = this.db.prepare('SELECT next_at FROM raid_sync WHERE id=1').get(),
				job = this.db
					.prepare("SELECT MIN(next_at) due FROM raid_jobs WHERE status='pending'")
					.get();
			const due = Math.max(Date.now() + 15000, Math.min(sync.next_at, job.due ?? Infinity));
			const alarm = await this.ctx.storage.getAlarm();
			if (alarm === null || alarm > due) await this.ctx.storage.setAlarm(due);
		}
		if (this.env.RECRUITMENT_NOTIFICATIONS_ENABLED !== 'true') return;
		const webhook = this.env.DISCORD_RECRUITMENT_WEBHOOK;
		if (!webhook || !/^https:\/\/discord\.com\/api\/webhooks\/\d+\/[\w-]+$/.test(webhook)) return;
		const pending = this.db
			.prepare('SELECT 1 FROM outbox WHERE delivered_at IS NULL AND attempts<5 LIMIT 1')
			.get();
		if (pending && (await this.ctx.storage.getAlarm()) === null)
			await this.ctx.storage.setAlarm(Date.now() + 60000);
	}

	async alarm() {
		const origin = this.env.APP_ORIGIN || (await this.ctx.storage.get('application-origin'));
		if (origin) await deliverRecruitment(this.db, { ...this.env, APP_ORIGIN: origin });
		try {
			await syncRaidEvents(this.db, this.env);
			captureRaidIncidents(this.db, this.env);
			await deliverGM(this.db, this.env);
			await deliverPush(this.db, { ...this.env, APP_ORIGIN: origin || this.env.APP_ORIGIN });
			await deliverCallups(this.db, { ...this.env, APP_ORIGIN: origin || '' });
		} finally {
			await this.scheduleNotifications();
		}
	}
}

// Code, styles and images come straight from the asset store at the edge. Only pages and
// the API reach the guild's Durable Object, which handles one request at a time: a page
// load requests dozens of files, and queuing them there left phones waiting for minutes.
async function serveStatic(request, env, url) {
	const asset = staticFile(url.pathname);
	if (!asset) return null;
	const stored = await env.ASSETS.fetch(
		new Request(new URL('/' + asset.file, url.origin), {
			method: request.method,
			headers: request.headers,
		}),
	);
	if (!stored.ok && stored.status !== 304) return null;
	const headers = new Headers(securityHeaders(env.APP_ORIGIN || url.origin));
	headers.set('Cache-Control', asset.cacheControl);
	const tag = stored.headers.get('ETag');
	if (tag) headers.set('ETag', tag);
	if (stored.status === 304) return new Response(null, { status: 304, headers });
	headers.set('Content-Type', asset.contentType);
	return new Response(request.method === 'HEAD' ? null : stored.body, { status: 200, headers });
}

export default {
	async fetch(request, env) {
		if (env.APP_ORIGIN && new URL(request.url).origin !== env.APP_ORIGIN) {
			if (!['GET', 'HEAD'].includes(request.method))
				return Response.json(
					{
						error:
							'La dirección de la web ha cambiado. Abre la nueva dirección y vuelve a enviar el formulario.',
					},
					{ status: 409 },
				);
			const original = new URL(request.url),
				target = new URL(env.APP_ORIGIN);
			target.pathname = original.pathname;
			target.search = original.search;
			// Permanent: search engines transfer the old address's standing to the domain.
			return new Response(null, {
				status: 301,
				headers: { Location: target.href, 'Cache-Control': 'public, max-age=3600' },
			});
		}
		if (['GET', 'HEAD'].includes(request.method)) {
			const response = await serveStatic(request, env, new URL(request.url));
			if (response) return response;
		}
		// One persistent database per guild. Keep this name stable across deploys.
		const id = env.GUILD.idFromName('darknessofthefallen');
		return env.GUILD.get(id).fetch(request);
	},
};
