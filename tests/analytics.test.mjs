import test from 'node:test';
import assert from 'node:assert/strict';
import { analyticsPage, initAnalytics, measurementId } from '../public/analytics.js';
test('analytics excludes private pages, authentication and forms', () => {
	for (const path of [
		'/panel',
		'/perfil',
		'/login',
		'/auth/discord/callback',
		'/reclutamiento',
		'/contacto',
	])
		assert.equal(analyticsPage(path), false);
	for (const path of ['/', '/raids/', '/roster', '/progreso'])
		assert.equal(analyticsPage(path), true);
	if (!measurementId) assert.doesNotThrow(() => initAnalytics());
});
