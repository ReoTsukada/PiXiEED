import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const playwrightModule = process.env.PIXIEED_PLAYWRIGHT_MODULE || 'playwright';
const { chromium } = await import(playwrightModule);
const out = process.env.PIXIEED_AD_EVIDENCE_DIR || join(tmpdir(), 'pixieed-output-side-ad-preview');
const base = process.env.PIXIEED_BROWSER_BASE_URL || 'http://127.0.0.1:4211';
const report = { cases: [], thresholds: [], scroll: [], zoom: [], otherPages: [], previews: [], errors: [], denied: [], providerStubs: 0, hardwareCalls: 0 };
const baselineHtml = process.env.PIXIEED_AD_BASELINE_HTML ? await readFile(process.env.PIXIEED_AD_BASELINE_HTML, 'utf8') : null;
report.baseline = baselineHtml ? 'Inherited conversion tree before the two ad-preview includes' : 'Current tree without adPreview';
await mkdir(join(out, 'downloads'), { recursive: true });
const server = process.env.PIXIEED_BROWSER_BASE_URL ? null : spawn(process.execPath, [root + '/scripts/tool-runtime-local-server.mjs'], {
  env: { ...process.env, PIXIEED_BENCH_PORT: '4211' }, stdio: ['ignore', 'pipe', 'inherit']
});
let browser;
const paint = page => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
async function context(viewport) {
  const context = await browser.newContext({ viewport, serviceWorkers: 'block', acceptDownloads: true });
  await context.route('**/*', route => {
    const request = route.request(), url = new URL(request.url());
    if (url.origin !== base || !['GET', 'HEAD'].includes(request.method())) {
      report.denied.push({ url: request.url(), method: request.method() }); return route.abort();
    }
    if (baselineHtml && url.pathname === '/output/work/' && url.searchParams.get('adBaseline') === '1') return route.fulfill({ contentType: 'text/html', body: baselineHtml });
    // Prevent even local provider-loader execution. No real creative, ad SDK or GA request.
    if (url.pathname === '/js/adsense-auto.js') { report.providerStubs++; return route.fulfill({ contentType: 'text/javascript', body: '' }); }
    if (url.pathname === '/js/site-analytics.mjs') return route.fulfill({ contentType: 'text/javascript', body: 'export function trackSiteEvent(){};export function trackToolStartOnce(){};export function trackToolEvent(){};' });
    if (url.pathname === '/js/site-header-benefits.mjs') return route.fulfill({ contentType: 'text/javascript', body: '' });
    if (url.pathname === '/js/display-ads.mjs') return route.fulfill({ contentType: 'text/javascript', body: 'export function mountDisplayAds(){return()=>{}};' });
    return route.continue();
  });
  await context.addInitScript(() => {
    window.__adReviewHardware = 0; window.__adReviewShifts = [];
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: async () => { window.__adReviewHardware++; throw Error('Hardware forbidden in placement review'); } } });
    new PerformanceObserver(list => { for (const entry of list.getEntries()) if (!entry.hadRecentInput) window.__adReviewShifts.push(entry.value); }).observe({ type: 'layout-shift', buffered: true });
  });
  const page = await context.newPage(); page.setDefaultTimeout(12000);
  page.on('pageerror', error => report.errors.push(error.message));
  return { context, page };
}
async function stageImage(page) {
  await page.goto(base + '/output/work/');
  return page.evaluate(async () => {
    const { stageToolOutput } = await import('/js/creation/output-handoff.mjs?rev=20261020-format-conversion-1');
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 32;
    const ctx = canvas.getContext('2d'), palette = ['#f3ca6b', '#245345', '#d7e6c7', '#df8065', '#447b8b'];
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) { ctx.fillStyle = palette[(x * 3 + y * 2) % palette.length]; ctx.fillRect(x * 4, y * 4, 4, 4); }
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    const frames = [{ width: 32, height: 32, data: new Uint8Array(ctx.getImageData(0, 0, 32, 32).data) }];
    const staged = await stageToolOutput({ blob, filename: 'synthetic-ad-review.png', returnUrl: '/draw/?workspace=1', title: '合成画像の出力', source: 'local synthetic fixture', metadata: { width: 32, height: 32 },
      mediaSources: [{ id: 'local-images-review', label: '合成画像', kind: 'rgba-frames', frames, totalPlays: 1 }] });
    return staged.url;
  });
}
async function open(page, url, mode, size = 'auto') {
  const target = new URL(url); if (mode !== 'none') target.searchParams.set('adPreview', mode);
  if (mode !== 'none') target.searchParams.set('adSize', size);
  await page.goto(target.href); await page.locator('#output-layout').waitFor({ state: 'visible' });
  await page.waitForFunction(() => document.querySelector('#output-download').getAttribute('href')?.startsWith('blob:'));
  await paint(page); await page.waitForTimeout(100);
}
async function snapshot(page) {
  return page.evaluate(() => {
    const rect = node => { const r = node.getBoundingClientRect(); return [r.x, r.y, r.width, r.height].map(v => Math.round(v * 1000) / 1000); };
    const selectors = ['.output-main', '#output-layout', '#output-preview', '#output-download', '#output-return', '#output-filename', '#output-extension'];
    return { boxes: Object.fromEntries(selectors.map(s => [s, rect(document.querySelector(s))])),
      documentHeight: document.documentElement.scrollHeight, scrollWidth: document.documentElement.scrollWidth, viewportWidth: innerWidth, scrollY,
      filename: document.querySelector('#output-filename').value, format: document.querySelector('#output-extension').textContent,
      metadata: document.querySelector('#output-metadata').textContent, focus: document.activeElement.id,
      unitCount: document.querySelectorAll('.output-side-ad-preview').length,
      ad: (() => { const n = document.querySelector('.output-side-ad-preview'); return n ? { visible: !n.hidden, eligible: n.dataset.eligible, state: n.dataset.previewState, box: rect(n), unit: rect(n.querySelector('.output-side-ad-preview__unit')), localTop: n.style.top, actualUnitHeight: getComputedStyle(n.querySelector('.output-side-ad-preview__unit')).height } : null; })(),
      visualViewport: window.visualViewport ? { width: visualViewport.width, height: visualViewport.height, scale: visualViewport.scale, offsetTop: visualViewport.offsetTop, offsetLeft: visualViewport.offsetLeft } : null };
  });
}
function unchanged(before, after, label) {
  assert.deepEqual(after.boxes, before.boxes, label + ': primary coordinates');
  for (const key of ['documentHeight', 'scrollWidth', 'scrollY', 'filename', 'format', 'metadata']) assert.deepEqual(after[key], before[key], label + ': ' + key);
  assert.ok(after.scrollWidth <= after.viewportWidth, label + ': horizontal overflow');
}
async function save(page, name) {
  const pending = page.waitForEvent('download'); await page.locator('#output-download').click();
  const download = await pending, path = join(out, 'downloads', name); await download.saveAs(path);
  const bytes = await readFile(path);
  assert.equal(bytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  assert.match(await page.locator('#output-status').textContent(), /ダウンロードを開始しました/);
  return { bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
}
async function capture(page, name, metadata) {
  const path = `${out}/${name}.png`; await page.screenshot({ path, fullPage: false }); report.previews.push({ path, synthetic: true, ...metadata });
}

try {
  if (server) await new Promise((resolve, reject) => { server.stdout.once('data', resolve); server.once('error', reject); server.once('exit', code => reject(Error(`Local server exited before ready: ${code}`))); });
  browser = await chromium.launch({ headless: true }); report.browser = browser.version();
  for (const viewport of [{ width: 1920, height: 1080 }, { width: 2560, height: 1440 }, { width: 1440, height: 900 }, { width: 1366, height: 768 }, { width: 390, height: 844 }, { width: 320, height: 700 }]) {
    const { context: ctx, page } = await context(viewport), url = await stageImage(page);
    const baselineUrl = new URL(url); if (baselineHtml) baselineUrl.searchParams.set('adBaseline', '1');
    await open(page, baselineUrl.href, 'none'); const baseline = await snapshot(page); assert.equal(baseline.unitCount, 0);
    if (viewport.width === 1920) await capture(page, 'pc-1920-no-ad', { viewport, size: 'none' });
    const baselineSave = await save(page, `${viewport.width}-none.png`);
    await open(page, url, 'none'); const currentDefault = await snapshot(page); unchanged(baseline, currentDefault, `${viewport.width} current default`); assert.equal(currentDefault.unitCount, 0);
    for (const size of ['auto', '160x600', '300x600']) for (const mode of ['slot', 'delay', 'unfilled', 'failed', 'blocked']) {
      await open(page, url, mode, size); const before = await snapshot(page); unchanged(baseline, before, `${viewport.width} ${size} ${mode}`);
      const available = (viewport.width - 1280) / 2 - 48 - 24;
      const chosenWidth = size === 'auto' ? (available >= 300 ? 300 : 160) : Number(size.split('x')[0]);
      const eligible = viewport.height >= 758 && available >= chosenWidth;
      assert.equal(before.ad.eligible, String(eligible), `${viewport.width} ${size} ${mode}: candidate`);
      assert.equal(before.ad.visible, eligible && mode === 'slot');
      await page.locator('#output-filename').evaluate(node => node.focus({ preventScroll: true })); const focusBefore = await page.evaluate(() => document.activeElement.id);
      const shiftsBefore = await page.evaluate(() => window.__adReviewShifts.length);
      if (mode === 'delay' && eligible) await page.waitForTimeout(1600);
      await paint(page); const after = await snapshot(page); unchanged(baseline, after, `${viewport.width} ${mode} after`);
      assert.equal(after.focus, focusBefore); assert.equal(after.ad.visible, eligible && ['slot', 'delay'].includes(mode));
      if (after.ad.visible) { assert.equal(after.ad.unit[2], chosenWidth); assert.equal(after.ad.unit[3], 600); assert.equal(after.ad.box[3], 621); }
      assert.equal(await page.evaluate(n => window.__adReviewShifts.slice(n).reduce((a, b) => a + b, 0), shiftsBefore), 0, 'ad-induced CLS');
      const saved = await save(page, `${viewport.width}-${size}-${mode}.png`); assert.deepEqual(saved, baselineSave);
      assert.equal(await page.locator('.output-side-ad-preview').count(), 1, 'no duplicate stub after save');
      await page.evaluate(() => scrollTo(0, 0)); await paint(page);
      if (mode === 'slot' && ((size === 'auto' && [1920, 2560, 390, 320].includes(viewport.width)) || (size === '160x600' && viewport.width === 2560)))
        await capture(page, `output-${viewport.width}x${viewport.height}-${size === 'auto' ? (eligible ? chosenWidth + 'x600' : 'no-ad') : size}`, { viewport, size, visibleStub: after.ad.visible });
      report.cases.push({ viewport, size, mode, availableWidth: available, baseline, before, after, coordinateDelta: 0, documentHeightDelta: 0, adInducedCLS: 0, download: saved, focusRetained: true });
    }
    // Hold the real progress signal across paints, then perform a real format conversion.
    // A resumed job retires the stub for this navigation; it never flashes back on completion.
    await open(page, url, 'slot');
    const progressGeometry = await snapshot(page);
    await page.evaluate(() => { document.querySelector('#output-generation-progress').hidden = false; }); await paint(page);
    assert.equal(await page.locator('.output-side-ad-preview').isVisible(), false);
    await page.evaluate(() => { document.querySelector('#output-generation-progress').hidden = true; }); await paint(page);
    assert.equal(await page.locator('.output-side-ad-preview').isVisible(), false);
    unchanged(progressGeometry, await snapshot(page), 'after progress signal');
    await page.locator('#output-extension').click(); await page.locator('#output-format-select').selectOption('webp');
    await page.waitForFunction(() => document.querySelector('#output-extension').textContent.trim().startsWith('.webp'));
    assert.equal(await page.locator('.output-side-ad-preview').count(), 1);
    assert.equal(await page.locator('.output-side-ad-preview').isVisible(), false);
    const retained = await page.evaluate(async () => {
      const { readToolOutput } = await import('/js/creation/output-handoff.mjs?rev=20261020-format-conversion-1');
      const r = await readToolOutput(new URLSearchParams(location.search).get('id'));
      return { sourceBytes: r.sourceBlob.size, outputs: r.outputs.map(o => o.extension), sources: r.mediaSources.length };
    });
    assert.equal(retained.sources, 1); assert.ok(retained.outputs.includes('webp'));
    await page.reload(); await page.locator('#output-layout').waitFor({ state: 'visible' }); await paint(page);
    assert.match(await page.locator('#output-extension').textContent(), /webp/);
    await page.goto(base + '/output/'); await page.goBack(); await page.locator('#output-layout').waitFor({ state: 'visible' });
    assert.match(await page.locator('#output-extension').textContent(), /webp/);
    report.cases.push({ viewport, lifecycle: 'progress-retire, real WebP conversion, reload and browser back', retained, duplicateStubs: 0 });
    // Resize/keyboard-sized viewport must immediately omit a no-longer-fitting stub.
    await open(page, url, 'slot'); await page.setViewportSize({ width: 390, height: 360 }); await paint(page);
    assert.equal(await page.locator('.output-side-ad-preview').isVisible(), false);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    report.hardwareCalls += await page.evaluate(() => window.__adReviewHardware); await ctx.close();
  }
  // Measure the exact CSS viewport boundaries rather than inferring from device resolution.
  for (const test of [
    { width: 1743, height: 900, size: 'auto', expected: 0 },
    { width: 1744, height: 900, size: 'auto', expected: 160 },
    { width: 2023, height: 900, size: 'auto', expected: 160 },
    { width: 2024, height: 900, size: 'auto', expected: 300 },
    { width: 2023, height: 900, size: '300x600', expected: 0 },
    { width: 2024, height: 900, size: '300x600', expected: 300 },
    { width: 1920, height: 757, size: '160x600', expected: 0 },
    { width: 1920, height: 758, size: '160x600', expected: 0 },
    { width: 1920, height: 854, size: '160x600', expected: 0 },
    { width: 1920, height: 855, size: '160x600', expected: 160 },
    { width: 2560, height: 757, size: '300x600', expected: 0 },
    { width: 2560, height: 758, size: '300x600', expected: 0 },
    { width: 2560, height: 854, size: '300x600', expected: 0 },
    { width: 2560, height: 855, size: '300x600', expected: 300 }
  ]) {
    const { context: ctx, page } = await context({ width: test.width, height: test.height }), url = await stageImage(page);
    await open(page, url, 'none'); const baseline = await snapshot(page);
    await open(page, url, 'slot', test.size); const after = await snapshot(page);
    unchanged(baseline, after, 'CSS boundary ' + JSON.stringify(test));
    assert.equal(after.ad.visible, Boolean(test.expected));
    if (test.expected) { assert.equal(after.ad.unit[2], test.expected); assert.equal(after.ad.unit[3], 600); }
    const availableWidth = test.width - 24 - (after.boxes['.output-main'][0] + after.boxes['.output-main'][2] + 48);
    report.thresholds.push({ ...test, availableWidth, baseline, after }); await ctx.close();
  }
  {
    const { context: ctx, page } = await context({ width: 1920, height: 1080 }), url = await stageImage(page);
    for (const y of [0, 1, 24, 100, 300]) {
      await open(page, url, 'none'); await page.evaluate(y => scrollTo({ top: y, behavior: 'instant' }), y); await paint(page); const baseline = await snapshot(page);
      await open(page, url, 'slot', '160x600'); await page.evaluate(y => scrollTo({ top: y, behavior: 'instant' }), y); await paint(page); const after = await snapshot(page);
      unchanged(baseline, after, 'scroll ' + y);
      const naturalTop = after.boxes['.output-main'][1] + 48;
      assert.equal(after.ad.visible, naturalTop >= 0, 'hide only when the full anchored slot no longer fits');
      if (after.ad.visible) assert.equal(after.ad.box[1], naturalTop, 'do not move the ad down around the header when scrolled');
      assert.equal(after.ad.localTop, '48px', 'document anchor stays fixed');
      report.scroll.push({ requestedY: y, baseline, after });
    }
    // Returning to the original document anchor may reveal the same inert stub, never a new unit.
    await page.evaluate(() => scrollTo(0, 0)); await paint(page);
    assert.equal(await page.locator('.output-side-ad-preview').isVisible(), true);
    assert.equal(await page.locator('.output-side-ad-preview').count(), 1); await ctx.close();
  }
  // Desktop zoom is modeled by its smaller CSS viewport, independently of device pixel ratio.
  // Pinch zoom is separately exercised using Chromium's real visual viewport scale signal.
  for (const physical of [{ width: 1920, height: 1080 }, { width: 2560, height: 1440 }]) for (const zoom of [1.25, 1.5, 2]) {
    const viewport = { width: Math.floor(physical.width / zoom), height: Math.floor(physical.height / zoom) };
    const { context: ctx, page } = await context(viewport), url = await stageImage(page);
    await open(page, url, 'none'); const baseline = await snapshot(page);
    await open(page, url, 'slot'); const after = await snapshot(page); unchanged(baseline, after, `desktop zoom model ${zoom}`);
    const available = (viewport.width - 1280) / 2 - 72, expectedWidth = available >= 300 ? 300 : available >= 160 ? 160 : 0;
    assert.equal(after.ad.visible, Boolean(expectedWidth && viewport.height >= 758));
    report.zoom.push({ type: 'desktop CSS viewport model; browser menu zoom not automated', physical, zoom, viewport, baseline, after }); await ctx.close();
  }
  {
    const { context: ctx, page } = await context({ width: 1920, height: 1080 }), url = await stageImage(page), cdp = await ctx.newCDPSession(page);
    await open(page, url, 'none'); await cdp.send('Emulation.setPageScaleFactor', { pageScaleFactor: 2 }); await paint(page); const baseline = await snapshot(page);
    await cdp.send('Emulation.setPageScaleFactor', { pageScaleFactor: 1 }); await open(page, url, 'slot', '160x600');
    await cdp.send('Emulation.setPageScaleFactor', { pageScaleFactor: 2 }); await paint(page); const after = await snapshot(page);
    assert.equal(after.visualViewport.scale, 2); assert.equal(after.ad.visible, false); unchanged(baseline, after, 'pinch zoom');
    await cdp.send('Emulation.setPageScaleFactor', { pageScaleFactor: 1 }); await paint(page); assert.equal(await page.locator('.output-side-ad-preview').isVisible(), true);
    report.zoom.push({ type: 'Chromium visualViewport pinch scale 2 and reset', baseline, after }); await ctx.close();
  }
  // Existing pages get no extra slot, reserved blank, provider request or loading entry.
  for (const viewport of [{ width: 1920, height: 1080 }, { width: 390, height: 844 }, { width: 320, height: 700 }]) {
    const { context: ctx, page } = await context(viewport);
    for (const route of ['/', '/tools/', '/about/', '/guide/', '/stores/', '/books/', '/draw/', '/audio/', '/camera/', '/output/']) {
      await page.goto(base + route, { waitUntil: 'networkidle' });
      assert.equal(await page.locator('.output-side-ad-preview').count(), 0);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
      assert.equal(overflow, false, route + ' overflow'); report.otherPages.push({ viewport, route, extraAdSlots: 0, overflow });
    }
    report.hardwareCalls += await page.evaluate(() => window.__adReviewHardware); await ctx.close();
  }
  assert.deepEqual(report.errors, []); assert.deepEqual(report.denied, []); assert.equal(report.hardwareCalls, 0);
} catch (error) { report.failure = { message: error.message, stack: error.stack }; process.exitCode = 1; }
finally {
  await browser?.close(); server?.kill('SIGTERM');
  await writeFile(join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ cases: report.cases.length, thresholds: report.thresholds.length, scroll: report.scroll.length, zoom: report.zoom.length, otherPages: report.otherPages.length, previews: report.previews.length, errors: report.errors, denied: report.denied, hardwareCalls: report.hardwareCalls, failure: report.failure }));
}
