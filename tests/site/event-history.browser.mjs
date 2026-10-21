// Run with PIXIEED_BROWSER_BASE_URL pointing to a loopback-only preview.
// Optional PIXIEED_PLAYWRIGHT_MODULE selects an existing Playwright installation.
import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { eligibleEvents, indexPage } from '../../scripts/generate-event-pages.mjs';
const base = process.env.PIXIEED_BROWSER_BASE_URL || 'http://127.0.0.1:50723';
assert.ok(['127.0.0.1', 'localhost'].includes(new URL(base).hostname));
const engines = await import(process.env.PIXIEED_PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PIXIEED_PLAYWRIGHT_MODULE).href : 'playwright');
const catalog = JSON.parse(await readFile(new URL('../../data/pixel-art-events.json', import.meta.url)));
const html = indexPage(eligibleEvents(catalog), catalog.events);
const evidence = process.env.PIXIEED_EVENT_EVIDENCE_DIR;
if (evidence) await mkdir(evidence, { recursive: true });
const results = [];
for (const engine of (process.env.PIXIEED_BROWSER_ENGINES || 'chromium').split(',')) {
  const browser = await engines[engine].launch({ headless: true, timeout: 15_000, ...(engine === 'webkit' && process.env.PIXIEED_WEBKIT_EXECUTABLE ? { executablePath: process.env.PIXIEED_WEBKIT_EXECUTABLE } : {}) });
  try {
    for (const width of [320, 390, 1280]) {
      const ctx = await browser.newContext({ viewport: { width, height: 900 }, serviceWorkers: 'block' });
      let externalAttempts = 0;
      await ctx.route('**/*', route => {
        const url = new URL(route.request().url());
        if (url.origin !== new URL(base).origin || !['GET', 'HEAD'].includes(route.request().method())) { externalAttempts++; return route.abort(); }
        if (url.pathname === '/events/') return route.fulfill({ contentType: 'text/html', body: html });
        return route.continue();
      });
      const page = await ctx.newPage();
      const errors = []; page.on('pageerror', error => errors.push(error.message));
      await page.goto(`${base}/events/`);
      await page.waitForSelector('.event-status-nav');
      assert.equal(await page.locator('[data-event-card]').count(), catalog.events.length);
      const near = catalog.events.filter(event => /data-status="(?:active|upcoming)"/.test(html.match(new RegExp(`<li class="event-card" id="${event.id}"[^>]*>`))?.[0] || '')).length;
      assert.equal(await page.locator('[data-event-card]:visible').count(), near);
      const visibleYears = await page.locator('[data-event-year-section]:visible').evaluateAll(nodes => nodes.map(node => node.dataset.eventYearSection));
      assert.deepEqual(visibleYears, [...visibleYears].sort(), 'nearby editions start with the current year before later years');
      assert.equal(await page.locator('.px-site-header').evaluate(n => Math.round(n.getBoundingClientRect().height)), 64);
      assert.equal(await page.locator('[data-menu-link]').count(), 24);
      if (evidence && width !== 320) await page.screenshot({ path: join(evidence, `${engine}-${width}-top.png`) });
      await page.locator('[data-event-status="all"]').click();
      assert.equal(await page.locator('[data-event-card]:visible').count(), catalog.events.length);
      for (const scale of [1, 2]) {
        await page.addStyleTag({ content: `html { font-size: ${scale * 100}% !important; }` });
        const metrics = await page.evaluate(() => {
          const bad = [];
          for (const card of document.querySelectorAll('[data-event-card]:not([hidden])')) {
            const box = card.getBoundingClientRect();
            for (const item of card.querySelectorAll('a, strong, span')) {
              const r = item.getBoundingClientRect();
              if (r.width && (r.bottom > box.bottom + 1 || r.right > box.right + 1 || r.left < box.left - 1)) bad.push(card.id);
            }
          }
          return { overflow: document.documentElement.scrollWidth > innerWidth + 1, bad,
            targets: [...document.querySelectorAll('.event-status-nav button, .event-card-source a')].filter(n => n.getBoundingClientRect().width).every(n => n.getBoundingClientRect().height >= 44) };
        });
        assert.equal(metrics.overflow, false, `${engine} ${width}px ${scale * 100}% overflow`);
        assert.deepEqual(metrics.bad, [], `${engine} ${width}px ${scale * 100}% card containment`);
        assert.equal(metrics.targets, true);
      }
      await page.addStyleTag({ content: 'html { font-size: 100% !important; }' });
      await page.locator('[data-event-status="ended"]').focus();
      await page.keyboard.press('Enter');
      assert.equal(await page.locator('[data-event-status="ended"]').getAttribute('aria-pressed'), 'true');
      assert.equal(await page.locator('[data-event-card]:visible:not([data-status="ended"])').count(), 0);
      await page.locator('[data-event-query]').fill('no-matching-event-UI-検証');
      assert.equal(await page.locator('[data-event-card]:visible').count(), 0);
      assert.equal(await page.locator('.event-empty').isVisible(), true);
      await page.locator('.event-empty button').click();
      await page.waitForFunction(() => document.querySelector('[data-event-status="all"]').getAttribute('aria-pressed') === 'true');
      assert.equal(await page.locator('[data-event-card]:visible').count(), catalog.events.length);
      const firstTitle = await page.locator('.event-card strong').first().textContent();
      await page.locator('[data-event-query]').fill(firstTitle);
      assert.ok(await page.locator('[data-event-card]:visible').count() >= 1);
      await page.locator('button[type="reset"]').click();
      await page.locator('.event-extra-filters summary').click();
      await page.locator('[data-event-format-filter]').selectOption('online');
      assert.equal(await page.locator('[data-event-card]:visible:not([data-format="online"])').count(), 0);
      const targetId = await page.locator('[data-event-card][data-status="ended"]').first().getAttribute('id');
      await page.evaluate(id => { location.hash = id; }, targetId);
      await page.waitForFunction(id => !document.getElementById(id).hidden, targetId);
      assert.ok(await page.locator(`#${targetId}`).evaluate(n => n.getBoundingClientRect().top >= 64), 'hash target clears the shared header');
      await page.locator(`#${targetId} strong`).evaluate(n => { n.textContent = 'とても長いイベントタイトルと会場名の折返し確認'.repeat(12); });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
      if (evidence) await page.screenshot({ path: join(evidence, `${engine}-${width}-cards.png`) });
      assert.deepEqual(errors, []);
      assert.equal(externalAttempts, 0, 'preview made no external requests');
      results.push({ engine, width, scales: [100, 200], records: catalog.events.length, near, externalAttempts, passed: true });
      await ctx.close();
    }
    const noJs = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 320, height: 800 }, serviceWorkers: 'block' });
    await noJs.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.origin !== new URL(base).origin) return route.abort();
      if (url.pathname === '/events/') return route.fulfill({ contentType: 'text/html', body: html });
      return route.continue();
    });
    const page = await noJs.newPage(); await page.goto(`${base}/events/`);
    assert.equal(await page.locator('[data-event-card]:visible').count(), catalog.events.length);
    assert.equal(await page.locator('[rel="canonical"]').getAttribute('href'), 'https://pixieed.jp/events/');
    await noJs.close();
  } finally { await browser.close(); }
}
if (evidence) await writeFile(join(evidence, 'results.json'), JSON.stringify(results, null, 2));
console.log(JSON.stringify(results, null, 2));
