import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { openDatabase } from '../src/db.mjs';
import { createApp } from '../src/app.mjs';
import { issueSession } from '../src/auth.mjs';
import { syncRaidEvents } from '../src/raid-sync.mjs';
import { botIcons, deliverBotRenders, nextBotRenderAt } from '../src/raid-bot.mjs';

const env = {
	APP_ORIGIN: 'http://localhost:3011',
	DISCORD_GUILD_ID: '1550000000000000001',
	RAID_HELPER_CHANNEL_ID: '1550997172982382723',
	DISCORD_BOT_TOKEN: 'test.' + 'x'.repeat(60),
};
const ids = {
	member: '1550000000000000011',
	raid_leader: '1550000000000000013',
	officer: '1550000000000000014',
	guest: '1550000000000000019',
};
const hex = (buffer) => Buffer.from(buffer).toString('hex');
const start = () => {
	const d = new Date(Date.now() + 3 * 86400000);
	return `${d.toISOString().slice(0, 10)}T23:00`;
};

async function fixture() {
	const db = openDatabase(':memory:'),
		sessions = {},
		keys = await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']),
		verifyKey = hex(await crypto.subtle.exportKey('raw', keys.publicKey));
	for (const [rank, id] of Object.entries(ids)) {
		if (rank === 'guest') continue;
		db.prepare('INSERT INTO users VALUES(?,?,?,?)').run(
			id,
			'QA ' + rank,
			rank,
			new Date().toISOString(),
		);
		sessions[rank] = issueSession(db, id);
	}
	db.prepare(
		"INSERT INTO characters(id,user_id,name,class,role,spec,is_main,created_at) VALUES('char1',?,'Merlina','Mago','DPS distancia','Escarcha',1,?)",
	).run(ids.member, new Date().toISOString());
	// A stand-in for Discord's API: the application, its emojis and the channel's messages.
	const discord = { messages: new Map(), emojis: [], calls: [], fail: null, next: 1 };
	const transport = async (url, options) => {
		const path = new URL(url).pathname,
			method = options.method,
			v = options.body ? JSON.parse(options.body) : null;
		assert.equal(new URL(url).hostname, 'discord.com');
		assert.equal(options.headers.Authorization, `Bot ${env.DISCORD_BOT_TOKEN}`);
		discord.calls.push({ method, path, body: v });
		if (discord.fail) {
			const status = discord.fail;
			discord.fail = null;
			return Response.json({ retry_after: 1 }, { status });
		}
		if (path.endsWith('/applications/@me'))
			return Response.json({ id: '1550000000000000500', name: 'Bot QA', verify_key: verifyKey });
		if (path.endsWith('/emojis')) {
			if (method === 'GET') return Response.json({ items: discord.emojis });
			assert.match(v.image, /^data:image\/webp;base64,/);
			const emoji = {
				id: String(1550000000000001000n + BigInt(discord.emojis.length)),
				name: v.name,
			};
			discord.emojis.push(emoji);
			return Response.json(emoji);
		}
		const message = path.match(/\/channels\/(\d+)\/messages(?:\/(\d+))?$/);
		if (message) {
			if (method === 'POST') {
				const id = String(1550000000000002000n + BigInt(discord.next++));
				discord.messages.set(id, v);
				return Response.json({ id });
			}
			if (method === 'GET')
				return Response.json([...discord.messages].map(([id, m]) => ({ id, ...m })));
			if (!discord.messages.has(message[2])) return Response.json({ code: 10008 }, { status: 404 });
			if (method === 'DELETE') {
				discord.messages.delete(message[2]);
				return new Response(null, { status: 204 });
			}
			discord.messages.set(message[2], v);
			return Response.json({ id: message[2] });
		}
		if (/\/channels\/\d+$/.test(path)) return Response.json({ id: path.split('/').pop() });
		return Response.json({}, { status: 404 });
	};
	const server = createServer(createApp(db, env, { discordFetch: transport }));
	await new Promise((r) => server.listen(0, '127.0.0.1', r));
	const address = `http://127.0.0.1:${server.address().port}`;
	const request = async (path, rank, method = 'GET', body) => {
		const s = sessions[rank],
			r = await fetch(address + path, {
				method,
				headers: {
					Origin: env.APP_ORIGIN,
					'Content-Type': 'application/json',
					...(s ? { Cookie: 'session=' + s.raw, 'X-CSRF-Token': s.csrf } : {}),
				},
				...(body ? { body: JSON.stringify(body) } : {}),
			});
		return { status: r.status, body: await r.json() };
	};
	// A button press the way Discord sends it: signed, with no browser origin.
	const press = async (userId, custom_id, values, { nick = 'Invitado', forge = false } = {}) => {
		const raw = JSON.stringify({
				type: 3,
				guild_id: env.DISCORD_GUILD_ID,
				member: { nick, user: { id: userId, username: 'user' } },
				data: { custom_id, ...(values ? { values } : {}) },
			}),
			timestamp = String(Math.floor(Date.now() / 1000)),
			signature = hex(
				await crypto.subtle.sign(
					'Ed25519',
					keys.privateKey,
					new TextEncoder().encode(timestamp + (forge ? 'x' : '') + raw),
				),
			);
		const r = await fetch(address + '/api/discord/interactions', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'X-Signature-Ed25519': signature,
				'X-Signature-Timestamp': timestamp,
			},
			body: raw,
		});
		return { status: r.status, body: await r.json() };
	};
	const sync = () => syncRaidEvents(db, env, transport, { force: true });
	return {
		db,
		discord,
		transport,
		request,
		press,
		sync,
		close: async () => {
			await new Promise((r) => server.close(r));
			db.close();
		},
	};
}
// Connects the bot, switches it on and publishes one event.
async function published(f, capacity = 20) {
	const connected = await f.request('/api/raid-bot/connect', 'officer', 'POST', {});
	assert.equal(connected.status, 200);
	const config = { ...connected.body.config, enabled: true };
	assert.equal((await f.request('/api/raid-bot', 'officer', 'PUT', { config })).status, 200);
	const begin = start();
	const created = await f.request('/api/events', 'raid_leader', 'POST', {
		title: 'Núcleo de Magma',
		start: begin,
		end: begin.replace('T23:00', 'T23:59'),
		category: 'Oficial',
		roster: 'Roster de 20',
		capacity,
		description: 'Traed pociones.',
		requestId: randomUUID(),
	});
	assert.equal(created.status, 202);
	await f.sync();
	return { id: created.body.id, config, connected: connected.body };
}

test('connecting uploads the class icons and reports what is ready', async () => {
	const f = await fixture();
	try {
		assert.equal((await f.request('/api/raid-bot', 'raid_leader')).status, 403);
		const first = await f.request('/api/raid-bot/connect', 'officer', 'POST', {});
		assert.equal(first.body.report.created, botIcons.length);
		assert.deepEqual(first.body.report.failed, []);
		assert.equal(first.body.report.channel, 'ok');
		assert.equal(first.body.connected, true);
		assert.ok(first.body.icons.every((icon) => icon.uploaded));
		assert.ok(first.body.icons.some((icon) => icon.name === 'warrior'));
		// A second press uploads nothing again.
		const again = await f.request('/api/raid-bot/connect', 'officer', 'POST', {});
		assert.equal(again.body.report.created, 0);
		assert.equal(f.discord.emojis.length, botIcons.length);
	} finally {
		await f.close();
	}
});

test('the bot cannot be switched on before it is connected', async () => {
	const f = await fixture();
	try {
		const { config } = (await f.request('/api/raid-bot', 'officer')).body;
		const r = await f.request('/api/raid-bot', 'officer', 'PUT', {
			config: { ...config, enabled: true },
		});
		assert.equal(r.status, 409);
	} finally {
		await f.close();
	}
});

test('an event is published with class buttons and sign-ups arrive from Discord', async () => {
	const f = await fixture();
	try {
		const { id } = await published(f);
		const event = (await f.request('/api/events/' + id, 'member')).body;
		assert.equal(event.state, 'Abierta');
		assert.equal(event.provider, 'bot');
		const [messageId, message] = [...f.discord.messages][0];
		assert.equal(event.externalId, messageId);
		assert.equal(message.embeds[0].title, 'Núcleo de Magma');
		assert.match(message.embeds[0].description, /Traed pociones/);
		const buttons = message.components.flatMap((row) => row.components);
		const mage = buttons.find((b) => b.custom_id === `rs:c:${id}:Mago`);
		assert.equal(mage.emoji.name, 'mage');
		assert.match(mage.emoji.id, /^\d{17,20}$/);
		assert.ok(buttons.some((b) => b.custom_id === `rs:x:${id}`));

		// Unsigned or forged calls never get in.
		assert.equal((await f.press(ids.member, `rs:c:${id}:Mago`, null, { forge: true })).status, 401);

		// Class button → private menu of specializations → signed up.
		const menu = await f.press(ids.member, `rs:c:${id}:Mago`);
		assert.equal(menu.body.type, 4);
		assert.equal(menu.body.data.flags, 64);
		const select = menu.body.data.components[0].components[0];
		assert.deepEqual(
			select.options.map((o) => o.label),
			['Arcano', 'Fuego', 'Escarcha'],
		);
		const done = await f.press(ids.member, select.custom_id, ['Escarcha']);
		assert.equal(done.body.type, 7);
		assert.match(done.body.data.content, /Mago · Escarcha/);

		const after = (await f.request('/api/events/' + id, 'member')).body;
		assert.equal(after.signups.length, 1);
		// The registered character of that class gives its name and is linked.
		assert.equal(after.signups[0].name, 'Merlina');
		assert.equal(after.signups[0].registeredCharacter, true);
		assert.equal(after.signups[0].status, 'Confirmado');
		assert.equal(after.signups[0].role, 'DPS distancia');

		// The message in Discord is edited with the new sign-up.
		assert.ok(nextBotRenderAt(f.db) <= Date.now());
		assert.equal(await deliverBotRenders(f.db, env, f.transport), 1);
		const edited = f.discord.messages.get(messageId);
		assert.match(JSON.stringify(edited.embeds[0].fields), /Merlina/);
		assert.match(edited.embeds[0].fields[0].name, /<:mage:\d+> Mago \(1\)/);
		assert.equal(await deliverBotRenders(f.db, env, f.transport), 0);

		// «Ausente» needs no menu and answers by updating the message itself.
		const absent = await f.press(ids.member, `rs:c:${id}:Ausente`);
		assert.equal(absent.body.type, 7);
		assert.equal(
			(await f.request('/api/events/' + id, 'member')).body.signups[0].status,
			'Ausente',
		);
		const left = await f.press(ids.member, `rs:x:${id}`);
		assert.equal(left.body.type, 7);
		assert.equal((await f.request('/api/events/' + id, 'member')).body.signups.length, 0);
		assert.match((await f.press(ids.member, `rs:x:${id}`)).body.data.content, /No estabas/);
	} finally {
		await f.close();
	}
});

test('a full raid queues sign-ups and promotes them when a place frees up', async () => {
	const f = await fixture();
	try {
		const { id } = await published(f, 1);
		// Without a character of that class registered on the website, nobody gets in.
		const refused = await f.press(ids.guest, `rs:c:${id}:Guerrero`);
		assert.match(refused.body.data.content, /personaje de esa clase registrado/);
		assert.equal(refused.body.data.flags, 64);
		assert.match((await f.press(ids.guest, `rs:c:${id}:Ausente`)).body.data.content, /registrado/);
		assert.match((await f.press(ids.member, `rs:c:${id}:Guerrero`)).body.data.content, /Guerrero/);
		f.db
			.prepare(
				"INSERT INTO characters(id,user_id,name,class,role,spec,created_at) VALUES('char2',?,'Thrall','Guerrero','DPS melee','Armas',?)",
			)
			.run(ids.officer, new Date().toISOString());
		await f.press(ids.member, `rs:s:${id}:Mago`, ['Fuego']);
		const queued = await f.press(ids.officer, `rs:s:${id}:Guerrero`, ['Armas']);
		assert.match(queued.body.data.content, /en cola/);
		let event = (await f.request('/api/events/' + id, 'raid_leader')).body;
		assert.deepEqual(event.signups.map((s) => s.status).sort(), ['Confirmado', 'Suplente']);
		assert.equal(event.signups.find((s) => s.name === 'Thrall').registeredCharacter, true);
		assert.equal((await f.request('/api/events/' + id, 'raid_leader')).body.signups.length, 2);
		await f.press(ids.member, `rs:x:${id}`);
		event = (await f.request('/api/events/' + id, 'raid_leader')).body;
		assert.deepEqual(
			event.signups.map((s) => [s.name, s.status]),
			[['Thrall', 'Confirmado']],
		);
	} finally {
		await f.close();
	}
});

test('edits on the website reach the Discord message', async () => {
	const f = await fixture();
	try {
		const { id, config } = await published(f);
		const [messageId] = [...f.discord.messages][0];
		await deliverBotRenders(f.db, env, f.transport);

		// A sign-up made on the website.
		const signup = await f.request(`/api/events/${id}/signup`, 'member', 'POST', {
			characterId: 'char1',
			className: 'Mago',
			specName: 'Arcano',
			requestId: randomUUID(),
		});
		assert.equal(signup.status, 202);
		await f.sync();
		let event = (await f.request('/api/events/' + id, 'raid_leader')).body;
		assert.equal(event.signups[0].specName, 'Arcano');
		assert.equal(event.job, null);

		// Title and capacity.
		const begin = start();
		const edit = await f.request('/api/events/' + id, 'raid_leader', 'PATCH', {
			title: 'Guarida de Onyxia',
			start: begin,
			end: begin.replace('T23:00', 'T23:30'),
			capacity: 40,
			description: 'Capa de escamas obligatoria.',
			revision: event.revision,
			requestId: randomUUID(),
		});
		assert.equal(edit.status, 202);
		await f.sync();
		event = (await f.request('/api/events/' + id, 'raid_leader')).body;
		assert.equal(event.title, 'Guarida de Onyxia');
		assert.equal(event.capacity, 40);
		assert.equal(event.job, null);

		// The template: a renamed option, a new look and a role limit, applied to open events.
		const classes = config.classes.map((c) =>
			c.name === 'Suplente' ? { ...c, name: 'Banquillo', icon: '🛋️' } : c,
		);
		const roles = config.roles.map((r) => (r.name === 'Tanque' ? { ...r, limit: 2 } : r));
		const saved = await f.request('/api/raid-bot', 'officer', 'PUT', {
			config: { ...config, classes, roles, color: '#112233', groupBy: 'role' },
		});
		assert.equal(saved.status, 200);
		assert.equal(saved.body.updated, 1);

		assert.equal(await deliverBotRenders(f.db, env, f.transport), 1);
		const message = f.discord.messages.get(messageId);
		assert.equal(message.embeds[0].title, 'Guarida de Onyxia');
		assert.equal(message.embeds[0].color, 0x112233);
		assert.match(message.embeds[0].description, /Capa de escamas/);
		assert.match(message.embeds[0].description, /Tanque \*\*0\/2\*\*/);
		assert.match(message.embeds[0].description, /\*\*1\/40\*\* inscritos/);
		const labels = message.components.flatMap((row) => row.components).map((b) => b.label);
		assert.ok(labels.includes('Banquillo') && !labels.includes('Suplente'));
		event = (await f.request('/api/events/' + id, 'raid_leader')).body;
		assert.ok(event.classes.some((c) => c.name === 'Banquillo'));

		// An invalid template is refused whole.
		const broken = await f.request('/api/raid-bot', 'officer', 'PUT', {
			config: { ...config, classes: [...classes, { ...classes[0] }] },
		});
		assert.equal(broken.status, 400);

		// Cancelling deletes the message.
		const cancel = await f.request(`/api/events/${id}/cancel`, 'raid_leader', 'POST', {
			revision: event.revision,
			requestId: randomUUID(),
		});
		assert.equal(cancel.status, 202);
		await f.sync();
		assert.equal(f.discord.messages.size, 0);
		assert.equal(
			f.db.prepare('SELECT state FROM raid_events WHERE id=?').get(id).state,
			'Cancelada',
		);
		assert.match((await f.press(ids.member, `rs:c:${id}:Mago`)).body.data.content, /ya no existe/);
	} finally {
		await f.close();
	}
});

test('a publication Discord did not answer is retried without posting twice', async () => {
	const f = await fixture();
	try {
		const connected = await f.request('/api/raid-bot/connect', 'officer', 'POST', {});
		await f.request('/api/raid-bot', 'officer', 'PUT', {
			config: { ...connected.body.config, enabled: true },
		});
		const begin = start();
		const created = await f.request('/api/events', 'raid_leader', 'POST', {
			title: 'Zul Gurub',
			start: begin,
			end: begin.replace('T23:00', 'T23:59'),
			category: 'Voluntaria',
			capacity: 20,
			requestId: randomUUID(),
		});
		// No permission in the channel: blocked with an explanation, nothing posted.
		f.discord.fail = 403;
		await f.sync();
		let event = (await f.request('/api/events/' + created.body.id, 'raid_leader')).body;
		assert.equal(event.job.status, 'blocked');
		assert.match(event.job.error, /permiso/);
		assert.equal(f.discord.messages.size, 0);
		// Fixed in Discord: «Reintentar» publishes it once.
		await f.request(`/api/events/${created.body.id}/retry`, 'raid_leader', 'POST', {
			requestId: randomUUID(),
		});
		await f.sync();
		event = (await f.request('/api/events/' + created.body.id, 'raid_leader')).body;
		assert.equal(event.state, 'Abierta');
		assert.equal(f.discord.messages.size, 1);
	} finally {
		await f.close();
	}
});
