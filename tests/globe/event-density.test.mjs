import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyEvent, compareEventsByDisplayPriority, DEFAULT_EVENT_PERIOD_FILTER, EVENT_PERIOD_OPTIONS, eventDates, eventDensityBin, eventPeriodCounts, matchesEventPeriod, nextTokyoMidnightDelay, sortEventsByDisplayPriority, tokyoDate, uniqueEventEditions } from '../../js/globe/event-density.mjs';

test('Tokyo-local date determines upcoming, active, and past boundaries inclusively', () => {
  const event = { startDate: '2026-10-05', endDate: '2026-10-07' };
  assert.equal(classifyEvent(event, '2026-10-04'), 'upcoming');
  assert.equal(classifyEvent(event, '2026-10-05'), 'active');
  assert.equal(classifyEvent(event, '2026-10-07'), 'active');
  assert.equal(classifyEvent(event, '2026-10-08'), 'past');
  assert.equal(classifyEvent({ date: '2026-10-05' }, '2026-10-05'), 'active');
});

test('explicit competition deadlines expire at their exact timestamp', () => {
  const event = { startDate: '2026-08-16', endDate: '2026-10-10', deadlineAt: '2026-10-09T17:00:00+00:00' };
  const cutoff = Date.parse(event.deadlineAt);
  assert.equal(classifyEvent(event, '2026-10-10', cutoff - 1), 'active');
  assert.equal(classifyEvent(event, '2026-10-10', cutoff), 'past');
  assert.equal(classifyEvent(event, '2026-10-09', cutoff), 'past');
});

test('date and dates legacy fields are supported; no date never becomes a scheduled event', () => {
  assert.deepEqual(eventDates({ date: '2026/11/1' }), { start: '2026-11-01', end: '2026-11-01' });
  assert.deepEqual(eventDates({ dates: '2026年11月1日（日）〜2026年11月3日（火）' }), { start: '2026-11-01', end: '2026-11-03' });
  assert.deepEqual(eventDates({ dateLabel: '2026年12月2日～4日', startDate: '2026-12-02' }), { start: '2026-12-02', end: '2026-12-02' });
  for (const event of [{}, { status: 'upcoming' }, { dateLabel: '開催日調整中' }]) assert.equal(classifyEvent(event, '2026-10-05'), 'unknown');
  assert.equal(classifyEvent({ status: 'watch', lastHeldDate: '2025-01-01' }, '2026-10-05'), 'watch');
});

test('watch, cancelled, and postponed records do not count as past or scheduled', () => {
  assert.equal(classifyEvent({ status: 'watch', lastHeldDate: '2025-01-01' }, '2026-10-05'), 'watch');
  const actualPast = { id: 'past-edition', name: 'Annual Art Fest', startDate: '2025-01-01' };
  const watch = { id: 'next-edition-watch', name: 'Annual Art Fest', status: 'watch', lastHeldDate: '2025-01-01', dateLabel: '次回開催情報待ち（前回は2025年1月1日）' };
  assert.equal(eventDates(watch), null);
  assert.equal(uniqueEventEditions([actualPast, watch]).length, 2);
  assert.equal(classifyEvent({ status: 'cancelled', startDate: '2026-10-05' }, '2026-10-05'), 'cancelled');
  assert.equal(classifyEvent({ status: 'postponed', endDate: '2020-01-01', startDate: '2020-01-01' }, '2026-10-05'), 'postponed');
  assert.equal(eventPeriodCounts([{ status: 'watch', lastHeldDate: '2025-01-01' }, { status: 'cancelled', date: '2025-01-01' }, { status: 'postponed', date: '2025-01-01' }], '2026-10-05').total, 0);
});

test('period filters and annual edition aliases count once; future color wins in a mixed cell', () => {
  const events = [
    { id: 'future-a', name: 'Pixel Art Park 9', shortName: 'Pixel Art Park', startDate: '2026-10-11' },
    { id: 'future-duplicate', name: 'Pixel Art Park', startDate: '2026-10-11' },
    { id: 'future-second-edition', name: 'Pixel Art Park 8', shortName: 'Pixel Art Park', startDate: '2026-10-18' },
    { id: 'past', name: 'Winter Pixel Fest 2026', startDate: '2026-01-11' },
    { id: 'watch', name: 'Next edition', status: 'watch', lastHeldDate: '2025-04-01' }
  ];
  assert.equal(uniqueEventEditions(events).length, 4);
  assert.deepEqual(eventPeriodCounts(events, '2026-10-05'), { upcoming: 2, active: 0, past: 1, future: 2, total: 3 });
  assert.equal(matchesEventPeriod(events[0], 'future', '2026-10-05'), true);
  assert.equal(matchesEventPeriod(events[3], 'past', '2026-10-05'), true);
  assert.equal(matchesEventPeriod(events[4], 'past', '2026-10-05'), false);
  assert.deepEqual([eventDensityBin(0), eventDensityBin(1), eventDensityBin(2), eventDensityBin(4), eventDensityBin(5), eventDensityBin(99)], [0, 1, 2, 2, 3, 3]);
});

test('future is the initial period and the list prioritizes active, nearest upcoming, unconfirmed, then recent past', () => {
  assert.equal(DEFAULT_EVENT_PERIOD_FILTER, 'future');
  assert.deepEqual(EVENT_PERIOD_OPTIONS.map(([value]) => value), ['future', 'all', 'past']);
  const events = [
    { id: 'past-old', name: 'Past old', startDate: '2025-01-01', endDate: '2025-01-02' },
    { id: 'unknown', name: 'Unknown' },
    { id: 'upcoming-far', name: 'Upcoming far', startDate: '2026-11-01' },
    { id: 'active-later', name: 'Active later', startDate: '2026-10-01', endDate: '2026-10-10' },
    { id: 'watch', name: 'Watch old date', status: 'watch', lastHeldDate: '2026-10-04' },
    { id: 'past-new', name: 'Past new', startDate: '2026-09-29', endDate: '2026-10-02' },
    { id: 'upcoming-near', name: 'Upcoming near', startDate: '2026-10-20' },
    { id: 'active-soon-end', name: 'Active soon end', startDate: '2026-10-03', endDate: '2026-10-06' }
  ];
  assert.deepEqual(sortEventsByDisplayPriority(events, '2026-10-05').map(event => event.id), [
    'active-soon-end', 'active-later', 'upcoming-near', 'upcoming-far', 'unknown', 'watch', 'past-new', 'past-old'
  ]);
  assert.ok(compareEventsByDisplayPriority(events[3], events[7], '2026-10-05') > 0);
});

test('JST date and next midnight refresh boundary use Asia/Tokyo', () => {
  const midnightUtc = Date.parse('2026-10-04T15:00:00Z');
  assert.equal(tokyoDate(midnightUtc - 1), '2026-10-04');
  assert.equal(tokyoDate(midnightUtc), '2026-10-05');
  assert.equal(nextTokyoMidnightDelay(midnightUtc - 1), 1);
  assert.ok(nextTokyoMidnightDelay(Date.parse('2026-10-05T14:59:00Z')) <= 60_000);
});
