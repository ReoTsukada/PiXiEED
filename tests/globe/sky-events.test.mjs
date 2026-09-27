import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { solarLongitudeDate, upcomingMeteorShowers, upcomingEclipses, meteorOutlook, METEOR_SHOWERS, daysUntil } from '../../js/globe/sky-events.mjs';

const hoursApart = (a, b) => Math.abs(a - b) / 3600000;

test('shower peaks land on the IMO dates', () => {
  // IMO 2025: Perseids Aug 12 ~20h UT, Geminids Dec 14 ~07h UT; 2026 Quadrantids Jan 3 ~21h UT.
  const from = new Date('2025-06-01T00:00Z');
  assert.ok(hoursApart(solarLongitudeDate(140.0, from), Date.parse('2025-08-12T20:00Z')) < 6);
  assert.ok(hoursApart(solarLongitudeDate(262.2, from), Date.parse('2025-12-14T07:00Z')) < 6);
  assert.ok(hoursApart(solarLongitudeDate(283.15, from), Date.parse('2026-01-03T21:00Z')) < 6);
});

test('the list is the next peak of every shower, soonest first, each with a dark-sky outlook', () => {
  const list = upcomingMeteorShowers(new Date('2026-09-27T00:00Z'), 35.68, 139.69);
  assert.equal(list.length, METEOR_SHOWERS.length);
  for (let i = 1; i < list.length; i += 1) assert.ok(list[i].peak >= list[i - 1].peak);
  const geminids = list.find((m) => m.shower.id === 'geminids');
  assert.ok(geminids.best, 'the Geminids are seen from Tokyo');
  assert.ok(geminids.rate > 60 && geminids.rating === 'great');
  assert.ok(geminids.radiantAltitude > 40);
});

test('a shower whose radiant never rises is reported as not visible', () => {
  // The Ursids' radiant (Dec +76) never rises from far south.
  const ursids = METEOR_SHOWERS.find((m) => m.id === 'ursids');
  const outlook = meteorOutlook(ursids, solarLongitudeDate(ursids.solarLongitude, new Date('2026-09-27T00:00Z')), -45, 170);
  assert.equal(outlook.best, null);
});

test('eclipses seen from Tokyo: 2030 annular (partial here), 2035 total', () => {
  const eclipses = upcomingEclipses(new Date('2026-09-27T00:00Z'), 35.68, 139.69, 3);
  const years = eclipses.map((e) => e.time.getUTCFullYear());
  assert.deepEqual(years.slice(0, 3), [2030, 2032, 2035]);
  assert.ok(eclipses[0].local.obscuration > 0.6 && eclipses[0].local.obscuration < 0.85);
  assert.ok(eclipses[2].local.obscuration > 0.99);
});

test('countdown days are calendar days', () => {
  assert.equal(daysUntil(new Date(2026, 9, 9, 18), new Date(2026, 8, 27, 12)), 12);
  assert.equal(daysUntil(new Date(2026, 8, 27, 23), new Date(2026, 8, 27, 1)), 0);
});

test('the telescope is listed as a tool and opens straight into the telescope', () => {
  const root = new URL('../..', import.meta.url);
  assert.match(readFileSync(new URL('tools/index.html', root), 'utf8'), /href="\/telescope\/"/);
  assert.match(readFileSync(new URL('telescope/index.html', root), 'utf8'), /tool=telescope/);
  assert.match(readFileSync(new URL('js/globe/prototype.mjs', root), 'utf8'), /openTelescopeTool/);
});
