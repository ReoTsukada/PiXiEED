import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const base = process.env.PIXIEED_BROWSER_BASE_URL || 'http://127.0.0.1:4193';
assert.ok(['localhost', '127.0.0.1'].includes(new URL(base).hostname));
const { chromium } = await import(pathToFileURL(process.env.PIXIEED_PLAYWRIGHT_MODULE || '/Users/tsukadareine/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs').href);
const browser = await chromium.launch({ headless: true });
const results = [];
const output = '/tmp/pixieed-telescope-hidden';
await mkdir(output, { recursive: true });
try {
  for (const viewport of [{ width: 1280, height: 800 }, { width: 390, height: 844 }, { width: 320, height: 568 }]) {
    for (const path of ['/', '/tools/']) {
      const page = await browser.newPage({ viewport, reducedMotion: 'reduce' });
      await page.route('**/*', route => new URL(route.request().url()).origin === new URL(base).origin ? route.continue() : route.abort());
      await page.goto(base + path);
      await page.waitForTimeout(650);
      const telescope = page.locator('a[href="/telescope/"]');
      assert.equal(await telescope.count(), 1, 'retain reversible card markup');
      assert.equal(await telescope.isVisible(), false);
      assert.equal(await telescope.evaluate(el => el.getBoundingClientRect().width), 0);
      const grid = page.locator(path === '/' ? '#hpToys' : '.tool-grid').first();
      const layout = await grid.evaluate(el => {
        const cards = [...el.children].filter(card => !card.hidden);
        const widths = getComputedStyle(el).gridTemplateColumns.trim().split(/\s+/).length;
        const boxes = cards.map(card => ({ toy: card.dataset.toy, left: card.getBoundingClientRect().left, top: card.getBoundingClientRect().top, width: card.getBoundingClientRect().width }));
        return { boxes, columns: widths };
      });
      assert.ok(layout.boxes.length >= 5);
      assert.equal(layout.boxes.some(b => b.toy === 'telescope'), false);
      assert.ok(layout.boxes.some(b => b.toy === 'editor') && layout.boxes.some(b => b.toy === 'camera'));
      for (let i = 0; i < layout.boxes.length; i++) {
        assert.ok(layout.boxes[i].width > 40);
        if (i % layout.columns === 0) assert.ok(Math.abs(layout.boxes[i].left - layout.boxes[0].left) < 2, 'rows pack without a reserved gap');
      }
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      await page.locator('.site-header').first().scrollIntoViewIfNeeded();
      await page.keyboard.press('Tab');
      assert.notEqual(await page.evaluate(() => document.activeElement?.getAttribute('href')), '/telescope/');
      const menuButton = page.locator('.menu-toggle').first();
      assert.equal(await menuButton.count(), 1, 'header menu remains available');
      if (await menuButton.count()) {
        await menuButton.click();
        assert.equal(await page.locator('[data-site-menu] a[href="/telescope/"]:visible').count(), 0);
        await page.keyboard.press('Escape');
      }
      await grid.scrollIntoViewIfNeeded();
      await page.screenshot({ path: `${output}/${path === '/' ? 'home' : 'tools'}-${viewport.width}.png`, fullPage: true });
      results.push({ path, viewport, visibleCards: layout.boxes.map(b => b.toy), columns: layout.columns });
      await page.close();
    }
  }
  const source = await readFile(new URL('../telescope/index.html', import.meta.url), 'utf8');
  assert.match(source, /tool=telescope/);
  console.log(JSON.stringify({ passed: results.length, results, output, evidence: 'local Chromium; physical devices and production untested' }, null, 2));
} finally { await browser.close(); }
