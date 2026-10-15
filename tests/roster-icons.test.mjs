import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ClassIcon, SpecIcon } from '../public/components.js';
import { iconAssets } from '../public/icon-assets.js';
import { normalizeSpecValue, getSpecsForClass } from '../public/specs.js';
test('roster icons are real images and resolve for stable and legacy specializations', () => {
	// WebP files start with "RIFF", a 4-byte size and "WEBP".
	for (const file of iconAssets) {
		const header = readFileSync(new URL('../public/' + file, import.meta.url));
		assert.equal(header.subarray(0, 4).toString('latin1'), 'RIFF', file);
		assert.equal(header.subarray(8, 12).toString('latin1'), 'WEBP', file);
	}
	assert.match(SpecIcon({ className: 'Mago', specId: 'Escarcha' }), /spec_frost.webp/);
	assert.match(SpecIcon({ className: 'Mago', specId: 'frost' }), /spec_frost.webp/);
	assert.equal(SpecIcon({ className: 'Mago', specId: 'arms' }), '');
	assert.equal(normalizeSpecValue('Build personal'), 'Build personal');
	assert.equal(normalizeSpecValue('Aflicción'), 'affliction');
	assert.equal(normalizeSpecValue('Reprensión'), 'retribution');
	assert.deepEqual(getSpecsForClass('__proto__'), {});
	assert.doesNotMatch(ClassIcon({ className: '"><script>alert(1)</script>' }), /<script>/);
});
