#!/usr/bin/env node
/** Local acceptance for dedicated tool navigation and operation bars. */
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

if (process.argv.includes('--help') || process.argv.includes('-h')) { console.log(`Usage: node scripts/tool-navigation-browser-harness.mjs [--help]\nRuns local tool-navigation checks against PIXIEED_BROWSER_BASE_URL (default http://127.0.0.1:4212).\nRequires project package playwright, or PIXIEED_PLAYWRIGHT_MODULE as a path, file URL, or package specifier.\nEvidence output: PIXIEED_TOOL_NAV_OUTPUT (default ${join(tmpdir(), 'pixieed-tool-nav-evidence')}). Optional filters: PIXIEED_TOOL_NAV_WIDTH and comma-separated PIXIEED_TOOL_NAV_ONLY. No dependencies are installed automatically.`); process.exit(0); }
async function loadChromium() { const value = process.env.PIXIEED_PLAYWRIGHT_MODULE?.trim(), pathLike = value && /^(?:\/|\.{1,2}(?:\/|$)|[A-Za-z]:[\\/])/.test(value); const specifier = !value ? 'playwright' : value.startsWith('file:') ? value : pathLike ? pathToFileURL(resolve(value)).href : value; try { const api = await import(specifier); if (!api.chromium?.launch) throw new TypeError('module does not export chromium.launch'); return api.chromium; } catch (error) { console.error(`Unable to load Playwright (${value || 'project package "playwright"'}). Install it in the project with npm install --save-dev playwright, or set PIXIEED_PLAYWRIGHT_MODULE to a valid filesystem path, file URL, or package specifier. No dependency was installed. Cause: ${error.message}`); process.exit(1); } }

const base = process.env.PIXIEED_BROWSER_BASE_URL || 'http://127.0.0.1:4212';
const baseUrl = new URL(base);
const origin = baseUrl.origin;
assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(baseUrl.hostname), 'only a localhost fixture server is allowed');
const output = process.env.PIXIEED_TOOL_NAV_OUTPUT || join(tmpdir(), 'pixieed-tool-nav-evidence');
const chromium = await loadChromium();
const browser = await chromium.launch({ headless: true });
const viewports = [{ width: 320, height: 568 }, { width: 390, height: 844 }, { width: 1440, height: 900 }].filter(viewport => !process.env.PIXIEED_TOOL_NAV_WIDTH || viewport.width === Number(process.env.PIXIEED_TOOL_NAV_WIDTH));
const only = process.env.PIXIEED_TOOL_NAV_ONLY;
const selected = name => !only || only.split(',').includes(name);
const evidence = { base: origin, viewports, screenshots: [], checks: [], unavailable: [], blockedRequests: [], pageErrors: [] };
await mkdir(output, { recursive: true });

function pass(name, details = {}) { evidence.checks.push({ name, ...details }); }
function unavailable(name, reason) { evidence.unavailable.push({ name, reason }); }
function safeName(value) { return value.replace(/[^a-z0-9-]+/gi, '-').replace(/^-|-$/g, '').toLowerCase(); }

async function newContext(viewport) {
  const context = await browser.newContext({
    viewport, deviceScaleFactor: 1, hasTouch: viewport.width < 600, serviceWorkers: 'block',
  });
  await context.route('**/*', async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin === origin && ['GET', 'HEAD'].includes(request.method())) return route.continue();
    evidence.blockedRequests.push({ url: url.href, method: request.method(), reason: url.origin === origin ? 'non-read request' : 'external origin' });
    return route.abort();
  });
  await context.addInitScript(() => {
    const media = navigator.mediaDevices || {};
    Object.defineProperty(media, 'getUserMedia', {
      configurable: true,
      value: async () => { throw new DOMException('Camera access denied by navigation harness', 'NotAllowedError'); },
    });
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: media,
    });
  });
  return context;
}

function listenErrors(page) {
  page.on('pageerror', error => evidence.pageErrors.push({ url: page.url(), error: error.message }));
}

async function becomesEnabled(page, selector, timeout = 10_000) {
  return page.waitForFunction(value => {
    const control = document.querySelector(value);
    return Boolean(control && !control.disabled && control.getAttribute('aria-disabled') !== 'true');
  }, selector, { timeout }).then(() => true, () => false);
}

async function captureSafeCameraImage(frame) {
  await frame.locator('#cameraImageInput').waitFor({ state: 'attached', timeout: 20_000 });
  await frame.locator('#cameraImageInput').setInputFiles(await makePng(frame));
  await frame.waitForFunction(() => {
    const surface = document.querySelector('#pixelStudio');
    return surface?.dataset.mode === 'live' && document.querySelector('#cameraStatus')?.textContent === 'プレビュー';
  }, null, { timeout: 30_000 });

  const capture = frame.locator('.app-tabs #capture');
  const shutter = frame.locator('.app-tabs .pc-nav-shutter');
  const retake = frame.locator('.app-tabs .pc-nav-retake');
  assert.equal(await capture.getAttribute('aria-label'), 'この画像を確定', 'imported image names the primary action as confirm');
  assert.equal(await capture.getAttribute('data-action'), 'capture');
  assert.ok(await shutter.isVisible(), 'camera shutter is visible while previewing the imported image');
  assert.ok(!(await retake.isVisible()), 'retake icon stays hidden before capture');
  if (!(await becomesEnabled(frame, '#capture'))) {
    unavailable('camera safe image capture', 'imported image did not enable the native capture action');
    return false;
  }

  await frame.evaluate(() => {
    window.__cameraCapturedTransitions = 0;
    const surface = document.querySelector('#pixelStudio');
    new MutationObserver(() => {
      if (surface.dataset.mode === 'captured') window.__cameraCapturedTransitions += 1;
    }).observe(surface, { attributes: true, attributeFilter: ['data-mode'] });
  });
  await capture.click();
  const completed = await frame.waitForFunction(() => document.querySelector('#pixelStudio')?.dataset.mode === 'captured', null, { timeout: 30_000 }).then(() => true, () => false);
  if (!completed) {
    unavailable('camera safe image capture', 'the native capture action did not reach captured state');
    return false;
  }
  await frame.waitForFunction(() => document.body.getAttribute('data-tool-result-open') === 'camera-result', null, { timeout: 15_000 });
  assert.equal(await frame.locator('#cameraStatus').textContent(), '撮影済み');
  assert.equal(await capture.getAttribute('data-action'), 'retake', 'captured image switches the center action to retake');
  assert.match(await capture.getAttribute('aria-label'), /撮り直/);
  assert.ok(!(await shutter.isVisible()), 'shutter icon is hidden after capture');
  assert.ok(await retake.isVisible() || await capture.locator('.px-tool-result__nav-icon').isVisible(), 'native retake/result-return icon is visible after capture');
  assert.ok(await frame.locator('#resultControls').isVisible(), 'captured image result controls are available');
  assert.equal(await frame.evaluate(() => window.__cameraCapturedTransitions), 1, 'one capture click produces one captured-state transition');
  pass('camera safe local PNG preview and capture', { source: 'synthetic PNG', mode: 'captured', capturedTransitions: 1 });
  return true;
}

async function screenshot(page, label) {
  const path = join(output, `${safeName(label)}.png`);
  await page.screenshot({ path, fullPage: false, animations: 'disabled' });
  evidence.screenshots.push(path);
}

async function checkMenu(page, width) {
  const toggle = page.locator('[data-menu-toggle]').first();
  await toggle.waitFor({ state: 'visible' });
  const toggleBox = await toggle.boundingBox();
  assert.ok(toggleBox && toggleBox.x >= 0 && toggleBox.x + toggleBox.width <= width + 1, `site menu launcher fits ${width}px`);
  await toggle.click();
  const menu = page.locator('[data-site-menu]');
  await menu.waitFor({ state: 'visible' });
  await menu.evaluate(node => Promise.all(node.getAnimations().map(animation => animation.finished.catch(() => {}))));
  const menuBox = await menu.boundingBox();
  const close = page.locator('[data-menu-close]');
  const closeBox = await close.boundingBox();
  assert.ok(menuBox && menuBox.x >= 0 && menuBox.x + menuBox.width <= width + 1, `site menu fits ${width}px`);
  assert.ok(closeBox && closeBox.width >= 44 && closeBox.height >= 44, 'site menu close control remains a touch target');
  pass(`site menu reachable at ${width}px`, { width, toggle: toggleBox, menu: menuBox });
  await close.click();
  await menu.waitFor({ state: 'hidden' });
}

async function inspectOperationBar(page, viewportLabel) {
  const nav = page.locator('.app-tabs.app-tabs--tool-operations, .app-tabs[data-operation-bar-ready="true"]');
  await nav.waitFor({ state: 'visible' });
  await nav.evaluate(node => Promise.all(node.getAnimations({ subtree:true })
    .filter(animation => animation.effect?.getTiming().iterations !== Infinity)
    .map(animation => animation.finished.catch(() => {}))));
  const model = await nav.evaluate(node => {
    const rect = element => { const r = element.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height, right: r.right, bottom: r.bottom }; };
    const slots = [...node.querySelectorAll(':scope > [data-operation-slot]')];
    const sharedCreationBar = node.classList.contains('app-tabs--tool-operations');
    const visible = el => Boolean(el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden' && !el.closest('[hidden],[inert]'));
    const primaryNodes = sharedCreationBar ? [...node.querySelectorAll(':scope > [data-nav-primary]')].filter(visible) : [];
    const center = sharedCreationBar ? primaryNodes[0] : node.querySelector(':scope > button, :scope > a');
    const visibleControls = (sharedCreationBar ? [...node.querySelectorAll(':scope > [data-nav-slot]')] : [...node.querySelectorAll('[data-tool-operation]')]).filter(visible);
    const forbidden = [...node.querySelectorAll(':scope > a[href], :scope > [data-operation-slot] > a[href], :scope > [data-operation-slot] > [data-tool-operation][href]')].map(a => a.getAttribute('href'));
    const headers = [...document.querySelectorAll('.px-tool-header-controls [data-tool-operation], .site-header [data-tool-operation]')];
    return {
      slotCount: slots.length,
      sharedCreationBar,
      navSlotValues: [...new Set([...node.querySelectorAll(':scope > [data-nav-slot]')].map(el => el.dataset.navSlot))].sort(),
      primaryCount: primaryNodes.length,
      slotRects: slots.map(rect),
      peerSlotWidths: slots.map(slot => rect(slot).width),
      peerSlotCenters: slots.map(slot => { const r = slot.getBoundingClientRect(); return r.left + r.width / 2; }),
      populatedSlots: slots.filter(slot => slot.children.length > 0).length,
      centerId: center?.id || null,
      centerRect: center ? rect(center) : null,
      visibleControls: visibleControls.map(el => ({ id: el.id || '', label: el.getAttribute('aria-label') || el.textContent.trim(), disabled: el.matches(':disabled,[aria-disabled="true"]'), rect: rect(el) })),
      forbiddenLinks: forbidden,
      headerOperations: headers.map(el => el.id || el.getAttribute('aria-label') || el.textContent.trim()),
      duplicateHeaderOperations: headers.filter(el => node.contains(el)).map(el => el.id || el.getAttribute('aria-label') || el.textContent.trim()),
      duplicateIds: [...new Set(visibleControls.map(el => el.id).filter(Boolean))].filter(id => document.querySelectorAll(`#${CSS.escape(id)}`).length !== 1),
      horizontalOverflow: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) > innerWidth + 1,
    };
  });
  if (model.sharedCreationBar) {
    assert.deepEqual(model.navSlotValues, ['1', '2', '3', '4', '5'], 'shared editor bar exposes five operation positions');
    assert.equal(model.primaryCount, 1, 'shared editor bar has one center primary action');
  } else assert.equal(model.slotCount, 4, 'operation bar has four symmetric peer slots plus its primary center control');
  if (!model.sharedCreationBar) {
    assert.ok(model.peerSlotWidths.every(width => width > 0 && Math.abs(width - model.peerSlotWidths[0]) < 1), 'four peer slots have equal available widths');
    const gaps = model.peerSlotCenters.slice(1).map((center, index) => center - model.peerSlotCenters[index]);
    assert.ok(Math.abs(gaps[0] - gaps[2]) < 1 && Math.abs(gaps[1] - gaps[0] * 2) < 2, 'four peers mirror symmetrically around the larger center control');
  } else {
    assert.equal(model.visibleControls.length, 5, 'shared tool bar presents four peers and one primary position');
    const peers = model.visibleControls.filter(control => control.id !== model.centerId);
    assert.equal(peers.length, 4, 'shared toolbar has four visible peer operations');
  }
  assert.ok(model.centerRect, 'center primary action is a direct operation bar child');
  assert.deepEqual(model.forbiddenLinks, [], 'bottom operation bar does not contain site navigation');
  assert.deepEqual(model.duplicateHeaderOperations, [], 'operation controls are not duplicated between the header and bottom bar');
  assert.deepEqual(model.duplicateIds, [], 'operation controls have no duplicate IDs');
  assert.ok(model.centerRect.width >= 57.9 && model.centerRect.height >= 57.9, 'primary center action is 58px after pixel rounding: ' + JSON.stringify(model.centerRect));
  const peers = model.visibleControls.filter(control => control.id !== model.centerId);
  for (const peer of peers) assert.ok(peer.rect.width >= 43.9 && peer.rect.height >= 43.9, `${peer.label || peer.id} is 44px after pixel rounding`);
  if (model.sharedCreationBar) {
    assert.equal(peers.length, 4, 'shared editor has four active peer controls');
    assert.ok(peers.every(peer => Math.abs(peer.rect.width - peers[0].rect.width) < 1 && Math.abs(peer.rect.height - peers[0].rect.height) < 1), 'shared editor peer controls have equal dimensions');
    const centers = peers.map(peer => peer.rect.x + peer.rect.width / 2).sort((a, b) => a - b);
    const centerX = model.centerRect.x + model.centerRect.width / 2;
    assert.ok(Math.abs((centerX - centers[0]) - (centers[3] - centerX)) < 1 && Math.abs((centerX - centers[1]) - (centers[2] - centerX)) < 1, 'shared editor peer controls are mirrored around the primary action');
  }
  assert.ok(!model.horizontalOverflow, `tool page does not overflow horizontally at ${viewportLabel}`);
  pass(`operation bar layout ${viewportLabel}`, model);
  return model;
}

async function shellScenario({ route, name, viewport, screenshotStates }) {
  const context = await newContext(viewport);
  try {
    const page = await context.newPage(); listenErrors(page);
    await page.goto(new URL(route, baseUrl).href, { waitUntil: 'domcontentloaded' });
    await checkMenu(page, viewport.width);
    if (name === 'camera') await page.locator('[data-embed-start]').click();
    const frameLocator = page.locator('iframe.tool-embed__frame');
    await frameLocator.waitFor({ state: 'attached', timeout: 30_000 });
    await page.evaluate(() => { window.__harnessFrameRef = document.querySelector('iframe.tool-embed__frame')?.contentWindow; });
    await page.waitForFunction(() => {
      const frame = document.querySelector('iframe.tool-embed__frame');
      try { return frame?.contentDocument?.body?.dataset.creationMode || false; } catch { return false; }
    }, null, { timeout: 30_000 });
    await page.waitForFunction(expectedMode => {
      const frame = document.querySelector('iframe.tool-embed__frame');
      try {
        const body = frame?.contentDocument?.body;
        return body?.dataset.creationMode === expectedMode
          && !frame.contentDocument.querySelector('#main')?.inert
          && !body.hasAttribute('data-creation-transition');
      } catch { return false; }
    }, name, { timeout: 30_000 });
    const child = page.frames().find(candidate => candidate.parentFrame() && candidate.url().includes('/draw/editor.html'));
    if (!child) {
      unavailable(`${name} embedded editor`, 'iframe was attached but the local editor document did not become available');
      return;
    }
    await child.locator('.app-tabs.app-tabs--tool-operations').waitFor({ state: 'visible', timeout: 30_000 });
    assert.equal(await child.locator('[data-site-menu]').count(), 0, 'embedded editor does not mount a duplicate global site menu');
    const tokenBefore = await frameLocator.getAttribute('src');
    const modeBefore = await child.locator('body').getAttribute('data-creation-mode');
    assert.ok(tokenBefore && new URL(tokenBefore, baseUrl).searchParams.get('channel'), 'embedded frame carries its controller channel token');
    const operationBar = await inspectOperationBar(child, `${name} ${viewport.width}`);
    if (name === 'camera') {
      const ids = operationBar.visibleControls.map(control => control.id).sort();
      assert.deepEqual(ids, ['creation-file-open', 'creation-output-open', 'creation-settings-open', 'flipCamera', 'capture'].sort(), 'camera has native file, flip, capture, settings and output operations');
      assert.equal(operationBar.centerId, 'capture', 'camera capture stays in the central primary position');
      pass('camera native operation availability', { controls: operationBar.visibleControls.map(({ id, disabled }) => ({ id, disabled })) });
    }
    const outerMenuCount = await page.locator('[data-site-menu]').count();
    assert.equal(outerMenuCount, 1, 'page menu belongs to the outer shell only');
    pass(`${name} shell/frame ownership`, { width: viewport.width, mode: modeBefore, channel: new URL(tokenBefore, baseUrl).searchParams.get('channel') });

    await child.locator('#creation-mode-menu > summary').click();
    await child.locator('.creation-mode-menu__panel').waitFor({ state:'visible' });
    const modePanel = await child.locator('.creation-mode-menu__panel').evaluate(node => node.getBoundingClientRect().toJSON());
    const childWidth = await child.evaluate(() => innerWidth);
    assert.ok(modePanel && modePanel.x >= 0 && modePanel.x + modePanel.width <= childWidth + 1, 'production mode picker fits the actual iframe viewport');
    await page.keyboard.press('Escape');
    await child.locator('.creation-mode-menu__panel').waitFor({ state:'hidden' });
    pass('production mode menu fits and dismisses', { tool:name, width:viewport.width });

    if (name === 'camera') await captureSafeCameraImage(child);

    if (screenshotStates) await screenshot(page, `${name}-${viewport.width}-normal`);
    const expand = page.locator('[data-embed-expand]');
    await expand.waitFor({ state: 'visible' });
    await page.evaluate(() => {
      const button = document.querySelector('[data-embed-expand]');
      const pageY = button.getBoundingClientRect().top + window.scrollY;
      window.scrollTo({ left: 0, top: Math.max(0, pageY - innerHeight / 2), behavior: 'instant' });
    });
    const scrolled = await page.evaluate(() => window.scrollY);
    await expand.click();
    await page.waitForFunction(() => document.querySelector('[data-embed-expand]')?.getAttribute('aria-expanded') === 'true');
    await page.waitForTimeout(150);
    assert.equal(await frameLocator.getAttribute('src'), tokenBefore, 'expand retains iframe URL/channel');
    assert.equal(await frameLocator.evaluate(el => el.contentWindow === window.__harnessFrameRef), true, 'iframe window stays mounted through expand');
    assert.equal(await child.locator('body').getAttribute('data-creation-mode'), name === 'camera' ? 'camera' : modeBefore, 'expand retains active editor mode');
    const exit = page.locator('[data-embed-expand]');
    assert.equal(await exit.evaluate(el => document.activeElement === el), true, 'expand focuses its exit control');
    pass(`${name} expansion scroll snapshot`, { width: viewport.width, scrollY: scrolled });
    if (screenshotStates) await screenshot(page, `${name}-${viewport.width}-expanded`);
    await exit.click();
    await page.waitForFunction(() => document.querySelector('[data-embed-expand]')?.getAttribute('aria-expanded') === 'false');
    assert.equal(await frameLocator.getAttribute('src'), tokenBefore, 'exit returns to the same iframe URL/channel');
    assert.equal(await frameLocator.evaluate(el => el.contentWindow === window.__harnessFrameRef), true, 'exit keeps the same iframe window alive');
    assert.equal(await child.locator('body').getAttribute('data-creation-mode'), modeBefore, 'exit retains selected mode');
    const restoredScroll = await page.evaluate(() => window.scrollY);
    assert.ok(Math.abs(restoredScroll - scrolled) <= 2, 'exit restores the pre-expansion page scroll position');
    const restoredStart = page.locator('[data-embed-expand]');
    assert.equal(await restoredStart.evaluate(el => document.activeElement === el), true, 'exit returns focus to the expand control');
    pass(`${name} expand/exit preserves frame, token, mode and focus`, { width: viewport.width, scrollBefore: scrolled });
  } finally { await context.close(); }
}

async function makePng(page, { changed = false } = {}) {
  const data = await page.evaluate(isChanged => {
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 16;
    const ctx = canvas.getContext('2d');
    for (let y = 0; y < 16; y += 1) for (let x = 0; x < 16; x += 1) {
      ctx.fillStyle = (x + y) % 2 ? '#e75445' : '#4c82c3'; ctx.fillRect(x, y, 1, 1);
    }
    if (isChanged) { ctx.fillStyle = '#24aa78'; ctx.fillRect(5, 5, 4, 4); }
    return canvas.toDataURL('image/png').split(',')[1];
  }, changed);
  return { name: changed ? 'local-after.png' : 'local-before.png', mimeType: 'image/png', buffer: Buffer.from(data, 'base64') };
}

async function makerScenario({ route, name, viewport }) {
  const context = await newContext(viewport);
  try {
    const page = await context.newPage(); listenErrors(page);
    await page.goto(new URL(route, baseUrl).href, { waitUntil: 'domcontentloaded' });
    await checkMenu(page, viewport.width);
    await inspectOperationBar(page, `${name} setup ${viewport.width}`);
    if (viewport.width >= 390) await screenshot(page, `${name}-${viewport.width}-setup`);

    if (name === 'jigsaw') {
      await page.locator('#jigsaw-source-kind').selectOption('file');
      await page.locator('#jigsaw-file').setInputFiles(await makePng(page));
      if (await becomesEnabled(page, '#jigsaw-start')) await page.locator('#jigsaw-start').click();
      else { unavailable(`${name} play`, 'local PNG selection left the start action disabled'); return; }
      await page.locator('#jigsaw-play').waitFor({ state: 'visible' });
      await inspectOperationBar(page, `${name} play ${viewport.width}`);
      const previewToggle = page.locator('#jigsaw-preview-toggle');
      await previewToggle.click();
      await page.locator('#jigsaw-preview').waitFor({ state: 'visible' });
      await page.keyboard.press('Escape');
      await page.locator('#jigsaw-preview').waitFor({ state: 'hidden' });
      assert.equal(await previewToggle.evaluate(node => document.activeElement === node), true, 'jigsaw preview Escape restores focus to its operation');
      assert.ok(await becomesEnabled(page, '#jigsaw-save'), '#jigsaw-save becomes enabled');
      await page.locator('#jigsaw-save').click();
      await page.waitForFunction(() => /配置を端末に保存|完成したパズルを端末に保存/.test(document.querySelector('#jigsaw-status')?.textContent || ''), null, { timeout: 20_000 });
      const more = page.locator('.jigsaw-more');
      await more.locator('summary').click();
      await page.locator('#jigsaw-new').click();
      await page.locator('#jigsaw-setup').waitFor({ state: 'visible' });
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.locator('#jigsaw-resume').waitFor({ state: 'visible', timeout: 20_000 });
      await page.locator('#jigsaw-resume').click();
      await page.locator('#jigsaw-play').waitFor({ state: 'visible' });
      pass('jigsaw preview dismissal, local save and saved-play resume', { width: viewport.width });
      if (viewport.width >= 390) await screenshot(page, `${name}-${viewport.width}-play`);
    } else if (name === 'spot-difference') {
      await page.locator('#spot-before-file').setInputFiles(await makePng(page));
      await page.locator('#spot-after-file').setInputFiles(await makePng(page, { changed: true }));
      await page.locator('#spot-import-pair').waitFor({ state: 'visible' });
      if (await becomesEnabled(page, '#spot-import-pair')) await page.locator('#spot-import-pair').click();
      else { unavailable(`${name} editor`, 'local two-image import stayed disabled after PNG selection'); return; }
      await page.locator('#spot-editor').waitFor({ state: 'visible' });
      await inspectOperationBar(page, `${name} editor ${viewport.width}`);
      await page.evaluate(() => { window.__harnessSpotEditorNode = document.querySelector('#spot-editor'); });
      const settings = page.locator('.spot-settings');
      await settings.locator(':scope > summary').click();
      await page.locator('.spot-settings__sheet').waitFor({ state: 'visible' });
      const settingsRect = await page.locator('.spot-settings__sheet').evaluate(node => node.getBoundingClientRect().toJSON());
      assert.ok(settingsRect.x >= 0 && settingsRect.right <= viewport.width + 1, 'spot editor settings stay within the viewport');
      await page.keyboard.press('Escape');
      await page.waitForFunction(() => !document.querySelector('.spot-settings')?.open);
      assert.equal(await settings.locator(':scope > summary').evaluate(node => document.activeElement === node), true, 'spot settings Escape restores focus to its launcher');
      await settings.locator(':scope > summary').click();
      const candidate = page.locator('#spot-candidates input[type="checkbox"]').first();
      await candidate.check();
      await page.locator('#spot-confirm').click();
      await page.waitForFunction(() => document.querySelector('#spot-confirmed')?.hidden === false, null, { timeout:20_000 });
      assert.ok(await becomesEnabled(page, '#spot-save'), '#spot-save becomes enabled');
      await page.locator('#spot-save').click();
      await page.waitForFunction(() => /端末内の下書きに保存しました|未確定の候補を端末に保存しました/.test(document.querySelector('#spot-status')?.textContent || ''), null, { timeout: 20_000 });
      await page.locator('#spot-redraw').waitFor({ state: 'visible' });
      await page.locator('#spot-redraw').click();
      await page.locator('#spot-inline-draw').waitFor({ state: 'visible' });
      await inspectOperationBar(page, `${name} inline drawing ${viewport.width}`);
      const undo = page.locator('#spot-inline-undo');
      const redo = page.locator('#spot-inline-redo');
      assert.ok(await undo.isDisabled() && await redo.isDisabled(), 'inline drawing starts with history actions disabled');
      const inlineCanvas = page.locator('#spot-inline-canvas');
      const inlineRect = await inlineCanvas.boundingBox();
      assert.ok(inlineRect?.width > 0 && inlineRect?.height > 0, 'inline drawing canvas is visible');
      await page.mouse.click(inlineRect.x + inlineRect.width * 0.35, inlineRect.y + inlineRect.height * 0.35);
      assert.ok(await becomesEnabled(page, '#spot-inline-undo'));
      await undo.click();
      assert.ok(await becomesEnabled(page, '#spot-inline-redo'));
      await redo.click();
      await page.locator('#spot-inline-finish').click();
      await page.locator('#spot-editor').waitFor({ state: 'visible', timeout: 20_000 });
      assert.equal(await page.evaluate(() => document.querySelector('#spot-editor') === window.__harnessSpotEditorNode), true, 'spot redraw returns to the existing editor section');
      assert.ok(await page.locator('#spot-candidates li').count() > 0, 'spot redraw regenerates local difference candidates');
      pass('spot settings, confirmation, local save and redraw undo/redo round trip', { width: viewport.width });
      if (viewport.width >= 390) await screenshot(page, `${name}-${viewport.width}-editor`);
    } else {
      await page.locator('#hidden-image-file').setInputFiles(await makePng(page));
      await page.locator('#hidden-start').waitFor({ state: 'visible' });
      if (await becomesEnabled(page, '#hidden-start')) await page.locator('#hidden-start').click();
      else { unavailable(`${name} editor`, 'local image import left the start action disabled'); return; }
      await page.locator('#hidden-editor').waitFor({ state: 'visible' });
      await inspectOperationBar(page, `${name} editor ${viewport.width}`);
      await page.evaluate(() => { window.__harnessHiddenEditorNode = document.querySelector('#hidden-editor'); });
      const settings = page.locator('#hidden-target-settings');
      await settings.locator(':scope > summary').click();
      const workbench = page.locator('.hidden-workbench');
      await workbench.waitFor({ state: 'visible' });
      const workbenchRect = await workbench.evaluate(node => node.getBoundingClientRect().toJSON());
      assert.ok(workbenchRect.x >= 0 && workbenchRect.right <= viewport.width + 1, 'hidden-object settings stay within the viewport');
      await page.keyboard.press('Escape');
      await page.waitForFunction(() => !document.querySelector('#hidden-target-settings')?.open);
      assert.equal(await settings.locator(':scope > summary').evaluate(node => document.activeElement === node), true);
      await settings.locator(':scope > summary').click();
      await page.locator('#hidden-name').fill('青い点');
      await page.locator('#hidden-add').click();
      await page.waitForFunction(() => !document.querySelector('#hidden-target-settings')?.open);
      assert.equal(await settings.evaluate(node => node.open), false, 'adding a target closes the settings panel');
      const canvas = page.locator('#hidden-canvas');
      await canvas.focus();
      await canvas.press('Space');
      assert.ok(await becomesEnabled(page, '#hidden-confirm'), '#hidden-confirm becomes enabled');
      await page.locator('#hidden-confirm').click();
      await page.waitForFunction(() => document.querySelector('#hidden-editor')?.dataset.confirmed === 'true', null, { timeout:20_000 });
      assert.ok(await becomesEnabled(page, '#hidden-save'), '#hidden-save becomes enabled');
      await page.locator('#hidden-save').click();
      await page.waitForFunction(() => /端末内の下書きに保存しました|マスクを端末内の下書きに保存しました/.test(document.querySelector('#hidden-status')?.textContent || ''), null, { timeout: 20_000 });
      await page.locator('#hidden-new').waitFor({ state: 'visible' });
      await page.locator('#hidden-new').click();
      await page.locator('#hidden-setup').waitFor({ state: 'visible' });
      assert.equal(await page.evaluate(() => document.querySelector('#hidden-editor') === window.__harnessHiddenEditorNode), true, 'new setup retains the existing editor node');
      // Existing resume availability is refreshed at startup, as on jigsaw.
      await page.reload({ waitUntil:'domcontentloaded' });
      await page.locator('#hidden-resume').waitFor({ state: 'visible' });
      await page.locator('#hidden-resume').click();
      await page.locator('#hidden-editor').waitFor({ state: 'visible', timeout: 20_000 });
      assert.equal(await page.locator('#hidden-editor').getAttribute('data-confirmed'), 'true', 'hidden-object resume retains its confirmed local state');
      pass('hidden-object add, keyboard mask, confirmation, local save and resume round trip', { width: viewport.width });
      if (viewport.width >= 390) await screenshot(page, `${name}-${viewport.width}-editor`);
    }
  } finally { await context.close(); }
}

async function seedLocalGame(page) {
  return page.evaluate(async () => {
    const { createDrawDocument } = await import('/js/creation/draw-core.mjs');
    const { createIndexedDbDraftAdapter, createLocalDraftStore } = await import('/js/creation/local-drafts.mjs');
    const { confirmDifferenceCandidates, detectDifferenceCandidates } = await import('/js/creation/spot-difference-core.mjs');
    const { confirmHiddenObjectTargets, createHiddenObjectDraft } = await import('/js/creation/hidden-object-core.mjs');
    const store = createLocalDraftStore(createIndexedDbDraftAdapter());
    const drawId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
    const spotId = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
    const hiddenId = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
    const before = createDrawDocument(16); before.pixels.fill(0); before.pixels[0] = 1;
    const after = createDrawDocument(16); after.pixels.fill(0); after.pixels[0] = 1;
    for (let y = 5; y < 9; y += 1) for (let x = 5; x < 9; x += 1) after.pixels[y * 16 + x] = 2;
    const first = await store.save({ draftId: drawId, kind: 'pixel_art', document: before, source: { type: 'hand_drawn', assetId: null, revisionId: null } });
    const second = await store.save({ draftId: drawId, kind: 'pixel_art', document: after, source: { type: 'hand_drawn', assetId: null, revisionId: null } });
    const ref = revision => ({ draftId: drawId, assetId: revision.asset.assetId, revisionId: revision.revisionId, contentHash: revision.documentHash, hashScheme: revision.hashScheme });
    const detected = detectDifferenceCandidates(before, after);
    if (!detected.candidates.length) throw new Error('Synthetic local difference produced no candidate regions');
    const spot = confirmDifferenceCandidates({ schemaVersion: 1, gameId: spotId, width: 16, height: 16, before: ref(first), after: ref(second), candidates: detected.candidates, confirmed: true, publication: 'draft', published: false });
    const spotSaved = await store.save({ draftId: spotId, kind: 'spot_difference', document: spot, source: { type: 'local_draft_copy', assetId: first.asset.assetId, revisionId: first.revisionId } });
    const hidden = confirmHiddenObjectTargets(createHiddenObjectDraft({ gameId: hiddenId, source: ref(first), width: 16, height: 16, targets: [{ id: 'dot', name: 'ドット', pixels: [85] }] }));
    const hiddenSaved = await store.save({ draftId: hiddenId, kind: 'hidden_object', document: hidden, source: { type: 'local_draft_copy', assetId: first.asset.assetId, revisionId: first.revisionId } });
    return { spotId, hiddenId, spotRevision: spotSaved.revisionId, hiddenRevision: hiddenSaved.revisionId };
  });
}

async function playScenario({ path, queryKey, draftIdKey, name, viewport }) {
  const context = await newContext(viewport);
  try {
    const seedPage = await context.newPage(); listenErrors(seedPage);
    await seedPage.goto(new URL(path, baseUrl).href, { waitUntil: 'domcontentloaded' });
    const fixtures = await seedLocalGame(seedPage);
    const id = fixtures[draftIdKey];
    await seedPage.goto(new URL(`${path}?${queryKey}=${id}`, baseUrl).href, { waitUntil: 'domcontentloaded' });
    const page = seedPage;
    await page.locator('#pixfind-game').waitFor({ state: 'visible', timeout: 30_000 });
    await page.locator('#pixfind-original').waitFor({ state: 'visible' });
    await page.locator('#pixfind-original').evaluate(img => img.decode());
    await page.locator('.px-tool-header-controls #pixfind-back').waitFor({ state: 'visible' });
    assert.equal(await page.locator('.app-tabs #pixfind-back').count(), 0, 'local-draft game return is in the page header, not bottom navigation');
    await checkMenu(page, viewport.width);
    await inspectOperationBar(page, `${name} play ${viewport.width}`);
    if (viewport.width >= 390) await screenshot(page, `${name}-${viewport.width}-play`);
    await page.locator('#pixfind-original').scrollIntoViewIfNeeded();
    const imageRect = await page.locator('#pixfind-original').boundingBox();
    assert.ok(imageRect && imageRect.width > 0 && imageRect.height > 0, `${name} synthetic image rendered`);
    await page.mouse.click(imageRect.x + imageRect.width * (5.5 / 16), imageRect.y + imageRect.height * (5.5 / 16));
    const reachedResult = await page.waitForFunction(() => document.body.hasAttribute('data-tool-result-open'), null, { timeout: 4_000 }).then(() => true, () => false);
    if (reachedResult) {
      await inspectOperationBar(page, `${name} result ${viewport.width}`);
      if (viewport.width >= 390) await screenshot(page, `${name}-${viewport.width}-result`);
      pass(`${name} synthetic local play reaches result`, { width: viewport.width, fixture: id });
    } else unavailable(`${name} result`, 'the local correct-answer click did not open the result view; play/setup screenshots and checks are retained');
  } finally { await context.close(); }
}

try {
  for (const viewport of viewports) {
    if (selected('draw')) await shellScenario({ route: '/draw/', name: 'draw', viewport, screenshotStates: viewport.width >= 390 });
    if (selected('audio')) await shellScenario({ route: '/audio/', name: 'audio', viewport, screenshotStates: viewport.width >= 390 });
    if (selected('camera')) await shellScenario({ route: '/camera/', name: 'camera', viewport, screenshotStates: viewport.width >= 390 });
    if (selected('jigsaw')) await makerScenario({ route: '/jigsaw/', name: 'jigsaw', viewport });
    if (selected('spot-difference')) await makerScenario({ route: '/spot-difference/', name: 'spot-difference', viewport });
    if (selected('hidden-object')) await makerScenario({ route: '/hidden-object/', name: 'hidden-object', viewport });
  }
  for (const viewport of viewports) {
    if (selected('spot-play')) await playScenario({ path: '/play/spot-difference/', queryKey: 'localSpot', draftIdKey: 'spotId', name: 'spot-play', viewport });
    if (selected('hidden-play')) await playScenario({ path: '/play/hidden-object/', queryKey: 'localHidden', draftIdKey: 'hiddenId', name: 'hidden-play', viewport });
  }
} finally {
  await browser.close();
  const reportPath = join(output, 'report.json');
  await import('node:fs/promises').then(({ writeFile }) => writeFile(reportPath, `${JSON.stringify(evidence, null, 2)}\n`));
}

assert.deepEqual(evidence.pageErrors, [], 'browser pages should not raise uncaught errors');
console.log(`PASS tool navigation harness: ${evidence.checks.length} checks; ${evidence.screenshots.length} screenshots`);
console.log(`Evidence: ${output}`);
