import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { openDatabase } from '../src/db.mjs';
import { createApp } from '../src/app.mjs';
import { MAP_URL } from '../public/public-views.js';

test('the map page embeds WoW Forever Map and allows only that frame', async () => {
	const db = openDatabase(':memory:');
	const server = createServer(createApp(db, { APP_ORIGIN: 'http://localhost:3000' }));
	await new Promise((r) => server.listen(0, '127.0.0.1', r));
	const base = `http://127.0.0.1:${server.address().port}`;
	try {
		const page = await fetch(base + '/mapa');
		assert.equal(page.status, 200);
		assert.equal(page.headers.get('x-robots-tag'), 'index, follow');
		const csp = page.headers.get('content-security-policy');
		assert.match(csp, new RegExp(`frame-src ${new URL(MAP_URL).origin};`));
		assert.match(csp, /frame-ancestors 'none'/, 'our own pages still cannot be framed');
		assert.match(await page.text(), /<title>Mapa interactivo de WoW Forever/);
		assert.match(await (await fetch(base + '/sitemap.xml')).text(), /\/mapa</);
	} finally {
		await new Promise((r) => server.close(r));
		db.close();
	}
	assert.match(
		readFileSync(new URL('../public/index.html', import.meta.url), 'utf8'),
		/href="\/mapa"/,
	);
});
