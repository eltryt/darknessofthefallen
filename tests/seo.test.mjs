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
		assert.match(html, /data-public-overview/);
		assert.match(html, /data-public-loading role="status"/);
		assert.match(html, /src="\/boot-state.js"/);
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

test('structured data describes the guild on the home page and breadcrumbs elsewhere', () => {
	const ld = (html) =>
		JSON.parse(html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)[1]);
	const home = ld(
		seoHtml(source, '/', 'https://guild.example', {
			discordUrl: 'https://discord.gg/abc',
			raidDays: [],
		}),
	);
	const guild = home['@graph'].find((n) => n['@type'] === 'Organization');
	assert.equal(guild.url, 'https://guild.example/');
	assert.deepEqual(guild.sameAs, ['https://discord.gg/abc']);
	assert.ok(home['@graph'].some((n) => n['@type'] === 'WebSite'));
	const page = ld(seoHtml(source, '/raids', 'https://guild.example', { raidDays: [] }));
	assert.equal(page['@graph'][0]['@type'], 'BreadcrumbList');
	assert.equal(page['@graph'][0].itemListElement[1].item, 'https://guild.example/raids');
	// A hostile setting can neither close the data block nor add a fake profile link.
	const hostile = seoHtml(source, '/', 'https://guild.example', {
		discordUrl: 'javascript:alert(1)</script><script>alert(1)</script>',
		raidDays: [],
	});
	assert.doesNotMatch(hostile, /<\/script><script>alert/);
	assert.equal(ld(hostile)['@graph'][1].sameAs, undefined);
	for (const [path, [title, description]] of Object.entries(seoPages)) {
		assert.ok(title.length <= 62, `${path} title too long`);
		assert.ok(description.length <= 160, `${path} description too long`);
	}
});
