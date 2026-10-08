import test from 'node:test';
import assert from 'node:assert/strict';
import {upcomingSessions, calendarFile} from '../public/schedule.js';

const settings = {name: 'Darkness of the Fallen', timezone: 'Europe/Madrid', raidDays: ['Martes', 'Miércoles', 'Jueves'], raidStart: '23:00', raidEnd: '01:00'};
const iso = session => [new Date(session.start).toISOString(), new Date(session.end).toISOString()];

test('next raid slots use Madrid time, configured weekdays and midnight rollover', () => {
  const slots = upcomingSessions(settings, {now: new Date('2026-10-08T20:00:00Z'), limit: 2});
  assert.deepEqual(slots.map(iso), [
    ['2026-10-08T21:00:00.000Z', '2026-10-08T23:00:00.000Z'],
    ['2026-10-13T21:00:00.000Z', '2026-10-13T23:00:00.000Z']
  ]);
  // Madrid is already on Friday; the Thursday slot is still in progress.
  assert.deepEqual(iso(upcomingSessions(settings, {now: new Date('2026-10-08T22:30:00Z'), limit: 1})[0]), iso(slots[0]));
  assert.deepEqual(iso(upcomingSessions(settings, {now: new Date('2026-10-08T23:00:00Z'), limit: 1})[0]), iso(slots[1]));
});

test('calendar preserves 23:00 Madrid across summer and winter offsets', () => {
  const summer = upcomingSessions(settings, {now: new Date('2026-03-23T10:00:00Z'), limit: 1});
  const afterSpringChange = upcomingSessions(settings, {now: new Date('2026-03-30T10:00:00Z'), limit: 1});
  const winter = upcomingSessions(settings, {now: new Date('2026-10-26T10:00:00Z'), limit: 1});
  assert.equal(iso(summer[0])[0], '2026-03-24T22:00:00.000Z');
  assert.equal(iso(afterSpringChange[0])[0], '2026-03-31T21:00:00.000Z');
  assert.equal(iso(winter[0])[0], '2026-10-27T22:00:00.000Z');
});

test('sessions spanning a clock change have correct real duration', () => {
  const saturday = {...settings, raidDays: ['Sábado'], raidEnd: '04:00'};
  const spring = upcomingSessions(saturday, {now: new Date('2026-03-28T10:00:00Z'), limit: 1})[0];
  const autumn = upcomingSessions(saturday, {now: new Date('2026-10-24T10:00:00Z'), limit: 1})[0];
  assert.equal((spring.end - spring.start) / 3600000, 4);
  assert.equal((autumn.end - autumn.start) / 3600000, 6);
  const sunday = {...settings, raidDays: ['Domingo'], raidStart: '02:30', raidEnd: '03:30'};
  assert.equal(upcomingSessions(sunday, {now: new Date('2026-03-29T00:00:00Z'), daysAhead: 1}).length, 0);
  assert.equal(iso(upcomingSessions(sunday, {now: new Date('2026-10-25T00:00:00Z'), limit: 1})[0])[0], '2026-10-25T00:30:00.000Z');
});

test('missing or invalid schedules yield an empty state, never invented dates', () => {
  for (const override of [{raidDays: []}, {raidDays: ['not a day']}, {raidDays: 'Martes'}, {timezone: 'invalid/zone'}, {raidStart: '24:00'}, {raidEnd: '23:00'}]) {
    assert.deepEqual(upcomingSessions({...settings, ...override}), []);
  }
  assert.deepEqual(upcomingSessions(settings, {now: new Date('invalid')}), []);
  const oneDay = upcomingSessions({...settings, raidDays: ['Martes', 'Martes']}, {now: new Date('2026-10-05T10:00:00Z'), daysAhead: 7});
  assert.equal(oneDay.length, 1);
});

test('calendar exports twelve weeks as tentative UTC events with stable identities', () => {
  const now = new Date('2026-10-05T10:00:00Z');
  const file = calendarFile(settings, {now});
  assert.ok(file.startsWith('BEGIN:VCALENDAR\r\nVERSION:2.0\r\n'));
  assert.ok(file.endsWith('END:VCALENDAR\r\n'));
  assert.equal(file.match(/BEGIN:VEVENT/g).length, 36);
  assert.equal(file.match(/STATUS:TENTATIVE/g).length, 36);
  assert.equal(file.match(/TRANSP:TRANSPARENT/g).length, 36);
  assert.match(file, /DTSTART:20261006T210000Z/);
  assert.match(file, /DTSTART:20261027T220000Z/);
  const ids = [...file.matchAll(/^UID:(.*)$/gm)].map(match => match[1]);
  assert.equal(new Set(ids).size, 36);
  const later = calendarFile(settings, {now: new Date('2026-10-05T11:00:00Z')});
  assert.deepEqual([...later.matchAll(/^UID:(.*)$/gm)].map(match => match[1]), ids);
  assert.ok(!file.includes('RRULE:')); // Fixed import; the UI never promises a subscription.
});

test('calendar escapes text and folds Unicode without injecting properties', () => {
  const name = 'Hermandad Áéñ 🛡️ '.repeat(10) + ',;\\\r\nBEGIN:VEVENT\r\nATTENDEE:unexpected';
  const file = calendarFile({...settings, name}, {now: new Date('2026-10-05T10:00:00Z'), daysAhead: 7});
  for (const line of file.split('\r\n')) assert.ok(Buffer.byteLength(line, 'utf8') <= 75);
  const unfolded = file.replace(/\r\n /g, '');
  assert.equal(unfolded.match(/^BEGIN:VEVENT$/gm).length, 3);
  assert.ok(!/^ATTENDEE:/m.test(unfolded));
  assert.ok(unfolded.includes('\\,\\;\\\\\\nBEGIN:VEVENT\\nATTENDEE:unexpected'));
});
