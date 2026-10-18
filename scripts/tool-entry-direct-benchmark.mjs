/** Local synthetic comparison of a tiny same-DOM draw mount and a retained iframe.
 * Run: node scripts/tool-entry-direct-benchmark.mjs
 * This does not benchmark the full PiXiEED editor or production network behavior.
 */
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const base = process.env.PIXIEED_BROWSER_BASE_URL || 'http://127.0.0.1:4197';
assert.ok(['localhost', '127.0.0.1'].includes(new URL(base).hostname), 'Only a local server is allowed');
const out = process.env.PIXIEED_ENTRY_OUTPUT || '/tmp/pixieed-entry-evidence';
const playwrightPath = process.env.PIXIEED_PLAYWRIGHT_MODULE
  || '/Users/tsukadareine/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const { chromium } = await import(pathToFileURL(playwrightPath).href);

const browserEntry = variant => `
const { createDrawDocument, createDrawHistory, beginDrawStroke, strokePixels, commitDrawStroke } = await import('/js/creation/draw-core.mjs?rev=20261011-tool-size-1');
const { createPixelCanvasSurface } = await import('/js/creation/pixel-canvas-surface.mjs?rev=20261015-alpha-opacity-1');
const markup = ${JSON.stringify(installMarkupPlaceholder())};
function mount(stage) {
  stage.innerHTML = markup;
  const canvas = stage.querySelector('canvas'), status = stage.querySelector('[data-ready-status]');
  const doc = createDrawDocument(16), history = createDrawHistory(doc), surface = createPixelCanvasSurface(canvas);
  const bench = window.__entryBench = { latencies: [], completedStrokes: 0, paintedPixels: 0, imageHash: '' };
  let selected = 2, tracker = null, previous = null;
  const point = event => ({ x: (event.clientX - canvas.getBoundingClientRect().left) * canvas.width / canvas.getBoundingClientRect().width, y: (event.clientY - canvas.getBoundingClientRect().top) * canvas.height / canvas.getBoundingClientRect().height });
  const paint = changed => { surface.paint(doc.pixels, doc.palette, changed); bench.paintedPixels = doc.pixels.reduce((count, pixel) => count + (pixel >= 0 ? 1 : 0), 0); bench.imageHash = doc.pixels.join(','); };
  const drawTo = next => { const changed = strokePixels(doc, previous, next, selected, { trusted: true, tracker }); previous = next; paint(changed); };
  const recordPaint = inputAt => requestAnimationFrame(() => bench.latencies.push(performance.now() - inputAt));
  stage.querySelectorAll('[data-color]').forEach(button => button.addEventListener('click', () => {
    selected = Number(button.dataset.color);
    stage.querySelectorAll('[data-color]').forEach(node => node.setAttribute('aria-pressed', String(node === button)));
  }));
  canvas.addEventListener('pointerdown', event => {
    event.preventDefault(); canvas.setPointerCapture(event.pointerId); tracker = beginDrawStroke(doc, { trusted: true }); previous = point(event); const inputAt = performance.now(); drawTo(previous); recordPaint(inputAt);
  });
  canvas.addEventListener('pointermove', event => { if (tracker) { const inputAt = performance.now(); drawTo(point(event)); recordPaint(inputAt); } });
  const end = event => {
    if (!tracker) return;
    if (event.type === 'pointerup') { const inputAt = performance.now(); drawTo(point(event)); recordPaint(inputAt); }
    commitDrawStroke(doc, history, tracker); tracker = null; previous = null; bench.completedStrokes += 1;
    requestAnimationFrame(() => { status.textContent = '準備完了'; });
  };
  canvas.addEventListener('pointerup', end); canvas.addEventListener('pointercancel', end);
  paint(null);
  requestAnimationFrame(() => {
    status.textContent = '準備完了';
    if (window.parent !== window) window.parent.postMessage({ type: 'pixieed-entry-ready' }, location.origin);
    else window.__entryUsableAt = performance.now();
  });
}
if (${JSON.stringify(variant)} === 'direct') {
  mount(document.querySelector('[data-entry-stage]'));
} else if (${JSON.stringify(variant)} === 'iframe') {
  window.addEventListener('message', event => { if (event.origin === location.origin && event.data?.type === 'pixieed-entry-ready') window.__entryUsableAt = performance.now(); });
  const frame = document.createElement('iframe'); frame.title = '同じ描画課題'; frame.setAttribute('sandbox', 'allow-scripts allow-same-origin');
  frame.src = '/__pixieed-entry-frame.html'; document.querySelector('[data-entry-stage]').append(frame);
} else {
  mount(document.querySelector('[data-entry-stage]'));
}
`;

function installMarkupPlaceholder() { return '<section class="widget" aria-label="ドット絵の描画課題"><div class="controls" role="group" aria-label="色を選ぶ"><button type="button" data-color="2" aria-label="赤" aria-pressed="true" style="background:#e75445"></button><button type="button" data-color="4" aria-label="青" aria-pressed="false" style="background:#4c82c3"></button><button type="button" data-color="5" aria-label="緑" aria-pressed="false" style="background:#6d9b68"></button></div><canvas width="16" height="16" aria-label="16×16キャンバス"></canvas><output data-ready-status role="status">準備中</output></section>'; }

const html = variant => `<!doctype html>
<html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Entry comparison</title><style>
*{box-sizing:border-box}body{margin:0;background:#f4f2ec;color:#17232d;font:16px/1.45 system-ui,sans-serif}
header{height:56px;padding:0 20px;display:flex;align-items:center;background:white;border-bottom:1px solid #d8d4ca;font-weight:800}
main{max-width:900px;margin:auto;padding:20px}.intro{margin-bottom:18px}.intro h1{margin:0 0 5px;font-size:26px}.intro p{margin:0;color:#52606b}
[data-entry-stage]{min-height:430px;padding:16px;background:#fff;border:1px solid #d8d4ca;border-radius:12px}
.widget{display:grid;justify-items:center;gap:12px}.controls{display:flex;gap:8px}.controls button{width:44px;height:44px;border:2px solid #fff;border-radius:9px;box-shadow:0 0 0 1px #777;cursor:pointer}.controls button[aria-pressed=true]{outline:3px solid #17232d}
canvas{display:block;width:min(320px,80vw);height:min(320px,80vw);border:2px solid #17232d;background:repeating-conic-gradient(#e9ece5 0 25%,#fff 0 50%) 0 0/32px 32px;image-rendering:pixelated;touch-action:none}
iframe{display:block;width:100%;height:430px;border:0;background:white}
</style></head><body><header>PiXiEED · ドット絵</header><main><section class="intro"><h1>ドット絵を描く</h1><p>同じ短い描画課題で、直接配置と保持 iframe の起動・入力応答を比較します。</p></section>
<section data-entry-stage aria-label="描画ワークスペース"></section></main>
<script type="module">${browserEntry(variant)}</script></body></html>`;

const frameHtml = `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Draw surface</title>
<style>*{box-sizing:border-box}body{margin:0;background:#f4f2ec;font:16px/1.45 system-ui,sans-serif}.widget{min-height:430px;display:grid;align-content:center;justify-items:center;gap:12px;padding:16px}.controls{display:flex;gap:8px}.controls button{width:44px;height:44px;border:2px solid #fff;border-radius:9px;box-shadow:0 0 0 1px #777;cursor:pointer}.controls button[aria-pressed=true]{outline:3px solid #17232d}canvas{display:block;width:min(320px,80vw);height:min(320px,80vw);border:2px solid #17232d;background:repeating-conic-gradient(#e9ece5 0 25%,#fff 0 50%) 0 0/32px 32px;image-rendering:pixelated;touch-action:none}</style></head>
<body><main data-entry-stage></main><script type="module">${browserEntry('frame-child')}</script></body></html>`;

await mkdir(out, { recursive: true });
await writeFile(`${out}/direct-host.html`, html('direct'));
await writeFile(`${out}/iframe-host.html`, html('iframe'));
await writeFile(`${out}/iframe-child.html`, frameHtml);
const browser = await chromium.launch({ headless: true });
const report = {
  generatedAt: new Date().toISOString(), engine: browser.version(), base,
  setup: { pairs: 5, order: 'direct/frame, frame/direct, alternating', contexts: 'fresh isolated context per variant; one cold navigation and one reload per context', viewport: { width: 390, height: 844 }, cache: 'Playwright routing is enabled to fulfill local prototype documents and block nonlocal requests; reload is recorded but is not claimed as a true HTTP-cache warm run.' },
  limitations: [
    'Core-only 16×16 drawing surface; no production toolbar, layers, frames, storage, camera, project workspace, handoff, or analytics.',
    'Local Chromium with synthetic pointer strokes only; no Safari, physical device, user data, hardware, external or production requests.',
    'Response body byte totals are exact uncompressed local response-body bytes, not compressed transfer sizes or WAN estimates.',
    'Results cannot be extrapolated to the full editor, production latency, SEO, or user-perceived speed.'
  ],
  blockedRequests: [], cases: []
};

async function runCase(pair, variant, orderIndex) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  const requests = [];
  const blocked = [];
  await context.route('**/*', async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin !== base || !['GET', 'HEAD'].includes(request.method())) {
      blocked.push({ url: url.href, method: request.method() });
      report.blockedRequests.push({ url: url.href, method: request.method() });
      return route.abort();
    }
    if (url.pathname === '/__pixieed-entry-host.html') return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: html(variant) });
    if (url.pathname === '/__pixieed-entry-frame.html') return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: frameHtml });
    return route.continue();
  });
  const navResponses = [];
  const onResponse = response => {
    const task = (async () => {
      try {
        const body = await response.body();
        requests.push({ url: response.url(), status: response.status(), bodyBytes: body.byteLength });
      } catch { /* Ignore bodies invalidated by a navigation race. */ }
    })();
    navResponses.push(task);
  };
  page.on('response', onResponse);
  const row = { pair, variant, orderIndex, cold: null, reload: null, blockedRequests: blocked, errors: [] };
  page.on('pageerror', error => row.errors.push(error.message));
  try {
    const url = `${base}/__pixieed-entry-host.html?variant=${variant}&pair=${pair}`;
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => Number.isFinite(window.__entryUsableAt));
    const frame = variant === 'iframe' ? page.frames().find(item => item.url().includes('__pixieed-entry-frame.html')) : page;
    assert.ok(frame, 'Expected drawing context');
    const coldUsableAt = await page.evaluate(() => window.__entryUsableAt);
    if (pair === 1) await page.screenshot({ path: `${out}/${variant}-preview.png`, fullPage: true });
    const coldRequestsEnd = requests.length;
    const canvas = frame.locator('canvas');
    const bounds = await canvas.boundingBox();
    assert.ok(bounds);
    for (let n = 0; n < 12; n++) {
      const x0 = 1 + (n % 4) * 2, y0 = 1 + n;
      const x1 = Math.min(14, x0 + 3), y1 = Math.min(14, y0 + 2);
      await page.mouse.move(bounds.x + ((x0 + 0.5) / 16) * bounds.width, bounds.y + ((y0 + 0.5) / 16) * bounds.height);
      await page.mouse.down();
      await page.mouse.move(bounds.x + ((x1 + 0.5) / 16) * bounds.width, bounds.y + ((y1 + 0.5) / 16) * bounds.height, { steps: 3 });
      await page.mouse.up();
    }
    const usableContext = frame === page ? page : frame;
    await usableContext.waitForFunction(() => window.__entryBench?.completedStrokes === 12 && window.__entryBench?.latencies.length >= 60);
    const interaction = await usableContext.evaluate(() => ({
      count: window.__entryBench?.latencies.length || 0,
      completedStrokes: window.__entryBench?.completedStrokes || 0,
      latencies: window.__entryBench?.latencies || [],
      paintedPixels: window.__entryBench?.paintedPixels || 0,
      image: window.__entryBench?.imageHash || null
    }));
    assert.equal(interaction.completedStrokes, 12, 'Expected every synthetic stroke to paint');
    assert.ok(interaction.count >= 60, 'Expected pointer-to-paint samples for every synthetic stroke');
    await Promise.all(navResponses);
    row.cold = {
      navigationToUsableMs: round(coldUsableAt),
      responseBodyBytes: sumBytes(requests.slice(0, coldRequestsEnd)),
      responses: requests.slice(0, coldRequestsEnd),
      interaction,
      latencyMs: summarize(interaction.latencies)
    };

    // Record reload behavior in the same context, while explicitly not treating
    // it as a cache-warm run because Playwright routing disables the HTTP cache.
    requests.length = 0; navResponses.length = 0;
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => Number.isFinite(window.__entryUsableAt));
    await Promise.all(navResponses);
    const reloadUsableAt = await page.evaluate(() => window.__entryUsableAt);
    row.reload = { navigationToUsableMs: round(reloadUsableAt), responseBodyBytes: sumBytes(requests), responses: [...requests], cacheWarmClaimed: false };
    assert.deepEqual(row.errors, []);
  } catch (error) {
    row.error = error.stack || String(error);
  } finally {
    page.off('response', onResponse);
    await context.close();
  }
  return row;
}

function round(value) { return Number(value.toFixed(3)); }
function sumBytes(rows) { return rows.reduce((total, item) => total + item.bodyBytes, 0); }
function summarize(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return { median: round(sorted[Math.floor(sorted.length / 2)]), p95: round(sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1)]), max: round(sorted.at(-1)) };
}

try {
  for (let pair = 1; pair <= 5; pair++) {
    const order = pair % 2 ? ['direct', 'iframe'] : ['iframe', 'direct'];
    for (const [index, variant] of order.entries()) {
      const row = await runCase(pair, variant, index);
      report.cases.push(row);
      console.log(JSON.stringify({ pair, variant, coldMs: row.cold?.navigationToUsableMs, bodyBytes: row.cold?.responseBodyBytes, paintMedianMs: row.cold?.latencyMs?.median, error: Boolean(row.error) }));
      await writeFile(`${out}/tool-entry-direct-benchmark.json`, JSON.stringify(report, null, 2));
    }
  }
} finally {
  await browser.close();
}

const direct = report.cases.filter(row => row.variant === 'direct' && !row.error);
const iframe = report.cases.filter(row => row.variant === 'iframe' && !row.error);
report.summary = {
  successfulPairs: Math.min(direct.length, iframe.length),
  directMedianNavigationMs: direct.length ? round(median(direct.map(row => row.cold.navigationToUsableMs))) : null,
  iframeMedianNavigationMs: iframe.length ? round(median(iframe.map(row => row.cold.navigationToUsableMs))) : null,
  directMedianResponseBodyBytes: direct.length ? round(median(direct.map(row => row.cold.responseBodyBytes))) : null,
  iframeMedianResponseBodyBytes: iframe.length ? round(median(iframe.map(row => row.cold.responseBodyBytes))) : null,
  directMedianStrokeToPaintMs: direct.length ? round(median(direct.map(row => row.cold.latencyMs.median))) : null,
  iframeMedianStrokeToPaintMs: iframe.length ? round(median(iframe.map(row => row.cold.latencyMs.median))) : null,
  errors: report.cases.filter(row => row.error).map(row => ({ pair: row.pair, variant: row.variant, error: row.error }))
};
await writeFile(`${out}/tool-entry-direct-benchmark.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report.summary, null, 2));
if (report.summary.errors.length || report.summary.successfulPairs !== 5 || report.blockedRequests.length) process.exitCode = 1;

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}
