const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const LOCAL_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/;
const OFFSET_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?(Z|[+-]\d{2}:\d{2})$/;

function parts(date) {
  const match = DATE_RE.exec(String(date || ''));
  if (!match) return null;
  const [year, month, day] = match.slice(1).map(Number);
  const d = new Date(Date.UTC(year, month - 1, day));
  return d.getUTCFullYear() === year && d.getUTCMonth() === month - 1 && d.getUTCDate() === day ? { year, month, day } : null;
}
function assertDate(value, label) {
  if (!parts(value)) throw new TypeError(`${label} must be a valid YYYY-MM-DD date.`);
  return value;
}
function addDays(value, count) {
  const p = parts(value), date = new Date(Date.UTC(p.year, p.month - 1, p.day + count));
  return date.toISOString().slice(0, 10);
}
function validateZone(zone) {
  if (typeof zone !== 'string' || !zone.trim()) throw new TypeError('An explicit IANA timeZone is required for local event times.');
  try { new Intl.DateTimeFormat('en', { timeZone: zone }).format(0); } catch { throw new TypeError(`Invalid IANA timeZone: ${zone}`); }
  return zone;
}
function formattedLocal(instant, zone) {
  const values = new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(instant));
  return Object.fromEntries(values.filter(p => p.type !== 'literal').map(p => [p.type, p.value]));
}
function localInstant(value, zone, label) {
  const m = LOCAL_RE.exec(value || '');
  if (!m) throw new TypeError(`${label} must be YYYY-MM-DDTHH:mm[:ss] when using timeZone.`);
  const [year, month, day, hour, minute] = m.slice(1, 6).map(Number);
  const second = Number(m[6] || 0);
  if (!parts(`${m[1]}-${m[2]}-${m[3]}`) || hour > 23 || minute > 59 || second > 59) throw new TypeError(`${label} is invalid.`);
  const expected = { year: m[1], month: m[2], day: m[3], hour: String(hour).padStart(2, '0'), minute: String(minute).padStart(2, '0'), second: String(second).padStart(2, '0') };
  const nominal = Date.UTC(year, month - 1, day, hour, minute, second);
  const candidates = new Set();
  // Probe offsets over adjacent days, then require exact local-field round-trip. This rejects DST gaps/folds.
  for (let probe = nominal - 36 * 3600000; probe <= nominal + 36 * 3600000; probe += 3 * 3600000) {
    const f = formattedLocal(probe, zone);
    const represented = Date.UTC(Number(f.year), Number(f.month) - 1, Number(f.day), Number(f.hour), Number(f.minute), Number(f.second));
    candidates.add(nominal - (represented - probe));
  }
  const exact = [...candidates].filter(candidate => {
    const f = formattedLocal(candidate, zone);
    return Object.keys(expected).every(key => f[key] === expected[key]);
  });
  if (exact.length !== 1) throw new TypeError(`${label} is ${exact.length ? 'ambiguous' : 'nonexistent'} in ${zone}.`);
  return exact[0];
}
function offsetInstant(value, label) {
  const m = OFFSET_RE.exec(value || '');
  if (!m || !parts(`${m[1]}-${m[2]}-${m[3]}`)) throw new TypeError(`${label} must be an ISO timestamp with an explicit UTC offset.`);
  const hour = Number(m[4]), minute = Number(m[5]), second = Number(m[6] || 0);
  const offsetHour = m[7] === 'Z' ? 0 : Number(m[7].slice(1, 3));
  const offsetMinute = m[7] === 'Z' ? 0 : Number(m[7].slice(4, 6));
  if (hour > 23 || minute > 59 || second > 59 || offsetHour > 14 || offsetMinute > 59 || (offsetHour === 14 && offsetMinute !== 0)) throw new TypeError(`${label} is invalid.`);
  const instant = Date.parse(value);
  if (!Number.isFinite(instant)) throw new TypeError(`${label} is invalid.`);
  return instant;
}
function utcStamp(instant) { return new Date(instant).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z'); }
function localParts(value) {
  const m = LOCAL_RE.exec(value);
  return { date: `${m[1]}-${m[2]}-${m[3]}`, clock: `${m[4]}:${m[5]}:${m[6] || '00'}` };
}
function calendarFields(event, { requireTimedEnd = true } = {}) {
  if (!event || typeof event !== 'object') throw new TypeError('An event record is required.');
  const title = String(event.name || event.title || '').trim();
  if (!title) throw new TypeError('An explicit event name is required.');
  if (event.watch === true || ['watch', 'unknown', 'tentative', 'unconfirmed', 'pending', 'cancelled', 'canceled', 'postponed', 'ended', 'completed', 'past'].includes(String(event.status || '').trim().toLowerCase())) throw new TypeError('This event has no confirmed active occurrence to add.');
  const venue = String(event.venue || event.location || '').trim();
  const sourceUrl = String(event.sourceUrl || event.url || event.website || event.detailUrl || '').trim();
  if (!venue) throw new TypeError('An explicit venue is required.');
  let source;
  try { source = new URL(sourceUrl); } catch { throw new TypeError('An explicit sourceUrl is required.'); }
  if (!['http:', 'https:'].includes(source.protocol)) throw new TypeError('sourceUrl must use HTTP or HTTPS.');
  const detail = String(event.description || event.detail || '').trim();
  const dateLabel = typeof event.dateLabel === 'string' ? event.dateLabel.trim() : '';
  const details = [detail, dateLabel ? `掲載日時情報：${dateLabel}` : '', `Source: ${source.href}`].filter(Boolean).join('\n\n');
  if (event.allDay === true) {
    const start = assertDate(event.startDate || event.date || event.start, 'startDate');
    const endInclusive = assertDate(event.endDate || event.end || start, 'endDate');
    if (endInclusive < start) throw new TypeError('endDate must not precede startDate.');
    const zoneValue = event.timeZone || event.timezone || event.tz;
    const zone = zoneValue ? validateZone(zoneValue) : null;
    const endExclusive = addDays(endInclusive, 1);
    return { title, venue, details, sourceUrl: source.href, allDay: true, zone, googleDates: `${start.replaceAll('-', '')}/${endExclusive.replaceAll('-', '')}`, icsStart: start.replaceAll('-', ''), icsEnd: endExclusive.replaceAll('-', '') };
  }
  const zoneValue = event.timeZone || event.timezone || event.tz;
  const zone = zoneValue ? validateZone(zoneValue) : null;
  const startValue = event.startDateTime || event.startAt || event.start;
  const endValue = event.endDateTime || event.endAt || event.end;
  const parse = (value, label) => {
    if (OFFSET_RE.test(value || '')) {
      const match = OFFSET_RE.exec(value);
      const instant = offsetInstant(value, label);
      if (zone) {
        const local = formattedLocal(instant, zone);
        const [year, month, day, hour, minute, second = '00'] = match.slice(1, 7);
        if (local.year !== year || local.month !== month || local.day !== day || local.hour !== hour || local.minute !== minute || local.second !== second) throw new TypeError(`${label} UTC offset does not match ${zone}.`);
      }
      return { instant, local: false };
    }
    if (!zone) throw new TypeError('Local timed events require an explicit IANA timeZone; offset timestamps can be used without one.');
    return { instant: localInstant(value, zone, label), local: true };
  };
  const start = parse(startValue, 'start');
  if (!endValue && requireTimedEnd) throw new TypeError('A timed Google Calendar draft needs an explicit end; no duration is inferred.');
  const end = endValue ? parse(endValue, 'end') : null;
  if (end && end.instant <= start.instant) throw new TypeError('end must be after start.');
  const tz = zone || 'UTC';
  return { title, venue, details, sourceUrl: source.href, allDay: false, zone: tz, googleDates: end ? `${utcStamp(start.instant)}/${utcStamp(end.instant)}` : null, icsStart: `${utcStamp(start.instant)}`, icsEnd: end ? `${utcStamp(end.instant)}` : null, startLocal: start.local ? localParts(startValue) : null, endLocal: end?.local ? localParts(endValue) : null };
}

export function createGoogleCalendarUrl(event) {
  const value = calendarFields(event);
  const params = new URLSearchParams();
  params.set('action', 'TEMPLATE');
  params.set('dates', value.googleDates);
  if (value.zone) { params.set('stz', value.zone); params.set('etz', value.zone); }
  params.set('details', value.details);
  params.set('location', value.venue);
  params.set('text', value.title);
  return `https://calendar.google.com/calendar/r/eventedit?${params.toString()}`;
}
function escapeIcs(value) { return String(value).replace(/\\/g, '\\\\').replace(/\r\n|\r|\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;'); }
function foldLine(line) {
  const chunks = []; let chunk = '', bytes = 0;
  for (const char of line) {
    const size = new TextEncoder().encode(char).length;
    if (bytes + size > 75) { chunks.push(chunk); chunk = ' '; bytes = 1; }
    chunk += char; bytes += size;
  }
  chunks.push(chunk);
  return chunks.join('\r\n');
}
function stableUid(event) {
  const value = `${String(event.id || event.eventId || `${event.name || event.title}|${event.startDate || event.startDateTime || event.startAt || event.start}|${event.sourceUrl || event.url || event.website || event.detailUrl || ''}`)}|${event.calendarCopyKind || 'event'}`;
  // FNV-1a is sufficient for a deterministic, non-sensitive calendar UID.
  let hash = 2166136261;
  for (const ch of value) { hash ^= ch.codePointAt(0); hash = Math.imul(hash, 16777619); }
  return `${(hash >>> 0).toString(16)}@pixieed.jp`;
}
export function createEventIcs(event, { now = new Date() } = {}) {
  const value = calendarFields(event, { requireTimedEnd: false });
  const stamp = now instanceof Date ? now : new Date(now);
  if (!Number.isFinite(stamp.getTime())) throw new TypeError('now must be a valid date.');
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//PiXiEED//Event Calendar//EN', 'CALSCALE:GREGORIAN', 'BEGIN:VEVENT', `UID:${stableUid(event)}`, `DTSTAMP:${utcStamp(stamp.getTime())}`];
  if (value.allDay) lines.push(`DTSTART;VALUE=DATE:${value.icsStart}`, `DTEND;VALUE=DATE:${value.icsEnd}`);
  else { lines.push(`DTSTART:${value.icsStart}`); if (value.icsEnd) lines.push(`DTEND:${value.icsEnd}`); }
  if (value.zone) lines.push(`X-PIXIEED-ORIGINAL-TIMEZONE:${escapeIcs(value.zone)}`);
  lines.push(`SUMMARY:${escapeIcs(value.title)}`, `LOCATION:${escapeIcs(value.venue)}`, `DESCRIPTION:${escapeIcs(value.details)}`, `URL:${escapeIcs(value.sourceUrl)}`, 'END:VEVENT', 'END:VCALENDAR');
  return `${lines.map(foldLine).join('\r\n')}\r\n`;
}
export function eventCalendarAvailability(event) {
  let icsAvailable = false, googleAvailable = false, reason = '';
  try { calendarFields(event, { requireTimedEnd: false }); icsAvailable = true; } catch (error) { reason = error.message; }
  try { calendarFields(event, { requireTimedEnd: true }); googleAvailable = true; } catch (error) { if (!reason || /explicit end/.test(error.message)) reason = error.message; }
  return Object.freeze({ available: googleAvailable, googleAvailable, icsAvailable, reason });
}

/** Build an explicitly date-only reminder; it does not assert an all-day event or infer a time zone. */
export function createEventDateReminder(event) {
  if (event?.watch === true || ['watch', 'unknown', 'tentative', 'unconfirmed', 'pending', 'cancelled', 'canceled', 'postponed', 'ended', 'completed', 'past'].includes(String(event?.status || '').trim().toLowerCase())) throw new TypeError('This event has no confirmed active occurrence to add.');
  const startDate = event?.startDate || event?.date;
  const endDate = event?.endDate || startDate;
  if (!startDate || !endDate) throw new TypeError('A confirmed structured startDate and endDate are required for a date-only reminder.');
  const title = String(event.name || event.title || '').trim();
  if (!title) throw new TypeError('An explicit event name is required.');
  return { ...event, name: `日付のみ・時刻未指定：${title}`, allDay: true, calendarCopyKind: 'date-reminder', startDate, endDate,
    timeZone: '', timezone: '', tz: '',
    description: `これは開催日だけを示す予定です。開催時刻・タイムゾーンはこの予定に設定しません。公式情報で確認してください。\n\n${String(event.description || event.detail || '').trim()}`.trim() };
}
