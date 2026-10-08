const weekdays = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const dayMs = 86400000;

function clock(value) {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(value || '')) return null;
  const [hour, minute] = value.split(':').map(Number);
  return {hour, minute, total: hour * 60 + minute};
}

function localParts(formatter, timestamp) {
  return Object.fromEntries(formatter.formatToParts(timestamp)
    .filter(part => ['year', 'month', 'day', 'hour', 'minute'].includes(part.type))
    .map(part => [part.type, Number(part.value)]));
}

// Resolve a wall-clock time using the zone's offsets around that day. Skipped
// DST times are omitted; a repeated time uses its first occurrence consistently.
function instant(date, time, formatter) {
  const wall = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), time.hour, time.minute);
  const offsets = new Set([-dayMs, 0, dayMs].map(delta => {
    const sample = wall + delta, p = localParts(formatter, sample);
    return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute) - sample;
  }));
  const candidates = [...offsets].map(offset => wall - offset).filter(value => {
    const p = localParts(formatter, value);
    return p.year === date.getUTCFullYear() && p.month === date.getUTCMonth() + 1 &&
      p.day === date.getUTCDate() && p.hour === time.hour && p.minute === time.minute;
  }).sort((a, b) => a - b);
  return candidates[0] ?? null;
}

export function upcomingSessions(settings, {now = new Date(), daysAhead = 84, limit = Infinity} = {}) {
  const timestamp = Number(now), startTime = clock(settings.raidStart), endTime = clock(settings.raidEnd);
  if (!Number.isFinite(timestamp) || !startTime || !endTime || startTime.total === endTime.total ||
      !Number.isInteger(daysAhead) || daysAhead < 1 || daysAhead > 366 || !(limit > 0)) return [];
  const days = new Set((Array.isArray(settings.raidDays) ? settings.raidDays : []).filter(day => weekdays.includes(day)));
  if (!days.size) return [];
  let formatter;
  try {
    formatter = new Intl.DateTimeFormat('en-GB', {
      timeZone: settings.timezone || 'Europe/Madrid', year: 'numeric', month: '2-digit',
      day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
    });
  } catch { return []; }
  const today = localParts(formatter, timestamp);
  const anchor = Date.UTC(today.year, today.month - 1, today.day);
  const sessions = [];
  // Include yesterday so an overnight session stays visible until it ends.
  for (let offset = -1; offset < daysAhead && sessions.length < limit; offset++) {
    const date = new Date(anchor + offset * dayMs);
    if (!days.has(weekdays[date.getUTCDay()])) continue;
    const endDate = new Date(+date + (endTime.total <= startTime.total ? dayMs : 0));
    const start = instant(date, startTime, formatter), end = instant(endDate, endTime, formatter);
    if (start === null || end === null || end <= start || end <= timestamp) continue;
    sessions.push({start, end});
  }
  return sessions;
}

const calendarText = value => String(value ?? '').replace(/\\/g, '\\\\')
  .replace(/\r\n|\r|\n/g, '\\n').replace(/;/g, '\\;').replace(/,/g, '\\,');
const utc = timestamp => new Date(timestamp).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');

// iCalendar lines are limited to 75 UTF-8 octets, not 75 JavaScript characters.
function fold(line) {
  const encoder = new TextEncoder();
  let result = '', length = 0;
  for (const char of line) {
    const bytes = encoder.encode(char).length;
    if (length + bytes > 75) { result += '\r\n '; length = 1; }
    result += char; length += bytes;
  }
  return result;
}

export function calendarFile(settings, {now = new Date(), daysAhead = 84} = {}) {
  const sessions = upcomingSessions(settings, {now, daysAhead});
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Darkness of the Fallen//Guild schedule//ES',
    'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', `X-WR-CALNAME:${calendarText(settings.name)} · Horario habitual`];
  for (const session of sessions) {
    lines.push('BEGIN:VEVENT', `UID:raid-${session.start}-${session.end}@darknessofthefallen`,
      `DTSTAMP:${utc(Number(now))}`, `DTSTART:${utc(session.start)}`, `DTEND:${utc(session.end)}`,
      `SUMMARY:${calendarText(settings.name)} · Horario de raid`,
      `DESCRIPTION:${calendarText('Horario habitual de la hermandad. Confirma la convocatoria y tu inscripción en Discord. Esta importación no se actualiza automáticamente.')}`,
      'STATUS:TENTATIVE', 'TRANSP:TRANSPARENT', 'END:VEVENT');
  }
  return lines.concat('END:VCALENDAR').map(fold).join('\r\n') + '\r\n';
}
