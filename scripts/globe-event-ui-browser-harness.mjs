#!/usr/bin/env node
// Local-only event list/detail regression checks. No accounts or real ads.
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
const base = process.env.PIXIEED_BROWSER_BASE_URL || 'http://127.0.0.1:4296';
assert.ok(['127.0.0.1', 'localhost'].includes(new URL(base).hostname));
const engines = await import(process.env.PIXIEED_PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PIXIEED_PLAYWRIGHT_MODULE).href : 'playwright');
const fixture = Array.from({ length: 26 }, (_, i) => ({ kind: 'pixel-art', checkedAt: '2026-10-08', id: `ui-${i}`, name: `検証用ピクセルアート展示 ${i + 1}`, prefecture: '東京都', venue: '検証用ギャラリー', status: 'upcoming', startDate: '2099-10-11', endDate: '2099-10-12', startAt: '2099-10-11T11:00', endAt: '2099-10-12T18:00', timeZone: 'Asia/Tokyo', sourceUrl: 'https://example.org/event', description: '安全な検証データです。'.repeat(20) }));
fixture.push({ ...fixture[0], id: 'past-ui', name: '検証用過去展示', status: 'ended', startDate: '2020-01-01', endDate: '2020-01-01', startAt: undefined, endAt: undefined });
fixture.push({ ...fixture[0], id: 'watch-ui', name: '検証用次回待ち', status: 'watch', startDate: undefined, endDate: undefined, startAt: undefined, endAt: undefined });
const checks = [], unavailable = [];
for (const engineName of ['chromium', 'webkit']) {
  let browser;
  try { browser = await engines[engineName].launch({ headless: true }); }
  catch (error) {
    if (!error.message.includes("Executable doesn't exist")) throw error;
    unavailable.push(`${engineName}: browser not installed`); continue;
  }
  try {
    for (const viewport of [{ width: 320, height: 740 }, { width: 390, height: 844 }, { width: 844, height: 390 }, { width: 1280, height: 800 }]) {
      const ctx = await browser.newContext({ viewport, serviceWorkers: 'block', acceptDownloads: true });
      await ctx.route('**/*', route => {
        const u = new URL(route.request().url());
        if (u.hostname === 'script.google.com') return route.fulfill({ contentType: 'application/json', body: '{"events":[]}' });
        if (u.pathname === '/data/pixel-art-events.json') return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ version: 1, updatedAt: '2026-10-08', events: fixture }) });
        // This single optional-module failure verifies the revised controls remain independent.
        if (u.pathname === '/js/display-ads.mjs') return route.fulfill({ contentType: 'text/javascript', body: 'throw new Error("optional ad unavailable");' });
        if (['localhost', '127.0.0.1'].includes(u.hostname) && ['GET', 'HEAD'].includes(route.request().method())) return route.continue();
        return route.abort('blockedbyclient');
      });
      await ctx.addInitScript(() => {
        localStorage.setItem('PiXiEED:map-events-view', 'overview');
        sessionStorage.setItem('PiXiEED:map-events-expanded', 'false');
      });
      const page = await ctx.newPage();
      const errors = []; page.on('pageerror', error => { if (!error.message.includes('optional ad unavailable')) errors.push(error.message); });
      async function openList() {
        const frame = page.frames().find(f => f !== page.mainFrame());
        await frame.waitForFunction(() => globalThis.__PIXIEED_MAP_EVENTS__);
        await frame.evaluate(() => __PIXIEED_MAP_EVENTS__.ready);
        if (await frame.locator('[data-map-content="events"]').getAttribute('aria-pressed') !== 'true') await frame.locator('[data-map-content="events"]').click();
        await frame.evaluate(() => __PIXIEED_MAP_EVENTS__.selectRegion({ prefectureId: '13', prefectureLabel: '東京都', mapRegionId: 'prefecture:13', mapRegionKind: 'prefecture', mapRegionLabel: '東京都', countryId: 'JPN' }));
        assert.equal(await frame.locator('.map-events-panel').getAttribute('data-view'), 'list');
        assert.equal(await frame.locator('.map-events-panel__expand').count(), 0);
        assert.equal(await frame.locator('.map-event-card').count(), 20);
        return frame;
      }
      await page.goto(base + '/globe/', { waitUntil: 'domcontentloaded' });
      let frame = await openList();
      const period = frame.locator('.map-events-panel__period-toggle');
      const options = period.locator('[data-period-option]');
      assert.deepEqual(await options.allTextContents(), ['今後・開催中', '過去', 'すべて']);
      assert.equal(await period.getAttribute('role'), 'group');
      assert.equal(await period.locator('[aria-pressed="true"]').count(), 1);
      await period.locator('[data-period-option="future"]').focus();
      await page.keyboard.press('ArrowRight');
      assert.equal(await frame.evaluate(() => document.activeElement.dataset.periodOption), 'past');
      assert.equal(await period.getAttribute('data-event-period'), 'future', 'arrows move focus without changing results');
      await page.keyboard.press('Enter');
      assert.equal(await period.getAttribute('data-event-period'), 'past');
      assert.equal(await frame.locator('.map-event-card').count(), 1);
      assert.match(await frame.locator('.map-events-panel__heading').textContent(), /1件/);
      await page.keyboard.press('End');
      await page.keyboard.press('Space');
      assert.equal(await period.getAttribute('data-event-period'), 'all');
      assert.match(await frame.locator('.map-events-panel__heading').textContent(), /28件/);
      await period.locator('[data-period-option="future"]').click();
      assert.equal(await frame.locator('.map-event-card').count(), 20);
      const filterMetrics = await period.evaluate(n => ({ overflow: n.scrollWidth > n.clientWidth + 1, buttons: [...n.querySelectorAll('button')].map(b => ({ height: b.getBoundingClientRect().height, width: b.getBoundingClientRect().width, overflow: b.scrollWidth > b.clientWidth + 1 })), selectedLine: getComputedStyle(n.querySelector('[aria-pressed="true"]'), '::after').height }));
      assert.equal(filterMetrics.overflow, false); assert.equal(filterMetrics.selectedLine, '3px');
      assert.ok(filterMetrics.buttons.every(b => b.height >= 44 && b.width >= 44 && !b.overflow), JSON.stringify(filterMetrics));
      // A region with no past records retains a useful empty state and the chosen filter.
      await period.locator('[data-period-option="past"]').click();
      await frame.evaluate(() => __PIXIEED_MAP_EVENTS__.selectRegion({ prefectureId: '14', mapRegionId: 'prefecture:14', mapRegionKind: 'prefecture', mapRegionLabel: '神奈川県' }));
      assert.equal(await period.getAttribute('data-event-period'), 'past');
      assert.equal(await frame.locator('.map-event-card').count(), 0);
      assert.match(await frame.locator('.map-events-panel__empty').textContent(), /まだ掲載|ありません/);
      await frame.evaluate(() => __PIXIEED_MAP_EVENTS__.selectRegion({ prefectureId: '13', mapRegionId: 'prefecture:13', mapRegionKind: 'prefecture', mapRegionLabel: '東京都' }));
      await period.locator('[data-period-option="future"]').click();
      await frame.locator('.map-events-panel__more').click();
      assert.equal(await frame.locator('.map-event-card').count(), 26);
      const card = frame.locator('[data-event-id="ui-10"]');
      const button = card.locator('button');
      await button.scrollIntoViewIfNeeded();
      await button.focus();
      const scroll = await frame.locator('.map-events-panel__body').evaluate(n => n.scrollTop);
      await button.press('Enter');
      await page.locator('#mapEventDetail[data-event-id="ui-10"] .event-calendar').waitFor();
      assert.equal(await page.locator('.map-event-detail__title').textContent(), fixture[10].name);
      assert.equal(await page.locator('.map-event-detail__close').textContent(), '一覧に戻る');
      const google = page.locator('.event-calendar__action--primary');
      assert.ok((await google.getAttribute('href')).startsWith('https://calendar.google.com/'));
      if (viewport.width > 900) {
        assert.equal(await card.isVisible(), true);
        assert.equal(await card.getAttribute('aria-current'), 'true');
        assert.equal(await button.getAttribute('aria-expanded'), 'true');
      }
      const downloadPromise = page.waitForEvent('download');
      await page.locator('.event-calendar__action--secondary').click();
      assert.match((await downloadPromise).suggestedFilename(), /\.ics$/);
      const metrics = await page.evaluate(() => {
        const main = document.querySelector('#main');
        const detail = document.querySelector('#mapEventDetail');
        const controls = [...detail.querySelectorAll('a,button')].map(n => ({ text: n.textContent, height: n.getBoundingClientRect().height, width: n.getBoundingClientRect().width }));
        return { overflow: detail.scrollWidth > detail.clientWidth + 1, mainOverflow: main.scrollWidth > main.clientWidth + 1, controls };
      });
      assert.equal(metrics.overflow, false); assert.equal(metrics.mainOverflow, false);
      assert.ok(metrics.controls.every(n => n.height >= 44 && n.width >= 44), JSON.stringify(metrics));
      await page.locator('.map-event-detail__close').focus();
      await page.keyboard.press('Escape');
      await page.locator('#mapEventDetailHost').waitFor({ state: 'hidden' });
      await frame.waitForFunction(() => document.activeElement?.closest('[data-event-id]')?.dataset.eventId === 'ui-10');
      assert.equal(await frame.locator('.map-events-panel').getAttribute('data-view'), 'list');
      assert.equal(await frame.locator('.map-event-card').count(), 26);
      assert.ok(Math.abs(await frame.locator('.map-events-panel__body').evaluate(n => n.scrollTop) - scroll) < 3, 'return preserves the list scroll');
      // Refresh while a card control has focus must preserve that focus and scroll.
      await frame.evaluate(() => __PIXIEED_MAP_EVENTS__.refreshData());
      assert.equal(await frame.evaluate(() => document.activeElement?.closest('[data-event-id]')?.dataset.eventId), 'ui-10');
      await button.click();
      await page.locator('.map-event-detail__close').click();
      await page.locator('#mapEventDetailHost').waitFor({ state: 'hidden' });
      if (viewport.width > 900) {
        await button.click();
        await page.locator('.map-event-detail__close').waitFor();
        await period.locator('[data-period-option="past"]').click();
        await page.locator('#mapEventDetailHost').waitFor({ state: 'hidden' });
        assert.equal(await frame.locator('.map-events-panel').getAttribute('data-view'), 'list');
        assert.equal(await frame.locator('.map-event-card').count(), 1);
        assert.equal(await frame.evaluate(() => document.activeElement.dataset.periodOption), 'past');
      }
      await page.reload({ waitUntil: 'domcontentloaded' }); frame = await openList();
      await page.goto(base + '/tools/', { waitUntil: 'domcontentloaded' });
      await page.goBack({ waitUntil: 'domcontentloaded' });
      frame = await openList();
      assert.deepEqual(errors, []);
      checks.push({ engine: engineName, ...viewport, expanded: true, keyboard: true, scrollFocus: true, reloadAndBack: true, ics: true, controls: metrics.controls.length, periodFilters: true });
      await ctx.close();
    }
  } finally { await browser.close(); }
}
console.log(JSON.stringify({ checks, unavailable }, null, 2));
