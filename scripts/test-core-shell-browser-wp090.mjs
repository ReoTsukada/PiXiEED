import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const requireFromScreenshots = createRequire(new URL('../tools/screenshots/package.json', import.meta.url));
const { chromium } = requireFromScreenshots('playwright');
const browser = await chromium.launch({ headless: true });
const url = 'http://127.0.0.1:8000/core-shell/';

try {
  for (const [width, height, mobile] of [[390, 844, true], [540, 900, true], [900, 900, false], [1440, 900, false]]) {
    const page = await browser.newPage({ viewport: { width, height } });
    const requests = [];
    page.on('request', (request) => requests.push(request.url()));
    await page.goto(url, { waitUntil: 'networkidle', timeout: 20000 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const initial = await page.evaluate(() => ({
      landmarks: {
        header: document.querySelectorAll('header').length,
        nav: document.querySelectorAll('nav').length,
        main: document.querySelectorAll('main').length,
        aside: document.querySelectorAll('aside').length,
      },
      duplicateIds: [...document.querySelectorAll('[id]')].map((element) => element.id).filter((id, index, ids) => ids.indexOf(id) !== index),
      hiddenFocused: [...document.querySelectorAll('[hidden]')].some((element) => element.contains(document.activeElement)),
      overflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      reducedMotion: getComputedStyle(document.querySelector('.button')).transitionDuration,
      routeChunks: performance.getEntriesByType('resource').map((entry) => entry.name).filter((name) => /routes\//.test(name)),
    }));
    assert.deepEqual(initial.landmarks, { header: 1, nav: 1, main: 1, aside: 2 });
    assert.deepEqual(initial.duplicateIds, []);
    assert.equal(initial.hiddenFocused, false);
    assert.equal(initial.overflowX, false, `${width}x${height} no horizontal overflow`);
    assert.equal(initial.routeChunks.length, 0);
    assert.match(initial.reducedMotion, /0\.001ms|0s|1e-06s/);

    const skip = page.getByRole('link', { name: 'メインコンテンツへ移動' });
    await skip.focus();
    await skip.press('Enter');
    assert.equal(await page.evaluate(() => document.activeElement?.id), 'coreShellMain');

    await page.getByRole('button', { name: 'Projects', exact: true }).first().click();
    assert.equal(await page.evaluate(() => document.activeElement?.id), 'route-projects-heading');
    await page.getByRole('button', { name: 'ホーム', exact: true }).first().click();
    assert.equal(await page.evaluate(() => document.activeElement?.id), 'route-home-heading');

    const overviewTab = page.getByRole('tab', { name: 'Overview' });
    await overviewTab.focus();
    await overviewTab.press('ArrowRight');
    assert.equal(await page.getByRole('tab', { name: 'States' }).getAttribute('aria-selected'), 'true');
    assert.equal(await page.evaluate(() => document.activeElement?.dataset.tab), 'states');
    await page.getByRole('tab', { name: 'States' }).press('End');
    assert.equal(await page.evaluate(() => document.activeElement?.dataset.tab), 'contracts');
    await page.getByRole('tab', { name: 'Contracts' }).press('Home');
    assert.equal(await page.evaluate(() => document.activeElement?.dataset.tab), 'overview');

    await page.getByRole('button', { name: 'Themeを変更' }).click();
    assert.equal(await page.getByRole('menu', { name: 'Themeメニュー' }).isVisible(), true);
    assert.equal(await page.evaluate(() => document.activeElement?.textContent.trim()), 'Light');
    await page.getByRole('menuitem', { name: 'Light' }).press('ArrowDown');
    assert.equal(await page.evaluate(() => document.activeElement?.textContent.trim()), 'Dark');
    await page.getByRole('menuitem', { name: 'Dark' }).press('Escape');
    assert.equal(await page.locator('#themeMenu').getAttribute('hidden'), '');

    const openDialog = page.getByRole('button', { name: 'Shellの境界を見る' });
    await openDialog.click();
    assert.equal(await page.getByRole('dialog').count(), 1);
    assert.equal(await page.locator('.core-shell').getAttribute('aria-hidden'), 'true');
    assert.equal(await page.locator('.core-shell').getAttribute('inert'), '');
    await page.getByRole('button', { name: 'Dialogを閉じる' }).press('Tab');
    assert.equal(await page.evaluate(() => document.querySelector('.dialog-backdrop:not([hidden])')?.contains(document.activeElement)), true);
    await page.getByRole('button', { name: 'Dialogを閉じる' }).press('Escape');
    assert.equal(await page.getByRole('dialog').count(), 0);
    assert.equal(await page.evaluate(() => document.activeElement?.id), openDialog.getAttribute ? await openDialog.getAttribute('id') : null);
    assert.equal(await page.locator('.core-shell').getAttribute('aria-hidden'), null);

    await page.getByRole('button', { name: '通知を開く' }).click();
    assert.equal(await page.getByRole('dialog', { name: '通知' }).count(), 1);
    assert.equal(await page.getByRole('dialog', { name: '通知' }).locator('.state--unavailable').count(), 1);
    await page.getByRole('button', { name: '通知Sheetを閉じる' }).click();
    assert.equal(await page.getByRole('dialog', { name: '通知' }).count(), 0);

    const asyncResult = await page.evaluate(() => ({
      transition: window.__PIXIEED_CORE_SHELL__.setAsyncState('loading'),
      state: window.__PIXIEED_CORE_SHELL__.getAsyncState(),
      preview: window.__PIXIEED_CORE_SHELL__.setPreviewState('offline'),
      active: document.activeElement?.id,
    }));
    assert.equal(asyncResult.transition.ok, true);
    assert.equal(asyncResult.state, 'loading');
    assert.equal(asyncResult.preview, true);
    assert.equal(asyncResult.active, 'route-async-state-heading');
    await page.getByRole('button', { name: 'Homeへ戻る' }).click();

    const privacy = await page.evaluate(() => ({
      telemetry: window.__PIXIEED_CORE_SHELL__.getTelemetry(),
      shortcuts: window.__PIXIEED_CORE_SHELL__.getShortcuts(),
      pointerOwnership: window.__PIXIEED_CORE_SHELL__.getPointerOwnership(),
      canonical: getComputedStyle(document.documentElement).getPropertyValue('--color-pixel-canonical').trim(),
      textScalingOverflowBefore: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    }));
    assert.deepEqual(privacy.pointerOwnership, []);
    assert.equal(privacy.telemetry.some((event) => /jwt|email|project|commission|secret/i.test(JSON.stringify(event))), false);
    assert.equal(privacy.shortcuts[0].remappable, true);
    assert.equal(privacy.textScalingOverflowBefore, false);

    await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth), false, `${width}x${height} 200% text scaling no overflow`);
    await page.evaluate(() => { document.documentElement.style.fontSize = ''; });

    if (mobile) {
      await page.getByRole('button', { name: 'サイドナビゲーションを開閉' }).click();
      assert.equal(await page.locator('.core-shell__sidebar').isVisible(), true);
      await page.getByRole('button', { name: 'サイドナビゲーションを開閉' }).click();
      assert.equal(await page.locator('.core-shell__sidebar').isVisible(), false);
      assert.equal(await page.locator('.core-shell__mobile-nav').isVisible(), true);
    }
    await page.close();
    console.log(`WP-090 browser ${width}x${height}: skip/focus/roving tabs/menu/dialog-sheet/async/privacy/reduced-motion/text-scaling checks passed; route chunks requested=0`);
  }
} finally {
  await browser.close();
}
