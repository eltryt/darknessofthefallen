import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { existsSync, readFileSync } from 'node:fs';
import { openDatabase } from '../src/db.mjs';
import { createApp } from '../src/app.mjs';

test('the site is installable: manifest, icons and a service worker that never caches the API', async () => {
	const manifest = JSON.parse(readFileSync('public/site.webmanifest', 'utf8'));
	assert.equal(manifest.display, 'standalone');
	for (const size of ['192x192', '512x512']) {
		const icon = manifest.icons.find((i) => i.sizes === size);
		assert.ok(icon && existsSync('public/' + icon.src), size);
	}
	const worker = readFileSync('public/sw.js', 'utf8');
	assert.ok(!/\/api\//.test(worker), 'the service worker must not touch API routes');
	const server = createServer(createApp(openDatabase(':memory:'), {}));
	await new Promise((r) => server.listen(0, '127.0.0.1', r));
	try {
		const r = await fetch(`http://127.0.0.1:${server.address().port}/sw.js`);
		assert.equal(r.status, 200);
		assert.match(r.headers.get('content-type'), /javascript/);
		assert.equal(r.headers.get('cache-control'), 'no-cache');
	} finally {
		server.close();
	}
});
