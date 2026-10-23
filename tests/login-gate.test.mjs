import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { openDatabase } from '../src/db.mjs';
import { createApp, safeNext } from '../src/app.mjs';

const ORIGIN = 'http://localhost:3000';

test('the return path after signing in stays on this site', () => {
	assert.equal(safeNext('/perfil?personaje=abc#personajes'), '/perfil?personaje=abc#personajes');
	assert.equal(safeNext('/armeria'), '/armeria');
	for (const bad of [
		'//evil.example',
		'https://evil.example',
		'/\\evil.example',
		'/auth/discord',
		'',
		null,
	])
		assert.equal(safeNext(bad), null, String(bad));
});

test('opening a members-only link without a session shows a sign-in page, not JSON', async () => {
	const db = openDatabase(':memory:');
	const server = createServer(createApp(db, { APP_ORIGIN: ORIGIN }));
	await new Promise((r) => server.listen(0, '127.0.0.1', r));
	const base = `http://127.0.0.1:${server.address().port}`;
	try {
		const page = await fetch(base + '/perfil?personaje=abc', { headers: { Accept: 'text/html' } });
		assert.equal(page.status, 401);
		assert.match(page.headers.get('content-type'), /text\/html/);
		const html = await page.text();
		assert.match(html, /Entrar con Discord/);
		assert.match(html, /href="\/auth\/discord\?next=%2Fperfil%3Fpersonaje%3Dabc"/);

		// Scripts calling the API still get JSON.
		const api = await fetch(base + '/perfil', { headers: { Accept: 'application/json' } });
		assert.equal(api.status, 401);
		assert.equal((await api.json()).error, 'Entra con Discord para continuar.');
	} finally {
		server.close();
	}
});
