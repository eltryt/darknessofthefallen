import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ClassIcon, SpecIcon } from '../public/components.js';
import { iconAssets } from '../public/icon-assets.js';
import { normalizeSpecValue, getSpecsForClass } from '../public/specs.js';
test('roster icons are real images and resolve for stable and legacy specializations', () => {
	for (const file of iconAssets)
		assert.equal(
			readFileSync(new URL('../public/' + file, import.meta.url))
				.subarray(0, 3)
				.toString('hex'),
			'ffd8ff',
		);
	assert.match(SpecIcon({ className: 'Mago', specId: 'Escarcha' }), /spec_frost.jpg/);
	assert.match(SpecIcon({ className: 'Mago', specId: 'frost' }), /spec_frost.jpg/);
	assert.equal(SpecIcon({ className: 'Mago', specId: 'arms' }), '');
	assert.equal(normalizeSpecValue('Build personal'), 'Build personal');
	assert.equal(normalizeSpecValue('Aflicción'), 'affliction');
	assert.equal(normalizeSpecValue('Reprensión'), 'retribution');
	assert.deepEqual(getSpecsForClass('__proto__'), {});
	assert.doesNotMatch(ClassIcon({ className: '"><script>alert(1)</script>' }), /<script>/);
});
