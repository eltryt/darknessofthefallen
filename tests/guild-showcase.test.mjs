import test from 'node:test';
import assert from 'node:assert/strict';
import { recruitmentShowcase, progressShowcase } from '../public/guild-showcase.js';
const esc = (s) =>
	String(s ?? '')
		.replaceAll('<', '&lt;')
		.replaceAll('"', '&quot;');
test('recruitment defaults stay open and reflect only configured priorities', () => {
	const html = recruitmentShowcase({ recruitmentOpen: true }, esc);
	assert.equal((html.match(/data-recruit-priority="abierta"/g) || []).length, 9);
	assert.ok(html.includes('href="#application"'));
	const configured = recruitmentShowcase(
		{ recruitmentOpen: true, classPriorities: { Mago: 'alta' } },
		esc,
	);
	assert.equal((configured.match(/data-recruit-priority="alta"/g) || []).length, 1);
	assert.ok(!recruitmentShowcase({ recruitmentOpen: false }, esc).includes('href="#application"'));
});
test('progress uses recorded results and never fabricates a kill for the reference encounter', () => {
	const blank = progressShowcase([], esc);
	assert.ok(blank.includes('Sin progreso registrado'));
	assert.ok(!blank.includes('raid-score'));
	const html = progressShowcase(
		[
			{
				name: '<raid>',
				difficulty: '',
				defeated: 1,
				total: 2,
				bosses: [
					{ name: 'Uno', status: 'Derrotado', firstKill: '2026-10-01T22:00:00Z' },
					{ name: 'Dos', status: 'En progreso' },
				],
				history: [],
			},
		],
		esc,
	);
	assert.ok(html.includes('&lt;raid>'));
	assert.ok(html.includes('value="1" max="2"'));
	assert.ok(html.includes('En progreso'));
	assert.ok(!html.includes('Raider.IO'));
});
