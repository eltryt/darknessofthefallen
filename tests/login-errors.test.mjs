import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { openDatabase } from '../src/db.mjs';
import { createApp } from '../src/app.mjs';
import { startOAuth, finishOAuth } from '../src/auth.mjs';

const env = {
	APP_ORIGIN: 'http://localhost:3000',
	DISCORD_CLIENT_ID: 'client',
	DISCORD_CLIENT_SECRET: 'secret',
	DISCORD_GUILD_ID: 'guild',
};
const failures = (db) =>
	db
		.prepare("SELECT target,changes FROM audit WHERE action='auth.discord_failed' ORDER BY id")
		.all()
		.map((r) => [r.target, JSON.parse(r.changes)]);
// Discord answering the token, the profile and the guild membership.
const discord =
	(member, profile = 200) =>
	async (path) => {
		const status = path.endsWith('/token') ? 200 : path.endsWith('/member') ? member : profile;
		return new Response(
			JSON.stringify(
				path.endsWith('/token')
					? { access_token: 'PRIVATE_ACCESS_TOKEN' }
					: path.endsWith('/member')
						? { roles: [] }
						: { id: '42', username: 'infusiones', global_name: 'Infusiones' },
			),
			{ status },
		);
	};

test('a failed Discord sign-in says why and is recorded without tokens', async () => {
	const db = openDatabase(':memory:');
	const attempt = (member, profile, query) => {
		const auth = startOAuth(db, env);
		return finishOAuth(
			db,
			{ headers: { cookie: 'oauth_state=' + auth.state } },
			new URL(`http://localhost/auth/discord/callback?${query || `state=${auth.state}&code=c`}`),
			env,
			discord(member, profile),
		);
	};
	await assert.rejects(
		attempt(404),
		(e) => e.status === 403 && /«Infusiones» no está/.test(e.message),
	);
	await assert.rejects(attempt(429), (e) => e.status === 503 && /esperar/.test(e.message));
	await assert.rejects(attempt(200, 200, 'error=access_denied'), /cancelado/);
	// Started in one browser and finished in another (Discord's in-app browser).
	await assert.rejects(
		finishOAuth(
			db,
			{ headers: {} },
			new URL('http://localhost/auth/discord/callback?state=s&code=c'),
			env,
		),
		/Chrome o Safari/,
	);
	assert.deepEqual(failures(db), [
		['42', { reason: 'not_in_guild', name: 'Infusiones', discordStatus: 404 }],
		['42', { reason: 'rate_limited', name: 'Infusiones', discordStatus: 429 }],
		['desconocido', { reason: 'cancelled' }],
		['desconocido', { reason: 'browser' }],
	]);
	assert.ok(!JSON.stringify(db.prepare('SELECT * FROM audit').all()).includes('PRIVATE'));
	assert.equal(db.prepare('SELECT count(*) n FROM users').get().n, 0);
});

test('the callback shows a page with another try instead of raw JSON', async () => {
	const db = openDatabase(':memory:');
	const server = createServer(createApp(db, env));
	await new Promise((r) => server.listen(0, '127.0.0.1', r));
	try {
		const r = await fetch(
			`http://127.0.0.1:${server.address().port}/auth/discord/callback?state=s&code=c`,
			{ headers: { cookie: 'login_next=%2Fperfil' }, redirect: 'manual' },
		);
		assert.equal(r.status, 400);
		assert.match(r.headers.get('content-type'), /text\/html/);
		const page = await r.text();
		assert.match(page, /No hemos podido completar la entrada/);
		assert.match(page, /href="\/auth\/discord\?next=%2Fperfil">Volver a intentarlo/);
	} finally {
		server.close();
	}
});
