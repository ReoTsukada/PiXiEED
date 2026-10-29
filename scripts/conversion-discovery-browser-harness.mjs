#!/usr/bin/env node
/** Real guide navigation, files, module Workers and IndexedDB. No UI/codec substitutes. */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { encodePcm } from '../js/creation/conversion-pcm.mjs';
const root = resolve(process.env.PIXIEED_BROWSER_ROOT || fileURLToPath(new URL('../', import.meta.url)));
const output = (process.env.PIXIEED_BROWSER_ARTIFACTS || '/tmp/pixieed-output-browser') + '/discovery';
await mkdir(output, { recursive: true });
const mime = { '.mjs': 'text/javascript', '.js': 'text/javascript', '.html': 'text/html', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' };
const server = createServer(async (request, response) => {
  try {
    let path = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    if (path.endsWith('/')) path += 'index.html';
    const file = resolve(root, '.' + path);
    if (!file.startsWith(root + '/')) throw new Error('path');
    response.setHeader('Content-Type', mime[extname(file)] || 'application/octet-stream'); response.end(await readFile(file));
  } catch { response.statusCode = 404; response.end(); }
});
await new Promise(done => server.listen(0, '127.0.0.1', done));
const base = `http://127.0.0.1:${server.address().port}`;
const { chromium } = await import(process.env.PIXIEED_PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PIXIEED_PLAYWRIGHT_MODULE).href : 'playwright');
const browser = await chromium.launch({ executablePath: process.env.PIXIEED_CHROME_EXECUTABLE || undefined, args: ['--no-sandbox'] });
const report = { browser: browser.version(), cases: [], errors: [] };
const pass = name => { report.cases.push(name); console.log('PASS ' + name); };
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
await context.route('**/*', route => new URL(route.request().url()).origin === base ? route.continue() : route.abort());
const page = await context.newPage(); page.setDefaultTimeout(20000);
page.on('pageerror', error => report.errors.push(error.message)); page.on('dialog', dialog => dialog.accept());
async function open(path) {
  await page.goto(base + path, { waitUntil: 'domcontentloaded' });
  if (path.startsWith('/output/work/')) await page.locator('[data-text-tools]').waitFor({ state: 'attached' });
}
async function download(selector = '[data-download]') {
  const [file] = await Promise.all([page.waitForEvent('download'), page.locator(selector).click()]);
  assert.equal(await file.failure(), null); return { name: file.suggestedFilename(), bytes: await readFile(await file.path()) };
}
try {
  // The homepage is a light navigation portal; social interactions stay on Explore.
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 920 });
    await open('/');
    await page.locator('.portal-bento .portal-card').first().waitFor({ state: 'visible' });
    assert.equal(await page.locator('h1').count(), 1);
    assert.equal(await page.locator('.portal-card').count(), 7);
    assert.equal(await page.locator('#socialApp').count(), 0);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    pass('Home portal at '+width+'px: links, one heading, no overflow');
    if ([390,1440].includes(width)) await page.screenshot({ path: output+'/home-'+width+'.png', fullPage: true });
  }
  await page.setViewportSize({ width: 390, height: 920 });
  await open('/');
  await page.locator('#portal-query').fill('ＧＩＦ');
  await page.locator('#portal-results a').first().waitFor({ state: 'visible' });
  assert.equal(await page.locator('#portal-results a').first().getAttribute('href'), '/output/gif-speed/');
  await page.locator('#portal-query').fill('SNS');
  assert.equal(await page.locator('#portal-results a').first().getAttribute('href'), '/explore/');
  await page.locator('#portal-query').press('Enter');
  await page.waitForURL(base+'/explore/');
  assert.ok(await page.locator('#feed').count());
  assert.ok(await page.locator('#composerDialog').count());
  pass('Homepage intent search navigates to real SNS feed and retains composer');
  await open('/');
  assert.ok(await page.locator('.portal-more-disclosure').isVisible());
  assert.equal(await page.locator('.portal-more-disclosure').getAttribute('open'), null);
  await page.locator('.portal-more-disclosure summary').click();
  assert.ok(await page.locator('a[href="/output/formats/"]').isVisible());
  pass('Additional tools are progressively disclosed rather than a button wall');
  await open('/?view=saved');
  await page.waitForURL(base+'/explore/?view=saved');
  pass('Old home social bookmarks redirect to Explore');
  // Explore uses the actual social controller and local IndexedDB, not seeded posts.
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 950 });
    await open('/explore/');
    await page.locator('.explore-hero').waitFor({ state: 'visible' });
    assert.equal(await page.locator('h1').count(), 1);
    assert.equal(await page.locator('#feedViews [data-action="view"]').count(), 3);
    assert.equal(await page.locator('#feedViews [data-action="mine"]').count(), 1);
    assert.equal(await page.locator('#socialSearch').count(), 1);
    assert.ok(await page.locator('#pageTitle').isVisible(), 'The community heading must be visible, including on mobile');
    assert.ok(await page.locator('.prompt-open').isVisible(), 'The post composer entrance must be visible');
    assert.equal(await page.locator('#composerDialog').count(), 1);
    assert.deepEqual(await page.locator('#socialApp').evaluate(element =>
      [...element.childNodes].filter(node => node.nodeType === Node.TEXT_NODE && node.textContent.trim()).map(node => node.textContent.trim())
    ), [], 'No stray markup fragments may be visible outside SNS sections');
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    if (width >= 1191) assert.ok(await page.locator('.explore-maker-feature').isVisible());
    pass('Explore at '+width+'px: responsive SNS hero, search, views, composer');
    if ([390,1440].includes(width)) await page.screenshot({ path: output+'/explore-'+width+'.png', fullPage: true });
  }
  await page.setViewportSize({ width: 390, height: 950 });
  await open('/explore/');
  await page.waitForFunction(() => document.querySelector('#socialApp')?.dataset.ready === 'true', { timeout: 12000 });
  await page.locator('#feedViews [data-view="saved"]').click();
  await page.waitForFunction(() => document.body.dataset.exploreView === 'saved');
  assert.equal(await page.locator('#socialSearch').isVisible(), false);
  await page.locator('#feedViews [data-view="local"]').click();
  await page.waitForFunction(() => document.body.dataset.exploreView === 'local');
  assert.ok(await page.locator('#draftsPanel').isVisible());
  await page.locator('#feedViews [data-view="feed"]').click();
  await page.waitForFunction(() => document.body.dataset.exploreView === 'feed');
  assert.ok(await page.locator('#socialSearch').isVisible());
  await page.locator('.prompt-open').click();
  await page.locator('#composerDialog').waitFor({ state: 'visible' });
  assert.ok(await page.locator('#composerForm').isVisible());
  await page.locator('#composerClose').click();
  await page.locator('#composerDialog').waitFor({ state: 'hidden' });
  pass('Explore: real saved/draft/feed switching and existing composer dialog');
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 }); await open('/output/formats/qoi/');
    assert.equal(await page.locator('h1').count(), 1);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    pass(`QOI guide at ${width}px: one heading and no horizontal overflow`);
    if ([390,1440].includes(width)) await page.screenshot({ path: `${output}/qoi-${width}.png`, fullPage: true });
  }
  await open('/output/formats/'); await page.locator('[data-format-filter]').waitFor({ state: 'visible' });
  await page.locator('[data-format-filter]').fill('.ＱＯＩ');
  assert.ok(await page.locator('[data-format-card]:visible').count() > 0);
  await page.locator('[data-format-filter]').fill('no-matching-format'); assert.ok(await page.locator('[data-format-empty]').isVisible());
  await page.locator('[data-format-filter]').fill(''); assert.equal(await page.locator('[data-format-card]:visible').count(), 8);
  pass('Local directory filter, full-width characters, empty-state recovery');
  await page.screenshot({ path: `${output}/directory.png`, fullPage: true });
  const png = Buffer.from(await page.evaluate(() => {
    const canvas = document.createElement('canvas'); canvas.width = 12; canvas.height = 8;
    const ctx = canvas.getContext('2d'); ctx.fillStyle = '#1b563e'; ctx.fillRect(2, 1, 10, 7);
    return [...atob(canvas.toDataURL('image/png').split(',')[1])].map(ch => ch.charCodeAt(0));
  }));
  const samples = Float64Array.from({ length: 800 }, (_, i) => (i % 64 - 32) / 64);
  const aiff = Buffer.from(await encodePcm({ sampleRate: 8000, channels: [samples] }, 'aiff', { bitDepth: 16 }).arrayBuffer());
  const signature = { qoi: [0, 'qoif'], tiff: [0, 'II'], ico: null, tga: null, ppm: [0, 'P6'], bmp: [0, 'BM'], aiff: [8, 'AIFF'], au: [0, '.snd'] };
  for (const [slug, target] of Object.entries({ qoi:'qoi', tga:'tga', tiff:'tiff', ico:'ico', netpbm:'ppm', bmp:'bmp', aiff:'aiff', au:'au' })) {
    await open(`/output/formats/${slug}/`); await page.locator('.format-intro [data-output-start]').click();
    await page.locator('.convert-intent').waitFor({ state: 'visible' });
    const audio = ['aiff','au'].includes(target);
    await page.locator('[data-file]').setInputFiles({ name: audio ? 'sample.aiff' : 'sample.png', mimeType: audio ? 'audio/aiff' : 'image/png', buffer: audio ? aiff : png });
    await page.waitForFunction(target => document.querySelector('[data-format]')?.value === target, target);
    assert.equal(await page.locator('.convert-intent').getAttribute('data-state'), 'ready');
    if (target === 'qoi') await page.screenshot({ path: `${output}/intent-qoi.png`, fullPage: true });
    await page.locator('[data-convert]').click(); await page.locator('[data-download]').waitFor({ state: 'visible' });
    const result = await download(); assert.ok(result.name.endsWith('.' + target)); assert.ok(result.bytes.length > 16);
    if (signature[target]) { const [offset, text] = signature[target]; assert.equal(result.bytes.subarray(offset,offset+text.length).toString(),text); }
    if (target === 'ico') assert.equal(result.bytes.subarray(0,4).toString('hex'),'00000100');
    if (target === 'tga') { assert.equal(result.bytes[2],2); assert.equal(result.bytes[16],32); }
    pass(`${slug}: real guide → selected ${target} → actual downloaded file`);
  }
  await open('/output/work/?mode=convert&to=qoi');
  await page.locator('[data-file]').setInputFiles({ name: 'sample.png', mimeType: 'image/png', buffer: png });
  await page.waitForFunction(() => document.querySelector('[data-format]').value === 'qoi');
  await page.locator('[data-format]').selectOption('png'); assert.equal(await page.locator('.convert-intent').isVisible(), false);
  await page.locator('[data-file]').setInputFiles({ name: 'second.png', mimeType: 'image/png', buffer: png });
  await page.waitForFunction(() => document.querySelector('[data-name]')?.textContent === 'second.png' && !document.querySelector('[data-convert]').disabled);
  assert.equal(await page.locator('[data-format]').inputValue(), 'png');
  pass('Manual changes override the suggested target, including subsequent file loads');
  await open('/output/work/?mode=convert&to=aiff');
  await page.locator('[data-file]').setInputFiles({ name: 'image.png', mimeType: 'image/png', buffer: png });
  await page.waitForFunction(() => document.querySelector('.convert-intent').dataset.state === 'unavailable');
  assert.equal(await page.locator('[data-format]').inputValue(), 'png');
  pass('Incompatible audio target shows explanation and keeps a valid image output');
  await open('/output/work/?mode=convert&to=qoi&text=input');
  await page.locator('[data-tx-source]').waitFor({ state: 'visible' }); assert.equal(await page.locator('.convert-intent').count(),0);
  pass('Text input mode takes precedence over a conversion intent');
  const staged = await page.evaluate(async bytes => {
    const { storeOutputFile } = await import('/js/creation/output-router.mjs?rev=20261028-unified-output-1');
    return storeOutputFile(new Blob([new Uint8Array(bytes)], { type: 'image/png' }), 'original.png', '/draw/');
  }, [...png]);
  await open(staged.url + '&to=qoi'); await page.locator('[data-download]').waitFor({ state: 'visible' });
  assert.equal(await page.locator('.convert-intent').count(),0); assert.deepEqual((await download()).bytes,png);
  pass('Real IndexedDB handoff ignores intent and preserves original file bytes');

  // The compact Draw menu uses the production HTML/CSS. Reproduce the runtime
  // text-tool reparenting and measure hit areas with the same Chrome engine.
  const drawHtml = await readFile(resolve(root, './draw/editor.html'), 'utf8');
  const pickerMarkup = drawHtml.match(/<details id="draw-tool-picker"[\s\S]*?<\/details>/)?.[0];
  assert.ok(pickerMarkup, 'Draw tool picker must be present in the published editor');
  const layoutPage = await context.newPage();
  await layoutPage.setContent('<!doctype html><html><body data-page="draw"><div class="draw-controls"><div class="draw-fixed-left">'+pickerMarkup+'</div></div></body></html>');
  const menuCss = await readFile(resolve(root, './css/draw-tool-picker.css'), 'utf8');
  const textCss = await readFile(resolve(root, './css/draw-text-panel.css'), 'utf8');
  await layoutPage.addStyleTag({ content: menuCss + '\n' + textCss });
  await layoutPage.evaluate(() => {
    const slot = document.createElement('div'); slot.className = 'draw-text-tool-slot';
    const button = document.createElement('button');
    button.className = 'draw-text-opener'; button.type = 'button'; button.textContent = '文字';
    button.setAttribute('aria-label', '文字を入力'); slot.append(button);
    document.querySelector('.draw-tool-menu .draw-tool-group').append(slot);
    document.getElementById('draw-tool-picker').open = true;
  });
  for (const width of [320, 390, 650, 900]) {
    await layoutPage.setViewportSize({ width, height: 820 });
    const measure = await layoutPage.evaluate(() => {
      const rect = element => { const r=element.getBoundingClientRect(); return { x:r.x, y:r.y, width:r.width, height:r.height }; };
      const selection = [...document.querySelectorAll('.draw-select-tool-modes > button')].map(rect);
      const text = rect(document.querySelector('.draw-text-opener'));
      const spray = rect(document.querySelector('[data-draw-tool="spray"]'));
      const groups = [...document.querySelectorAll('.draw-tool-group')];
      return { selection, text, spray, overflow: groups.some(g => g.scrollWidth > g.clientWidth + 1),
        menu:rect(document.querySelector('.draw-tool-menu')) };
    });
    assert.equal(measure.selection.length, 3);
    assert.ok(measure.selection.every(e => Math.abs(e.y - measure.selection[0].y) < 1), 'selection modes must be on the same row');
    assert.ok(measure.selection.every(e => Math.abs(e.width - measure.selection[0].width) < 2), 'selection modes must be equally wide');
    assert.ok(Math.abs(measure.text.width - measure.spray.width) < 2 && Math.abs(measure.text.height - measure.spray.height) < 1,
      'text tool and spray must share a full-sized touch target');
    assert.ok(measure.text.width >= 48 && measure.text.height >= 48);
    assert.equal(measure.overflow, false, 'no individual tool section should overflow its grid');
    assert.ok(measure.menu.x >= 0 && measure.menu.x + measure.menu.width <= width, 'menu must remain within viewport');
    pass('Draw compact tool menu at '+width+'px: aligned selection and text buttons');
    if (width === 390) await layoutPage.screenshot({ path: output+'/draw-tool-grid-390.png', fullPage: false });
  }
  await layoutPage.close();
  // Exercise the real Draw runtime, not a mocked renderer: a single dispatched
  // pointer move containing many high-resolution samples should draw every
  // pixel but queue only one paint for the frame.
  const drawPage = await context.newPage();
  drawPage.setDefaultTimeout(25000);
  const drawErrors = [];
  drawPage.on('pageerror', error => drawErrors.push(error.message));
  await drawPage.addInitScript(() => {
    window.__drawStrokeAudit = { paints: 0 };
    const original = CanvasRenderingContext2D.prototype.putImageData;
    CanvasRenderingContext2D.prototype.putImageData = function (...args) {
      if (this.canvas?.id === 'draw-canvas') window.__drawStrokeAudit.paints++;
      return original.apply(this, args);
    };
  });
  await drawPage.setViewportSize({ width: 390, height: 844 });
  await drawPage.goto(base + '/draw/editor.html', { waitUntil: 'domcontentloaded' });
  await drawPage.locator('#draw-canvas').waitFor({ state: 'attached' });
  await drawPage.waitForFunction(() => {
    const canvas = document.querySelector('#draw-canvas');
    return Boolean(canvas?.dataset.tool && !document.querySelector('#main')?.inert);
  }, null, { timeout: 40000 });
  // Browser-trusted mouse events exercise the real captured gesture; synthetic
  // pointerdown cannot establish capture and must not be used to assert input.
  const drawCanvas = drawPage.locator('#draw-canvas');
  const box = await drawCanvas.boundingBox();
  assert.ok(box && box.width > 0 && box.height > 0, 'Draw canvas must be visible and sized');
  const grid = await drawCanvas.evaluate(canvas => ({ width: canvas.width, height: canvas.height }));
  const rgbaCount = () => drawCanvas.evaluate(canvas => {
    const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
    let count = 0; for (let i=3; i<data.length; i+=4) if (data[i]) count++;
    return count;
  });
  const beforePixels = await rgbaCount();
  const y = box.y + box.height * Math.floor(grid.height * .5) / grid.height + box.height / (grid.height * 2);
  const xAt = n => box.x + box.width * (n + .5) / grid.width;
  await drawPage.mouse.move(xAt(2), y);
  await drawPage.mouse.down();
  await drawPage.mouse.move(xAt(Math.max(3, grid.width - 3)), y, { steps: 14 });
  await drawPage.mouse.up();
  await drawPage.waitForTimeout(90);
  const afterPixels = await rgbaCount();
  assert.ok(afterPixels > beforePixels, 'real mouse stroke must paint canvas pixels');
  assert.ok(await drawPage.locator('#draw-undo').isEnabled(), 'real stroke must commit one history transaction');
  await drawPage.locator('#draw-undo').click();
  assert.equal(await rgbaCount(), beforePixels, 'undo restores original canvas without dropped pixels');
  assert.deepEqual(drawErrors, [], 'drawing should not throw page errors');
  pass('Draw real mouse gesture paints and undo restores exact original pixels');
  await drawPage.screenshot({ path: output+'/draw-stroke-after.png', fullPage: false });
  // Exercise the real Draw document at progressively larger canvas sizes.
  // Frame intervals are diagnostic CI-machine samples, not device FPS promises.
  report.drawCanvasAudit = [];
  for (const size of [32, 64, 128, 256]) {
    await drawPage.evaluate(next => {
      const input = document.querySelector('#draw-size');
      input.value = String(next);
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }, size);
    const panel = drawPage.locator('#creation-project-settings-panel');
    await panel.waitFor({ state: 'visible', timeout: 15000 });
    await drawPage.locator('[data-project-action="preview"]').click();
    await drawPage.waitForFunction(() => !document.querySelector('[data-project-action="apply"]')?.disabled, null, { timeout: 20000 });
    await drawPage.locator('[data-project-action="apply"]').click();
    await drawPage.waitForFunction(next => document.querySelector('#draw-canvas')?.width === next, size, { timeout: 20000 });
    await panel.locator('.creation-project-settings__close').click();
    await panel.waitFor({ state: 'hidden' });
    const basePixels = await rgbaCount();
    // Idle control on the same CI browser/viewport, not a presumed 60fps baseline.
    const idle = await drawPage.evaluate(() => new Promise(resolve => {
      let first = 0, prior = 0; const gaps = [];
      function sample(at) {
        if (!first) first = at;
        if (prior) gaps.push(at - prior);
        prior = at;
        if (at - first >= 550) {
          const ordered = gaps.sort((a, b) => a - b);
          resolve({ idleFrames: ordered.length, idleP95FrameGapMs: ordered[Math.min(ordered.length-1, Math.floor(ordered.length*.95))] || null,
            idleMaxFrameGapMs: ordered.at(-1) || null });
        } else requestAnimationFrame(sample);
      }
      requestAnimationFrame(sample);
    }));
    const canvasBox = await drawCanvas.boundingBox();
    assert.ok(canvasBox && canvasBox.width > 0 && canvasBox.height > 0, 'resized canvas must be visible');
    const row = Math.max(1, Math.floor(size * .85));
    const moveY = canvasBox.y + canvasBox.height * (row + .5) / size;
    const moveX = n => canvasBox.x + canvasBox.width * (n + .5) / size;
    await drawPage.evaluate(() => {
      const audit = { gaps: [], previous: 0, stopped: false };
      window.__drawFrameProbe = audit;
      window.__drawStrokeAudit.paints = 0;
      const measure = at => {
        if (audit.stopped) return;
        if (audit.previous) audit.gaps.push(at - audit.previous);
        audit.previous = at;
        requestAnimationFrame(measure);
      };
      requestAnimationFrame(measure);
    });
    const started = Date.now();
    await drawPage.mouse.move(moveX(2), moveY);
    await drawPage.mouse.down();
    await drawPage.mouse.move(moveX(size - 3), moveY, { steps: 20 });
    await drawPage.mouse.up();
    await drawPage.waitForTimeout(70);
    const elapsedMs = Date.now() - started;
    const strokePixels = await rgbaCount();
    assert.ok(strokePixels > basePixels, 'Draw at '+size+'px must write visible pixels');
    assert.ok(await drawPage.locator('#draw-undo').isEnabled(), 'Stroke at '+size+'px must be undoable');
    const frameStats = await drawPage.evaluate(() => {
      const audit = window.__drawFrameProbe; audit.stopped = true;
      const sorted = [...audit.gaps].sort((a,b)=>a-b);
      return { frames: sorted.length, p95FrameGapMs: sorted[Math.min(sorted.length-1, Math.floor(sorted.length*.95))] || null,
        maxFrameGapMs: sorted.at(-1) || null, drawCanvasPaintCalls: window.__drawStrokeAudit.paints };
    });
    await drawPage.locator('#draw-undo').click();
    assert.equal(await rgbaCount(), basePixels, 'Undo at '+size+'px must restore all prior pixels');
    report.drawCanvasAudit.push({ canvasSize: size, strokeWallMs: elapsedMs, writtenPixels: strokePixels - basePixels,
      ...idle, ...frameStats,
      relativeP95Gap: idle.idleP95FrameGapMs && frameStats.p95FrameGapMs
        ? Math.round(100 * frameStats.p95FrameGapMs / idle.idleP95FrameGapMs) / 100 : null });
    pass('Draw '+size+'px: real stroke, undo, frame timing sampled without content loss');
  }
  await writeFile(output+'/draw-canvas-audit.json', JSON.stringify(report.drawCanvasAudit, null, 2));
  await drawPage.close();

  // A fresh browser context emulates a 390px touch screen. This is not a physical Android device.
  const touchContext = await browser.newContext({ viewport: { width: 390, height: 844 },
    isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  await touchContext.route('**/*', route => new URL(route.request().url()).origin === base ? route.continue() : route.abort());
  const touchPage = await touchContext.newPage();
  const touchErrors = [];
  touchPage.on('pageerror', error => touchErrors.push(error.message));
  await touchPage.goto(base+'/draw/editor.html', { waitUntil: 'domcontentloaded' });
  await touchPage.waitForFunction(() => {
    const canvas = document.querySelector('#draw-canvas');
    return Boolean(canvas?.dataset.tool && !document.querySelector('#main')?.inert);
  }, null, { timeout: 40000 });
  const touchCanvas = touchPage.locator('#draw-canvas');
  const touchPixels = () => touchCanvas.evaluate(canvas => {
    const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
    let count = 0; for (let i=3;i<data.length;i+=4) if(data[i]) count++;
    return count;
  });
  const touchStart = await touchPixels();
  const touchRect = await touchCanvas.boundingBox();
  assert.ok(touchRect && touchRect.width > 0 && touchRect.height > 0);
  await touchPage.touchscreen.tap(touchRect.x + touchRect.width * .36, touchRect.y + touchRect.height * .36);
  await touchPage.waitForTimeout(80);
  const touchEnd = await touchPixels();
  assert.ok(touchEnd > touchStart, 'Emulated touch tap must paint a visible pixel');
  await touchPage.locator('#draw-undo').click();
  assert.equal(await touchPixels(), touchStart, 'Emulated touch undo must restore the original pixels');
  assert.deepEqual(touchErrors, [], 'Emulated touch drawing must not throw');
  report.drawTouchAudit = { viewportWidth: 390, writtenPixels: touchEnd - touchStart, undoRestored: true, emulated: true };
  pass('Draw 390px emulated touch: tap, visible pigment and exact undo');
  await touchContext.close();
  const staticContext = await browser.newContext({ javaScriptEnabled: false });
  const staticPage = await staticContext.newPage(); await staticPage.goto(base+'/output/formats/tga/');
  assert.equal(await staticPage.locator('.format-route-start').count(),4); assert.ok(await staticPage.locator('h1').isVisible()); await staticContext.close();
  pass('Guide content and four conversion links work without JavaScript');
  assert.deepEqual(report.errors, []); pass('No uncaught browser errors');
} catch (error) {
  report.failure = error.stack; console.error(error); process.exitCode = 1;
  await page.screenshot({ path: output+'/failure.png', fullPage:true }).catch(() => {});
} finally {
  await writeFile(output+'/report.json', JSON.stringify(report,null,2)); await browser.close(); server.close();
}
