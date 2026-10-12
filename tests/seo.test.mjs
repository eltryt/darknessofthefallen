import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { seoPages, seoHtml, sitemap } from '../src/seo.mjs';
const source = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
test('server SEO provides unique public metadata and indexable text without private data', () => {
	const titles = new Set();
	for (const path of Object.keys(seoPages)) {
		const html = seoHtml(source, path, 'https://guild.example', {
			raidDays: ['Martes'],
			raidStart: '23:00',
			raidEnd: '01:00',
		});
		assert.ok(html.includes(`rel="canonical" href="https://guild.example${path}"`));
		assert.match(html, /<h1>/);
		assert.doesNotMatch(html, /Abriendo las puertas/);
		assert.match(html, /og:image/);
		titles.add(html.match(/<title>(.*?)<\/title>/s)[1]);
	}
	assert.equal(titles.size, Object.keys(seoPages).length);
	assert.match(seoHtml(source, '/panel', 'https://guild.example', {}), /noindex,nofollow/);
	assert.doesNotMatch(sitemap('https://guild.example'), /panel|perfil|login|api/);
	const malicious = seoHtml(source, '/', 'https://guild.example', {
		raidDays: ['<script>x</script>'],
		raidStart: '$&',
		raidEnd: '01:00',
	});
	assert.ok(malicious.includes('&lt;script&gt;'));
	assert.ok(malicious.includes('$&'));
});
