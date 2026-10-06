import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { deflateSync } from 'node:zlib';
import { pathToFileURL } from 'node:url';
import { supabaseConfig } from '../data/site-config.js';

const playwrightPath = process.env.PIXIEED_PLAYWRIGHT_MODULE || '/Users/tsukadareine/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const { chromium } = await import(pathToFileURL(playwrightPath).href);
const BASE = process.env.PIXIEED_BROWSER_BASE_URL || 'http://127.0.0.1:4188';
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

const OUT = process.env.PIXIEED_GAME_LAYOUT_OUT || '/tmp/pixieed-game-results-list-20261006';
await mkdir(OUT, { recursive: true });
const browser = await chromium.launch({ headless: true });
const results = [];
try {
  for (const [width, height] of SIZES) for (const mode of ['spot-difference', 'hidden-object']) {
    const page = await browser.newPage({ viewport: { width, height } });
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => {
      window.fixtureCopies = []; window.fixtureShares = []; window.fixtureShareMode = 'cancel'; window.fixtureCopyFail = false;
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async url => {
        if (window.fixtureCopyFail) throw new Error('denied'); window.fixtureCopies.push(url);
      } } });
      Object.defineProperty(navigator, 'share', { configurable: true, value: async data => {
        window.fixtureShares.push(data);
        if (window.fixtureShareMode === 'cancel') throw new DOMException('cancel', 'AbortError');
      } });
    });
    await page.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.origin === new URL(BASE).origin) {
        const match = url.pathname.match(/^\/play\/(spot-difference|hidden-object)\/puzzles\/([^/]+)\/(ogp.png)?$/);
        if (match) {
          if (match[3]) return route.fulfill({ contentType: 'image/png', body: pngs['hidden-original'] });
          const shareUrl = url.origin + url.pathname;
          return route.fulfill({ contentType: 'text/html', body: `<link rel="canonical" href="${shareUrl}"><meta property="og:url" content="${shareUrl}"><meta property="og:image" content="${shareUrl}ogp.png"><meta property="og:title" content="Fixture"><meta property="og:description" content="Local synthetic puzzle">` });
        }
        return route.continue();
      }
      if (url.origin === supabaseConfig.url) {
        if (url.pathname.endsWith('/functions/v1/public-post-puzzle')) return route.fulfill({ json: fixtures[mode], headers: { 'access-control-allow-origin': '*' } });
        if (url.pathname.includes('/storage/v1/object/public/post-public/puzzles/')) return route.fulfill({ contentType: 'image/png', body: url.pathname.endsWith('changed.png') ? pngs['spot-changed'] : mode === 'spot-difference' ? pngs['spot-original'] : pngs['hidden-original'], headers: { 'access-control-allow-origin': '*' } });
      }
      return route.fulfill({ status: 200, body: '' });
    });
    const path = '/play/' + mode + '/';
    await page.goto(`${BASE}${path}?postPuzzle=${UUIDS[mode]}`);
    await page.waitForFunction(() => document.querySelector('#pixfind-original')?.naturalWidth === 16 && document.querySelector('#pixfind-progress')?.textContent.includes('0 / 2'));
    const initial = await page.evaluate(() => {
      const header = document.querySelector('.site-header').getBoundingClientRect();
      const area = document.querySelector('#pixfind-play-area').getBoundingClientRect();
      const nav = document.querySelector('.app-tabs').getBoundingClientRect();
      const controls = ['pixfind-back','puzzle-share-copy','pixfind-hint'].map(id => {
        const button = document.getElementById(id); const r = button.getBoundingClientRect();
        return { id, inHeader: !!button.closest('.site-header'), x:r.x, right:r.right, y:r.y, bottom:r.bottom, width:r.width, height:r.height, hit: document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)?.closest('button')?.id };
      });
      const targets = [...document.querySelectorAll('#pixfind-found-list li')].map(li => ({ text:li.textContent, font:parseFloat(getComputedStyle(li).fontSize), top:li.getBoundingClientRect().top, bottom:li.getBoundingClientRect().bottom }));
      return { rows:getComputedStyle(document.querySelector('#pixfind-game')).gridTemplateRows,imagesRows:getComputedStyle(document.querySelector('.pixfind-images')).gridTemplateRows,figureRows:getComputedStyle(document.querySelector('.pixfind-image')).gridTemplateRows, header:header.toJSON(), area:area.toJSON(), nav:nav.toJSON(), controls, targets, horizontalOverflow:document.documentElement.scrollWidth > innerWidth };
    });
    for (const c of initial.controls) {
      assert.equal(c.inHeader,true); assert.equal(c.hit,c.id);
      assert.ok(c.x>=0 && c.right<=width && c.y>=0 && c.bottom<=initial.header.bottom+1);
      assert.ok(c.width>=44 && c.height>=44);
    }
    assert.equal(initial.horizontalOverflow,false);
    assert.ok(initial.area.top>=initial.header.bottom && initial.area.bottom<=initial.nav.top);
    await page.screenshot({path:`${OUT}/${mode}-${width}-initial.png`});
    assert.ok(initial.area.height >= (height<500?100:height*(mode==='spot-difference'?.25:.38)),JSON.stringify(initial));
    if (mode==='hidden-object') {
      assert.deepEqual(initial.targets.map(t=>t.text),['星','月']);
      for (const t of initial.targets) { assert.ok(t.font>=12.8); assert.ok(t.bottom<=initial.area.top); }
    }
    // Keyboard-triggered hint marks an unseen target without recording a found answer.
    await page.locator('#pixfind-hint').focus(); await page.keyboard.press('Enter');
    assert.match(await page.locator('#pixfind-progress').textContent(),/0 \/ 2/);
    assert.equal(await page.locator('#pixfind-hint').isDisabled(),false);
    await page.locator('#puzzle-share-copy').focus(); await page.keyboard.press('Enter');
    await page.waitForFunction(() => window.fixtureCopies.length===1);
    assert.equal(await page.locator('#puzzle-share-copy svg').count(),1);
    await page.screenshot({ path:`${OUT}/${mode}-${width}-play.png` });
    // Complete with actual native taps on authored source pixels.
    const complete = async () => {
      for (const [x,y] of [[5.5,5.5],[12.5,12.5]]) {
        const p = await page.evaluate(({x,y}) => {const r=document.querySelector('#pixfind-original').getBoundingClientRect();return {x:r.x+x*r.width/16,y:r.y+y*r.height/16};},{x,y});
        await page.mouse.click(p.x,p.y);
      }
      try { await page.waitForFunction(() => !!document.body.dataset.toolResultOpen,undefined,{timeout:5000}); } catch(error) { await page.screenshot({path:`${OUT}/${mode}-${width}-failed.png`}); console.log(await page.evaluate(()=>({progress:document.querySelector('#pixfind-progress').textContent,status:document.querySelector('#pixfind-game-status').textContent,inert:document.querySelector('#pixfind-game').inert,share:document.querySelector('#puzzle-share').outerHTML}))); throw error; }
    };
    await complete();
    const result = page.locator('.px-tool-result');
    const returnLink = result.getByRole('link', { name: '問題一覧に戻る', exact: true });
    assert.equal(await returnLink.getAttribute('href'), path);
    assert.equal(await result.getByRole('button', { name: /もう一度遊ぶ|ゲームに戻る/ }).count(), 0);
    const resultUrl = page.url();
    await result.getByRole('button',{name:'共有する',exact:true}).click();
    await page.waitForFunction(() => window.fixtureCopies.length===2);
    assert.equal(page.url(), resultUrl, 'share cancellation does not navigate');
    assert.equal(await page.evaluate(() => window.fixtureShares.length),1,'cancelled Web Share copies verified URL');
    await page.evaluate(() => {window.fixtureShareMode='success';});
    await result.getByRole('button',{name:'共有する',exact:true}).click();
    await page.waitForFunction(() => document.querySelector('#puzzle-share-status').textContent==='共有しました。');
    assert.equal(await page.evaluate(() => window.fixtureCopies.length),2);
    await page.evaluate(() => {Object.defineProperty(navigator,'share',{value:undefined});});
    await result.getByRole('button',{name:'共有する',exact:true}).click();
    await page.waitForFunction(() => window.fixtureCopies.length===3);
    await page.evaluate(() => {window.fixtureCopyFail=true;});
    await result.getByRole('button',{name:'共有する',exact:true}).click();
    await page.waitForFunction(() => !document.querySelector('#puzzle-share-url').hidden);
    assert.match(await page.locator('#pixfind-progress').textContent(), /2 \/ 2/, 'sharing retains the completed play');
    assert.equal(await page.locator('#puzzle-share-url').evaluate(el=>el.selectionStart===0 && el.selectionEnd===el.value.length),true);
    await page.screenshot({ path:`${OUT}/${mode}-${width}-result.png` });
    if (width === 320) await returnLink.click();
    else if (width === 390) { await returnLink.focus(); await page.keyboard.press('Enter'); }
    else if (width === 844) await page.keyboard.press('Escape');
    else await page.locator('#pixfind-primary').click();
    await page.waitForURL(new URL(path, BASE).href);
    await page.waitForFunction(() => document.querySelector('#pixfind-game')?.hidden === true);
    assert.equal(await page.locator('#pixfind-game').isVisible(),false);
    assert.equal(await page.locator('#pixfind-hint').isVisible(),false);
    assert.deepEqual(errors,[]);
    const summary = {mode,width,height,areaHeight:initial.area.height,returnHref:path,checks:'header hit targets, keyboard hint/copy, share success/cancel/unsupported/manual fallback, result list link/Enter/Escape/nav PASS'};
    results.push(summary); console.log(JSON.stringify(summary)); await page.close();
  }
} finally { await writeFile(`${OUT}/results.json`,JSON.stringify(results,null,2)); await browser.close(); }
