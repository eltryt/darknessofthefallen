import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { mobileArt, mobileArtQuery } from '../public/art-variants.js';
import { staticFile } from '../src/app.mjs';

const read = (file) => readFileSync(new URL(`../public/${file}`, import.meta.url), 'utf8');

test('index.html preloads exactly the modules app.js imports', () => {
	const graph = new Set();
	const walk = (file) => {
		if (graph.has(file)) return;
		graph.add(file);
		for (const m of read(file).matchAll(
			/(?:^|\n)\s*(?:import|export)\s[^'"]*?from\s*['"]\.\/([^'"]+)['"]|(?:^|\n)\s*import\s*['"]\.\/([^'"]+)['"]/g,
		))
			walk(m[1] || m[2]);
	};
	walk('app.js');
	graph.delete('app.js');
	const preloaded = [...read('index.html').matchAll(/rel="modulepreload" href="\/([^"]+)"/g)].map(
		(m) => m[1],
	);
	assert.deepEqual(preloaded.sort(), [...graph].sort());
	for (const file of preloaded) assert.ok(staticFile('/' + file), `${file} is served`);
});

test('every illustration has a lighter phone version that theme.css and the preload use', () => {
	const css = read('theme.css');
	assert.ok(css.includes(`@media ${mobileArtQuery}`));
	assert.ok(read('boot-state.js').includes(`matchMedia('${mobileArtQuery}')`));
	for (const name of mobileArt) {
		const full = new URL(`../public/assets/art/${name}.webp`, import.meta.url),
			phone = new URL(`../public/assets/art/${name}-m.webp`, import.meta.url);
		assert.ok(existsSync(phone), `${name}-m.webp exists`);
		assert.ok(statSync(phone).size < statSync(full).size / 2, `${name}-m.webp is lighter`);
		assert.ok(staticFile(`/assets/art/${name}-m.webp`), `${name}-m.webp is served`);
		assert.ok(css.includes(`--art-${name}: url('assets/art/${name}-m.webp')`));
		// Rules use the variable, so phones never download the full version.
		assert.equal(css.split(`url('assets/art/${name}.webp')`).length, 2, `${name} only in :root`);
	}
});

test('pages ask for the guild data and the session before the modules load', () => {
	const boot = read('boot-state.js');
	for (const path of ['/api/public', '/api/me']) assert.ok(boot.includes(`'${path}'`));
	assert.match(read('app.js'), /window\.dotfPrefetch\?\.\[path\]/);
});
