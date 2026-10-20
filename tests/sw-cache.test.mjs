import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const source = readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8');
const ORIGIN = 'https://guild.example';

// The service worker with an in-memory Cache Storage and a scripted network.
function worker() {
	const stores = new Map();
	const key = (r) => (typeof r === 'string' ? new URL(r, ORIGIN).href : r.url);
	const caches = {
		async open(name) {
			if (!stores.has(name)) stores.set(name, new Map());
			const store = stores.get(name);
			return {
				match: async (r) => store.get(key(r))?.clone(),
				put: async (r, res) => void store.set(key(r), res),
				add: async () => {},
			};
		},
		keys: async () => [...stores.keys()],
		delete: async (name) => stores.delete(name),
		match: async () => undefined,
	};
	const network = { calls: [], version: 'deploy-1', offline: false, body: 'v1' };
	const fetch = async (request) => {
		network.calls.push(new URL(request.url).pathname);
		if (network.offline) throw new TypeError('offline');
		const html = request.mode === 'navigate';
		return new Response(html ? '<html>' : network.body, {
			headers: html ? { 'X-App-Version': network.version } : {},
		});
	};
	const listeners = {};
	const self = {
		location: { origin: ORIGIN },
		addEventListener: (type, fn) => (listeners[type] = fn),
		skipWaiting() {},
		clients: { claim: async () => {} },
		registration: {},
	};
	runInNewContext(source, { self, caches, fetch, Response, URL, Promise });
	const get = async (path, mode = 'no-cors') => {
		let reply;
		listeners.fetch({
			request: { url: ORIGIN + path, method: 'GET', mode },
			respondWith: (p) => (reply = p),
		});
		const res = await reply;
		return res && { body: await res.text(), headers: res.headers };
	};
	return { get, network, stores };
}

test('code comes from the device while the deploy does not change', async () => {
	const sw = worker();
	await sw.get('/raids', 'navigate');
	assert.equal((await sw.get('/app.js')).body, 'v1');
	sw.network.calls.length = 0;
	await sw.get('/raids', 'navigate');
	assert.equal((await sw.get('/app.js')).body, 'v1');
	assert.equal((await sw.get('/style.css')).body, 'v1');
	assert.deepEqual(sw.network.calls, ['/raids', '/style.css'], 'app.js not requested again');
});

test('a new deploy drops the cached code before the page asks for it', async () => {
	const sw = worker();
	await sw.get('/', 'navigate');
	await sw.get('/app.js');
	sw.network.version = 'deploy-2';
	sw.network.body = 'v2';
	await sw.get('/', 'navigate');
	assert.equal((await sw.get('/app.js')).body, 'v2');
	assert.deepEqual(
		[...sw.stores.keys()].filter((k) => k.startsWith('dotf-code-')),
		['dotf-code-deploy-2'],
	);
});

test('pages, data and the worker itself are never cached', async () => {
	const sw = worker();
	await sw.get('/', 'navigate');
	assert.equal(await sw.get('/api/me'), undefined, 'left to the network');
	assert.equal(await sw.get('/sw.js'), undefined);
	assert.equal(await sw.get('/app.js?debug=1'), undefined);
	sw.network.calls.length = 0;
	await sw.get('/', 'navigate');
	assert.deepEqual(sw.network.calls, ['/']);
});

test('without a known deploy code goes to the network, and offline pages show a notice', async () => {
	const sw = worker();
	await sw.get('/app.js');
	await sw.get('/app.js');
	assert.deepEqual(sw.network.calls, ['/app.js', '/app.js']);
	sw.network.offline = true;
	assert.match((await sw.get('/', 'navigate')).body, /Sin conexión/);
});
