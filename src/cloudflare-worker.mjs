import gmSchema from '../migrations/006_gm_notifications.sql';
import {
	deliverGM,
	gmReady,
	captureRaidIncidents,
	repairGMRedirectFailures,
} from './gm-notifications.mjs';
import { DurableObject } from 'cloudflare:workers';
import { Buffer } from 'node:buffer';
import { byteRange, createApp, securityHeaders, staticFile } from './app.mjs';
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
import levelCapSchema from '../migrations/014_level_cap.sql';
import rouletteSchema from '../migrations/015_roulette.sql';
import rouletteDeleteSchema from '../migrations/016_roulette_delete.sql';
import rouletteDmSchema from '../migrations/017_roulette_dm.sql';
import rouletteLoserDmSchema from '../migrations/018_roulette_loser_dm.sql';
import rouletteRematchSchema from '../migrations/019_roulette_rematch.sql';
import rouletteChatSchema from '../migrations/020_roulette_chat.sql';
import battlenetSyncSchema from '../migrations/021_battlenet_sync.sql';
import applicationTrackingSchema from '../migrations/022_application_tracking.sql';
import gmCasesSchema from '../migrations/023_gm_cases.sql';
import raidBotSchema from '../migrations/024_raid_bot.sql';
import { botReady, deliverBotRenders, nextBotRenderAt } from './raid-bot.mjs';
import { deliverRouletteDMs, nextRouletteDMAt } from './roulette.mjs';
import { deliverPush, nextPushAt, pushReady } from './push-notifications.mjs';
import { deliverCallups, dmReady, nextCallupAt } from './raid-lineup.mjs';
import { syncRaidEvents } from './raid-sync.mjs';
import { raidHelperReady } from './raid-helper.mjs';
import { battlenetReady, nextBattlenetSyncAt, syncBattlenet } from './battlenet.mjs';
// An alarm this far past its time is not going to fire on its own.
const STALE_ALARM_MS = 120000;

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
			levelCapSchema,
			rouletteSchema,
			rouletteDeleteSchema,
			rouletteDmSchema,
			rouletteLoserDmSchema,
			rouletteRematchSchema,
			rouletteChatSchema,
			battlenetSyncSchema,
			applicationTrackingSchema,
			gmCasesSchema,
			raidBotSchema,
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
		// Reading pages queues nothing new: their check of the alarms runs once a minute at
		// most (each check reads several tables). Writes always check; the alarm reschedules
		// itself after every run.
		const reading = request.method === 'GET' || request.method === 'HEAD';
		if (!reading || Date.now() - (this.scheduledAt || 0) > 60000) {
			this.scheduledAt = Date.now();
			await this.scheduleNotifications();
		}
		return response || new Response('Application response unavailable.', { status: 500 });
	}

	// Brings the alarm forward to `at`. An alarm already well in the past never fires again
	// (Cloudflare gives up after failed retries and leaves it set), and since this only ever
	// moves the alarm earlier, such a stale one used to stop every scheduled job for good:
	// raid sync stopped on 2026-11-08 that way. A stale alarm is replaced.
	async arm(at) {
		const alarm = await this.ctx.storage.getAlarm();
		if (alarm === null || alarm > at || alarm < Date.now() - STALE_ALARM_MS) {
			if (alarm !== null && alarm < Date.now() - STALE_ALARM_MS)
				console.warn(`Stale alarm from ${new Date(alarm).toISOString()} replaced`);
			await this.ctx.storage.setAlarm(at);
		}
	}

	async scheduleNotifications() {
		if (gmReady(this.env)) {
			const row = this.db
				.prepare(
					"SELECT MIN(next_at) due FROM gm_notifications WHERE status IN ('pending','sending')",
				)
				.get();
			if (row.due !== null) await this.arm(Math.max(Date.now() + 60000, row.due));
		}
		if (pushReady(this.env)) {
			const due = nextPushAt(this.db);
			if (due !== null) await this.arm(Math.max(Date.now() + 2000, due));
		}
		if (dmReady(this.env)) {
			const due = Math.min(
				nextCallupAt(this.db) ?? Infinity,
				nextRouletteDMAt(this.db) ?? Infinity,
			);
			if (due !== Infinity) await this.arm(Math.max(Date.now() + 5000, due));
		}
		if (botReady(this.env)) {
			// A press in Discord or an edit on the website reaches the message in a second.
			const due = nextBotRenderAt(this.db);
			if (due !== null) await this.arm(Math.max(Date.now() + 1000, due));
		}
		if (raidHelperReady(this.env) || botReady(this.env)) {
			const sync = this.db.prepare('SELECT next_at FROM raid_sync WHERE id=1').get(),
				job = this.db
					.prepare("SELECT MIN(next_at) due FROM raid_jobs WHERE status='pending'")
					.get();
			await this.arm(Math.max(Date.now() + 15000, Math.min(sync.next_at, job.due ?? Infinity)));
		}
		if (battlenetReady(this.env)) {
			const due = nextBattlenetSyncAt(this.db);
			if (due !== null) await this.arm(Math.max(Date.now() + 60000, due));
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
		// Each job runs on its own: one that throws no longer skips the rest or fails the
		// whole alarm (repeated failures are what leave Cloudflare's alarm stuck).
		const steps = [
			[
				'recruitment',
				() => origin && deliverRecruitment(this.db, { ...this.env, APP_ORIGIN: origin }),
			],
			['raid-sync', () => syncRaidEvents(this.db, { ...this.env, APP_ORIGIN: origin || '' })],
			['raid-bot', () => deliverBotRenders(this.db, { ...this.env, APP_ORIGIN: origin || '' })],
			['raid-incidents', () => captureRaidIncidents(this.db, this.env)],
			['gm', () => deliverGM(this.db, this.env)],
			[
				'push',
				() => deliverPush(this.db, { ...this.env, APP_ORIGIN: origin || this.env.APP_ORIGIN }),
			],
			['callups', () => deliverCallups(this.db, { ...this.env, APP_ORIGIN: origin || '' })],
			['roulette-dm', () => deliverRouletteDMs(this.db, { ...this.env, APP_ORIGIN: origin || '' })],
			['battlenet', () => syncBattlenet(this.db, this.env)],
		];
		for (const [name, step] of steps) {
			try {
				await step();
			} catch (e) {
				console.error(`Alarm step ${name} failed: ${e?.name || 'Error'}`);
			}
		}
		await this.scheduleNotifications();
	}
}

// Code, styles and images come straight from the asset store at the edge. Only pages and
// the API reach the guild's Durable Object, which handles one request at a time: a page
// load requests dozens of files, and queuing them there left phones waiting for minutes.
async function serveStatic(request, env, url) {
	const asset = staticFile(url.pathname);
	if (!asset) return null;
	const video = asset.contentType.startsWith('video/');
	const forwarded = new Headers(request.headers);
	// Ranges are cut here from the whole file, so the asset store always sends all of it.
	if (video) forwarded.delete('Range');
	const stored = await env.ASSETS.fetch(
		new Request(new URL('/' + asset.file, url.origin), {
			method: request.method,
			headers: forwarded,
		}),
	);
	if (!stored.ok && stored.status !== 304) return null;
	const headers = new Headers(securityHeaders(env.APP_ORIGIN || url.origin));
	headers.set('Cache-Control', asset.cacheControl);
	const tag = stored.headers.get('ETag');
	if (tag) headers.set('ETag', tag);
	if (stored.status === 304) return new Response(null, { status: 304, headers });
	headers.set('Content-Type', asset.contentType);
	// Players (Safari above all) read videos in byte ranges to start and to seek.
	if (video && request.method !== 'HEAD') {
		const bytes = new Uint8Array(await stored.arrayBuffer());
		const range = byteRange(bytes.length, request.headers.get('Range'));
		headers.set('Accept-Ranges', 'bytes');
		if (range === 'invalid') {
			headers.set('Content-Range', `bytes */${bytes.length}`);
			return new Response(null, { status: 416, headers });
		}
		if (range) {
			headers.set('Content-Range', `bytes ${range.start}-${range.end}/${bytes.length}`);
			return new Response(bytes.slice(range.start, range.end + 1), { status: 206, headers });
		}
		return new Response(bytes, { status: 200, headers });
	}
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
		const response = await env.GUILD.get(id).fetch(request);
		// Pages name their deploy so the app's service worker knows when its cached
		// code is current (public/sw.js).
		const deploy = env.CF_VERSION_METADATA?.id;
		if (!deploy || !response.headers.get('Content-Type')?.startsWith('text/html')) return response;
		const page = new Response(response.body, response);
		page.headers.set('X-App-Version', deploy);
		return page;
	},
};
