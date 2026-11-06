import test from 'node:test';
import assert from 'node:assert/strict';
import { rosterCards } from '../public/roster-ui.js';

const esc = (s) => String(s ?? '').replaceAll('<', '&lt;');
const row = (id, user, name, isMain, display = 'Dmix') => ({
	id,
	user_id: user,
	name,
	class: 'Mago',
	role: 'DPS distancia',
	is_main: isMain,
	display_name: display,
	rank: 'raider',
});

test('an alter says whose it is; the public roster does not', () => {
	const rows = [
		row('a', 'u1', 'Mago Español', 0),
		row('m', 'u1', 'Principal', 1),
		row('x', 'u2', 'Huérfano', 0, 'Solo'),
	];
	const html = rosterCards(rows, esc, { privateDetails: true });
	assert.match(html, /Alter de <b>Principal<\/b> · Dmix/);
	assert.match(html, /Alter de <b>Solo<\/b>/);
	assert.equal((html.match(/roster-alt-of/g) || []).length, 2);
	assert.ok(!rosterCards(rows, esc).includes('roster-alt-of'));
});
