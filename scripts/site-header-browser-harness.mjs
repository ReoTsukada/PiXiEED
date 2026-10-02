#!/usr/bin/env node
/** Local UI checks only; external ads, analytics and accounts are never contacted. */
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';

const base = process.env.PIXIEED_BROWSER_BASE_URL || 'http://127.0.0.1:4180';
const origin = new URL(base).origin;
assert.ok(['127.0.0.1', 'localhost'].includes(new URL(base).hostname));
const modulePath = process.env.PIXIEED_PLAYWRIGHT_MODULE || '/Users/tsukadareine/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const { chromium } = await import(pathToFileURL(modulePath).href);
const browser = await chromium.launch({ headless: true });
const paths = ['/', '/tools/', '/draw/', '/audio/', '/jigsaw/', '/spot-difference/', '/hidden-object/', '/play/spot-difference/', '/play/hidden-object/', '/pixel-camera.html', '/globe/', '/globe-prototype.html', '/telescope/', '/about/', '/guide/', '/privacy/', '/profile/', '/stores/', '/stores/ecowashcafe-nakanoshima.html'];
let checks = 0;
try {
  for (const viewport of [{ width: 320, height: 568 }, { width: 390, height: 844 }, { width: 844, height: 390 }, { width: 1280, height: 800 }]) {
    const context = await browser.newContext({ viewport });
    await context.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    for (const path of paths) {
      errors.length = 0;
      const label = `${path} ${viewport.width}x${viewport.height}`;
      console.log(`Checking ${label}`);
      await page.goto(base + path, { waitUntil: 'domcontentloaded' });
      const toggle = page.locator('[data-menu-toggle]');
      await toggle.waitFor({ state: 'visible' });
      // Allow the ordinary-page shell to finish without testing only the first paint.
      await page.waitForTimeout(600);
      await page.evaluate(() => document.querySelectorAll('dialog[open]').forEach(dialog => dialog.close()));
      assert.equal(await toggle.count(), 1, `${label}: single hamburger`);
      assert.equal(await page.locator('[data-site-menu]').count(), 1, `${label}: single menu`);
      const layout = await page.evaluate(() => {
        const toggle = document.querySelector('[data-menu-toggle]');
        const rect = toggle.getBoundingClientRect();
        const brand = document.querySelector('.px-header-brand').getBoundingClientRect();
        const header = toggle.closest('.px-site-header');
        const controls = [...header.querySelectorAll('button,a')].filter(node => node !== toggle).map(node => node.getBoundingClientRect()).filter(r => r.width && r.height);
        const overlaps = controls.some(r => r.left < rect.right - 1 && r.right > rect.left + 1 && r.top < rect.bottom - 1 && r.bottom > rect.top + 1);
        const centre = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
        return { width: rect.width, height: rect.height, top: rect.top, right: rect.right, overlaps, brandRight: brand.right,
          reachable: centre === toggle || toggle.contains(centre), overflow: document.documentElement.scrollWidth > innerWidth + 1 };
      });
      assert.ok(layout.width >= 44 && layout.height >= 44, `${label}: finger target ${JSON.stringify(layout)}`);
      assert.ok(layout.top >= 0 && layout.right <= viewport.width + 1, `${label}: header fit`);
      assert.equal(layout.overlaps, false, `${label}: separate header controls`);
      assert.equal(layout.reachable, true, `${label}: hamburger reachable`);
      assert.equal(layout.overflow, false, `${label}: no horizontal overflow`);
      const tabsBefore = await page.locator('.app-tabs').evaluateAll(nodes => nodes.map(n => n.innerHTML));
      await toggle.click();
      await page.locator('[data-site-menu]').waitFor({ state: 'visible' });
      assert.equal(await toggle.getAttribute('aria-expanded'), 'true');
      await page.waitForFunction(() => document.activeElement?.matches('[data-menu-close]'));
      const menuControls = page.locator('[data-site-menu] a[href],[data-site-menu] button:not(:disabled)');
      await menuControls.last().focus();
      await page.keyboard.press('Tab');
      assert.equal(await menuControls.first().evaluate(node => node === document.activeElement), true, `${label}: forward focus stays in menu`);
      await page.keyboard.press('Shift+Tab');
      assert.equal(await menuControls.last().evaluate(node => node === document.activeElement), true, `${label}: backward focus stays in menu`);
      await page.locator('[data-menu-setting="display"]').click();
      await page.locator('[data-site-settings][open]').waitFor();
      const motion = page.locator('[data-setting-motion]');
      await motion.check();
      assert.equal(await page.evaluate(() => document.documentElement.dataset.pixieedMotion), 'reduced', `${label}: tool settings work`);
      await motion.uncheck();
      await page.locator('[data-settings-close]').last().click();
      await page.waitForFunction(() => document.activeElement?.matches('[data-menu-toggle]'));
      assert.equal(await toggle.evaluate(node => node === document.activeElement), true, `${label}: settings restore header focus`);
      await toggle.click();
      await page.locator('[data-menu-setting="privacy"]').click();
      await page.locator('[data-site-settings][open] [data-settings-panel="privacy"]').waitFor();
      await page.locator('[data-setting-analytics]').uncheck();
      await page.locator('[data-settings-close]').last().click();
      await toggle.click();
      await page.keyboard.press('Escape');
      assert.equal(await toggle.getAttribute('aria-expanded'), 'false');
      assert.equal(await toggle.evaluate(node => node === document.activeElement), true, `${label}: focus returns`);
      assert.deepEqual(await page.locator('.app-tabs').evaluateAll(nodes => nodes.map(n => n.innerHTML)), tabsBefore, `${label}: centre action preserved`);
      assert.deepEqual(errors, [], `${label}: no application exceptions`);
      if (path === '/globe/') {
        await page.waitForFunction(() => document.querySelector('iframe')?.contentDocument?.readyState === 'complete');
        assert.equal(await page.locator('iframe').first().contentFrame().locator('[data-menu-toggle]').count(), 0, 'iframe uses parent menu');
      }
      checks++;
    }
    await context.close();
  }
  console.log(`Chromium: ${checks}/${checks} header routes PASS; external requests blocked; production and physical devices UNTESTED`);
} finally { await browser.close(); }
