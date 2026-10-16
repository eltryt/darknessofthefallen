import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { openDatabase } from '../src/db.mjs';
import { createApp } from '../src/app.mjs';
import { issueSession } from '../src/auth.mjs';

const MEMBER = '123456789012345678';
const env = {
	APP_ORIGIN: 'http://localhost:3000',
	DISCORD_BOT_TOKEN: 'x'.repeat(60),
	DISCORD_GUILD_ID: '987654321098765432',
	DISCORD_ROLE_MAP: JSON.stringify({ 'role-member': 'member', 'role-officer': 'officer' }),
};

// Fake Discord: answers the member lookup with the scripted response.
async function fixture(reply, extraEnv = {}) {
	const db = openDatabase(':memory:'),
		calls = [];
	db.prepare('INSERT INTO users VALUES(?,?,?,?)').run(MEMBER, 'Jugador', 'officer', '2026-10-16');
	const session = issueSession(db, MEMBER);
	const discordFetch = async (url, options) => {
		calls.push({ url, auth: options.headers.Authorization });
		return reply();
	};
	const server = createServer(createApp(db, { ...env, ...extraEnv }, { discordFetch }));
	await new Promise((r) => server.listen(0, '127.0.0.1', r));
	const request = async (path, method = 'GET', body) => {
		const r = await fetch(`http://127.0.0.1:${server.address().port}${path}`, {
			method,
			headers: {
				Origin: 'http://localhost:3000',
				'Content-Type': 'application/json',
				Cookie: `session=${session.raw}`,
				'X-CSRF-Token': session.csrf,
			},
			...(body === undefined ? {} : { body: JSON.stringify(body) }),
		});
		return { status: r.status, body: await r.json(), headers: r.headers };
	};
	return {
		db,
		calls,
		request,
		close: async () => {
			await new Promise((r) => server.close(r));
			db.close();
		},
	};
}
const json = (status, data) => ({ status, ok: status < 300, json: async () => data });

test('a member who left the Discord server loses every session at the next check', async () => {
	const f = await fixture(() => json(404, { message: 'Unknown Member', code: 10007 }));
	try {
		const me = await f.request('/api/me');
		assert.equal(me.body.user, null);
		assert.equal(f.calls.length, 1);
		assert.match(f.calls[0].url, /guilds\/987654321098765432\/members\/123456789012345678$/);
		assert.equal(f.calls[0].auth, 'Bot ' + 'x'.repeat(60));
		assert.equal(f.db.prepare('SELECT COUNT(*) n FROM sessions').get().n, 0);
		assert.equal(f.db.prepare('SELECT rank FROM users').get().rank, 'visitor');
		assert.equal((await f.request('/api/roster')).status, 401);
	} finally {
		await f.close();
	}
});

test('an unknown server (bot removed) never logs players out', async () => {
	const f = await fixture(() => json(404, { message: 'Unknown Guild', code: 10004 }));
	try {
		assert.equal((await f.request('/api/me')).body.user.rank, 'officer');
		assert.equal(f.db.prepare('SELECT COUNT(*) n FROM sessions').get().n, 1);
	} finally {
		await f.close();
	}
});

test('a removed Discord role downgrades the rank without logging in again', async () => {
	const f = await fixture(() => json(200, { roles: ['role-member'] }));
	try {
		const me = await f.request('/api/me');
		assert.equal(me.body.user.rank, 'member');
		assert.equal(f.db.prepare('SELECT rank FROM users').get().rank, 'member');
		assert.equal((await f.request('/api/applications')).status, 403);
		// Within the interval Discord is not asked again.
		await f.request('/api/me');
		assert.equal(f.calls.length, 1);
	} finally {
		await f.close();
	}
});

test('Discord outages keep the session and the stored rank', async () => {
	const f = await fixture(() => {
		throw new Error('network down');
	});
	try {
		assert.equal((await f.request('/api/me')).body.user.rank, 'officer');
		const g = await fixture(() => json(500, {}));
		try {
			assert.equal((await g.request('/api/me')).body.user.rank, 'officer');
		} finally {
			await g.close();
		}
	} finally {
		await f.close();
	}
});

test('without a bot token sessions behave as before and Discord is never called', async () => {
	const f = await fixture(() => json(404, {}), { DISCORD_BOT_TOKEN: '' });
	try {
		assert.equal((await f.request('/api/me')).body.user.rank, 'officer');
		assert.equal(f.calls.length, 0);
	} finally {
		await f.close();
	}
});

test('responses carry isolation headers and a CSP without plugins', async () => {
	const f = await fixture(() => json(200, { roles: ['role-officer'] }));
	try {
		const r = await f.request('/api/me');
		assert.equal(r.headers.get('cross-origin-opener-policy'), 'same-origin');
		assert.equal(r.headers.get('cross-origin-resource-policy'), 'same-origin');
		assert.equal(r.headers.get('x-frame-options'), 'DENY');
		assert.match(r.headers.get('content-security-policy'), /object-src 'none'/);
		assert.match(r.headers.get('content-security-policy'), /frame-ancestors 'none'/);
	} finally {
		await f.close();
	}
});

test('anonymous applications are limited per address', async () => {
	const db = openDatabase(':memory:');
	db.prepare('UPDATE settings SET data=json_set(data,?,json(?)) WHERE id=1').run(
		'$.recruitmentOpen',
		'true',
	);
	const server = createServer(createApp(db, { APP_ORIGIN: 'http://localhost:3000' }));
	await new Promise((r) => server.listen(0, '127.0.0.1', r));
	try {
		const send = () =>
			fetch(`http://127.0.0.1:${server.address().port}/api/applications`, {
				method: 'POST',
				headers: { Origin: 'http://localhost:3000', 'Content-Type': 'application/json' },
				body: JSON.stringify({
					name: 'Candidato',
					discord: 'handle',
					character: 'Uno',
					class: 'Guerrero',
					role: 'Tanque',
					experience: 'Classic',
					availability: 'Noches',
					reason: 'Equipo',
					consent: true,
				}),
			}).then((r) => r.status);
		assert.deepEqual([await send(), await send(), await send()], [201, 201, 201]);
		assert.equal(await send(), 429);
		assert.equal(db.prepare('SELECT COUNT(*) n FROM applications').get().n, 3);
	} finally {
		await new Promise((r) => server.close(r));
		db.close();
	}
});
