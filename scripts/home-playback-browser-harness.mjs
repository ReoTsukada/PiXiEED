#!/usr/bin/env node
/** Local browser regression: touch, playback preference, audio and synthetic sensors. */
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const base = process.env.PIXIEED_BROWSER_BASE_URL || 'http://127.0.0.1:4184';
assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(new URL(base).hostname));
const modulePath = process.env.PIXIEED_PLAYWRIGHT_MODULE;
assert.ok(modulePath, 'Set PIXIEED_PLAYWRIGHT_MODULE to an existing installation');
const output = process.env.PIXIEED_HOME_OUTPUT || '/tmp/pixieed-home-autoplay-20261013';
const { chromium } = await import(pathToFileURL(modulePath).href);
const browser = await chromium.launch({ headless: true });
await mkdir(output, { recursive: true });
const report = { browser: browser.version(), physicalAndroid: 'UNTESTED', scenarios: [] };

async function open({ viewport = { width: 390, height: 844 }, preference = 'reduce', sensor = 'granted', stored = false, observer = true, oldSource = false } = {}) {
  const page = await browser.newPage({ viewport, hasTouch: true, isMobile: true, reducedMotion: preference });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(({ sensor, stored, observer }) => {
    if (stored) localStorage.setItem('PiXiEED:motion-preference:v1', 'reduced');
    window.__permissionCalls = 0; window.__notes = 0; window.__contexts = [];
    const NativeAudio = window.AudioContext;
    window.AudioContext = class extends NativeAudio { constructor(...args) { super(...args); __contexts.push(this); } };
    const start = OscillatorNode.prototype.start;
    OscillatorNode.prototype.start = function (...args) { __notes++; return start.apply(this, args); };
    window.DeviceOrientationEvent = sensor === 'unsupported' ? undefined : class extends Event {
      static requestPermission() { __permissionCalls++; return Promise.resolve(sensor === 'denied' ? 'denied' : 'granted'); }
    };
    window.DeviceMotionEvent = undefined;
    if (!observer) window.IntersectionObserver = undefined;
    window.__sample = (beta, gamma) => { for (let i = 0; i < 30; i++) {
      const event = new Event('deviceorientation'); Object.assign(event, { beta, gamma }); dispatchEvent(event);
    } };
    window.__right = () => {
      const angle = ((screen.orientation.angle % 360) + 360) % 360;
      __sample(angle === 90 ? 90 : angle === 270 ? -90 : 0, angle === 0 ? 90 : angle === 180 ? -90 : 0);
    };
  }, { sensor, stored, observer });
  const baseline = oldSource ? await readFile(process.env.PIXIEED_HOME_BASELINE, 'utf8') : null;
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== new URL(base).origin) return route.fulfill({ status: 200, body: '', contentType: 'text/javascript' });
    if (baseline && url.pathname === '/js/home-play.mjs') return route.fulfill({ status: 200, body: baseline, contentType: 'text/javascript' });
    return route.continue();
  });
  await page.goto(base + '/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.querySelectorAll('#hpColors button').length === 7);
  await page.waitForTimeout(250);
  return { page, errors };
}
async function blueTouch(page) {
  if (await page.locator('#hpPalette').isHidden()) await page.locator('#hpPaletteToggle').click();
  await page.locator('#hpColors button').nth(4).click();
  await page.locator('#hpCanvas').scrollIntoViewIfNeeded();
  const box = await page.locator('#hpCanvas').boundingBox();
  const cdp = await page.context().newCDPSession(page);
  const x = box.x + box.width * .04; const y = box.y + box.height * .55;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + 12, y, id: 1 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
  await page.waitForTimeout(80);
}
async function center(page) {
  return page.evaluate(() => {
    const c = document.querySelector('#hpCanvas'); const data = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    let x = 0; let y = 0; let count = 0;
    for (let i = 0; i < data.length; i += 4) if (data[i] === 49 && data[i + 1] === 95 && data[i + 2] === 208) {
      x += (i / 4) % c.width; y += Math.floor(i / 4 / c.width); count++;
    }
    return count ? { x: x / count, y: y / count, count } : null;
  });
}
async function moving(page, axis = 'y', sign = 1) {
  const before = await center(page); await page.waitForTimeout(350); const after = await center(page);
  assert.ok(before && after, 'touch drawing produces blue pixels');
  assert.ok((after[axis] - before[axis]) * sign > 1, `pixels move: ${JSON.stringify({ before, after })}`);
}
async function staticDrawing(page) {
  const before = await center(page); await page.waitForTimeout(260); const after = await center(page);
  assert.ok(before && after); assert.deepEqual(after, before, 'paused pixels stay still');
}
async function audio(page) { return page.evaluate(() => ({ notes: __notes, contexts: __contexts.map(c => c.state), text: document.querySelector('#hpAudioState').textContent })); }
async function frame(page) { return page.locator('#hpCanvas').evaluate(c => c.toDataURL()); }
async function animated(page) { const before = await frame(page); await page.waitForTimeout(220); assert.notEqual(await frame(page), before, 'hero visual updates automatically'); }

try {
  if (process.env.PIXIEED_HOME_BASELINE) {
    const { page, errors } = await open({ oldSource: true });
    await blueTouch(page); await staticDrawing(page);
    assert.ok((await audio(page)).notes > 0); assert.equal((await audio(page)).contexts[0], 'running');
    assert.deepEqual(errors, []);
    report.scenarios.push({ name: 'published-source-reproduction', result: 'PASS: reduced motion freezes pixels while audio runs' });
    await page.close();
  }
  for (const viewport of [{ width: 320, height: 568 }, { width: 390, height: 844 }, { width: 844, height: 390 }, { width: 1280, height: 800 }]) {
    for (const preference of ['reduce', 'no-preference']) {
      const { page, errors } = await open({ viewport, preference });
      assert.equal(await page.locator('#hpPlayback').getAttribute('aria-pressed'), 'true');
      assert.deepEqual((await audio(page)).contexts, [], 'initial motion cannot create audio before a gesture');
      assert.equal((await audio(page)).notes, 0);
      await animated(page);
      await blueTouch(page);
      assert.ok((await audio(page)).notes > 0);
      await page.locator('#hpCanvas').scrollIntoViewIfNeeded();
      await moving(page);
      if (await page.locator('#hpPalette').isHidden()) await page.locator('#hpPaletteToggle').click();
      await page.locator('#hpMotion').click();
      await page.locator('#hpCanvas').scrollIntoViewIfNeeded();
      await page.evaluate(() => __right());
      await moving(page, 'x');
      for (let n = 0; n < 3; n++) {
        await page.locator('#hpPlayback').click();
        await page.locator('#hpCanvas').scrollIntoViewIfNeeded();
        await page.waitForTimeout(60); await staticDrawing(page);
        const stopped = await audio(page); assert.equal(stopped.contexts[0], 'suspended');
        await blueTouch(page); assert.equal((await audio(page)).notes, stopped.notes, 'touch cannot unmute an explicit pause');
        await page.locator('#hpPlayback').click();
        await page.locator('#hpCanvas').scrollIntoViewIfNeeded();
        await page.evaluate(() => __right());
      }
      assert.equal(await page.evaluate(() => __permissionCalls), 1, 'repeated playback does not prompt again');
      await page.emulateMedia({ reducedMotion: preference === 'reduce' ? 'no-preference' : 'reduce' });
      await page.evaluate(() => document.documentElement.dataset.pixieedMotion = 'reduced');
      await page.waitForTimeout(80);
      assert.equal(await page.locator('#hpPlayback').getAttribute('aria-pressed'), 'true');
      assert.equal((await audio(page)).contexts[0], 'running', 'preference change cannot stop hero or audio');
      await page.evaluate(() => dispatchEvent(new PageTransitionEvent('pagehide')));
      await page.waitForTimeout(80); const hidden = await audio(page); assert.equal(hidden.contexts[0], 'suspended');
      await staticDrawing(page);
      await page.evaluate(() => dispatchEvent(new PageTransitionEvent('pageshow')));
      await page.waitForTimeout(120); assert.equal((await audio(page)).contexts[0], 'running', 'restoration resumes previously gesture-authorized audio');
      await animated(page);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
      const boxes = await page.locator('.hp-tools button').evaluateAll(nodes => nodes.map(n => n.getBoundingClientRect().toJSON()));
      assert.ok(boxes[0].right <= boxes[1].left || boxes[1].right <= boxes[0].left || boxes[0].bottom <= boxes[1].top);
      await page.screenshot({ path: `${output}/${viewport.width}-${preference}.png`, fullPage: false });
      assert.deepEqual(errors, []);
      report.scenarios.push({ viewport, preference, result: 'PASS', touch: true, syntheticTilt: true, cycles: 3, lifecycle: true });
      await page.close();
    }
  }
  for (const sensor of ['unsupported', 'denied', 'no-data']) {
    const { page, errors } = await open({ sensor, stored: true, preference: 'no-preference', observer: false });
    assert.equal(await page.locator('#hpPlayback').getAttribute('aria-pressed'), 'true');
    assert.match(await page.locator('#hpPlaybackStatus').textContent(), /再生中/);
    await animated(page);
    if (sensor !== 'unsupported') {
      await page.locator('#hpPaletteToggle').click(); await page.locator('#hpMotion').click();
      if (sensor === 'no-data') await page.waitForTimeout(3100);
    }
    assert.match(await page.locator('#hpGyroStatus').textContent(), /タッチ/);
    await blueTouch(page); await moving(page);
    await page.evaluate(() => document.documentElement.dataset.pixieedMotion = 'full');
    await page.waitForTimeout(80);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.waitForTimeout(80); await animated(page);
    assert.equal(await page.locator('#hpPlayback').getAttribute('aria-pressed'), 'true');
    assert.equal(await page.evaluate(() => localStorage.getItem('PiXiEED:motion-preference:v1')), 'reduced');
    assert.deepEqual(errors, []);
    report.scenarios.push({ sensor, storedPreference: true, observerFallback: true, result: 'PASS' });
    await page.close();
  }
  {
    const { page, errors } = await open({ sensor: 'unsupported' });
    await animated(page);
    assert.deepEqual((await audio(page)).contexts, []);
    await blueTouch(page);
    await page.locator('#hpCanvas').scrollIntoViewIfNeeded();
    const box = await page.locator('#hpCanvas').boundingBox();
    const cdp = await page.context().newCDPSession(page);
    const touch = (type, points) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points.map(([x, y]) => ({ x, y, id: 1 })) });
    await touch('touchStart', [[box.x + box.width * .2, box.y + box.height * .8]]);
    await touch('touchMove', [[box.x + box.width * .2 + 24, box.y + box.height * .8]]);
    await touch('touchEnd', []);
    await page.waitForTimeout(80); await moving(page);
    await page.setViewportSize({ width: 844, height: 390 });
    await page.locator('#hpCanvas').scrollIntoViewIfNeeded(); await page.waitForTimeout(100);
    assert.ok(await center(page), 'rotation retains the touch drawing');
    await page.evaluate(() => {
      window.__visibility = 'hidden'; Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => __visibility });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await page.waitForTimeout(100); await staticDrawing(page);
    assert.equal((await audio(page)).contexts[0], 'suspended');
    await page.evaluate(() => { __visibility = 'visible'; document.dispatchEvent(new Event('visibilitychange')); });
    await page.waitForTimeout(80); assert.equal((await audio(page)).contexts[0], 'running');
    await animated(page);
    await blueTouch(page); assert.equal((await audio(page)).contexts[0], 'running');
    await page.evaluate(() => scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' }));
    await page.waitForFunction(() => document.querySelector('#hpStage').getBoundingClientRect().bottom < 0);
    await page.waitForTimeout(100); assert.equal((await audio(page)).contexts[0], 'suspended');
    await page.locator('#hpCanvas').scrollIntoViewIfNeeded();
    await page.waitForTimeout(100); assert.equal((await audio(page)).contexts[0], 'running');
    await animated(page);
    assert.deepEqual(errors, []);
    report.scenarios.push({ name: 'touch-drag-rotation-visibility-scroll', result: 'PASS', gestureAuthorizedAudioResumes: true });
    await page.close();
  }
} catch (error) { report.failure = error.stack; throw error; }
finally { await writeFile(`${output}/browser.json`, JSON.stringify(report, null, 2)); await browser.close(); }
console.log(JSON.stringify(report, null, 2));
