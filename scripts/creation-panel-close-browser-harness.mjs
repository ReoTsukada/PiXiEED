#!/usr/bin/env node
/** Verify sticky dismiss controls against the real local Draw DOM and CSS. */
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
const base = process.env.PIXIEED_BROWSER_BASE_URL || 'http://127.0.0.1:4182';
const origin = new URL(base).origin;
assert.ok(['localhost', '127.0.0.1'].includes(new URL(base).hostname), 'Use a local read-only server');
const runtime = process.env.PIXIEED_PLAYWRIGHT_MODULE || '/Users/tsukadareine/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const { chromium } = await import(pathToFileURL(runtime).href);
const browser = await chromium.launch({ headless: true });
const viewports = [
  { name: '320x568', width: 320, height: 568 },
  { name: '390x844', width: 390, height: 844 },
  { name: '844x390', width: 844, height: 390 },
  { name: '1280x800', width: 1280, height: 800 },
];
let checks = 0;
function ok(value, message) { checks += 1; assert.ok(value, message); }
async function viewportScrollTargets(page, hostSelector, targetSelector, label, { minHeight = 44, requireClick = false } = {}) {
  const snapshots = [];
  for (const position of ['top', 'middle', 'bottom']) {
    const metrics = await page.evaluate(({ hostSelector, targetSelector, position }) => {
      const host = document.querySelector(hostSelector), target = document.querySelector(targetSelector);
      if (!host || !target) return { missing: true, host: Boolean(host), target: Boolean(target) };
      const max = Math.max(0, host.scrollHeight - host.clientHeight);
      host.scrollTop = position === 'top' ? 0 : position === 'middle' ? Math.round(max / 2) : max;
      const r = target.getBoundingClientRect();
      const left = r.left, right = r.right;
      const top = r.top, bottom = r.bottom;
      const x = (left + right) / 2, y = (top + bottom) / 2;
      const hit = right > left && bottom > top ? document.elementFromPoint(x, y) : null;
      return { max, scrollTop: host.scrollTop, rect: { x: r.x, y: r.y, width: r.width, height: r.height },
        visible: left >= 0 && right <= innerWidth && top >= 0 && bottom <= innerHeight, hit: Boolean(hit && (hit === target || target.contains(hit))),
        hitTag: hit?.tagName || null, hitId: hit?.id || null };
    }, { hostSelector, targetSelector, position });
    ok(!metrics.missing, `${label} ${position}: missing host/target ${JSON.stringify(metrics)}`);
    ok(metrics.visible, `${label} ${position}: target is outside viewport ${JSON.stringify(metrics)}`);
    ok(metrics.rect.width >= minHeight && metrics.rect.height >= minHeight, `${label} ${position}: target under ${minHeight}px ${JSON.stringify(metrics)}`);
    if (requireClick) ok(metrics.hit, `${label} ${position}: elementFromPoint misses target ${JSON.stringify(metrics)}`);
    snapshots.push({ position, ...metrics });
  }
  return snapshots;
}
async function realTap(page, selector, label) {
  const point = await page.locator(selector).evaluate(target => {
    const r = target.getBoundingClientRect();
    const x = Math.max(0, Math.min(innerWidth - 1, r.left + r.width / 2));
    const y = Math.max(0, Math.min(innerHeight - 1, r.top + r.height / 2));
    const hit = document.elementFromPoint(x, y);
    return { x, y, hit: Boolean(hit && (hit === target || target.contains(hit))), width: r.width, height: r.height };
  });
  ok(point.hit && point.width >= 44 && point.height >= 44, `${label}: not hit-testable ${JSON.stringify(point)}`);
  await page.mouse.click(point.x, point.y);
}
try {
  for (const viewport of viewports) {
    const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height }, deviceScaleFactor: 1, hasTouch: viewport.width < 600, isMobile: viewport.width < 600 });
    await context.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`${base}/draw/`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#draw-canvas');
    await page.waitForFunction(() => { const main = document.querySelector('main'); return main && !main.inert; }, null, { timeout: 15000 });

    // Color editor uses the real module markup; add only local synthetic height.
    await page.locator('.draw-current').click();
    await page.waitForFunction(() => { const panel = document.querySelector('#draw-color-editor'); return panel && !panel.hidden; });
    await page.evaluate(() => {
      const content = document.querySelector('#draw-color-editor .dce-content');
      const tall = document.createElement('div'); tall.dataset.harnessTallContent = '';
      tall.style.cssText = 'height:1200px;min-height:1200px;background:linear-gradient(#263642,#15202b)';
      content.append(tall);
    });
    const color = await page.evaluate(() => {
      const panel = document.querySelector('#draw-color-editor');
      const host = panel.querySelector('.dce-content');
      const header = panel.querySelector('.dce-header');
      return { host: { scrollHeight: host.scrollHeight, clientHeight: host.clientHeight }, header: header.getBoundingClientRect().toJSON(), panel: panel.getBoundingClientRect().toJSON() };
    });
    ok(color.host.scrollHeight > color.host.clientHeight, `${viewport.name}: color content is not scrollable ${JSON.stringify(color)}`);
    await viewportScrollTargets(page, '#draw-color-editor .dce-content', '#draw-color-editor .dce-actions #dce-done', `${viewport.name} color done`, { requireClick: true });
    await viewportScrollTargets(page, '#draw-color-editor .dce-content', '#draw-color-editor .dce-header', `${viewport.name} color heading`, { minHeight: 36 });
    await realTap(page, '#draw-color-editor #dce-done', `${viewport.name} color done`);
    ok(await page.locator('#draw-color-editor').evaluate(el => el.hidden), `${viewport.name}: color done did not close panel`);

    // The animation layer panel and button are produced by the live editor module.
    const layerToggle = page.locator('#draw-animation-controls [data-action="toggle-frames"]');
    if (await layerToggle.count()) {
      await layerToggle.first().click();
      const layerPanel = page.locator('#draw-animation-controls-panel');
      await layerPanel.waitFor({ state: 'visible' });
      await page.evaluate(() => {
        const list = document.querySelector('#draw-animation-controls-panel .animation-controls__frames');
        list.classList.add('is-cel-grid');
        list.style.cssText += ';display:grid;grid-template-columns:72px;grid-auto-rows:56px;height:120px;max-height:120px;overflow:auto';
        for (let i = 0; i < 36; i += 1) { const row = document.createElement('div'); row.className = 'animation-controls__frame'; row.textContent = `fixture ${i}`; list.append(row); }
      });
      const layerMetrics = await viewportScrollTargets(page, '#draw-animation-controls-panel .animation-controls__frames', '#draw-animation-controls-panel [data-action="close-animation"]', `${viewport.name} layers close`, { requireClick: true });
      ok(layerMetrics.at(-1).max > 0, `${viewport.name}: layer fixture did not create a scroll range`);
      await realTap(page, '#draw-animation-controls-panel [data-action="close-animation"]', `${viewport.name} layers close`);
      ok(await layerPanel.evaluate(el => el.hidden), `${viewport.name}: layer close did not hide panel`);
    } else {
      console.log(`${viewport.name}: UNTESTED animation layers (toggle absent)`);
    }

    // Exercise the native dialog's real CSS and cancel callback without touching project data.
    await page.evaluate(async () => {
      const { confirmPxdConversion } = await import('/js/creation/pxd-ui.mjs');
      const rgba = new Uint8Array(16 * 16 * 4); rgba.fill(255);
      window.__closeDialogResult = confirmPxdConversion({ image: { width: 16, height: 16, rgba }, document: { width: 16, height: 16, rgba } });
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const comparison = document.querySelector('.pxd-conversion .pxd-comparison');
      const tall = document.createElement('div'); tall.dataset.harnessTallContent = '';
      tall.style.cssText = `grid-column:1/-1;height:${innerHeight * 2}px;background:#e7e9e5`; comparison.append(tall);
    });
    const dialogHost = await page.locator('.pxd-conversion').evaluate(el => ({ height: el.clientHeight, open: el.open, scrollHeight: el.scrollHeight, overflow: getComputedStyle(el).overflow }));
    const pxdContent = await page.locator('.pxd-conversion .pxd-comparison').evaluate(el => ({ scrollHeight: el.scrollHeight, clientHeight: el.clientHeight }));
    ok(dialogHost.open && pxdContent.scrollHeight > pxdContent.clientHeight && dialogHost.scrollHeight <= dialogHost.height + 1, `${viewport.name}: native conversion dialog/content scroll layout is invalid ${JSON.stringify({ dialogHost, pxdContent })}`);
    const pxdMetrics = await viewportScrollTargets(page, '.pxd-conversion .pxd-comparison', '#pxd-conversion-cancel', `${viewport.name} PXD cancel`, { requireClick: true });
    ok(pxdMetrics[0].visible, `${viewport.name}: PXD cancel must be visible at initial scroll top`);
    await realTap(page, '#pxd-conversion-cancel', `${viewport.name} PXD cancel`);
    const result = await page.evaluate(async () => await window.__closeDialogResult);
    ok(result === false, `${viewport.name}: PXD cancel changed result semantics`);
    ok(await page.locator('.pxd-conversion').count() === 0, `${viewport.name}: PXD dialog remained after cancel`);

    // Details launchers are tested against their own long scrollable fixed menus.
    for (const [detailsSelector, summarySelector, menuSelector, label] of [
      ['#draw-tool-picker', '#draw-tool-summary', '.draw-tool-menu', 'tool picker'],
      ['#draw-settings-picker', '#draw-settings-summary', '.draw-settings-panel', 'settings picker'],
    ]) {
      const details = page.locator(detailsSelector);
      if (!(await details.count())) { console.log(`${viewport.name}: UNTESTED ${label} (details absent)`); continue; }
      await page.locator(summarySelector).click();
      const menu = page.locator(menuSelector);
      await menu.waitFor({ state: 'visible' });
      await page.evaluate(({ menuSelector }) => {
        const menu = document.querySelector(menuSelector);
        for (let i = 0; i < 80; i += 1) { const row = document.createElement('div'); row.style.cssText = 'height:52px;min-height:52px'; row.textContent = `fixture ${i}`; menu.append(row); }
      }, { menuSelector });
      const menuHost = await page.locator(menuSelector).evaluate(el => el);
      const launcher = await page.locator(summarySelector).evaluate(el => { const r = el.getBoundingClientRect(); const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return { visible: r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight, hit: Boolean(hit && (hit === el || el.contains(hit))), width: r.width, height: r.height }; });
      ok(launcher.visible && launcher.hit && launcher.width >= 44 && launcher.height >= 44, `${viewport.name}: ${label} summary target unavailable ${JSON.stringify(launcher)}`);
      for (const position of ['top', 'middle', 'bottom']) {
        const geometry = await page.locator(menuSelector).evaluate((el, position) => {
          const max = Math.max(0, el.scrollHeight - el.clientHeight); el.scrollTop = position === 'top' ? 0 : position === 'middle' ? Math.round(max / 2) : max;
          return { max, scrollTop: el.scrollTop, height: el.clientHeight, scrollHeight: el.scrollHeight };
        }, position);
        ok(geometry.max > 0, `${viewport.name}: ${label} fixture not scrollable`);
        const launcherAtPosition = await page.locator(summarySelector).evaluate(el => { const r = el.getBoundingClientRect(); const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return { rect: r.toJSON(), visible: r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight, hit: Boolean(hit && (hit === el || el.contains(hit))) }; });
        ok(launcherAtPosition.visible && launcherAtPosition.hit, `${viewport.name}: ${label} summary inaccessible at ${position} ${JSON.stringify(launcherAtPosition)}`);
      }
      await realTap(page, summarySelector, `${viewport.name} ${label} summary`);
      ok(!(await details.evaluate(el => el.open)), `${viewport.name}: ${label} summary did not close details`);
    }
    // The Audio color editor shares the panel module but uses its fixed audio frame.
    await page.goto(`${base}/audio/`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#audio-current');
    await page.waitForFunction(() => { const main = document.querySelector('main'); return main && !main.inert; }, null, { timeout: 15000 });
    await page.locator('#audio-current').click();
    await page.waitForFunction(() => { const panel = document.querySelector('#audio-color-editor-panel'); return panel && !panel.hidden; });
    await page.evaluate(() => {
      const content = document.querySelector('#audio-color-editor-panel .dce-content');
      const tall = document.createElement('div'); tall.dataset.harnessTallContent = '';
      tall.style.cssText = 'height:1200px;min-height:1200px;background:linear-gradient(#263642,#15202b)';
      content.append(tall);
    });
    const audioColor = await viewportScrollTargets(page, '#audio-color-editor-panel .dce-content', '#audio-color-editor-panel #dce-done', `${viewport.name} audio color done`, { requireClick: true });
    ok(audioColor[0].visible, `${viewport.name}: Audio done missing at initial top`);
    await realTap(page, '#audio-color-editor-panel #dce-done', `${viewport.name} audio color done`);
    ok(await page.locator('#audio-color-editor-panel').evaluate(el => el.hidden), `${viewport.name}: Audio done did not close color editor`);

    ok(errors.length === 0, `${viewport.name}: browser errors ${JSON.stringify(errors)}`);
    console.log(`${viewport.name}: PASS`);
    await context.close();
  }
  console.log(`PASS: ${checks} close-control assertions across ${viewports.length} viewports`);
} finally {
  await browser.close();
}
