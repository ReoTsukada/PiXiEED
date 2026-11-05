#!/usr/bin/env node
/** Real Chromium, real module Workers/IndexedDB/downloads. No codec or UI mocks. */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
const repository = resolve(fileURLToPath(new URL('../', import.meta.url)));
const root = resolve(process.env.PIXIEED_BROWSER_ROOT || repository);
const output = process.env.PIXIEED_BROWSER_ARTIFACTS || '/tmp/pixieed-output-browser';
await mkdir(output, { recursive: true });
const mime = { '.mjs': 'text/javascript', '.js': 'text/javascript', '.html': 'text/html', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.wasm': 'application/wasm', '.woff2': 'font/woff2' };
const server = createServer(async (request, response) => {
  try {
    let path = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    if (path.endsWith('/')) path += 'index.html';
    const file = resolve(root, '.' + path);
    if (!file.startsWith(root + '/')) throw new Error('path');
    response.setHeader('Content-Type', mime[extname(file)] || 'application/octet-stream');
    response.end(await readFile(file));
  } catch { response.statusCode = 404; response.end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const { chromium } = await import(process.env.PIXIEED_PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PIXIEED_PLAYWRIGHT_MODULE).href : 'playwright');
const browser = await chromium.launch({ executablePath: process.env.PIXIEED_CHROME_EXECUTABLE || undefined, args: ['--no-sandbox'] });
const report = { source: root, browser: browser.version(), cases: [], workers: [], errors: [] };
const pass = name => { report.cases.push(name); console.log('PASS ' + name); };
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const context = await browser.newContext({ viewport: { width: 1365, height: 1000 }, acceptDownloads: true });
// External advertising/authentication services are outside this local conversion test.
// Internal HTML, JS, module Workers and codecs are served unchanged from the build.
await context.route('**/*', route => new URL(route.request().url()).origin === base ? route.continue() : route.abort());
const page = await context.newPage();
page.on('pageerror', error => report.errors.push(error.message));
page.on('worker', worker => report.workers.push(worker.url()));
page.on('dialog', dialog => dialog.accept());
page.setDefaultTimeout(20000);
async function open(query = '?mode=convert&text=input') {
  await page.goto(base + '/output/work/' + query, { waitUntil: 'domcontentloaded' });
  await page.locator('[data-text-tools]').waitFor({ state: 'attached' });
}
async function selectMode(mode) {
  const source = page.locator('[data-sc-source]'), target = page.locator('[data-sc-target]');
  if (mode === 'output') { await selectWorkspace('[data-sc-source]','file'); await selectWorkspace('[data-sc-target]','text'); }
  else if (mode === 'input') { await selectWorkspace('[data-sc-target]','file'); await selectWorkspace('[data-sc-source]','text'); }
  else { await selectWorkspace('[data-sc-source]','file'); await selectWorkspace('[data-sc-target]','file'); }
  await page.waitForFunction(expected => document.querySelector('.text-mode-nav [aria-pressed="true"]')?.dataset.textMode === expected, mode);
}
async function selectWorkspace(selector,value) {
  const unified = page.locator('[data-sc-unified-purpose]');
  if (await unified.count()) {
    if (selector === '[data-sc-source]' || selector === '[data-sc-target]') {
      await page.evaluate(({selector,value}) => {
        const source=document.querySelector('[data-sc-source]'),target=document.querySelector('[data-sc-target]');
        if(selector==='[data-sc-source]')source.value=value;else target.value=value;
        const mode=source.value==='text'?'input':target.value==='text'?'output':'media';
        document.querySelector('#main')?.textConversion?.setMode(mode);
      },{selector,value});
      await page.waitForFunction(({selector,value})=>document.querySelector(selector)?.value===value,{selector,value});
      return;
    }
    if (selector === '[data-sc-format]') {
      const expression=page.locator('[data-sc-unified-format]');
      const sourceMode=await page.locator('#main').evaluate(node=>node.textConversion.snapshot().mode);
      if(sourceMode==='input'){
        await unified.selectOption(value==='text'?'text':'restore');
        if(value!=='text')await expression.selectOption(value);
      }else if(['ascii','block','braille','emoji','custom'].includes(value)){
        await expression.selectOption('text-art');await page.locator('[data-sc-unified-art-style]').waitFor({state:'visible'});await page.locator('[data-sc-unified-art-style]').selectOption(value);
      }else if(['encode','pixels','base64','dataurl'].includes(value)){
        const tools=page.locator('.sc-unified-code-tools');if(!await tools.evaluate(node=>node.open))await tools.locator('summary').click();
        const open=page.locator('[data-sc-unified-code-open]');if(await open.isVisible())await open.click();
        await page.locator('[data-sc-unified-code-format]').waitFor({state:'visible'});await page.locator('[data-sc-unified-code-format]').selectOption(value);
      }else await expression.selectOption(value);
      return;
    }
  }
  const panel=page.locator('#sc-settings-panel');
  if (!(await panel.evaluate(node=>node.open))) await page.locator('[data-sc-settings-open]').click();
  const routeName = selector === '[data-sc-source]' ? 'sc-source-choice'
    : selector === '[data-sc-target]' ? 'sc-target-choice' : '';
  const routeGroup = routeName ? page.locator(`[data-sc-route-name="${routeName}"]`) : null;
  if (routeGroup && await routeGroup.count()) {
    const routeDetails = page.locator('.sc-route-options');
    if (!(await routeDetails.evaluate(node => node.open))) await page.locator('.sc-route-options > summary').click();
    const radio = routeGroup.locator(`input[type="radio"][value="${value}"]`);
    await radio.check();
    await page.waitForFunction(({ selector, value }) => document.querySelector(selector)?.value === value,
      { selector, value });
    assert.equal(await radio.isChecked(), true);
  } else {
    await page.locator(selector).selectOption(value);
  }
  if (await panel.evaluate(node=>node.matches(':modal'))) { await page.keyboard.press('Escape'); await page.waitForFunction(()=>!document.querySelector('#sc-settings-panel')?.open); }
}
async function exportFromVisibleAction() {
  const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#output-nav-export').click()]);
  assert.equal(await download.failure(), null);
  return { name: download.suggestedFilename(), bytes: await readFile(await download.path()) };
}
async function run(success = true) {
  const mode = await page.locator('.text-mode-nav [aria-pressed="true"]').getAttribute('data-text-mode');
  if (mode === 'output') {
    await page.waitForFunction(() => ['ready', 'error'].includes(document.querySelector('[data-text-tools]')?.dataset.txLiveState));
    const state = await page.locator('[data-text-tools]').getAttribute('data-tx-live-state');
    assert.equal(state, success ? 'ready' : 'error');
    if (success) assert.match(await page.locator('[data-tx-status]').textContent(), /プレビューを更新しました/);
    return null;
  }
  if (success) {
    // Native controls/status live in collapsed settings; visible Save has its own status.
    const previousStatus = await page.locator('[data-tx-status]').textContent();
    const pendingDownload = exportFromVisibleAction();
    await page.waitForFunction(previous => {
      const root = document.querySelector('[data-text-tools]');
      const status = document.querySelector('[data-tx-status]')?.textContent;
      return root?.getAttribute('aria-busy') === 'true' || (status && status !== previous);
    }, previousStatus);
    await page.waitForFunction(() => document.querySelector('[data-text-tools]')?.getAttribute('aria-busy') === 'false'
      && /完了しました/.test(document.querySelector('[data-tx-status]')?.textContent || ''));
    assert.match(await page.locator('[data-tx-status]').textContent(), /完了しました/);
    const saved = await pendingDownload;
    await page.waitForFunction(() => /ダウンロードを開始しました/.test(document.querySelector('.sc-export-message')?.textContent || ''));
    assert.equal(await page.locator('.sc-export-message').isVisible(), true);
    return saved;
  }
  await page.locator('#output-nav-export').click();
  await page.waitForFunction(() => document.querySelector('[data-text-tools]')?.getAttribute('aria-busy') === 'false');
  return null;
}
async function download(selector) {
  const link = page.locator(selector);
  const hidden = await link.evaluate(node => node.hidden || Boolean(node.closest('[hidden]')) || getComputedStyle(node).display === 'none');
  if (hidden) return exportFromVisibleAction();
  const [download] = await Promise.all([page.waitForEvent('download'), link.click()]);
  assert.equal(await download.failure(), null);
  return { name: download.suggestedFilename(), bytes: await readFile(await download.path()) };
}
try {
  await open();
  const text = 'PiXiEED\n日本語 & <script>not executed</script>\n文章を画像と保存データへ。';
  await page.locator('[data-tx-source]').fill(text);
  const png = await run();
  assert.equal(png.bytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  const svg = await download('[data-tx-svg]');
  assert.match(svg.bytes.toString(), /&lt;script&gt;not executed&lt;\/script&gt;/);
  const document = await download('[data-tx-project]');
  assert.equal(JSON.parse(document.bytes.toString().split('\n').slice(1).join('\n')).text, text);
  pass('Japanese text → real PNG/SVG and editable text document; markup remains inert');
  await page.screenshot({ path: output + '/text-desktop.png', fullPage: true });
  await page.locator('[data-tx-use]').click();
  await page.waitForFunction(() => !document.querySelector('[data-editor]').hidden && document.querySelector('#main').getAttribute('aria-busy') === 'false');
  await selectWorkspace('[data-sc-format]','jpeg');
  const jpeg = await exportFromVisibleAction();
  assert.equal(jpeg.bytes.subarray(0, 2).toString('hex'), 'ffd8');
  pass('Text-generated PNG enters the existing media converter and saves a real JPEG');
  await selectMode('output');
  await page.locator('[data-tx-file]').setInputFiles({ name: 'pixels.png', mimeType: 'image/png', buffer: png.bytes });
  for (const style of ['ascii', 'block', 'braille', 'emoji', 'custom']) {
    await selectWorkspace('[data-sc-format]',style);
    await run();
    const art = await page.locator('[data-tx-text-result]').inputValue();
    assert.ok(art.length > 0);
    assert.equal(Array.from(art.split('\n')[0]).length, 64);
    pass(`Real image → ${style} character art in a module Worker`);
  }
  await page.locator('[data-tx-select]').click();
  assert.equal(await page.locator('[data-tx-text-result]').evaluate(node => node.selectionEnd - node.selectionStart), (await page.locator('[data-tx-text-result]').inputValue()).length);
  pass('Full-text selection remains available independently of clipboard permissions');
  const bytes = Buffer.from(Array.from({ length: 16384 }, (_, index) => index * 37 & 255));
  await page.locator('[data-tx-file]').setInputFiles({ name: '原本.pxd', mimeType: 'application/octet-stream', buffer: bytes });
  await selectWorkspace('[data-sc-format]','encode');
  await run();
  const code = (await download('[data-tx-txt]')).bytes.toString();
  assert.match(code, /BEGIN PIXIEED RESTORE 1/);
  await selectMode('input');
  await page.locator('[data-tx-source]').fill('メモの前文\n' + code + '\nメモの後文');
  await selectWorkspace('[data-sc-format]','restore');
  const restored = await run();
  assert.equal(restored.name, '原本.pxd'); assert.equal(hash(restored.bytes), hash(bytes));
  pass('Binary/PXD → TXT → restore preserves filename and every byte (SHA-256 match)');
  const previous = await page.locator('[data-tx-download]').getAttribute('href');
  const damaged = code.replace('ACVK', 'ASVK');
  assert.notEqual(damaged, code);
  await page.locator('[data-tx-source]').fill(damaged); await run(false);
  assert.match(await page.locator('[data-tx-status]').textContent(), /検査に失敗/);
  assert.equal(await page.locator('[data-tx-download]').getAttribute('href'), previous);
  pass('Corruption is rejected without discarding the last successful download');
  await selectMode('output');
  await page.locator('[data-tx-file]').setInputFiles({ name: 'too-large.pxd', mimeType: 'application/octet-stream', buffer: Buffer.alloc(16 * 1024 * 1024 + 1) });
  await run(false);
  assert.match(await page.locator('[data-tx-status]').textContent(), /16MB/);
  assert.equal(await page.locator('[data-tx-download]').getAttribute('href'), previous);
  pass('Oversize input fails before encoding and preserves the previous result');
  await selectMode('input');
  const cancelText = 'キャンセル前に保持する合成テキスト';
  await page.locator('[data-tx-source]').fill(cancelText);
  await selectWorkspace('[data-sc-format]','text');
  await page.evaluate(() => { document.querySelector('#output-nav-export').click(); document.querySelector('[data-tx-cancel]').click(); });
  await page.waitForFunction(() => document.querySelector('[data-text-tools]').getAttribute('aria-busy') === 'false');
  assert.match(await page.locator('[data-tx-status]').textContent(), /中止しました/);
  assert.equal(await page.locator('[data-tx-source]').inputValue(), cancelText);
  assert.equal(await page.locator('[data-tx-download]').getAttribute('href'), previous);
  pass('Cancellation preserves the input and prior successful result');
  await page.setViewportSize({ width: 375, height: 812 });
  await selectMode('input');
  await page.locator('[data-tx-source]').fill('スマートフォンでも\n文字から画像へ。');
  await run();
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  await page.screenshot({ path: output + '/text-mobile.png', fullPage: true });
  pass('375px mobile layout: text conversion, visible save control, no horizontal overflow');
  for (const mode of ['draw', 'camera', 'audio', 'jigsaw', 'spot-difference', 'hidden-object']) {
    await open('?mode=convert');
    await Promise.all([
      page.waitForURL(/\/output\/work\/\?file=/),
      page.evaluate(async ({ mode, bytes }) => {
        history.replaceState(null, '', `/${mode}/`);
        const { routeEditorFile } = await import('/js/creation/output-router.mjs?rev=20261028-unified-output-1');
        await routeEditorFile(new Blob([new Uint8Array(bytes)], { type: 'application/octet-stream' }), 'exact.pxd');
      }, { mode, bytes: [...bytes] })
    ]);
    await page.waitForFunction(() => document.querySelector('[data-tx-file-name]')?.textContent === 'exact.pxd');
    const direct = await exportFromVisibleAction();
    assert.equal(hash(direct.bytes), hash(bytes));
    await selectMode('output');
    await run();
    assert.match(await page.locator('[data-tx-text-result]').inputValue(), /BEGIN PIXIEED RESTORE 1/);
    pass(`${mode}: real IndexedDB handoff → common output → byte-exact PXD download and text encoding`);
  }
  await open('?mode=convert');
  await page.locator('[data-demo]').click();
  const motionPanel = page.locator('#sc-settings-panel');
  if (!(await motionPanel.evaluate(node => node.open))) await page.locator('[data-sc-settings-open]').click();
  await page.locator('[data-rate="2"]').click();
  if (await motionPanel.evaluate(node => node.matches(':modal'))) { await page.keyboard.press('Escape'); await page.waitForFunction(() => !document.querySelector('#sc-settings-panel').open); }
  const gif = await exportFromVisibleAction();
  assert.match(gif.bytes.subarray(0, 6).toString(), /^GIF8[79]a$/);
  pass('Existing animated GIF conversion and playback-speed controls still export a real GIF');
  assert.ok(report.workers.some(url => url.includes('/text-worker.mjs')));
  assert.deepEqual(report.errors, [], 'No uncaught errors in the output workspace');
  pass('Built text Worker loads successfully; no uncaught output-workspace exceptions');
} catch (error) {
  report.failure = error.stack;
  console.error(error);
  report.failureState = await page.evaluate(() => ({
    mode: document.querySelector('.text-mode-nav [aria-pressed="true"]')?.dataset.textMode,
    startup: document.body.dataset.conversionStartup,
    startupError: document.querySelector('[data-conversion-error]')?.textContent,
    originalLinks: [...document.querySelectorAll('a.convert-primary[download]')].map(node => ({ name: node.download, blob: node.getAttribute('href')?.startsWith('blob:'), hidden: Boolean(node.closest('[hidden]')) })),
    busy: document.querySelector('[data-text-tools]')?.getAttribute('aria-busy'),
    textStatus: document.querySelector('[data-tx-status]')?.textContent,
    nativeStatusVisibleText: document.querySelector('[data-tx-status]')?.innerText,
    saveStatus: document.querySelector('.sc-export-message')?.textContent,
    textLength: document.querySelector('[data-tx-source]')?.value.length,
    action: document.querySelector('[data-tx-action]')?.value,
    nativeRunDisabled: document.querySelector('[data-tx-run]')?.disabled,
    saveDisabled: document.querySelector('#output-nav-export')?.disabled,
    resultState: document.querySelector('.sc-result-surface')?.dataset.state,
    resultCurrent: document.querySelector('.sc-result-surface')?.dataset.current,
    resultLink: Boolean(document.querySelector('[data-tx-download]')?.getAttribute('href')?.startsWith('blob:')),
    purpose: document.querySelector('[data-sc-unified-purpose]')?.value,
    format: document.querySelector('[data-sc-unified-format]')?.value,
    recoveryStatus: document.querySelector('[data-sc-local-recovery-status]')?.textContent,
    invalidFields: [...document.querySelectorAll('[data-text-tools] input,[data-text-tools] select,[data-text-tools] textarea')]
      .filter(node => node.willValidate && !node.checkValidity())
      .map(node => ({ id: node.id, attributes: [...node.attributes].filter(attr => attr.name.startsWith('data-tx-')).map(attr => attr.name), value: node.value }))
  })).catch(() => null);
  console.error('FAILURE_STATE', JSON.stringify(report.failureState));
  await page.screenshot({ path: output + '/failure.png', fullPage: true }).catch(() => {});
  process.exitCode = 1;
} finally {
  await writeFile(output + '/report.json', JSON.stringify(report, null, 2));
  await browser.close();
  server.close();
}
