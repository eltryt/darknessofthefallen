import test from 'node:test';
import assert from 'node:assert/strict';
import {
	upcomingEvents,
	eventDate,
	launchCountdown,
	FOREVER_LAUNCH,
} from '../public/home-events.js';
test('launch countdown targets midnight in Madrid and stops at launch', () => {
	assert.equal(new Date(FOREVER_LAUNCH).toISOString(), '2026-11-04T23:00:00.000Z');
	assert.deepEqual(launchCountdown(Date.parse('2026-10-16T21:59:08Z')), {
		live: false,
		expired: false,
		days: 19,
		hours: 1,
		minutes: 0,
		seconds: 52,
	});
	assert.equal(launchCountdown(FOREVER_LAUNCH).live, true);
	assert.equal(launchCountdown(FOREVER_LAUNCH + 3600000).seconds, 0);
	assert.equal(launchCountdown(FOREVER_LAUNCH + 7 * 86400000).expired, true);
});
test('home shows three next open events, excludes past, cancelled, invalid and unpublished events', () => {
	const rows = [5, 1, 4, 2, 3].map((day) => ({
		state: 'Abierta',
		starts_at: `2026-10-0${day}T21:00:00Z`,
	}));
	rows.push(
		{ state: 'Cancelada', starts_at: '2026-10-01T22:00:00Z' },
		{ state: 'Pendiente de publicación', starts_at: '2026-10-01T23:00:00Z' },
		{ state: 'Abierta', starts_at: 'bad' },
	);
	assert.deepEqual(
		upcomingEvents(rows, Date.parse('2026-10-01T21:00:00Z')).map((e) => e.starts_at),
		[2, 3, 4].map((d) => `2026-10-0${d}T21:00:00Z`),
	);
	assert.equal(rows[0].starts_at, '2026-10-05T21:00:00Z');
	assert.match(eventDate('2026-07-01T21:00:00Z'), /23:00/);
	assert.match(eventDate('2026-12-01T22:00:00Z'), /23:00/);
});
