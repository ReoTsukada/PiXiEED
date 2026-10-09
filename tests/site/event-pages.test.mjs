import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { eligibleEvents, eventPage, eventFacts, generateEventPages, indexPage, HUB_ONLY_REASONS, PUBLIC_SUMMARY_OVERRIDES } from '../../scripts/generate-event-pages.mjs';

const catalog = JSON.parse(await readFile(new URL('../../data/pixel-art-events.json', import.meta.url), 'utf8'));
const events = eligibleEvents(catalog);
const idSet = new Set(events.map((event) => event.id));
const allIds = new Set(catalog.events.map((event) => event.id));

test('indexable events have a checked source and unique, substantive dated edition', () => {
  assert.equal(catalog.events.length, 102);
  assert.equal(events.length, 86);
  for (const event of events) {
    assert.ok(event.sourceUrl.startsWith('https://'));
    assert.ok(event.checkedAt);
    assert.ok(event.status !== 'watch');
    assert.ok(event.startDate || event.endDate || event.dateLabel);
    assert.ok(event.description?.trim());
  }
  const editionKeys = events.map((event) => `${event.name}|${event.startDate}|${event.endDate}`);
  assert.equal(new Set(editionKeys).size, editionKeys.length, 'same-name same-date editions do not get duplicate pages');
  for (const id of Object.keys(HUB_ONLY_REASONS)) assert.ok(!idSet.has(id), `${id} is hub-only`);
  assert.equal(catalog.events.filter((event) => event.status === 'watch').length, 5);
  assert.ok(catalog.events.filter((event) => event.status === 'watch').every((event) => !idSet.has(event.id)));
  assert.ok(idSet.has('kac-ultra-dope-motocross-2026'));
  assert.ok(!idSet.has('motocross-saito-ultra-dope-2026'));
  assert.ok([...idSet].every((id) => allIds.has(id)));
});

test('a dated record without a substantive description is not given a leaf page', () => {
  const sparse = { version: 1, events: [{ id: 'sparse', name: 'Sparse event', status: 'upcoming', startDate: '2027-01-01', endDate: '2027-01-01', sourceUrl: 'https://example.test', checkedAt: '2026-10-01' }] };
  assert.deepEqual(eligibleEvents(sparse), []);
});

test('event page discloses unknown fields, source provenance, and introduction status', () => {
  const event = { id: 'test-event', name: '<Pixel Jam>', startDate: '2026-11-01', endDate: '2026-11-01', status: 'upcoming', sourceUrl: 'https://example.test/event', checkedAt: '2026-10-01T00:00:00Z', sourceLabel: '公式案内', description: '開催内容の説明' };
  const html = eventPage(event, [event]);
  assert.match(html, /<link rel="canonical" href="https:\/\/pixieed\.jp\/events\/test-event\/">/);
  assert.match(html, /&lt;Pixel Jam&gt;/);
  assert.match(html, /<dt>正式名称<\/dt><dd>未確認<\/dd>/);
  assert.match(html, /<dt>通称<\/dt><dd>未確認<\/dd>/);
  assert.match(html, /<dt>参加方法<\/dt><dd>未確認<\/dd>/);
  assert.match(html, /PiXiEEDによるイベント紹介です/);
  assert.match(html, /情報確認日/);
  assert.doesNotMatch(html, /application\/ld\+json/);
});

test('watch records are hub-only with previous-date facts and links to available history', () => {
  const watch = { id: 'sample-watch', name: 'Sample Pixel Festival', status: 'watch', lastHeldDate: '2025-05-01', dateLabel: '次回開催情報待ち（前回は2025年5月1日）', venue: '次回会場未発表', sourceUrl: 'https://example.test', checkedAt: '2026-10-01', sourceLabel: '主催公式' };
  const priorLeaf = { id: 'sample-2025', name: watch.name, status: 'ended', startDate: '2025-05-01', endDate: '2025-05-01', dateLabel: '2025年5月1日', venue: 'Sample Hall', sourceUrl: 'https://example.test/2025', checkedAt: '2026-10-01', description: '前回の開催内容' };
  const hub = indexPage([priorLeaf], [watch, priorLeaf]);
  assert.match(hub, /次回開催情報待ち（前回は2025年5月1日）/);
  assert.match(hub, /過去開催：Sample Pixel Festival（2025年5月1日）/);
  assert.match(hub, /href="\/events\/sample-2025\/"/);
  assert.doesNotMatch(hub, /href="\/events\/sample-watch\/"/);
  const leaf = eventPage(priorLeaf, [watch, priorLeaf], new Set(['sample-2025']));
  assert.match(leaf, /href="\/events\/#sample-watch"/);
  assert.equal(eventFacts(watch).find(([label]) => label === '開催状態')[1], '次回開催情報待ち');
});

test('shared-description KAI, Beppu, and LCCL entries remain hub-only with their individual facts', () => {
  const groupIds = [
    'kai-whos-game-room-kaohsiung-2026', 'kai-whos-game-room-taoyuan-2026', 'kai-whos-game-room-kaohsiung-sanduo-2026', 'kai-whos-game-room-taipei-2026', 'kai-whos-game-room-chiayi-2026',
    'beppu-minecraft-pixel-art-2026-10-18', 'beppu-minecraft-pixel-art-2026-11-15',
    'lccl-game-design-pixel-art-camp-2026-11-30', 'lccl-game-design-pixel-art-camp-2026-12-08',
  ];
  const hub = indexPage(events, catalog.events);
  for (const id of groupIds) {
    assert.ok(HUB_ONLY_REASONS[id]);
    assert.ok(!idSet.has(id));
    const event = catalog.events.find((item) => item.id === id);
    assert.ok(hub.includes(event.dateLabel));
    assert.ok(hub.includes(event.venue));
    assert.ok(hub.includes(event.sourceUrl));
    assert.ok(hub.includes(event.checkedAt));
  }
  assert.match(hub, /Pixel Art Park初開催回の記録/);
  assert.match(hub, /同じ開催回の重複レコード/);
  assert.match(hub, /正規の開催紹介ページ/);
});

test('leaf pages use public-facing summaries where catalog descriptions contain editor notes', () => {
  assert.ok(Object.keys(PUBLIC_SUMMARY_OVERRIDES).length > 0);
  for (const [id, summary] of Object.entries(PUBLIC_SUMMARY_OVERRIDES)) {
    const event = events.find((item) => item.id === id);
    assert.ok(event, `${id} remains a substantive leaf page`);
    const html = eventPage(event, catalog.events, idSet);
    assert.ok(html.includes(summary.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')));
    assert.doesNotMatch(html, /別開催回として登録|今回確認時点|催事全体ではなく|重複計上しない|件数を増やさず/);
  }
});

test('hub has one anchor per source record and accurate record, edition, watch, and page counts', () => {
  const hub = indexPage(events, catalog.events);
  assert.match(hub, /102レコード（開催日付き97記録・重複1件を除く96開催回・次回未定5件）。個別紹介ページ86件。/);
  assert.match(hub, /PiXiEEDが独自に調査・編集した一覧です/);
  for (const event of catalog.events) assert.ok(hub.includes(`id="${event.id}"`));
});

test('generated canonical pages and sitemap contain only unique leaf URLs and are repeatable', async () => {
  const root = await mkdtemp(join(tmpdir(), 'pixieed-event-pages-'));
  try {
    await mkdir(join(root, 'data'));
    await writeFile(join(root, 'data/pixel-art-events.json'), JSON.stringify(catalog));
    await writeFile(join(root, 'sitemap.xml'), '<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>https://pixieed.jp/</loc></url><url><loc>https://pixieed.jp/events/old/</loc></url></urlset>');
    const first = await generateEventPages({ root });
    assert.equal(first.eventPages, 86);
    const sitemapPath = join(root, 'sitemap.xml');
    const sitemap = await readFile(sitemapPath, 'utf8');
    const sitemapUrls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(([, url]) => url);
    const expectedRoutes = ['/events/', ...first.ids.map((id) => `/events/${id}/`)];
    assert.equal(new Set(sitemapUrls).size, sitemapUrls.length);
    assert.deepEqual(sitemapUrls.filter((url) => url.includes('/events/')).map((url) => url.replace('https://pixieed.jp', '')), expectedRoutes);
    assert.ok(sitemapUrls.includes('https://pixieed.jp/'));
    const htmlFiles = ['events/index.html', ...first.ids.map((id) => `events/${id}/index.html`)];
    for (const file of htmlFiles) {
      const html = await readFile(join(root, file), 'utf8');
      for (const [, slug] of html.matchAll(/href="\/events\/([a-z0-9-]+)\//g)) assert.ok(idSet.has(slug), `${file} does not point at a missing leaf: ${slug}`);
      for (const [, anchor] of html.matchAll(/href="\/events\/#([a-z0-9-]+)"/g)) assert.ok(allIds.has(anchor), `${file} does not point at a missing hub anchor: ${anchor}`);
    }
    for (const id of first.ids) {
      const html = await readFile(join(root, 'events', id, 'index.html'), 'utf8');
      assert.match(html, new RegExp(`<link rel="canonical" href="https://pixieed\\.jp/events/${id}/">`));
    }
    const snapshot = await Promise.all(first.files.map(async (file) => [file, await readFile(join(root, file), 'utf8')]));
    const second = await generateEventPages({ root });
    assert.deepEqual(second.files, first.files);
    for (const [file, content] of snapshot) assert.equal(await readFile(join(root, file), 'utf8'), content, `${file} is stable on regeneration`);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
