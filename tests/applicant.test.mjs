import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { openDatabase } from '../src/db.mjs';
import { createApp } from '../src/app.mjs';
import { finishApplicantOAuth, notifyApplicant, startApplicantOAuth } from '../src/applicant.mjs';

const ORIGIN = 'http://localhost:3000';
const ENV = {
	APP_ORIGIN: ORIGIN,
	DISCORD_CLIENT_ID: 'client',
	DISCORD_CLIENT_SECRET: 'secret',
	DISCORD_GUILD_ID: '100000000000000001',
	DISCORD_DM_ENABLED: 'true',
	DISCORD_BOT_TOKEN: 'x'.repeat(60),
};
const form = (discord, extra = {}) => ({
	name: 'Candidato',
	discord,
	character: 'Uno',
	class: 'Guerrero',
	role: 'Tanque',
	experience: 'Classic',
	availability: 'Noches',
	reason: 'Equipo',
	consent: true,
	...extra,
});

async function fixture() {
	const db = openDatabase(':memory:');
	db.prepare('UPDATE settings SET data=json_set(data,?,json(?)) WHERE id=1').run(
		'$.recruitmentOpen',
		'true',
	);
	const server = createServer(createApp(db, ENV));
	await new Promise((r) => server.listen(0, '127.0.0.1', r));
	const base = `http://127.0.0.1:${server.address().port}`;
	const apply = (value, cookie = '') =>
		fetch(`${base}/api/applications`, {
			method: 'POST',
			headers: { Origin: ORIGIN, 'Content-Type': 'application/json', cookie },
			body: JSON.stringify(value),
		}).then(async (r) => ({ status: r.status, body: await r.json() }));
	const page = (path, cookie = '') =>
		fetch(base + path, { headers: { cookie }, redirect: 'manual' }).then(async (r) => ({
			status: r.status,
			html: await r.text(),
		}));
	return { db, apply, page, close: () => new Promise((r) => server.close(r)) };
}

test('without signing in: a private link, and one open application per Discord name', async () => {
	const f = await fixture();
	try {
		const first = await f.apply(form('Infusiones'));
		assert.equal(first.status, 201);
		assert.match(first.body.trackUrl, /^http:\/\/localhost:3000\/candidatura\/[\w-]{40,}$/);
		// The same account written differently is still the same person.
		const again = await f.apply(form('@infusiones#0'));
		assert.equal(again.status, 409);
		assert.match(again.body.error, /Ya hay una candidatura en revisión/);
		// The link shows the status and what was sent, never the officers' notes.
		f.db.prepare("UPDATE applications SET status='Contactado',notes='nota secreta'").run();
		const view = await f.page(new URL(first.body.trackUrl).pathname);
		assert.equal(view.status, 200);
		assert.match(view.html, /En contacto/);
		assert.match(view.html, /Infusiones/);
		assert.ok(!view.html.includes('nota secreta'));
		assert.equal((await f.page('/candidatura/' + 'x'.repeat(48))).status, 404);
		// Once decided, the person can apply again.
		f.db.prepare("UPDATE applications SET status='Rechazado'").run();
		assert.equal((await f.apply(form('Infusiones'))).status, 201);
	} finally {
		await f.close();
	}
});

test('identified with Discord: the real account is kept and shown at /candidatura', async () => {
	const f = await fixture();
	try {
		// The candidate sign-in only reads the Discord account ("identify").
		const { state, url } = startApplicantOAuth(f.db, ENV);
		assert.equal(new URL(url).searchParams.get('scope'), 'identify');
		const fetcher = async (u) =>
			String(u).endsWith('/oauth2/token')
				? Response.json({ access_token: 'PRIVATE' })
				: Response.json({ id: '200000000000000002', username: 'infusiones' });
		const done = await finishApplicantOAuth(
			f.db,
			{ headers: { cookie: `applicant_state=${state}` } },
			new URL(`${ORIGIN}/auth/discord/callback?code=c&state=${state}`),
			ENV,
			fetcher,
		);
		const cookie = `applicant=${done.raw}`;
		// The Discord name comes from Discord, whatever the form says.
		const sent = await f.apply(form('otro-nombre'), cookie);
		assert.equal(sent.status, 201);
		assert.equal(sent.body.identified, true);
		const row = f.db
			.prepare(
				'SELECT a.data,t.discord_id FROM applications a JOIN application_tracking t ON t.application_id=a.id',
			)
			.get();
		assert.equal(JSON.parse(row.data).discord, 'infusiones');
		assert.equal(row.discord_id, '200000000000000002');
		assert.equal((await f.apply(form('cualquiera'), cookie)).status, 409);
		const mine = await f.page('/candidatura', cookie);
		assert.match(mine.html, /Has entrado como <strong>@infusiones/);
		assert.match(mine.html, /Recibida/);
		// Without the sign-in, the page only offers to enter.
		assert.match((await f.page('/candidatura')).html, /Entrar con Discord/);
		// It is not a member session: the rest of the web stays closed.
		assert.equal(JSON.parse((await f.page('/api/me', cookie)).html).user, null);
		assert.equal((await f.page('/api/characters', cookie)).status, 401);
		assert.ok(
			!JSON.stringify(f.db.prepare('SELECT * FROM applicant_sessions').all()).includes('PRIVATE'),
		);
		assert.equal(f.db.prepare('SELECT count(*) n FROM sessions').get().n, 0);
	} finally {
		await f.close();
	}
});

test('officers message the candidate only when Discord pins down one account', async () => {
	const db = openDatabase(':memory:');
	db.prepare("INSERT INTO users VALUES('o1','Oficial','officer','2026-11-06')").run();
	const add = (id, discord, discordId = null) => {
		db.prepare(
			"INSERT INTO applications(id,data,created_at,updated_at) VALUES(?,?,'2026-11-06','2026-11-06')",
		).run(id, JSON.stringify(form(discord)));
		db.prepare(
			'INSERT INTO application_tracking(application_id,token,discord_key,discord_id) VALUES(?,?,?,?)',
		).run(id, 'tok' + id.repeat(30), discord.toLowerCase(), discordId);
	};
	add('a', 'Conocido', '300000000000000003');
	add('b', 'buscado');
	add('c', 'nadie');
	const sent = [];
	const fetcher = async (u, opts = {}) => {
		const url = String(u);
		if (url.includes('/members/search'))
			return Response.json(
				new URL(url).searchParams.get('query') === 'buscado'
					? [
							{ user: { id: '400000000000000004', username: 'buscado' } },
							{ user: { id: '500000000000000005', username: 'buscado2' } },
						]
					: [],
			);
		if (url.endsWith('/users/@me/channels'))
			return Response.json({ id: 'dm-' + JSON.parse(opts.body).recipient_id });
		sent.push([url, JSON.parse(opts.body).content]);
		return Response.json({ id: 'msg' });
	};
	const officer = { id: 'o1' };
	assert.deepEqual(
		await notifyApplicant(db, ENV, 'a', officer, 'Te esperamos el jueves.', fetcher),
		{
			status: 'Avisado por Discord',
		},
	);
	assert.match(sent[0][0], /dm-300000000000000003/);
	assert.match(sent[0][1], /Te esperamos el jueves\.[\s\S]*\/candidatura\/toka/);
	await notifyApplicant(db, ENV, 'b', officer, '', fetcher);
	assert.match(sent[1][0], /dm-400000000000000004/);
	await assert.rejects(
		notifyApplicant(db, ENV, 'c', officer, '', fetcher),
		/No encontramos a «nadie»/,
	);
	assert.deepEqual(
		db
			.prepare('SELECT notice_status FROM application_tracking ORDER BY application_id')
			.all()
			.map((r) => r.notice_status),
		['Avisado por Discord', 'Avisado por Discord', 'No encontrado en el servidor'],
	);
	await assert.rejects(
		notifyApplicant(db, { APP_ORIGIN: ORIGIN }, 'a', officer, '', fetcher),
		/no está configurado/,
	);
});
