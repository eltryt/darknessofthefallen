import test from 'node:test';
import assert from 'node:assert/strict';
import { upcomingEvents, eventDate } from '../public/home-events.js';
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
