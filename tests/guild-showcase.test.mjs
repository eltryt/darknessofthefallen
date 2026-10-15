import test from 'node:test';
import assert from 'node:assert/strict';
import {
	recruitmentShowcase,
	recruitmentSpecs,
	specPriority,
	progressShowcase,
} from '../public/guild-showcase.js';
const esc = (s) =>
	String(s ?? '')
		.replaceAll('<', '&lt;')
		.replaceAll('"', '&quot;');
test('recruitment shows one card per specialization, open by default', () => {
	const html = recruitmentShowcase({ recruitmentOpen: true }, esc);
	assert.equal((html.match(/data-recruit-priority="abierta"/g) || []).length, 28);
	assert.equal((html.match(/data-recruit-group/g) || []).length, 4);
	assert.ok(html.includes('href="#application"'));
	assert.ok(!recruitmentShowcase({ recruitmentOpen: false }, esc).includes('href="#application"'));
});
test('specialization priorities override their class, others inherit it', () => {
	const settings = {
		recruitmentOpen: true,
		classPriorities: { Sacerdote: 'media' },
		specPriorities: { 'Sacerdote:holy': 'alta', 'Mago:frost': 'baja' },
	};
	const bySpec = Object.fromEntries(
		recruitmentSpecs(settings).map((s) => [`${s.className}:${s.id}`, s.priority]),
	);
	assert.equal(bySpec['Sacerdote:holy'], 'alta');
	assert.equal(bySpec['Sacerdote:shadow'], 'media');
	assert.equal(bySpec['Mago:frost'], 'baja');
	assert.equal(bySpec['Mago:fire'], 'abierta');
	assert.equal(specPriority(settings, 'Sacerdote', 'discipline'), 'media');
	const html = recruitmentShowcase(settings, esc);
	assert.equal((html.match(/data-recruit-priority="alta"/g) || []).length, 1);
	// High priorities are listed first inside their role group.
	const healers = html.slice(html.indexOf('Sanadores'), html.indexOf('DPS cuerpo a cuerpo'));
	assert.ok(healers.indexOf('priority-alta') < healers.indexOf('priority-media'));
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
