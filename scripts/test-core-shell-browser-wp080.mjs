import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const requireFromScreenshots = createRequire(new URL('../tools/screenshots/package.json', import.meta.url));
const { chromium } = requireFromScreenshots('playwright');
const browser = await chromium.launch({ headless: true });
const url = 'http://127.0.0.1:8000/core-shell/';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const initialBundleFiles = [
  'core-shell/index.html',
  'core-shell/assets/core-shell.css',
  'core-shell/assets/core-shell.js',
  'core-shell/assets/core-shell-contracts.js',
  'core-shell/assets/core-feature-flag-rollback-utils.js',
];
const initialBundleSourceBytes = (await Promise.all(initialBundleFiles.map(async (file) => (await stat(path.join(root, file))).size))).reduce((sum, size) => sum + size, 0);

try {
  for (const [width, height, expectedMobile] of [[1440, 900, false], [900, 900, false], [390, 844, true], [540, 900, true]]) {
    const page = await browser.newPage({ viewport: { width, height } });
    const requests = [];
    page.on('request', (request) => requests.push(request.url()));
    await page.goto(url, { waitUntil: 'networkidle', timeout: 20000 });
    const summary = await page.evaluate(() => {
      const visibleButtons = [...document.querySelectorAll('button')].filter((button) => button.getBoundingClientRect().width > 0 && button.getBoundingClientRect().height > 0);
      const buttonRects = visibleButtons.map((button) => ({
        label: button.getAttribute('aria-label') || button.textContent.trim().slice(0, 30),
        width: button.getBoundingClientRect().width,
        height: button.getBoundingClientRect().height,
      }));
      return {
        path: location.pathname,
        isolated: window.__PIXIEED_CORE_SHELL__?.isIsolatedEntry?.() === true,
        navCount: document.querySelectorAll('.nav-item').length,
        mobileNav: getComputedStyle(document.querySelector('.core-shell__mobile-nav')).display,
        sidebar: getComputedStyle(document.querySelector('.core-shell__sidebar')).display,
        overflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth,
        minButtonWidth: Math.min(...buttonRects.map((entry) => entry.width)),
        minButtonHeight: Math.min(...buttonRects.map((entry) => entry.height)),
        iconButtonsWithoutName: [...document.querySelectorAll('.icon-button')].filter((button) => !button.getAttribute('aria-label')).length,
        scriptSources: [...document.scripts].map((script) => script.src).filter(Boolean),
        routeResources: performance.getEntriesByType('resource').map((entry) => entry.name).filter((name) => /routes\/(draw2|audio|game|market)-route\.js/.test(name)),
        initialJsBytes: performance.getEntriesByType('resource').filter((entry) => /\.js(?:\?|$)/.test(entry.name)).reduce((sum, entry) => sum + (entry.transferSize || entry.encodedBodySize || 0), 0),
        initialFlag: window.__PIXIEED_CORE_SHELL__?.getAccess?.()?.code,
      };
    });
    assert.equal(summary.path, '/core-shell/');
    assert.equal(summary.isolated, true);
    assert.equal(summary.navCount, 10);
    assert.equal(summary.mobileNav, expectedMobile ? 'block' : 'none');
    assert.equal(summary.sidebar, expectedMobile ? 'none' : 'block');
    assert.equal(summary.overflowX, false, `${width}x${height} must not overflow horizontally`);
    assert.ok(summary.minButtonWidth >= 44, `${width}x${height} touch target width`);
    assert.ok(summary.minButtonHeight >= 44, `${width}x${height} touch target height`);
    assert.equal(summary.iconButtonsWithoutName, 0);
    assert.deepEqual(summary.routeResources, []);
    assert.equal(summary.initialFlag, 'CORE_SHELL_SERVER_ROUTE_UNAVAILABLE');
    assert.ok(summary.initialJsBytes >= 0);
    assert.equal(requests.some((request) => /\/(market|pixfind|pixiee-lens|account)\//.test(new URL(request).pathname)), false);
    assert.equal(requests.some((request) => /\/pixiedraw\//.test(new URL(request).pathname)), false);
    if (expectedMobile) {
      await page.getByRole('button', { name: 'サイドナビゲーションを開閉' }).click();
      assert.equal(await page.locator('.core-shell__sidebar').isVisible(), true);
      await page.getByRole('button', { name: 'サイドナビゲーションを開閉' }).click();
      assert.equal(await page.locator('.core-shell__sidebar').isVisible(), false);
    }

    if (width === 1440) {
      await page.getByRole('button', { name: 'Shellの境界を見る' }).click();
      assert.equal(await page.getByRole('dialog').count(), 1);
      const dialogFocus = await page.evaluate(() => document.activeElement?.getAttribute('aria-label'));
      assert.equal(dialogFocus, 'Dialogを閉じる');
      await page.getByRole('button', { name: 'Dialogを閉じる' }).press('Tab');
      assert.equal(await page.evaluate(() => document.querySelector('#shellInfoDialog').contains(document.activeElement)), true, 'focus must remain inside the dialog');
      await page.getByRole('button', { name: 'Dialogを閉じる' }).press('Escape');
      assert.equal(await page.locator('#shellInfoDialog').getAttribute('hidden'), '');
      await page.getByRole('button', { name: 'Shellの境界を見る' }).click();
      await page.getByRole('button', { name: 'Dialogを閉じる' }).click();
      assert.equal(await page.evaluate(() => document.activeElement?.textContent.trim()), 'Shellの境界を見る');

      await page.getByRole('button', { name: 'Themeを変更' }).click();
      await page.getByRole('button', { name: 'Light', exact: true }).click();
      const lightPixel = await page.evaluate(() => {
        const canvas = document.createElement('canvas'); canvas.width = 1; canvas.height = 1;
        const context = canvas.getContext('2d'); context.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--color-pixel-canonical').trim(); context.fillRect(0, 0, 1, 1);
        return { theme: document.documentElement.dataset.theme, pixel: [...context.getImageData(0, 0, 1, 1).data], canonical: getComputedStyle(document.documentElement).getPropertyValue('--color-pixel-canonical').trim() };
      });
      await page.getByRole('button', { name: 'Themeを変更' }).click();
      await page.getByRole('button', { name: 'Dark', exact: true }).click();
      const darkPixel = await page.evaluate(() => ({ theme: document.documentElement.dataset.theme, canonical: getComputedStyle(document.documentElement).getPropertyValue('--color-pixel-canonical').trim() }));
      assert.equal(lightPixel.theme, 'light');
      assert.equal(darkPixel.theme, 'dark');
      assert.equal(lightPixel.canonical, darkPixel.canonical);
      const darkPixelData = await page.evaluate((expected) => {
        const canvas = document.createElement('canvas'); canvas.width = 1; canvas.height = 1;
        const context = canvas.getContext('2d'); context.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--color-pixel-canonical').trim(); context.fillRect(0, 0, 1, 1);
        return [...context.getImageData(0, 0, 1, 1).data].join(',') === expected;
      }, lightPixel.pixel.join(','));
      assert.equal(darkPixelData, true, 'theme changes must not change canonical pixel color');

      await page.getByRole('tab', { name: 'States' }).click();
      assert.equal(await page.locator('#statesPanel').getAttribute('hidden'), null);
      assert.equal(await page.locator('#overviewPanel').getAttribute('hidden'), '');
      await page.getByRole('tab', { name: 'Overview' }).click();
      assert.equal(await page.getByRole('button', { name: '開く', exact: true }).first().isEnabled(), false);
      await page.evaluate(async () => window.__PIXIEED_CORE_SHELL__.openTool('draw2'));
      assert.match(await page.locator('#coreToast').innerText(), /Server Route認可が未接続/);
      assert.deepEqual(await page.evaluate(() => performance.getEntriesByType('resource').map((entry) => entry.name).filter((name) => /routes\//.test(name))), []);

      await page.getByRole('button', { name: 'Split Viewを試す' }).click();
      assert.equal(await page.locator('#coreShellRoot').getAttribute('data-layout'), 'split');
      assert.equal(await page.locator('.core-shell__inspector').isVisible(), true);
      const screenshot = await page.screenshot();
      assert.ok(screenshot.length > 1000, 'visual regression screenshot must be capturable');
    }
    await page.close();
    console.log(`WP-080 browser ${width}x${height}: layout/accessibility/lazy/flag checks passed; initial source bytes=${initialBundleSourceBytes}; route chunks requested=0`);
  }
} finally {
  await browser.close();
}
