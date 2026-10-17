#!/usr/bin/env node
/** Local browser acceptance for page navigation and creation controls. External requests are blocked. */
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';

const phase = process.env.PIXIEED_NAV_PHASE || 'after';
assert.ok(['before', 'after'].includes(phase));
const base = process.env.PIXIEED_BROWSER_BASE_URL || (phase === 'before' ? 'http://127.0.0.1:4191' : 'http://127.0.0.1:4188');
const origin = new URL(base).origin;
assert.ok(['localhost', '127.0.0.1'].includes(new URL(base).hostname), 'Only localhost is allowed');
const output = resolve(process.env.PIXIEED_NAV_OUTPUT || `/tmp/pixieed-nav-roles-20261012/${phase}`);
const modulePath = process.env.PIXIEED_PLAYWRIGHT_MODULE || 'playwright';
const { chromium } = await import(modulePath === 'playwright' ? modulePath : pathToFileURL(modulePath).href);
const head = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const sourceFingerprint = process.env.PIXIEED_SOURCE_FINGERPRINT || null;
const beforeJson = resolve(process.env.PIXIEED_NAV_BEFORE_JSON || '/tmp/pixieed-nav-roles-20261012/before/before.json');
const beforeRows = phase === 'after' ? JSON.parse(await readFile(beforeJson, 'utf8').catch(() => '[]')) : [];
const viewports = [{ width: 320, height: 568 }, { width: 390, height: 844 }, { width: 844, height: 390 }, { width: 1280, height: 800 }];
const ordinaryRoutes = ['/', '/books/', '/stores/', '/globe/', '/jigsaw/', '/output/', '/play/hidden-object/', '/pixel-camera.html', '/events/', '/events/pixelween-2026/', '/output/work/', '/pixiee-lens/', '/pixel-camera-studio.html'];
const routeFilter = process.env.PIXIEED_NAV_ROUTES?.split(',').map(value => value.trim()).filter(Boolean);
const selectedRoutes = [...ordinaryRoutes, '/draw/'].filter(path => !routeFilter || routeFilter.includes(path));
assert.ok(selectedRoutes.length, 'At least one known local navigation route must be selected');
const results = [], failures = [];
const startedAt = new Date().toISOString();
const browser = await chromium.launch({ headless: true });

const rectOf = (el) => {
  const r = el.getBoundingClientRect();
  return { x: r.x, y: r.y, left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
};
async function recordObservation(page, row) {
  row.horizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
  row.pageNavCount = await page.locator('[data-page-nav],.px-page-nav,nav[aria-label="ページナビゲーション"]').count();
  row.creationControls = await page.locator('button[data-creation-mode]').evaluateAll(nodes => nodes.filter(n => n.checkVisibility()).map(n => {
    const r = n.getBoundingClientRect(), s = getComputedStyle(n);
    return { mode: n.dataset.creationMode, label: n.getAttribute('aria-label') || n.textContent.trim(), pressed: n.getAttribute('aria-pressed'), visible: r.width > 0 && r.height > 0, rect: { left:r.left,top:r.top,right:r.right,bottom:r.bottom,width:r.width,height:r.height }, radius:s.borderTopLeftRadius, focusVisible:n.matches(':focus-visible') };
  }));
  row.workNavigation = await page.locator('.app-tabs--work').evaluateAll(nodes => nodes.filter(n => n.checkVisibility()).map(n => ({ label:n.getAttribute('aria-label'), actions:[...n.querySelectorAll(':scope > a,:scope > button')].map(a => ({ action:a.dataset.pageAction||null,href:a.getAttribute('href'),text:a.textContent.trim(),rect:(()=>{const r=a.getBoundingClientRect();return {left:r.left,top:r.top,right:r.right,bottom:r.bottom,width:r.width,height:r.height};})() })) })));
}

try {
  await mkdir(output, { recursive: true });
  for (const viewport of viewports) {
    const context = await browser.newContext({ viewport, hasTouch: true });
    await context.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.fulfill({ status: 200, contentType: 'text/plain', body: '' }));
    // Never request a real camera or microphone. Browsers still use synthetic defaults.
    await context.addInitScript(() => {
      if (navigator.mediaDevices) Object.defineProperty(navigator.mediaDevices, 'getUserMedia', { configurable: true, value: async () => { throw new DOMException('Synthetic navigation QA media unavailable', 'NotFoundError'); } });
    });
    const page = await context.newPage();
    page.setDefaultTimeout(8000);
    let activeRow = null;
    page.on('pageerror', e => { activeRow?.pageErrors.push(e.message); });
    for (const path of selectedRoutes) {
      const row = { phase, path, viewport, checks: [], status: 'PENDING', pageErrors: [] };
      activeRow = row;
      results.push(row);
      try {
        await page.goto(base + path, { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(450);
        if (phase === 'after' && path === '/pixiee-lens/') {
          await page.waitForURL(url => url.pathname === '/draw/' && url.searchParams.get('mode') === 'camera');
          await page.waitForFunction(() => document.querySelector('[data-embed-status]')?.textContent.includes('編集を保持'));
          const frame = page.frames().find(frame => new URL(frame.url()).pathname === '/draw/editor.html');
          assert.ok(frame, 'retired LENS opens the retained current editor iframe');
          await frame.waitForFunction(() => document.body.dataset.creationMode === 'camera' && !document.body.hasAttribute('data-creation-transition'));
          row.actualPath = new URL(page.url()).pathname;
          row.compatibilityMode = await frame.locator('body').getAttribute('data-creation-mode');
          assert.equal(row.compatibilityMode, 'camera');
          assert.equal(await frame.locator('#pixelStudio').count(), 1);
          assert.equal(await page.locator('a[href="/pixiee-lens/"]').count(), 0);
          row.checks.push('retired LENS reaches current camera in the retained iframe without old app promotion');
          row.status = 'PASS';
          continue;
        }
        if (phase === 'after' && path === '/draw/') {
          await page.waitForFunction(() => document.documentElement.dataset.creationModesReady === 'true' && !document.body.hasAttribute('data-creation-transition'), null, { timeout:25000 });
        } else if (phase === 'after' && path === '/pixel-camera.html') {
          // The legacy route has a brief redirect/transition window. Wait for its
          // settled camera mode before recording controls or opening the menu.
          await page.waitForFunction(() => location.pathname === '/draw/' && document.documentElement.dataset.creationModesReady === 'true' && document.body.dataset.creationMode === 'camera' && !document.body.hasAttribute('data-creation-transition'), null, { timeout:25000 });
        }
        await recordObservation(page, row);
        row.actualPath = new URL(page.url()).pathname;
        row.screenshot = `${path === '/' ? 'home' : path.replaceAll('/', '_').replaceAll('.', '_')}-${viewport.width}x${viewport.height}.png`;
        await page.screenshot({ path: `${output}/${row.screenshot}` });
        if (path === '/pixel-camera.html' && phase === 'after') {
          row.compatibilityMode = await page.locator('body').getAttribute('data-creation-mode');
          assert.equal(new URL(page.url()).pathname, '/draw/', 'legacy camera route hands off to shared Draw');
          assert.equal(row.compatibilityMode, 'camera', 'legacy camera route opens the integrated camera mode');
          row.checks.push('legacy camera entry resolves to integrated Draw camera');
        } else if (path !== '/draw/') {
          if (phase === 'after') {
            assert.equal(row.creationControls.length, 0, `${path}: ordinary route must not show the creation mode bar`);
            const visiblePageTriggers = await page.locator('[data-menu-toggle]').evaluateAll(nodes => nodes.filter(n => n.checkVisibility() && n.getBoundingClientRect().width > 0 && n.getBoundingClientRect().height > 0).length);
            assert.equal(visiblePageTriggers, 1, `${path}: exactly one visible page navigation trigger`);
            const navs = await page.locator('[data-page-nav],.px-page-nav,nav[aria-label="ページナビゲーション"]').evaluateAll(nodes => nodes.filter(n=>n.checkVisibility()).map(n => n.getBoundingClientRect().toJSON()));
            assert.ok(navs.length <= 1, `${path}: duplicate global page navigation`);
            row.checks.push('ordinary route has no creation mode controls');
          }
        } else {
          await page.waitForFunction(() => document.documentElement.dataset.creationModesReady === 'true' && !document.body.hasAttribute('data-creation-transition'), null, { timeout: 15000 });
          const modeButtons = page.locator('.app-tabs > button[data-creation-mode]');
          row.modeCount = await page.locator('.app-tabs > button[data-creation-mode]').count();
          row.bottomNavigation = await page.locator('.app-tabs').evaluateAll(nodes => nodes.filter(n => n.checkVisibility()).map(n => { const r=n.getBoundingClientRect(); return { label:n.getAttribute('aria-label'),rect:{left:r.left,top:r.top,right:r.right,bottom:r.bottom,width:r.width,height:r.height}, anchors:[...n.querySelectorAll(':scope > a')].map(a => ({ href:a.getAttribute('href'),text:a.textContent.trim() })) }; }));
          row.remainingModeLinks = await page.locator('.app-tabs a[href],.creation-bottom-nav a[href],[data-creation-bottom] a[href]').evaluateAll(nodes => nodes.filter(n => n.checkVisibility() && /(?:camera|audio|draw|mode=)/i.test(`${n.href} ${n.textContent}`)).map(n => ({ href:n.getAttribute('href'),text:n.textContent.trim() })));
          row.canvasHeight = await page.locator('.draw-viewport').evaluateAll(nodes => nodes.filter(n=>n.checkVisibility()).map(n=>n.getBoundingClientRect().height));
          if (phase === 'after') {
            assert.equal(row.modeCount, 3, 'Draw page has direct draw/camera/audio controls');
            const buttonData = await modeButtons.evaluateAll(nodes => nodes.map(n => ({ mode:n.dataset.creationMode,pressed:n.getAttribute('aria-pressed'),r:n.getBoundingClientRect().toJSON(),radius:getComputedStyle(n).borderTopLeftRadius,focus:getComputedStyle(n).outlineStyle })));
            assert.deepEqual(buttonData.map(b => b.mode).sort(), ['audio','camera','draw']);
            const pressed = buttonData.filter(b => b.pressed === 'true');
            assert.equal(pressed.length, 1, 'exactly one mode is selected');
            assert.ok(buttonData.every(b => b.r.width >= 44 && b.r.height >= 44 && b.radius === '10px'), 'mode targets are >=44px with 10px radius');
            assert.ok(buttonData.every(b => Math.abs(b.r.top - buttonData[0].r.top) <= 2), 'mode buttons occupy one row');
            assert.ok(buttonData.every(b => Math.abs(b.r.bottom - buttonData[0].r.bottom) <= 2), 'mode buttons share one row height');
            assert.equal(row.remainingModeLinks.length, 0, 'bottom row contains no duplicate mode links');
            const hitTargets = await page.locator('.app-tabs > button[data-creation-mode]').evaluateAll(nodes => nodes.map(n => { const r=n.getBoundingClientRect(), hit=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2); return { mode:n.dataset.creationMode,hit:hit===n||n.contains(hit),rect:{left:r.left,top:r.top,right:r.right,bottom:r.bottom,width:r.width,height:r.height} }; }));
            assert.ok(hitTargets.every(x=>x.hit), 'each mode button center receives its own hit');
            assert.equal(row.horizontalOverflow, false, 'Draw page does not overflow horizontally');
            assert.equal(row.bottomNavigation.length, 1, 'Draw has one work navigation row');
            assert.equal(row.bottomNavigation[0].label, '制作モードと操作');
            await modeButtons.first().focus();
            await page.keyboard.press('Tab');
            assert.ok(await page.evaluate(() => document.activeElement?.matches('[data-creation-mode]:focus-visible')), 'mode controls expose a visible keyboard focus ring');
            row.checks.push('three direct mode buttons, one pressed, >=44px/10px, one row, reachable centers, no duplicate mode links');
            const baseline = beforeRows.find(old => old.path === '/draw/' && old.viewport?.width === viewport.width && old.viewport?.height === viewport.height);
            if (baseline?.canvasHeight?.length && row.canvasHeight.length) {
              row.baselineCanvasHeight = baseline.canvasHeight;
              assert.ok(row.canvasHeight[0] >= baseline.canvasHeight[0] - .1, 'page navigation preserves the prior canvas height');
              row.checks.push('canvas viewport is not shorter than the captured baseline');
            } else row.baselineCanvasHeight = 'UNAVAILABLE';

            // Exercise real transitions in this document; the current project and Undo control must stay mounted.
            const main = page.locator('#main'), projectKeyBefore = await page.locator('#creation-project-undo').count();
            const projectBar = page.locator('.project-bar'), projectNameBefore = await projectBar.locator('.project-bar__name').textContent().catch(()=>null);
            const originalURL = new URL(page.url());
            for (const mode of ['audio','camera','draw']) {
              await page.locator(`.app-tabs > button[data-creation-mode="${mode}"]`).click();
              await page.waitForFunction(expected => document.body.dataset.creationMode === expected && !document.body.hasAttribute('data-creation-transition'), mode, { timeout: 20000 });
              const selected = await page.locator('.app-tabs > button[data-creation-mode][aria-pressed="true"]').count();
              assert.equal(selected, 1, `${mode}: one selected mode after transition`);
              assert.equal(await page.locator('#main').count(), await main.count(), `${mode}: main workspace stays in same document`);
              assert.ok(await main.evaluate(el => el.isConnected && el === document.querySelector('#main')), `${mode}: same main DOM node retained`);
              assert.ok(await projectBar.evaluate(el => el.isConnected && el === document.querySelector('.project-bar')), `${mode}: same project bar retained`);
              assert.equal(await projectBar.locator('.project-bar__name').textContent().catch(()=>null), projectNameBefore, `${mode}: current project label retained`);
              assert.equal(await page.locator('#creation-project-undo').count(), projectKeyBefore, `${mode}: project Undo control retained`);
              assert.equal(new URL(page.url()).pathname, originalURL.pathname, `${mode}: route path retained`);
              const actionId = { draw:'#draw-animation-play', camera:'#capture', audio:'#draw-music-play' }[mode];
              assert.ok(await page.locator(actionId).isVisible(), `${mode}: its play/capture action remains visible`);
              row.checks.push(`${mode} mode keeps ${actionId}`);
            }
            // Rapid requests should settle on the last mode without replacing the document.
            await page.locator('.app-tabs > button[data-creation-mode="audio"]').click();
            await page.locator('.app-tabs > button[data-creation-mode="camera"]').click();
            await page.locator('.app-tabs > button[data-creation-mode="draw"]').click();
            await page.waitForFunction(() => document.body.dataset.creationMode === 'draw' && !document.body.hasAttribute('data-creation-transition'), null, { timeout: 25000 });
            row.canvasHeightAfterModes = await page.locator('.draw-viewport').evaluateAll(nodes => nodes.filter(n=>n.checkVisibility()).map(n=>n.getBoundingClientRect().height));
            assert.deepEqual(row.canvasHeightAfterModes, row.canvasHeight, 'mode changes do not change the canvas viewport height');
            assert.equal(new URL(page.url()).searchParams.get('mode'), null, 'draw mode removes the mode query');
            row.checks.push('draw/audio/camera transitions and rapid last-request settlement keep the same workspace and Undo');
            row.finalModeURL = page.url();
            if (viewport.width === 390 && viewport.height === 844) {
              await page.goto(`${base}/draw/?mode=camera#keep-navigation-hash`, { waitUntil:'domcontentloaded' });
              await page.waitForFunction(() => document.documentElement.dataset.creationModesReady === 'true' && document.body.dataset.creationMode === 'camera' && !document.body.hasAttribute('data-creation-transition'), null, { timeout:25000 });
              assert.equal(new URL(page.url()).searchParams.get('mode'), 'camera', 'direct camera entry keeps its mode query');
              // With a saved project pointer, startup restores the PXD route
              // parameters and drops the fragment. This matches the baseline.
              assert.ok(new URL(page.url()).searchParams.has('pxd') && new URL(page.url()).searchParams.has('pxdRevision'), 'restored project context is encoded in the direct camera URL');
              assert.equal(new URL(page.url()).hash, '', 'restored-context camera startup matches baseline by dropping the fragment');
              await page.locator('.app-tabs > button[data-creation-mode="draw"]').click();
              await page.waitForFunction(() => document.body.dataset.creationMode === 'draw' && !document.body.hasAttribute('data-creation-transition'), null, { timeout:25000 });
              assert.equal(new URL(page.url()).searchParams.has('mode'), false, 'return to draw removes the mode query');
              assert.equal(new URL(page.url()).hash, '', 'return to Draw does not restore a fragment removed during project-context startup');
              row.directCameraURL = page.url();
              await page.goto(`${base}/pixel-camera.html?mode=camera#legacy-hash`, { waitUntil:'domcontentloaded' });
              await page.waitForFunction(() => location.pathname === '/draw/' && document.documentElement.dataset.creationModesReady === 'true' && document.body.dataset.creationMode === 'camera' && !document.body.hasAttribute('data-creation-transition'), null, { timeout:25000 });
              assert.equal(new URL(page.url()).searchParams.get('mode'), 'camera', 'legacy camera entry preserves its requested mode query');
              assert.equal(new URL(page.url()).hash, '', 'legacy camera entry keeps its compatibility behavior of dropping the fragment');
              row.legacyCameraURL = page.url();
              row.cameraHashBehavior = 'A fresh direct Draw camera URL can retain a fragment; with an existing saved project pointer, startup adds PXD route parameters and drops the fragment as in the frozen baseline. The legacy camera route also drops fragments.';
              row.checks.push('restored-context Draw camera startup retains mode query and matches baseline fragment behavior; legacy camera route preserves mode query and drops fragment');
            }
          }
          row.status = phase === 'after' ? 'PASS' : 'CAPTURED';
        }

        const toggle = page.locator('[data-menu-toggle]');
        if (await toggle.count() === 1 && await toggle.isVisible()) {
          row.menuPageLabel = await toggle.getAttribute('aria-label');
          row.menuButtonText = await toggle.innerText();
          if (phase === 'after') {
            assert.match(row.menuPageLabel || '', /ページ/);
            assert.match(row.menuButtonText || '', /ページ/);
          }
          const storeBefore = await page.evaluate(() => ({ motion:localStorage.getItem('PiXiEED:motion-preference:v1'), consent:localStorage.getItem('PiXiEED:analytics-consent:v1') }));
          await toggle.click();
          await page.locator('[data-site-menu]').waitFor({ state: 'visible' });
          if (path === '/draw/' && phase === 'after') {
            row.mainInertOnMenu = await page.locator('#main').evaluate(el=>el.inert);
            assert.equal(row.mainInertOnMenu,true,'open page menu makes the work canvas inert');
            const center = await page.locator('.draw-viewport').boundingBox();
            if (center) row.canvasClickThrough = await page.evaluate(({x,y,width,height})=>!!document.elementFromPoint(x+width/2,y+height/2)?.closest('.draw-viewport'), {x:center.x,y:center.y,width:center.width,height:center.height});
            assert.equal(row.canvasClickThrough,false,'open page menu prevents pointer hit-testing through to the canvas');
          }
          row.menuScroller = await page.locator('.site-menu__body').evaluate(el => { const r=el.getBoundingClientRect(); return { client:el.clientHeight,scroll:el.scrollHeight,top:el.scrollTop,rect:{left:r.left,top:r.top,right:r.right,bottom:r.bottom,width:r.width,height:r.height} }; });
          row.menuLinks = await page.locator('[data-site-menu] nav a[href]').evaluateAll(nodes => nodes.map(n => ({ href:n.getAttribute('href'), text:n.textContent.trim(), current:n.getAttribute('aria-current') })));
          row.menuSettings = await page.locator('[data-menu-setting]').evaluateAll(nodes => nodes.map(n => ({ key:n.dataset.menuSetting,text:n.textContent.trim() })));
          if (phase === 'after') {
            assert.ok(row.menuScroller.client > 0 && row.menuScroller.scroll >= row.menuScroller.client, 'menu scroller is visible and has measured bounds');
            const close = page.locator('[data-menu-close]');
            await page.locator('[data-site-menu]').evaluate(el => el.scrollTop = el.scrollHeight);
            const closeRect = await close.boundingBox();
            assert.ok(closeRect && closeRect.y < 120 && closeRect.y + closeRect.height <= viewport.height, 'menu close remains reachable while scroller is at end');
            assert.ok(row.menuLinks.some(x => x.href === '/globe/'), 'menu has globe link');
            assert.ok(row.menuSettings.some(x => x.key === 'all'), 'menu has combined settings entry');
            if (['/events/pixelween-2026/','/output/work/','/pixel-camera-studio.html'].includes(path)) {
              assert.equal(row.menuLinks.filter(x=>x.current==='page').length,0,'detail/legacy variant does not falsely mark a different menu page current');
            } else {
            const currentLink = row.menuLinks.find(x => x.current === 'page');
            assert.ok(currentLink, 'page menu marks the current destination with aria-current="page"');
            assert.ok(currentLink.href, 'current destination identifies its href');
            const currentNode = page.locator(`[data-site-menu] a[aria-current="page"]`);
            const activeStyle = await currentNode.evaluate(n => { const s=getComputedStyle(n), label=n.querySelector('.site-menu__current'), l=label&&getComputedStyle(label); return { color:s.color,background:s.backgroundColor,weight:s.fontWeight,label:label?.textContent.trim()||null,labelVisible:!!label&&!label.hidden,underline:l?.textDecorationLine||'none',underlineOffset:l?.textUnderlineOffset||'auto' }; });
            row.currentDestinationStyle = activeStyle;
            assert.ok(activeStyle.labelVisible && activeStyle.label === '現在' && activeStyle.underline.includes('underline'), 'current destination has a visible underlined label');
            }
            await page.waitForFunction(() => document.activeElement?.matches('[data-menu-close]'), null, {timeout:3000});
            const firstFocusable = page.locator('[data-site-menu] a[href], [data-site-menu] button:not(:disabled)').first();
            const lastFocusable = page.locator('[data-site-menu] a[href], [data-site-menu] button:not(:disabled)').last();
            await lastFocusable.focus();
            assert.ok(await lastFocusable.evaluate(el=>el===document.activeElement), 'test starts from the actual last menu focus target');
            await page.keyboard.press('Tab');
            assert.ok(await firstFocusable.evaluate(el => el === document.activeElement), 'Tab wraps inside page menu');
            await page.keyboard.press('Escape');
            assert.equal(await toggle.getAttribute('aria-expanded'), 'false');
            assert.ok(await toggle.evaluate(el => el === document.activeElement), 'Escape returns focus to page button');
            await toggle.click(); await page.locator('[data-site-menu]').waitFor({ state: 'visible' });
            await page.locator('[data-menu-setting="all"]').click();
            const dialog = page.locator('[data-site-settings][open]'); await dialog.waitFor();
            row.settingsPanels = await dialog.locator('[data-settings-panel]').evaluateAll(nodes => nodes.map(n=>({name:n.dataset.settingsPanel,visible:!n.hidden,text:n.innerText})));
            assert.ok(row.settingsPanels.some(x=>x.name==='display'&&x.visible&&/表示設定/.test(x.text)));
            assert.ok(row.settingsPanels.some(x=>x.name==='privacy'&&x.visible&&/プライバシー設定/.test(x.text)));
            await page.locator('[data-settings-close]').last().click();
            await page.waitForFunction(() => document.activeElement?.matches('[data-menu-toggle]'));
            const storeAfter = await page.evaluate(() => ({ motion:localStorage.getItem('PiXiEED:motion-preference:v1'), consent:localStorage.getItem('PiXiEED:analytics-consent:v1') }));
            assert.deepEqual(storeAfter, storeBefore, 'opening and closing settings preserves motion and consent storage');
            if (path === '/draw/' && viewport.width === 390) {
              await toggle.click(); await page.locator('[data-site-menu]').waitFor({state:'visible'});
              const audioDestination = page.locator('[data-site-menu] a[data-menu-link][href*="mode=audio"]').first();
              assert.equal(await audioDestination.count(), 1, 'page menu exposes the audio mode destination');
              const timeOrigin = await page.evaluate(() => performance.timeOrigin);
              await audioDestination.click();
              await page.waitForFunction(() => document.body.dataset.creationMode === 'audio' && !document.body.hasAttribute('data-creation-transition'), null, {timeout:20000});
              assert.equal(new URL(page.url()).pathname, '/draw/', 'creation destination stays in the Draw document');
              assert.equal(new URL(page.url()).searchParams.get('mode'), 'audio', 'creation destination updates mode query');
              assert.equal(await page.evaluate(() => performance.timeOrigin), timeOrigin, 'creation destination changes mode without reloading the document');
              row.checks.push('page menu audio destination switches mode in place and updates the query');
            }
            row.checks.push('page menu label, scroller/close, links, combined settings, focus wrap/Escape, storage preservation');
          }
        }
        if (phase === 'after' && path !== '/draw/' && path !== '/pixiee-lens/') {
          if (path === '/globe/') {
            assert.equal(row.creationControls.length, 0, 'map route has no creation mode bar');
            assert.ok(row.workNavigation.some(n=>n.label==='この画面の操作'&&n.actions.some(a=>a.action==='view'&&/見る/.test(a.text))&&n.actions.some(a=>a.action==='post'&&/投稿する/.test(a.text))), 'map exposes its view/post work actions');
          } else if (path.startsWith('/stores/')) {
            assert.equal(row.creationControls.length, 0, 'store route has no creation mode bar');
            assert.ok(row.workNavigation.some(n=>n.label==='この画面の操作'&&n.actions.some(a=>a.href==='#store-search')), 'store exposes its search anchor as a work action');
          }
          const pageLinks = row.workNavigation.flatMap(n=>n.actions).filter(a=>a.href&&!a.href.startsWith('#'));
          assert.equal(pageLinks.length, 0, `${path}: work row contains no page destination links`);
          if (row.workNavigation.length) assert.equal(row.workNavigation.length, 1, `${path}: work navigation is singular`);
        }
        if (row.status === 'PENDING') row.status = phase === 'after' ? 'PASS' : 'CAPTURED';
      } catch (error) {
        row.status = 'FAIL'; row.failure = error.message;
        failures.push({ path, viewport, error: error.message });
        console.error(`FAIL ${path} ${viewport.width}x${viewport.height}: ${error.message}`);
        if (phase === 'before') row.status = 'CAPTURED_WITH_BASELINE_GAP';
      }
      }
    await context.close();
    console.log(`${phase} ${viewport.width}x${viewport.height} complete`);
  }
} finally {
  await browser.close();
  await writeFile(`${output}/${phase}.json`, JSON.stringify(results, null, 2));
  await writeFile(`${output}/${phase}-failures.json`, JSON.stringify(failures, null, 2));
  await writeFile(`${output}/metadata.json`, JSON.stringify({ phase, head, sourceFingerprint, base, startedAt, finishedAt: new Date().toISOString(), externalRequests: 'blocked', physicalDevices: 'UNTESTED', cameraPermission: 'never granted', results: results.length }, null, 2));
}
console.log(`${phase}: ${JSON.stringify(results.reduce((counts, row) => (counts[row.status] = (counts[row.status] || 0) + 1, counts), {}))}; report ${output}`);
if (phase === 'after' && failures.length) process.exitCode = 1;
