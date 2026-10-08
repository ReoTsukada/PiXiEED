import test from 'node:test';
import assert from 'node:assert/strict';
import { createEventDateReminder, createEventIcs, createGoogleCalendarUrl, eventCalendarAvailability } from '../../js/globe/event-calendar.mjs';
import { createEventCalendarSection } from '../../js/globe/event-calendar-ui.mjs';

const timed = overrides => ({ id: 'meet-1', name: 'Pixel Day', startDateTime: '2026-10-11T11:00', endDateTime: '2026-10-11T18:00', timeZone: 'Asia/Tokyo', venue: 'Hall A', description: 'Art, pixels', sourceUrl: 'https://example.com/event', ...overrides });

test('Google link uses official prefilled event parameters and explicit zone', () => {
  const url = new URL(createGoogleCalendarUrl(timed()));
  assert.equal(url.origin + url.pathname, 'https://calendar.google.com/calendar/r/eventedit');
  assert.equal(url.searchParams.get('action'), 'TEMPLATE');
  assert.equal(url.searchParams.get('dates'), '20261011T020000Z/20261011T090000Z');
  assert.equal(url.searchParams.get('stz'), 'Asia/Tokyo');
  assert.equal(url.searchParams.get('etz'), 'Asia/Tokyo');
  assert.equal(url.searchParams.get('location'), 'Hall A');
  assert.equal(url.searchParams.get('text'), 'Pixel Day');
  assert.match(url.searchParams.get('details'), /Source: https:\/\/example.com\/event/);
});

test('timed event rejects missing interval, invalid date, unknown zone, and DST gaps or folds', () => {
  for (const event of [timed({ endDateTime: '' }), timed({ startDateTime: '2026-02-30T10:00' }), timed({ timeZone: 'Mars/Olympus' }), timed({ timeZone: 'America/New_York', startDateTime: '2026-03-08T02:30' }), timed({ timeZone: 'America/New_York', startDateTime: '2026-11-01T01:30' })]) {
    assert.throws(() => createGoogleCalendarUrl(event));
  }
  assert.equal(eventCalendarAvailability(timed({ endDateTime: '' })).googleAvailable, false);
});

test('explicit-offset timestamp works without guessing a time zone', () => {
  const event = timed({ startDateTime: '2026-10-11T11:00+09:00', endDateTime: '2026-10-11T18:00+09:00', timeZone: '' });
  assert.match(createGoogleCalendarUrl(event), /dates=20261011T020000Z%2F20261011T090000Z/);
});

test('startAt/endAt and timezone aliases work, and an explicit IANA zone must match offsets', () => {
  const event = timed({ startDateTime: '', endDateTime: '', startAt: '2026-10-11T11:00', endAt: '2026-10-11T18:00', timeZone: '', timezone: 'Asia/Tokyo', sourceUrl: '', url: 'https://example.com/alias' });
  const url = new URL(createGoogleCalendarUrl(event));
  assert.equal(url.searchParams.get('stz'), 'Asia/Tokyo');
  assert.equal(url.searchParams.get('details').includes('https://example.com/alias'), true);
  assert.throws(() => createGoogleCalendarUrl(timed({ startDateTime: '2026-10-11T11:00+08:00', endDateTime: '2026-10-11T18:00+08:00' })), /does not match/);
  for (const offset of ['+25:00', '+00:60', '+14:01']) {
    assert.throws(() => createGoogleCalendarUrl(timed({ startDateTime: `2026-10-11T11:00${offset}`, endDateTime: `2026-10-11T18:00${offset}`, timeZone: '' })));
  }
});

test('ICS allows an exact start with no invented end; Google draft stays unavailable', () => {
  const event = timed({ endDateTime: '' });
  const ics = createEventIcs(event, { now: '2026-10-01T00:00:00Z' });
  assert.match(ics, /DTSTART:20261011T020000Z\r\n/);
  assert.doesNotMatch(ics, /DTEND/);
  assert.equal(eventCalendarAvailability(event).icsAvailable, true);
  assert.equal(eventCalendarAvailability(event).googleAvailable, false);
});

test('date-only reminder is a deliberate date-span copy, with exclusive ICS end date', () => {
  const reminder = createEventDateReminder({ id: 'day', name: 'Pixel Day', startDate: '2026-10-11', endDate: '2026-10-12', venue: 'Hall A', sourceUrl: 'https://example.com/event' });
  assert.equal(reminder.allDay, true);
  const url = new URL(createGoogleCalendarUrl(reminder));
  assert.equal(url.searchParams.get('dates'), '20261011/20261013');
  const ics = createEventIcs(reminder, { now: '2026-10-01T00:00:00Z' });
  assert.match(ics, /DTSTART;VALUE=DATE:20261011\r\nDTEND;VALUE=DATE:20261013/);
  assert.match(ics.replace(/\r\n[ ]/g, ''), /時刻・タイムゾーンはこの予定に設定しません/);
  assert.throws(() => createEventDateReminder({ name: 'No dates' }));
});

test('all-day single-date events use that date when endDate is omitted', () => {
  const event = { name: 'Local Art Day', allDay: true, startDate: '2026-10-11', venue: 'Hall A', sourceUrl: 'https://example.com/event' };
  const url = new URL(createGoogleCalendarUrl(event));
  assert.equal(url.searchParams.get('dates'), '20261011/20261012');
  assert.match(createEventIcs(event), /DTEND;VALUE=DATE:20261012/);
});

test('ICS escapes text, uses stable UID, UTC DTSTAMP, and folds UTF-8 lines at 75 octets', () => {
  const event = timed({ name: '絵;展, test\\name\n' + '長'.repeat(60), venue: 'Room, 1; West', description: 'line one\nline two' });
  const first = createEventIcs(event, { now: new Date('2026-10-01T00:00:00Z') });
  const second = createEventIcs(event, { now: new Date('2026-10-01T00:00:00Z') });
  assert.equal(first, second);
  assert.match(first, /UID:[^\r\n]+@pixieed\.jp\r\n/);
  assert.match(first, /DTSTAMP:20261001T000000Z\r\n/);
  assert.match(first, /SUMMARY:絵\\;展\\, test\\\\name\\n/);
  assert.match(first, /DESCRIPTION:line one\\nline two\\n\\nSource:/);
  assert.match(first, /URL:https:\/\/example\.com\/event\r\n/);
  for (const line of first.split('\r\n')) assert.ok(new TextEncoder().encode(line).length <= 75, `line length ${new TextEncoder().encode(line).length}: ${line}`);
  assert.ok(first.endsWith('\r\n'));
});

test('calendar-copy UID differs from its date-only reminder copy', () => {
  const event = { id: 'same-id', name: 'Pixel Day', allDay: true, startDate: '2026-10-11', endDate: '2026-10-11', venue: 'Hall A', sourceUrl: 'https://example.com/event' };
  const reminder = createEventDateReminder(event);
  const uid = value => value.match(/UID:([^\r\n]+)/)[1];
  assert.notEqual(uid(createEventIcs(event)), uid(createEventIcs(reminder)));
});

test('UI contains malformed catalog fields and omits date fallback for exact timed events', () => {
  class Node {
    constructor(tag) { this.tag = tag; this.children = []; this.listeners = {}; this.textContent = ''; }
    append(...nodes) { this.children.push(...nodes); }
    setAttribute() {}
    addEventListener(type, listener) { this.listeners[type] = listener; }
  }
  const doc = { createElement: tag => new Node(tag), body: new Node('body') };
  const flatten = node => [node, ...node.children.flatMap(flatten)];
  const invalid = createEventCalendarSection({ event: { name: 'Partial', startDate: 'not-a-date' }, doc });
  assert.ok(flatten(invalid).some(node => /カレンダーファイル：/.test(node.textContent)));
  const exact = createEventCalendarSection({ event: timed({ startDate: '2026-10-11', endDate: '2026-10-11' }), doc });
  assert.equal(flatten(exact).some(node => /日付だけを/.test(node.textContent)), false);
});

test('watch, cancelled, and postponed entries cannot produce calendar copies', () => {
  for (const status of ['watch', 'cancelled', 'postponed', 'ended', 'completed', 'past']) {
    const event = { ...timed(), status };
    assert.equal(eventCalendarAvailability(event).available, false);
    assert.throws(() => createEventIcs(event));
    assert.throws(() => createEventDateReminder({ ...event, startDate: '2026-10-11', endDate: '2026-10-11' }));
  }
});

test('explicit uncertainty and watch flags never produce confirmed date copies', () => {
  for (const event of [timed({watch:true}), ...['unknown','tentative','unconfirmed','pending'].map(status=>timed({status}))]) {
    assert.equal(eventCalendarAvailability(event).available,false);
    assert.throws(()=>createEventIcs(event));
    assert.throws(()=>createEventDateReminder({...event,startDate:'2026-10-11'}));
  }
});

test('ICS keeps the exact original zone as metadata while instants stay UTC', () => {
  const ics=createEventIcs(timed());
  assert.match(ics,/X-PIXIEED-ORIGINAL-TIMEZONE:Asia\/Tokyo/);
  assert.match(ics,/DTSTART:20261011T020000Z/);
  const reminder=createEventDateReminder({...timed(),startDate:'2026-10-11'});
  assert.doesNotMatch(createEventIcs(reminder),/X-PIXIEED-ORIGINAL-TIMEZONE|DTSTART:[0-9]+T/);
});
