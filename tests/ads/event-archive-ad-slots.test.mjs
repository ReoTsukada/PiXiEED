import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { addEventArchiveAdSlots } from '../../scripts/event-archive-ad-slots.mjs';
import { shouldShowEventArchiveAd } from '../../js/event-archive-ad-policy.mjs';

const source = await readFile(new URL('../../events/index.html', import.meta.url), 'utf8');

test('only the long event archive gets two clearly labelled manual slots after 24 and 48 entries', () => {
  const result = addEventArchiveAdSlots(source, 'events/index.html');
  assert.equal(result.added, true);
  assert.equal(result.skipped, false);
  assert.equal(result.slots, 2);
  assert.equal((result.html.match(/data-event-ad-slot\b/g) || []).length, 2);
  const card24 = result.html.indexOf('hk-museum-festival-carnival-pixel-public-art-2026');
  const slot24 = result.html.indexOf('data-event-ad-min-visible="24"');
  const card48 = result.html.indexOf('juuni-comitia-158-pixel-art-2026');
  const slot48 = result.html.indexOf('data-event-ad-min-visible="48"');
  assert.ok(card24 < slot24 && slot24 < card48 && card48 < slot48);
  assert.match(result.html, /aria-label="広告"/);
  assert.match(result.html, /px-display-ad__label">広告/);
  assert.match(result.html, /display-ads\.css\?rev=20261030-event-inline-ads-1/);
  assert.match(result.html, /display-ads\.mjs\?rev=20261030-event-inline-ads-1/);
  assert.doesNotMatch(result.html, /adsbygoogle\.js|adsense-auto\.js/);
  assert.equal(addEventArchiveAdSlots(result.html, 'events/index.html').html, result.html, 'the build transform is idempotent');
  assert.equal(addEventArchiveAdSlots(source, 'events/pixel-art-event/index.html').added, false);
});

test('short event archives do not gain ad slots or an ad loader', () => {
  const cards = Array.from({ length: 23 }, (_, i) => `<li data-event-card id="event-${i}">event</li>`).join('');
  const html = `<!doctype html><html><head></head><body><section id="event-year-2026"><ul>${cards}</ul></section></body></html>`;
  const result = addEventArchiveAdSlots(html, 'events/index.html');
  assert.deepEqual(result, { html, added: false, skipped: true, slots: 0 });
});

test('event archive slots disappear for narrow result sets or active filters', () => {
  const eligible = { status: 'near', query: '', format: 'all', region: 'all' };
  assert.equal(shouldShowEventArchiveAd({ ...eligible, visibleEventCount: 24, minimumVisibleEvents: 24 }), true);
  assert.equal(shouldShowEventArchiveAd({ ...eligible, visibleEventCount: 23, minimumVisibleEvents: 24 }), false);
  assert.equal(shouldShowEventArchiveAd({ ...eligible, visibleEventCount: 47, minimumVisibleEvents: 48 }), false);
  assert.equal(shouldShowEventArchiveAd({ ...eligible, status: 'all', visibleEventCount: 48, minimumVisibleEvents: 48 }), true);
  assert.equal(shouldShowEventArchiveAd({ ...eligible, status: 'ended', visibleEventCount: 86, minimumVisibleEvents: 24 }), false);
  assert.equal(shouldShowEventArchiveAd({ ...eligible, query: 'pixel', visibleEventCount: 86, minimumVisibleEvents: 24 }), false);
  assert.equal(shouldShowEventArchiveAd({ ...eligible, format: 'online', visibleEventCount: 86, minimumVisibleEvents: 24 }), false);
  assert.equal(shouldShowEventArchiveAd({ ...eligible, region: '東京都', visibleEventCount: 86, minimumVisibleEvents: 24 }), false);
});

test('ad rows span the archive grid and use normal-flow reserved responsive units', async () => {
  const pageCss = await readFile(new URL('../../css/event-pages.css', import.meta.url), 'utf8');
  const adCss = await readFile(new URL('../../css/display-ads.css', import.meta.url), 'utf8');
  const history = await readFile(new URL('../../js/event-history.mjs', import.meta.url), 'utf8');
  assert.match(pageCss, /\.event-list-ad\s*\{[^}]*grid-column:\s*1\s*\/\s*-1/s);
  assert.match(adCss, /\.px-display-ad\[data-ad-reserve\][\s\S]*?min-height: var\(--px-display-ad-reserved-height\)/);
  assert.match(adCss, /ins\.px-display-ad__unit\s*\{[^}]*max-width:\s*100%/s);
  assert.doesNotMatch(adCss, /position\s*:\s*(fixed|absolute)|animation\s*:/);
  assert.match(history, /shouldShowEventArchiveAd\(/);
  assert.match(history, /slot\.hidden\s*=\s*!shouldShowEventArchiveAd/);
});
