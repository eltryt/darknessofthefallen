import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { seoPages, seoHtml, sitemap, announce, INDEXNOW_KEY } from '../src/seo.mjs';
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

test('recruitment page carries the open places and the FAQ for search engines', () => {
	const settings = {
		recruitmentOpen: true,
		faction: 'Alianza',
		region: 'Europa',
		ruleset: 'PvP',
		raidDays: ['Martes', 'Jueves'],
		raidStart: '23:00',
		raidEnd: '01:00',
		lootMethod: 'Loot Council',
		classPriorities: { Cazador: 'cerrada' },
		specPriorities: {
			'Paladín:holy': 'alta',
			'Mago:fire': 'alta',
			'Mago:frost': 'alta',
			...Object.fromEntries(
				[
					'Guerrero:arms',
					'Guerrero:fury',
					'Guerrero:protection',
					'Paladín:protection',
					'Paladín:retribution',
					'Pícaro:subtlety',
					'Pícaro:assassination',
					'Pícaro:combat',
					'Sacerdote:discipline',
					'Sacerdote:holy',
					'Sacerdote:shadow',
					'Chamán:elemental',
					'Chamán:enhancement',
					'Chamán:restore',
					'Mago:arcane',
					'Brujo:affliction',
					'Brujo:demonology',
					'Brujo:destruction',
					'Druida:balance',
					'Druida:feral',
					'Druida:restore',
					'Druida:guardian',
				].map((k) => [k, 'cerrada']),
			),
		},
	};
	const html = seoHtml(source, '/reclutamiento', 'https://guild.example', settings);
	assert.match(html, /Buscamos Paladín Sagrado y Mago Fuego y Escarcha\./);
	assert.match(html, /Preguntas frecuentes/);
	assert.match(html, /Martes y Jueves, de 23:00 a 01:00/);
	const ld = JSON.parse(html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)[1]);
	const faq = ld['@graph'].find((n) => n['@type'] === 'FAQPage');
	assert.ok(faq.mainEntity.length >= 5);
	assert.equal(faq.mainEntity[0].acceptedAnswer['@type'], 'Answer');
	// Closed recruitment says so instead of listing places.
	assert.match(
		seoHtml(source, '/reclutamiento', 'https://guild.example', { recruitmentOpen: false }),
		/el reclutamiento está cerrado/,
	);
	// Only the recruitment page gets the FAQ.
	assert.doesNotMatch(seoHtml(source, '/raids', 'https://guild.example', settings), /FAQPage/);
});

test('sitemap dates the pages that show the settings, and IndexNow only runs in production', async () => {
	const map = sitemap('https://guild.example', { updatedAt: '2026-11-19T10:00:00.000Z' });
	assert.match(map, /reclutamiento<\/loc><lastmod>2026-11-19<\/lastmod>/);
	assert.doesNotMatch(map, /raids<\/loc><lastmod>/);
	assert.doesNotMatch(sitemap('https://guild.example', {}), /lastmod/);
	const sent = [];
	await announce('http://localhost:3000', ['/'], (...a) => sent.push(a));
	assert.equal(sent.length, 0);
	await announce('https://guild.example', ['/reclutamiento'], async (url, init) =>
		sent.push([url, init]),
	);
	const body = JSON.parse(sent[0][1].body);
	assert.equal(body.key, INDEXNOW_KEY);
	assert.deepEqual(body.urlList, ['https://guild.example/reclutamiento']);
});
