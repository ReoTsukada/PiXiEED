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
  assert.ok(flatten(invalid).some(node => /確認できません/.test(node.textContent)));
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

class CalendarNode {
  constructor(tag) { this.tag = tag; this.children = []; this.listeners = {}; this.textContent = ''; }
  append(...nodes) { this.children.push(...nodes); }
  setAttribute() {}
  addEventListener(type, listener) { this.listeners[type] = listener; }
  click() { this.clicked = true; }
  remove() {}
}
const calendarDoc = () => ({ createElement: tag => new CalendarNode(tag), body: new CalendarNode('body') });
const calendarNodes = node => [node, ...node.children.flatMap(calendarNodes)];
const dated = overrides => ({ name: 'Pixel Day', startDate: '2026-10-11', endDate: '2026-10-12', venue: 'Hall A', sourceUrl: 'https://example.com/event', ...overrides });

test('date-only catalog records offer direct actions without unavailable or separate reminder blocks', async () => {
  const doc = calendarDoc();
  let exportedBlob;
  const URLImpl = { createObjectURL(blob) { exportedBlob = blob; return 'blob:calendar-test'; }, revokeObjectURL() {} };
  const section = createEventCalendarSection({ event: dated(), doc, URLImpl, navigatorRef: {} });
  const nodes = calendarNodes(section);
  const google = nodes.find(node => node.tag === 'a');
  assert.equal(new URL(google.href).searchParams.get('dates'), '20261011/20261013');
  assert.ok(nodes.some(node => /開催日だけ/.test(node.textContent)));
  assert.equal(nodes.some(node => node.className === 'event-calendar__unavailable' || node.className === 'event-calendar__reminder'), false);
  const ics = nodes.find(node => node.tag === 'button');
  ics.listeners.click();
  assert.match(await exportedBlob.text(), /DTSTART;VALUE=DATE:20261011/);
  assert.match(doc.body.children[0].download, /\.ics$/);
});

test('UI never falls back to add invalid or inactive date-only records', () => {
  for (const event of [dated({ endDate: '2026-10-01' }), dated({ startDate: 'invalid' }), dated({ watch: true }), ...['watch', 'cancelled', 'postponed', 'ended', 'unknown', 'tentative', 'unconfirmed', 'pending'].map(status => dated({ status }))]) {
    const nodes = calendarNodes(createEventCalendarSection({ event, doc: calendarDoc() }));
    assert.equal(nodes.some(node => node.tag === 'a' || node.tag === 'button'), false);
    assert.equal(nodes.filter(node => node.className === 'event-calendar__unavailable').length, 1);
  }
});

test('UI preserves an exact ICS start when only the end time is missing', async () => {
  let exportedBlob;
  const URLImpl = { createObjectURL(blob) { exportedBlob = blob; return 'blob:calendar-test'; }, revokeObjectURL() {} };
  const nodes = calendarNodes(createEventCalendarSection({ event: timed({ ...dated(), endDateTime: '' }), doc: calendarDoc(), URLImpl, navigatorRef: {} }));
  assert.equal(nodes.some(node => node.tag === 'a'), false);
  nodes.find(node => node.tag === 'button').listeners.click();
  assert.match(await exportedBlob.text(), /DTSTART:20261011T020000Z/);
  assert.doesNotMatch(await exportedBlob.text(), /DTEND|VALUE=DATE/);
});

test('Android Chrome app route retains a complete Google web fallback and explicit web action', () => {
  const nav = { userAgent: 'Mozilla/5.0 (Linux; Android 14) Chrome/130.0 Mobile' };
  const nodes = calendarNodes(createEventCalendarSection({ event: dated(), doc: calendarDoc(), navigatorRef: nav }));
  const links = nodes.filter(node => node.tag === 'a');
  assert.equal(links.length, 2);
  assert.match(links[0].href, /^intent:\/\/calendar\.google\.com\/calendar\/r\/eventedit/);
  assert.match(links[0].href, /package=com\.google\.android\.calendar/);
  assert.equal(decodeURIComponent(links[0].href.match(/S\.browser_fallback_url=([^;]+)/)[1]), links[1].href);
  assert.equal(new URL(links[1].href).searchParams.get('dates'), '20261011/20261013');
  for (const userAgent of ['Mozilla/5.0 (iPhone)', 'Mozilla/5.0 (Linux; Android; wv) Version/4.0 Chrome/130.0', 'Mozilla/5.0 (Linux; Android) Firefox/130.0', 'Mozilla/5.0 (Linux; Android) Chrome/130.0 SamsungBrowser/27']) {
    const others = calendarNodes(createEventCalendarSection({ event: dated(), doc: calendarDoc(), navigatorRef: { userAgent } }));
    assert.equal(others.some(node => node.href?.startsWith('intent:')), false);
  }
});

test('file sharing runs from the gesture, does not report calendar registration, and never downloads on cancellation', async () => {
  const doc = calendarDoc();
  const files = [];
  const nav = { userAgent: 'iPhone', canShare: payload => payload.files[0].type === 'text/calendar', share: payload => { files.push(payload.files[0]); return Promise.resolve(); } };
  const nodes = calendarNodes(createEventCalendarSection({ event: dated(), doc, navigatorRef: nav }));
  const share = nodes.find(node => /共有メニュー/.test(node.textContent));
  const operation = share.listeners.click();
  assert.equal(files.length, 1, 'share called before an async boundary');
  assert.match(await files[0].text(), /DTSTART;VALUE=DATE:20261011/);
  await operation;
  const feedback = nodes.find(node => node.className === 'event-calendar__feedback');
  assert.match(feedback.textContent, /共有先に渡しました/);
  assert.equal(share.disabled, false);
  nav.share = () => Promise.reject(Object.assign(new Error('Cancelled'), { name: 'AbortError' }));
  await share.listeners.click();
  assert.match(feedback.textContent, /キャンセル/);
  assert.equal(doc.body.children.length, 0);
  nav.share = () => { throw new Error('Denied'); };
  await share.listeners.click();
  assert.match(feedback.textContent, /共有できません/);
  assert.equal(share.disabled, false);
});

test('unsupported ICS sharing remains a save action with device-specific labels, including desktop-mode iPad', () => {
  for (const [nav, expected] of [
    [{ userAgent: 'iPhone' }, /iPhone・iPad用/],
    [{ platform: 'MacIntel', maxTouchPoints: 5 }, /iPhone・iPad用/],
    [{ platform: 'MacIntel', maxTouchPoints: 0 }, /Appleカレンダー用/],
    [{ userAgentData: { platform: 'Windows' } }, /Outlook/],
    [{ userAgent: 'Android' }, /他のカレンダー用/]
  ]) {
    const nodes = calendarNodes(createEventCalendarSection({ event: dated(), doc: calendarDoc(), navigatorRef: { ...nav, share() {}, canShare: () => false } }));
    const buttons = nodes.filter(node => node.tag === 'button');
    assert.equal(buttons.length, 1);
    assert.match(buttons[0].textContent, expected);
  }
});

test('ICS-only Android records do not recommend an unavailable Google web action', () => {
  const nodes = calendarNodes(createEventCalendarSection({ event: timed({ endDateTime: '' }), doc: calendarDoc(), navigatorRef: { userAgent: 'Android Chrome/130.0' } }));
  assert.equal(nodes.some(node => /Web版/.test(node.textContent)), false);
});
