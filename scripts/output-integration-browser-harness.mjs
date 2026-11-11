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
  await page.waitForFunction(() => document.body.dataset.conversionStartup === 'ready'
    && document.querySelector('#main')?.dataset.smartConversion === 'true');
}
async function withVisibleControl(locator, operation) {
  assert.ok(await locator.count(), 'expected control exists before interacting with it');
  const target = locator.first();
  const panel = page.locator('#sc-settings-panel');
  const inPanel = await target.evaluate(node => Boolean(node.closest('#sc-settings-panel')));
  let openedPanel = false;
  if (inPanel && !(await panel.evaluate(node => node.open))) {
    await page.locator('[data-sc-settings-open]').click();
    await page.waitForFunction(() => document.querySelector('#sc-settings-panel')?.open === true);
    openedPanel = true;
    if (await page.locator('#main').getAttribute('data-unified-result') === 'true') {
      assert.equal(await panel.evaluate(node => node.matches(':modal')), true, 'unified settings open as a modal');
    }
  }
  try {
    const details = target.locator('xpath=ancestor::details');
    const order = await details.evaluateAll(nodes => nodes.map((node, index) => {
      let depth = 0;
      for (let current = node; current; current = current.parentElement) depth++;
      return { index, depth };
    }).sort((a, b) => a.depth - b.depth).map(item => item.index));
    for (const index of order) {
      const disclosure = details.nth(index);
      if (!(await disclosure.evaluate(node => node.open))) await disclosure.locator('summary').first().click();
    }
    await target.waitFor({ state: 'visible' });
    assert.equal(await target.isVisible(), true, 'control is visible after opening its real UI ancestors');
    return await operation(target);
  } finally {
    if (openedPanel && await panel.evaluate(node => node.open)) {
      await panel.locator('[data-sc-settings-close]').click();
      await page.waitForFunction(() => !document.querySelector('#sc-settings-panel')?.open);
    }
  }
}
async function selectMode(mode) {
  const unified = page.locator('[data-sc-unified-purpose]');
  if (await unified.count()) {
    const sourceKind = mode === 'input' ? 'text' : 'file';
    const sourceChoice = page.locator(`[data-ui-source="${sourceKind}"]`);
    if (await sourceChoice.isVisible()) {
      if (await sourceChoice.getAttribute('aria-pressed') !== 'true') await sourceChoice.click();
    } else if (sourceKind === 'text') {
      const edit = page.locator('[data-sc-edit-source]');
      assert.equal(await edit.getAttribute('aria-controls'), 'tx-source', 'the actual text-source edit action is available');
      if (await edit.getAttribute('aria-expanded') !== 'true') await edit.click();
    } else {
      throw new Error('The file-source control is unavailable; the UI has no loaded file to select.');
    }
    await page.waitForFunction(expected => document.querySelector('.sc-unified-composer')?.dataset.source === expected, sourceKind);
    const tab = page.locator(`#sc-output-tab-${mode === 'output' ? 'text' : 'image'}`);
    await withVisibleControl(tab, async control => {
      if (await control.getAttribute('aria-selected') !== 'true') await control.click();
    });
    await page.waitForFunction(expected => document.querySelector('#main')?.textConversion?.snapshot().mode === expected, mode);
    return;
  }
  const button = page.locator(`.text-mode-nav [data-text-mode="${mode}"]`);
  await button.waitFor({ state: 'visible' });
  await button.click();
  await page.waitForFunction(expected => document.querySelector('.text-mode-nav [aria-pressed="true"]')?.dataset.textMode === expected, mode);
}
async function selectWorkspace(selector, value) {
  const unified = page.locator('[data-sc-unified-purpose]');
  if (await unified.count()) {
    if (selector === '[data-sc-source]' || selector === '[data-sc-target]') {
      throw new Error(`Unified source/target routes use visible controls, not hidden native selects: ${selector}`);
    }
    if (selector === '[data-sc-format]') {
      const expression = page.locator('[data-sc-unified-format]');
      const sourceMode = await page.locator('#main').evaluate(node => node.textConversion.snapshot().mode);
      if (sourceMode === 'input' && value === 'text') {
        // The output tab classifies the result; selecting an already-selected image tab
        // intentionally keeps restore intent. Use the visible, explicit route action.
        const action = page.locator('[data-tx-action]');
        if (await action.inputValue() !== 'text') {
          await withVisibleControl(page.locator('[data-sc-unified-text-image]'), button => button.click());
        }
        await page.waitForFunction(() => document.querySelector('#sc-output-tab-image')?.getAttribute('aria-selected') === 'true'
          && document.querySelector('[data-tx-action]')?.value === 'text');
      } else if (sourceMode === 'input' && value === 'restore') {
        const purpose = page.locator('[data-sc-unified-purpose]');
        if (await purpose.isVisible()) await withVisibleControl(purpose, select => select.selectOption('restore'));
        else await withVisibleControl(page.locator('[data-sc-unified-code-open]'), button => button.click());
        await page.waitForFunction(() => document.querySelector('[data-tx-action]')?.value === 'restore');
      } else if (['ascii', 'block', 'braille', 'emoji', 'custom'].includes(value)) {
        await withVisibleControl(expression, select => select.selectOption('text-art'));
        await withVisibleControl(page.locator('[data-sc-unified-art-style]'), select => select.selectOption(value));
        await page.waitForFunction(expected => document.querySelector('[data-tx-style]')?.value === expected, value);
      } else if (['encode', 'pixels', 'base64', 'dataurl'].includes(value)) {
        const codeTools = page.locator('.sc-unified-code-tools');
        if (!(await codeTools.evaluate(node => node.open))) await codeTools.locator('summary').click();
        const codeOpen = page.locator('[data-sc-unified-code-open]');
        if (await codeOpen.isVisible()) await withVisibleControl(codeOpen, button => button.click());
        await withVisibleControl(page.locator('[data-sc-unified-code-format]'), select => select.selectOption(value));
        await page.waitForFunction(expected => document.querySelector('[data-tx-style]')?.value === expected, value);
      } else {
        await withVisibleControl(expression, select => select.selectOption(value));
        if (sourceMode === 'media') await page.waitForFunction(expected => document.querySelector('[data-format],#output-format-select')?.value === expected, value);
      }
      return;
    }
  }
  const routeName = selector === '[data-sc-source]' ? 'sc-source-choice'
    : selector === '[data-sc-target]' ? 'sc-target-choice' : '';
  const routeGroup = routeName ? page.locator(`[data-sc-route-name="${routeName}"]`) : null;
  if (routeGroup && await routeGroup.count()) {
    const radio = routeGroup.locator(`input[type="radio"][value="${value}"]`);
    await withVisibleControl(radio, async control => {
      await control.check();
      await page.waitForFunction(({ selector, value }) => document.querySelector(selector)?.value === value, { selector, value });
      assert.equal(await control.isChecked(), true);
    });
  } else {
    await withVisibleControl(page.locator(selector), control => control.selectOption(value));
  }
}
async function fillTextSource(value) {
  const source = page.locator('[data-tx-source]');
  const currentMode = await page.locator('#main').evaluate(node => node.textConversion.snapshot().mode);
  if (currentMode !== 'input') await selectMode('input');
  if (!(await source.isVisible())) {
    const textChoice = page.locator('[data-ui-source="text"]');
    if (await textChoice.isVisible() && await textChoice.getAttribute('aria-pressed') !== 'true') await textChoice.click();
    const edit = page.locator('[data-sc-edit-source]');
    if (await edit.isVisible() && await edit.getAttribute('aria-controls') === 'tx-source'
      && await edit.getAttribute('aria-expanded') !== 'true') await edit.click();
  }
  await withVisibleControl(source, control => control.fill(value));
  assert.equal(await source.inputValue(), value, 'visible source editor retains the requested text');
  await page.waitForFunction(() => document.querySelector('#main')?.textConversion?.snapshot().mode === 'input');
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
    const saved = await exportFromVisibleAction();
    await page.waitForFunction(() => document.querySelector('[data-text-tools]')?.getAttribute('aria-busy') === 'false'
      && /完了しました/.test(document.querySelector('[data-tx-status]')?.textContent || ''));
    assert.match(await page.locator('[data-tx-status]').textContent(), /完了しました/);
    await page.waitForFunction(() => /ダウンロードを開始しました/.test(document.querySelector('.sc-export-message')?.textContent || ''));
    assert.equal(await page.locator('.sc-export-message').isVisible(), true);
    return saved;
  }
  await page.locator('#output-nav-export').click();
  await page.waitForFunction(() => document.querySelector('[data-text-tools]')?.getAttribute('aria-busy') === 'false');
  return null;
}
async function download(selector) {
  const link = page.locator(selector).first();
  assert.ok(await link.count(), `expected native download link ${selector}`);
  if (selector === '[data-tx-txt]') {
    const current = await page.evaluate(() => ({
      mode: document.querySelector('#main')?.textConversion?.snapshot().mode,
      format: document.querySelector('[data-tx-style]')?.value,
      textTabSelected: document.querySelector('#sc-output-tab-text')?.getAttribute('aria-selected') === 'true',
    }));
    assert.deepEqual(current, { mode: 'output', format: 'encode', textTabSelected: true }, 'common Save is routed to the current TXT output');
    const expectedBytes = Buffer.from(await link.evaluate(async node => {
      const href = node.getAttribute('href');
      if (!href?.startsWith('blob:')) throw new Error('native TXT result link has no generated blob');
      return [...new Uint8Array(await (await fetch(href)).arrayBuffer())];
    }));
    const saved = await exportFromVisibleAction();
    assert.equal(saved.name, await link.getAttribute('download'), 'Save retains the native TXT filename');
    assert.deepEqual(saved.bytes, expectedBytes, 'common Save bytes match the native TXT result, not a different format');
    return saved;
  }
  const unavailable = await link.evaluate(node => node.hidden || Boolean(node.closest('[hidden]')) || getComputedStyle(node).display === 'none');
  assert.equal(unavailable, false, `native download link ${selector} must remain available for its own format`);
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    withVisibleControl(link, control => control.click())
  ]);
  assert.equal(await download.failure(), null);
  return { name: download.suggestedFilename(), bytes: await readFile(await download.path()) };
}
try {
  await open();
  const text = 'PiXiEED\n日本語 & <script>not executed</script>\n文章を画像と保存データへ。';
  await fillTextSource(text);
  const png = await run();
  assert.equal(png.bytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  const svg = await download('[data-tx-svg]');
  assert.match(svg.bytes.toString(), /&lt;script&gt;not executed&lt;\/script&gt;/);
  const document = await download('[data-tx-project]');
  assert.equal(JSON.parse(document.bytes.toString().split('\n').slice(1).join('\n')).text, text);
  pass('Japanese text → real PNG/SVG and editable text document; markup remains inert');
  await page.screenshot({ path: output + '/text-desktop.png', fullPage: true });
  await withVisibleControl(page.locator('[data-tx-use]'), control => control.click());
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
    const art = await withVisibleControl(page.locator('[data-tx-text-result]'), control => control.inputValue());
    assert.ok(art.length > 0);
    assert.equal(Array.from(art.split('\n')[0]).length, 64);
    pass(`Real image → ${style} character art in a module Worker`);
  }
  await withVisibleControl(page.locator('[data-tx-select]'), control => control.click());
  const selectedTextLength = await withVisibleControl(page.locator('[data-tx-text-result]'), control => control.inputValue().then(value => value.length));
  const selectedRange = await withVisibleControl(page.locator('[data-tx-text-result]'), control => control.evaluate(node => node.selectionEnd - node.selectionStart));
  assert.equal(selectedRange, selectedTextLength);
  pass('Full-text selection remains available independently of clipboard permissions');
  const bytes = Buffer.from(Array.from({ length: 16384 }, (_, index) => index * 37 & 255));
  await page.locator('[data-tx-file]').setInputFiles({ name: '原本.pxd', mimeType: 'application/octet-stream', buffer: bytes });
  await selectWorkspace('[data-sc-format]','encode');
  await run();
  const code = (await download('[data-tx-txt]')).bytes.toString();
  assert.match(code, /BEGIN PIXIEED RESTORE 1/);
  await selectMode('input');
  await fillTextSource('メモの前文\n' + code + '\nメモの後文');
  await selectWorkspace('[data-sc-format]','restore');
  const restored = await run();
  assert.equal(restored.name, '原本.pxd'); assert.equal(hash(restored.bytes), hash(bytes));
  pass('Binary/PXD → TXT → restore preserves filename and every byte (SHA-256 match)');
  const previous = await page.locator('[data-tx-download]').getAttribute('href');
  const damaged = code.replace('ACVK', 'ASVK');
  assert.notEqual(damaged, code);
  await fillTextSource(damaged); await run(false);
  assert.match(await page.locator('[data-tx-status]').textContent(), /検査に失敗/);
  assert.equal(await page.locator('[data-tx-download]').getAttribute('href'), previous);
  pass('Corruption is rejected without discarding the last successful download');
  await selectMode('output');
  await run();
  const previousOversize = await page.locator('[data-tx-txt]').getAttribute('href');
  assert.ok(previousOversize?.startsWith('blob:'), 'the current text output has a successful native TXT result before the failing input');
  await page.locator('[data-tx-file]').setInputFiles({ name: 'too-large.pxd', mimeType: 'application/octet-stream', buffer: Buffer.alloc(16 * 1024 * 1024 + 1) });
  await run(false);
  assert.match(await page.locator('[data-tx-status]').textContent(), /16MB/);
  assert.equal(await page.locator('[data-tx-txt]').getAttribute('href'), previousOversize);
  pass('Oversize input fails before encoding and preserves the previous result');
  await selectMode('input');
  const previousInput = '前回の変換結果として保持する文章';
  await fillTextSource(previousInput);
  await selectWorkspace('[data-sc-format]','text');
  await run();
  const cancelText = 'キャンセル前に保持する合成テキスト';
  await fillTextSource(cancelText);
  await selectWorkspace('[data-sc-format]','text');
  const previousCancel = await page.locator('[data-tx-download]').getAttribute('href');
  assert.ok(previousCancel?.startsWith('blob:'), 'the current input mode has a successful result before cancellation');
  // deterministic same-task cancellation; not a visible button timing assertion.
  await page.evaluate(() => { document.querySelector('#output-nav-export').click(); document.querySelector('[data-tx-cancel]').click(); });
  await page.waitForFunction(() => document.querySelector('[data-text-tools]').getAttribute('aria-busy') === 'false');
  assert.match(await page.locator('[data-tx-status]').textContent(), /中止しました/);
  assert.equal(await withVisibleControl(page.locator('[data-tx-source]'), control => control.inputValue()), cancelText);
  assert.equal(await page.locator('[data-tx-download]').getAttribute('href'), previousCancel);
  pass('Cancellation preserves the input and prior successful result');
  await page.setViewportSize({ width: 375, height: 812 });
  await selectMode('input');
  await fillTextSource('スマートフォンでも\n文字から画像へ。');
  await run();
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  await page.screenshot({ path: output + '/text-mobile.png', fullPage: true });
  pass('375px mobile layout: text conversion, visible save control, no horizontal overflow');
  for (const mode of ['draw', 'camera', 'audio', 'jigsaw', 'spot-difference', 'hidden-object']) {
    await open('?mode=convert');
    await Promise.all([
      page.waitForFunction(() => location.pathname === '/output/work/' && !location.search && history.state?.pixieedOutputRequest?.key === 'file' && /^[a-f\d-]{36}$/i.test(history.state.pixieedOutputRequest.id)),
      page.evaluate(async ({ mode, bytes }) => {
        history.replaceState(null, '', `/${mode}/`);
        const { routeEditorFile } = await import('/js/creation/output-router.mjs?rev=20261028-unified-output-1');
        await routeEditorFile(new Blob([new Uint8Array(bytes)], { type: 'application/octet-stream' }), 'exact.pxd');
      }, { mode, bytes: [...bytes] })
    ]);
    await page.waitForFunction(() => document.querySelector('[data-tx-file-name]')?.textContent === 'exact.pxd');
    const direct = await exportFromVisibleAction();
    assert.equal(hash(direct.bytes), hash(bytes));
    // PXD is not image text-art; use the explicit restoration-code route.
    await selectWorkspace('[data-sc-format]', 'encode');
    await run();
    assert.match(await withVisibleControl(page.locator('[data-tx-text-result]'), control => control.inputValue()), /BEGIN PIXIEED RESTORE 1/);
    pass(`${mode}: real IndexedDB handoff → common output → byte-exact PXD download and text encoding`);
  }
  await open('?mode=convert');
  await withVisibleControl(page.locator('[data-demo]'), control => control.click());
  await withVisibleControl(page.locator('[data-rate="2"]'), control => control.click());
  assert.equal(await page.locator('#sc-settings-panel').evaluate(node => node.open), false, 'the settings dialog closes through its visible close control');
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
