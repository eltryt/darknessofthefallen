import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const source = readFileSync(new URL('../public/boot-state.js', import.meta.url), 'utf8');

// Just enough DOM for boot-state.js: class lists, a class observer and appended nodes.
function element(observers) {
	const classes = new Set();
	const el = {
		style: { props: {}, setProperty: (k, v) => (el.style.props[k] = v) },
		set className(value) {
			classes.clear();
			value
				.split(/\s+/)
				.filter(Boolean)
				.forEach((c) => classes.add(c));
		},
		get className() {
			return [...classes].join(' ');
		},
		classList: {
			add: (c) => {
				classes.add(c);
				observers?.forEach((o) => o());
			},
			remove: (c) => {
				classes.delete(c);
				observers?.forEach((o) => o());
			},
			contains: (c) => classes.has(c),
		},
		setAttribute() {},
		addEventListener() {},
		remove: () => (el.removed = true),
	};
	return el;
}
function boot(t, { stored = false } = {}) {
	t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 0 });
	const observers = [];
	const root = element(observers);
	const appended = [];
	const storage = new Map(stored ? [['dotf-intro', '1']] : []);
	const document = {
		documentElement: root,
		currentScript: null,
		body: { append: (el) => appended.push(el) },
		head: { append() {} },
		createElement: () => element(),
		addEventListener() {},
	};
	runInNewContext(source, {
		document,
		window: { setTimeout },
		setTimeout,
		Date,
		URL,
		fetch: async () => new Response('{}'),
		location: { pathname: '/', href: 'https://guild.example/' },
		matchMedia: () => ({ matches: false }),
		sessionStorage: {
			getItem: (k) => storage.get(k) ?? null,
			setItem: (k, v) => storage.set(k, v),
		},
		addEventListener() {},
		removeEventListener() {},
		MutationObserver: class {
			constructor(callback) {
				this.callback = callback;
			}
			observe() {
				observers.push(this.callback);
			}
			disconnect() {
				observers.splice(observers.indexOf(this.callback), 1);
			}
		},
	});
	const intro = () => appended.find((el) => el.classList.contains('intro'));
	return {
		root,
		intro,
		ready: () => root.classList.remove('site-booting'),
		tick: (ms) => t.mock.timers.tick(ms),
		opening: () => intro()?.classList.contains('is-opening') ?? false,
	};
}

test('the intro covers a slow load and opens only once the site is ready', (t) => {
	const page = boot(t);
	assert.ok(page.intro(), 'built before the modules load');
	page.tick(4000);
	assert.equal(page.opening(), false, 'curtain stays closed while booting');
	page.ready();
	assert.equal(page.opening(), true);
	assert.equal(page.root.style.props['--intro'], '0.9s', 'hero enters sooner after a slow load');
	page.tick(1100);
	assert.equal(page.intro().removed, true);
	assert.equal(page.root.classList.contains('intro-playing'), false);
});

test('a fast load still shows the whole emblem before opening', (t) => {
	const page = boot(t);
	page.tick(500);
	page.ready();
	page.tick(1000);
	assert.equal(page.opening(), false);
	page.tick(100);
	assert.equal(page.opening(), true);
	assert.equal(page.root.style.props['--intro'], '1.75s');
});

test('a stalled load never traps the page behind the intro', (t) => {
	const page = boot(t);
	page.tick(9000);
	assert.equal(page.opening(), true);
	page.tick(1100);
	assert.equal(page.intro().removed, true);
});

test('the intro plays once per session', (t) => {
	const page = boot(t, { stored: true });
	assert.equal(page.intro(), undefined);
	assert.equal(page.root.classList.contains('intro-pending'), false);
});
