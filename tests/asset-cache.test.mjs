import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { openDatabase } from '../src/db.mjs';
import { createApp } from '../src/app.mjs';

test('images are cached, code revalidates with a fingerprint, pages are never stored', async () => {
	const db = openDatabase(':memory:');
	const server = createServer(createApp(db, { APP_ORIGIN: 'http://localhost:3000' }));
	await new Promise((r) => server.listen(0, '127.0.0.1', r));
	const get = (path, headers = {}) =>
		fetch(`http://127.0.0.1:${server.address().port}${path}`, { headers });
	try {
		const image = await get('/assets/portraits/warrior.webp');
		assert.equal(image.status, 200);
		assert.equal(image.headers.get('content-type'), 'image/webp');
		assert.match(image.headers.get('cache-control'), /max-age=86400/);
		const tag = image.headers.get('etag');
		assert.ok(tag);
		const again = await get('/assets/portraits/warrior.webp', { 'If-None-Match': tag });
		assert.equal(again.status, 304);

		const script = await get('/app.js');
		assert.equal(script.headers.get('cache-control'), 'no-cache');
		assert.equal(
			(await get('/app.js', { 'If-None-Match': script.headers.get('etag') })).status,
			304,
		);
		assert.equal((await get('/app.js', { 'If-None-Match': '"other"' })).status, 200);

		const page = await get('/perfil');
		assert.equal(page.headers.get('cache-control'), 'no-store');
		assert.equal(page.headers.get('etag'), null);
	} finally {
		await new Promise((r) => server.close(r));
		db.close();
	}
});

test('video byte ranges: full, open-ended, suffix and impossible requests', async () => {
	const { byteRange } = await import('../src/app.mjs');
	assert.equal(byteRange(1000, null), null);
	assert.deepEqual(byteRange(1000, 'bytes=0-99'), { start: 0, end: 99 });
	assert.deepEqual(byteRange(1000, 'bytes=0-1'), { start: 0, end: 1 });
	assert.deepEqual(byteRange(1000, 'bytes=900-'), { start: 900, end: 999 });
	assert.deepEqual(byteRange(1000, 'bytes=950-5000'), { start: 950, end: 999 });
	assert.deepEqual(byteRange(1000, 'bytes=-100'), { start: 900, end: 999 });
	assert.equal(byteRange(1000, 'bytes=1000-'), 'invalid');
	assert.equal(byteRange(1000, 'bytes=5-2'), 'invalid');
	assert.equal(byteRange(1000, 'bytes=0-1,5-9'), 'invalid');
	assert.equal(byteRange(1000, 'items=0-1'), 'invalid');
});
