import assert from 'node:assert/strict';
import { deflateSync } from 'node:zlib';
import { pathToFileURL } from 'node:url';
import { supabaseConfig } from '../data/site-config.js';

const playwrightPath = process.env.PIXIEED_PLAYWRIGHT_MODULE || '/Users/tsukadareine/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const { chromium } = await import(pathToFileURL(playwrightPath).href);
const BASE = process.env.PIXIEED_BROWSER_BASE_URL || 'http://127.0.0.1:4182';
if (!['localhost', '127.0.0.1', '[::1]'].includes(new URL(BASE).hostname)) throw new Error('Only a local test server is allowed.');
const SIZES = [[320, 568], [390, 844], [844, 390], [1280, 800]];
const UUIDS = { 'spot-difference': '10000000-0000-4000-8000-000000000001', 'hidden-object': '10000000-0000-4000-8000-000000000002' };
const WIDTH = 16; const HEIGHT = 16;

const crcTable = Uint32Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let bit = 0; bit < 8; bit += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(bytes) { let crc = 0xffffffff; for (const byte of bytes) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8); return (crc ^ 0xffffffff) >>> 0; }
function pngChunk(type, data) {
  const name = Buffer.from(type); const length = Buffer.alloc(4); length.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4); checksum.writeUInt32BE(crc32(Buffer.concat([name, data])));
  return Buffer.concat([length, name, data, checksum]);
}
function makePng(mode, changed = false) {
  const rgba = new Uint8Array(WIDTH * HEIGHT * 4);
  for (let i = 0; i < WIDTH * HEIGHT; i += 1) {
    const offset = i * 4; rgba[offset] = 245; rgba[offset + 1] = 245; rgba[offset + 2] = 239; rgba[offset + 3] = 255;
  }
  const marks = [5 * WIDTH + 5, 12 * WIDTH + 12];
  for (const pixel of marks) {
    const offset = pixel * 4;
    if (mode === 'spot-difference' && !changed) continue;
    if (mode === 'hidden-object') { rgba[offset] = 0; rgba[offset + 1] = 0; rgba[offset + 2] = 0; }
    else { rgba[offset] = 40; rgba[offset + 1] = 120; rgba[offset + 2] = 70; }
  }
  const scanlines = Buffer.alloc((WIDTH * 4 + 1) * HEIGHT);
  for (let y = 0; y < HEIGHT; y += 1) scanlines.set(rgba.subarray(y * WIDTH * 4, (y + 1) * WIDTH * 4), y * (WIDTH * 4 + 1) + 1);
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(WIDTH, 0); ihdr.writeUInt32BE(HEIGHT, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), pngChunk('IHDR', ihdr), pngChunk('IDAT', deflateSync(scanlines)), pngChunk('IEND', Buffer.alloc(0))]);
}

function publicPost(mode) {
  const postId = UUIDS[mode]; const root = `/storage/v1/object/public/post-public/puzzles/${postId}`;
  const targets = [
    { id: 'target-a', name: '星', pixels: [5 * WIDTH + 5] },
    { id: 'target-b', name: '月', pixels: [12 * WIDTH + 12] },
  ];
  const definition = mode === 'spot-difference'
    ? { schemaVersion: 1, confirmed: true, width: WIDTH, height: HEIGHT, candidates: targets.map((target) => ({ id: target.id, pixels: target.pixels })) }
    : { schemaVersion: 1, confirmed: true, width: WIDTH, height: HEIGHT, targets, hitBoxes: [] };
  if (mode === 'hidden-object') {
    // The server recomputes these 120 CSS px reference boxes from authored pixels.
    for (const target of targets) {
      const x = target.pixels[0] % WIDTH; const y = Math.floor(target.pixels[0] / WIDTH);
      const required = Math.ceil(24 / (120 / WIDTH)); const before = Math.floor((required - 1) / 2);
      definition.hitBoxes.push({ targetId: target.id, minX: Math.max(0, x - before), maxX: Math.min(WIDTH - 1, x - before + required - 1), minY: Math.max(0, y - before), maxY: Math.min(HEIGHT - 1, y - before + required - 1) });
    }
  }
  return { ok: true, postId, puzzle: { postId, title: `Fixture ${mode}`, author: 'Browser harness', mode: mode === 'spot-difference' ? 'spot_difference' : 'hidden_object', originalImage: { url: `https://kyyiuakrqomzlikfaire.supabase.co${root}/original.png`, width: WIDTH, height: HEIGHT }, ...(mode === 'spot-difference' ? { changedImage: { url: `https://kyyiuakrqomzlikfaire.supabase.co${root}/changed.png`, width: WIDTH, height: HEIGHT } } : {}), definition } };
}
const fixtures = Object.fromEntries(['spot-difference', 'hidden-object'].map((mode) => [mode, publicPost(mode)]));
const pngs = {
  'spot-original': makePng('spot-difference'), 'spot-changed': makePng('spot-difference', true),
  'hidden-original': makePng('hidden-object'),
};

const browser = await chromium.launch({ headless: true });
try {
  for (const [width, height] of SIZES) for (const mode of ['spot-difference', 'hidden-object']) {
    const reducedMotion = width === 320 && mode === 'spot-difference';
    const page = await browser.newPage({ viewport: { width, height }, hasTouch: width <= 390, isMobile: width <= 390 });
    const errors = []; page.on('pageerror', (error) => errors.push(error.message));
    if (reducedMotion) await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.route('**/*', async (route) => {
      const url = new URL(route.request().url());
      if (url.origin === new URL(BASE).origin) return route.continue();
      if (url.origin === supabaseConfig.url) {
        const postId = url.searchParams.get('postId');
        if (url.pathname.endsWith('/functions/v1/public-post-puzzle')) {
          const modeForRequest = Object.keys(fixtures).find((candidate) => UUIDS[candidate] === postId);
          if (!modeForRequest) return route.fulfill({ status: 404, json: { ok: false } });
          return route.fulfill({ status: 200, json: fixtures[modeForRequest], headers: { 'access-control-allow-origin': '*' } });
        }
        if (url.pathname.includes('/storage/v1/object/public/post-public/puzzles/')) {
          const body = url.pathname.endsWith('/original.png') ? (mode === 'spot-difference' ? pngs['spot-original'] : pngs['hidden-original']) : pngs['spot-changed'];
          return route.fulfill({ status: 200, contentType: 'image/png', body, headers: { 'access-control-allow-origin': '*' } });
        }
      }
      return route.fulfill({ status: 200, body: '' });
    });
    const id = UUIDS[mode]; const path = mode === 'spot-difference' ? '/play/spot-difference/' : '/play/hidden-object/';
    await page.goto(`${BASE}${path}?postPuzzle=${id}`);
    await page.waitForFunction(() => document.querySelector('#pixfind-original')?.naturalWidth === 16 && document.querySelector('#pixfind-progress')?.textContent.includes('0 / 2'));
    const initialGeometry = await page.evaluate(() => {
      const area = document.querySelector('#pixfind-play-area').getBoundingClientRect(); const image = document.querySelector('#pixfind-original').getBoundingClientRect();
      return { area: area.toJSON(), image: image.toJSON() };
    });
    assert.ok(initialGeometry.image.left >= initialGeometry.area.left - 0.5 && initialGeometry.image.top >= initialGeometry.area.top - 0.5
      && initialGeometry.image.right <= initialGeometry.area.right + 0.5 && initialGeometry.image.bottom <= initialGeometry.area.bottom + 0.5,
    `the complete source image fits inside the play area after initialization: ${JSON.stringify(initialGeometry)}`);
    const targetA = { x: 5.5, y: 5.5 };
    const targetB = { x: 12.5, y: 12.5 };
    const point = async (source) => page.evaluate(({ x, y }) => {
      const image = document.querySelector('#pixfind-original').getBoundingClientRect();
      const area = document.querySelector('#pixfind-play-area').getBoundingClientRect();
      const scale = image.width / 16;
      return { x: image.left + (x + 0.5) * scale, y: image.top + (y + 0.5) * scale, area: { left: area.left, top: area.top, width: area.width, height: area.height } };
    }, source);
    const clickSource = async (source, useTouch = false) => { const p = await point(source); if (useTouch) await page.touchscreen.tap(p.x, p.y); else await page.mouse.click(p.x, p.y); };

    await clickSource({ x: 8, y: 8 });
    await page.waitForFunction(() => document.querySelector('#pixfind-game-status')?.dataset.feedback === 'miss', undefined, { timeout: 5000 });
    assert.equal(await page.locator('#pixfind-game-status').isVisible(), true, 'miss feedback is visibly announced');
    await page.waitForFunction(() => !document.querySelector('#pixfind-game-status')?.dataset.visible, undefined, { timeout: 3000 });

    // A drag and a two-pointer cancel must not be converted into a tap answer.
    const playRect = await page.locator('#pixfind-play-area').boundingBox();
    const dragStart = { x: playRect.x + playRect.width / 2, y: playRect.y + playRect.height / 2 };
    await page.mouse.move(dragStart.x, dragStart.y); await page.mouse.down(); await page.mouse.move(dragStart.x + 18, dragStart.y + 1); await page.mouse.up();
    assert.match(await page.locator('#pixfind-progress').innerText(), /0 \/ 2/);
    assert.equal(await page.locator('#pixfind-game-status').getAttribute('data-feedback'), null);

    // The wheel zoom keeps the selected screen point under the cursor and both Spot views in sync.
    if (mode === 'spot-difference') {
      const areaBox = await page.locator('#pixfind-play-area').boundingBox();
      const anchor = { x: areaBox.x + areaBox.width * 0.65, y: areaBox.y + areaBox.height * 0.5 };
      const beforeImage = await page.locator('#pixfind-original').boundingBox();
      const beforeSource = { x: (anchor.x - beforeImage.x) / (beforeImage.width / 16), y: (anchor.y - beforeImage.y) / (beforeImage.height / 16) };
      await page.mouse.move(anchor.x, anchor.y); await page.mouse.wheel(0, -100);
      await page.waitForTimeout(80);
      const after = await page.evaluate(({ x, y }) => {
        const areas = [...document.querySelectorAll('#pixfind-play-area,#pixfind-changed-area')];
        const images = areas.map((area) => { const img = area.querySelector('img'); const r = img.getBoundingClientRect(); const g = area.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height, relX: r.left - g.left, relY: r.top - g.top }; });
        return { images, anchorX: x, anchorY: y };
      }, anchor);
      assert.ok(Math.abs(after.images[0].relX - after.images[1].relX) < 1 && Math.abs(after.images[0].relY - after.images[1].relY) < 1 && Math.abs(after.images[0].w - after.images[1].w) < 1, 'comparison images stay synchronized');
      const afterImage = await page.locator('#pixfind-original').boundingBox();
      const afterSource = { x: (anchor.x - afterImage.x) / (afterImage.width / 16), y: (anchor.y - afterImage.y) / (afterImage.height / 16) };
      assert.ok(Math.abs(beforeSource.x - afterSource.x) < 0.2 && Math.abs(beforeSource.y - afterSource.y) < 0.2, 'wheel zoom preserves the source point under the cursor');
    }

    const first = await point(targetA);
    const beforeFeedback = await page.evaluate(() => {
      const area = document.querySelector('#pixfind-play-area').getBoundingClientRect(); const image = document.querySelector('#pixfind-original').getBoundingClientRect();
      return { area: area.toJSON(), image: image.toJSON() };
    });
    if (width <= 390) await clickSource(targetA, true); else await clickSource(targetA);
    try {
      await page.waitForFunction(() => document.querySelector('#pixfind-game-status')?.dataset.feedback === 'correct' && document.querySelector('#pixfind-progress')?.textContent.includes('1 / 2'), undefined, { timeout: 6000 });
    } catch (error) {
      console.log(JSON.stringify({ debug: { width, height, mode, url: page.url(), status: await page.locator('#pixfind-game-status').evaluate((node) => ({ text: node.textContent, visible: node.dataset.visible, feedback: node.dataset.feedback })), progress: await page.locator('#pixfind-progress').innerText(), image: await page.locator('#pixfind-original').evaluate((node) => ({ complete: node.complete, width: node.naturalWidth, rect: node.getBoundingClientRect().toJSON() })), target: await point(targetA) } }));
      throw error;
    }
    const animation = await page.locator('#pixfind-play-area').evaluate((area) => getComputedStyle(area, '::after').animationName);
    assert.equal(animation, reducedMotion ? 'none' : 'pixfind-feedback-pop');
    assert.ok(first.x > 0);
    const afterFeedback = await page.evaluate(() => {
      const area = document.querySelector('#pixfind-play-area').getBoundingClientRect(); const image = document.querySelector('#pixfind-original').getBoundingClientRect();
      return { area: area.toJSON(), image: image.toJSON() };
    });
    for (const key of ['x', 'y', 'width', 'height']) {
      assert.ok(Math.abs(beforeFeedback.area[key] - afterFeedback.area[key]) < 0.1, `feedback preserves play-area ${key}`);
      assert.ok(Math.abs(beforeFeedback.image[key] - afterFeedback.image[key]) < 0.1, `feedback preserves image ${key}`);
    }
    await page.waitForFunction(() => !document.querySelector('#pixfind-game-status')?.dataset.visible, undefined, { timeout: 3000 });
    await clickSource(targetA);
    assert.match(await page.locator('#pixfind-progress').innerText(), /1 \/ 2/);
    assert.equal(await page.locator('#pixfind-game-status').getAttribute('data-feedback'), null, 'retapping a found target is not a miss');
    await clickSource({ x: 8, y: 8 });
    await page.waitForFunction(() => document.querySelector('#pixfind-game-status')?.dataset.feedback === 'miss', undefined, { timeout: 4000 });
    await clickSource(targetB);
    await page.waitForFunction(() => document.querySelector('#pixfind-progress')?.textContent.includes('2 / 2'), undefined, { timeout: 5000 });
    // Canceling a two-finger gesture must not create another answer tap.
    await page.evaluate(() => {
      const area = document.querySelector('#pixfind-play-area'); area.setPointerCapture = () => {};
      const rect = area.getBoundingClientRect(); const y = rect.top + rect.height / 2; const cx = rect.left + rect.width / 2;
      const send = (type, pointerId, clientX, clientY) => area.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerId, pointerType: 'touch', isPrimary: pointerId === 11, button: 0, buttons: type === 'pointerup' ? 0 : 1, clientX, clientY }));
      send('pointerdown', 11, cx - 20, y); send('pointerdown', 12, cx + 20, y); send('pointermove', 12, cx + 44, y + 8);
      send('pointercancel', 11, cx - 20, y); send('pointercancel', 12, cx + 44, y + 8);
    });
    assert.match(await page.locator('#pixfind-progress').innerText(), /2 \/ 2/);
    assert.equal(await page.locator('#pixfind-game-status').getAttribute('data-feedback'), 'correct');
    await page.locator('#pixfind-primary').click({ force: true });
    await page.waitForFunction(() => document.querySelector('#pixfind-progress')?.textContent.includes('0 / 2') && !document.querySelector('#pixfind-game-status')?.dataset.feedback, undefined, { timeout: 5000 });
    assert.deepEqual(errors, []);
    const compactLayout = await page.evaluate(() => {
      const area = document.querySelector('#pixfind-play-area').getBoundingClientRect();
      return { playAreaHeight: Math.round(area.height * 10) / 10, gridRows: getComputedStyle(document.querySelector('#pixfind-game')).gridTemplateRows };
    });
    console.log(JSON.stringify({ width, height, mode, visibleFeedback: 'PASS', dragCancel: 'PASS', retap: 'PASS', completionReset: 'PASS', reducedMotion: reducedMotion ? 'PASS' : 'not-emulated', ...compactLayout, errors: errors.length }));
    await page.close();
  }
} finally { await browser.close(); }
