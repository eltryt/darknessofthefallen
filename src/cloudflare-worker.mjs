import {DurableObject} from 'cloudflare:workers';
import {Buffer} from 'node:buffer';
import {createApp} from './app.mjs';
import {durableDatabase} from './cloudflare-database.mjs';
import {deliverRecruitment} from './integrations.mjs';
import initialSchema from '../migrations/001_initial.sql';
import operationsSchema from '../migrations/002_operations.sql';
import invitationSchema from '../migrations/003_discord_invite.sql';
import recruitmentSchema from '../migrations/004_open_recruitment.sql';

export class Guild extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.db = durableDatabase(ctx.storage, initialSchema, operationsSchema, invitationSchema, recruitmentSchema);
  }

  async fetch(request) {
    const origin = this.env.APP_ORIGIN || new URL(request.url).origin;
    if (new URL(request.url).origin !== origin) {
      return new Response('Use the configured application origin.', {status: 400});
    }
    if (!this.app) {
      this.appOrigin = origin;
      this.app = createApp(this.db, {...this.env, APP_ORIGIN: origin}, {
        readAsset: async file => {
          const path = file === 'index.html' ? '/' : '/' + file;
          const response = await this.env.ASSETS.fetch(new Request(new URL(path, origin)));
          if (!response.ok) throw new Error('Application asset unavailable.');
          return new Uint8Array(await response.arrayBuffer());
        }
      });
      await this.ctx.storage.put('application-origin', origin);
    }
    if (origin !== this.appOrigin) return new Response('Application origin mismatch.', {status: 400});
    const url = new URL(request.url);
    const req = {
      url: url.pathname + url.search,
      method: request.method,
      headers: Object.fromEntries(request.headers),
      // Cloudflare supplies this header at its trusted edge. The Node server
      // continues using the direct socket address, never forwarded headers.
      socket: {remoteAddress: request.headers.get('CF-Connecting-IP') || 'unknown'},
      async *[Symbol.asyncIterator]() {
        if (request.body) for await (const chunk of request.body) yield Buffer.from(chunk);
      }
    };
    let status = 200, headers = new Headers(), response;
    const res = {
      writeHead(code, values) {
        status = code; headers = new Headers();
        for (const [name, value] of Object.entries(values)) {
          for (const item of Array.isArray(value) ? value : [value]) headers.append(name, String(item));
        }
      },
      end(body) { response = new Response(request.method === 'HEAD' ? null : body, {status, headers}); }
    };
    await this.app(req, res);
    await this.scheduleNotifications();
    return response || new Response('Application response unavailable.', {status: 500});
  }

  async scheduleNotifications() {
    if (this.env.RECRUITMENT_NOTIFICATIONS_ENABLED !== 'true') return;
    const webhook = this.env.DISCORD_RECRUITMENT_WEBHOOK;
    if (!webhook || !/^https:\/\/discord\.com\/api\/webhooks\/\d+\/[\w-]+$/.test(webhook)) return;
    const pending = this.db.prepare('SELECT 1 FROM outbox WHERE delivered_at IS NULL AND attempts<5 LIMIT 1').get();
    if (pending && await this.ctx.storage.getAlarm() === null) await this.ctx.storage.setAlarm(Date.now() + 60000);
  }

  async alarm() {
    const origin = this.env.APP_ORIGIN || await this.ctx.storage.get('application-origin');
    if (origin) await deliverRecruitment(this.db, {...this.env, APP_ORIGIN: origin});
    await this.scheduleNotifications();
  }
}

export default {
  async fetch(request, env) {
    // One persistent database per guild. Keep this name stable across deploys.
    const id = env.GUILD.idFromName('darknessofthefallen');
    return env.GUILD.get(id).fetch(request);
  }
};
