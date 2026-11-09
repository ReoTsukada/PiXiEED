#!/usr/bin/env node
/** Synthetic localhost fixtures only. Never reads real profiles, works or external services. */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile, stat } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { homedir } from 'node:os';
const { chromium } = await import(pathToFileURL(process.env.PIXIEED_PLAYWRIGHT_MODULE || resolve(homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs')).href);
const root = resolve(process.env.PIXIEED_BROWSER_ROOT || fileURLToPath(new URL('..', import.meta.url)));
const out = process.env.PIXIEED_BROWSER_ARTIFACTS || '/tmp/pixieed-import-gallery-review';
await mkdir(out, { recursive: true });
const mime = { '.mjs': 'text/javascript', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.html': 'text/html', '.svg': 'image/svg+xml' };
const server = createServer(async (req, res) => {
  try {
    const path = new URL(req.url, 'http://localhost').pathname;
    if (path === '/__qa') { res.setHeader('Content-Type', 'text/html'); return res.end('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><style>body{margin:0;background:#0b1520;color:#fff;font-family:system-ui}button,input{font:inherit}</style><main id="main">合成作品のみの確認</main>'); }
    let p = resolve(root, '.' + path); if (!p.startsWith(root + '/')) return res.writeHead(403).end();
    if ((await stat(p)).isDirectory()) p += '/index.html';
    res.setHeader('Content-Type', mime[extname(p)] || 'application/octet-stream'); res.end(await readFile(p));
  } catch { res.writeHead(404).end(); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r)); const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ headless: true, ...(process.env.PIXIEED_CHROME_EXECUTABLE ? { executablePath: process.env.PIXIEED_CHROME_EXECUTABLE } : {}) });
const report = { status: 'PASS', checks: [], limitations: ['Synthetic local data and isolated Chromium contexts only; all external requests blocked.', 'Responsive emulation, not a physical phone.'] };
const waitFrame = p => p.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
const rows = p => p.evaluate(async () => (await __qa.raw.listProjects()).projects.map(p => ({ id: p.projectId, revision: p.revisionId, name: p.summary.name })));
const state = p => p.evaluate(() => ({ id: __qa.ws.currentProject.projectId, revision: __qa.ws.currentProject.revisionId }));
const openImport = async p => { await p.evaluate(() => __qa.ws.showProjects({ pane: 'import' })); await waitFrame(p); };
async function seed(p, empty = false) {
  await p.evaluate(async empty => {
    const { createPxdProject, encodePxd } = await import('/js/creation/pxd-codec.mjs');
    const { putPxdSharedImage } = await import('/js/creation/pxd-project.mjs');
    const { createPxdStore } = await import('/js/creation/pxd-store.mjs');
    const { mountProjectWorkspace } = await import('/js/creation/project-workspace.mjs');
    const raw = createPxdStore();
    async function make(id, title, tool, color, image = true) {
      let project = createPxdProject({ projectId: id, manifest: { title, lastMode: tool || 'draw', ...(tool ? { toolProject: { tool, schemaVersion: 1 } } : {}) } });
      if (image) { const rgba = new Uint8Array(24 * 24 * 4); for (let i = 0; i < rgba.length; i += 4) { const x = i / 4 % 24, y = Math.floor(i / 4 / 24); rgba[i] = x > 5 && x < 18 && y > 5 && y < 18 ? color : 12; rgba[i + 1] = y * 7; rgba[i + 2] = 180; rgba[i + 3] = 255; } project = await putPxdSharedImage(project, { width: 24, height: 24, rgba }); }
      return project;
    }
    const current = await raw.save(await make('qa-current', '通常の作品', 'draw', 250), { expectedRevisionId: null });
    await raw.save(await make('qa-normal-2', '通常の作品2', 'draw', 100), { expectedRevisionId: null });
    if (!empty) {
      await raw.save(await make('qa-old', '以前の海', null, 30), { expectedRevisionId: null });
      await raw.save(await make('qa-audio', '音楽だけ', 'audio', 30, false), { expectedRevisionId: null });
      for (let i = 0; i < 10; i++) await raw.save(await make(`qa-other-${i}`, `以前の作品 ${i}`, i % 2 ? 'camera' : null, i * 20), { expectedRevisionId: null });
    }
    let applied = current;
    const ws = mountProjectWorkspace({ tool: 'draw', initialProject: { project: current, persisted: true }, getProject: p => p, openProject: p => { applied = p; }, getPreviewImage: () => null, getEditorState: () => ({}), routePointer: false });
    await ws.ready; window.__qa = { raw, ws, make, encodePxd, applied: () => applied };
    await ws.showProjects({ pane: 'library' });
  }, empty);
  await waitFrame(p);
}
try {
  for (const width of [320, 390, 1280]) {
    const context = await browser.newContext({ viewport: { width, height: width === 320 ? 568 : 900 }, hasTouch: width < 600, isMobile: width < 600, serviceWorkers: 'block' });
    await context.route('**/*', route => new URL(route.request().url()).origin === base ? route.continue() : route.abort());
    const p = await context.newPage(); p.setDefaultTimeout(10000); const errors = []; p.on('pageerror', e => errors.push(e.message));
    try {
      await p.goto(base + '/__qa'); await seed(p); const before = await rows(p), initial = await state(p);
      const normalSize = await p.locator('#project-library-pane .project-gallery__tile').first().evaluate(e => e.getBoundingClientRect().width);
      await p.locator('#project-tab-import').click(); await waitFrame(p);
      const old = p.locator('#project-import-list [data-project-id="qa-old"]');
      assert.equal(await p.locator('#project-import-list').evaluate(e => getComputedStyle(e).getPropertyValue('--gallery-columns').trim()), width < 600 ? '3' : '6');
      const importSize = await old.evaluate(e => e.getBoundingClientRect().width); assert.ok(Math.abs(normalSize - importSize) < 1, 'same square gallery geometry');
      assert.equal(await old.locator('canvas').isVisible(), true); await old.click();
      assert.equal(await p.locator('#project-import-preview-title').textContent(), '以前の海');
      assert.equal(await p.locator('.project-import-preview__fallback').isVisible(), false, 'image preview hides text fallback');
      assert.equal(await p.locator('#project-import-copy').isEnabled(), true);
      assert.deepEqual(await rows(p), before, 'preview must not save or fork'); assert.deepEqual(await state(p), initial);
      await p.screenshot({ path: `${out}/import-gallery-${width}.png` });
      const layout = await p.locator('#pxd-panel').evaluate(e => ({ scroll: e.scrollWidth, width: e.clientWidth, left: e.getBoundingClientRect().left, right: e.getBoundingClientRect().right }));
      assert.ok(layout.scroll <= layout.width + 1 && layout.left >= 0 && layout.right <= width + 1, JSON.stringify(layout));
      await p.locator('#project-import-clear').click(); await p.locator('#project-import-search').fill('存在しない名前');
      await waitFrame(p); assert.equal(await p.locator('#project-import-list .project-gallery__tile').count(), 0);
      assert.match(await p.locator('#project-import-pane .project-list__empty').textContent(), /見つかりません/);
      await p.locator('#project-import-search').fill('音楽だけ'); await waitFrame(p);
      await p.locator('#project-import-list .project-gallery__tile').click(); assert.equal(await p.locator('.project-import-preview__fallback').isVisible(), true);
      await p.locator('#project-import-clear').click(); await p.locator('#project-import-search').fill(''); await waitFrame(p);
      await p.locator('#project-tab-import').focus(); await p.keyboard.press('End'); assert.equal(await p.locator('#project-tab-current').getAttribute('aria-selected'), 'true');
      await p.keyboard.press('Home'); assert.equal(await p.locator('#project-tab-library').getAttribute('aria-selected'), 'true');
      await p.keyboard.press('ArrowRight'); assert.equal(await p.locator('#project-tab-import').getAttribute('aria-selected'), 'true'); await waitFrame(p);
      await p.locator('#pxd-file-input').setInputFiles([]); assert.deepEqual(await rows(p), before, 'picker cancellation is read-only');
      await p.locator('#pxd-file-input').setInputFiles({ name: 'bad.pxd', mimeType: 'application/octet-stream', buffer: Buffer.from('invalid') });
      await p.waitForFunction(() => document.querySelector('#project-import-status').textContent.includes('読み込めません'));
      assert.deepEqual(await rows(p), before); assert.deepEqual(await state(p), initial);
      const fileBytes = await p.evaluate(async () => Array.from(await __qa.encodePxd(await __qa.make('qa-pxd', 'バックアップの星', null, 220))));
      const payload = { name: 'backup.pxd', mimeType: 'application/octet-stream', buffer: Buffer.from(fileBytes) };
      await p.locator('#pxd-file-input').setInputFiles(payload);
      await p.waitForFunction(() => document.querySelector('#project-import-preview-title').textContent === 'バックアップの星');
      assert.deepEqual(await rows(p), before); assert.deepEqual(await state(p), initial);
      assert.equal(await p.locator('#project-import-clear').textContent(), '候補から外す');
      await p.locator('#project-import-clear').click(); assert.equal(await p.locator('#project-import-list [data-project-id^="pxd-preview-"]').count(), 0); assert.deepEqual(await rows(p), before);
      // A pending file result must not reopen/recreate the preview after closing.
      await p.evaluate(() => { window.nativeFileRead = File.prototype.arrayBuffer; File.prototype.arrayBuffer = function () { return new Promise(resolve => { window.releaseRead = async () => resolve(await nativeFileRead.call(this)); }); }; });
      await p.locator('#pxd-file-input').setInputFiles(payload); await p.locator('#project-close').click();
      await p.evaluate(async () => { await releaseRead(); File.prototype.arrayBuffer = nativeFileRead; }); await waitFrame(p); await openImport(p);
      assert.equal(await p.locator('.project-import-preview').isVisible(), false); assert.deepEqual(await rows(p), before); assert.deepEqual(await state(p), initial);
      // Newer choice wins even if the older file resolves later.
      await p.evaluate(() => { File.prototype.arrayBuffer = function () { if (this.name !== 'delayed.pxd') return nativeFileRead.call(this); return new Promise(resolve => { window.releaseRead = async () => resolve(await nativeFileRead.call(this)); }); }; });
      await p.locator('#pxd-file-input').setInputFiles({ ...payload, name: 'delayed.pxd' });
      const newerBytes = await p.evaluate(async () => Array.from(await __qa.encodePxd(await __qa.make('qa-newer', '新しく選んだPXD', null, 160))));
      await p.locator('#pxd-file-input').setInputFiles({ name: 'newer.pxd', mimeType: 'application/octet-stream', buffer: Buffer.from(newerBytes) });
      await p.waitForFunction(() => document.querySelector('#project-import-preview-title').textContent === '新しく選んだPXD');
      await p.evaluate(async () => { await releaseRead(); File.prototype.arrayBuffer = nativeFileRead; }); await waitFrame(p);
      assert.equal(await p.locator('#project-import-preview-title').textContent(), '新しく選んだPXD'); assert.deepEqual(await rows(p), before);
      // Repeated copy click creates exactly one independent work.
      await p.locator('#project-import-copy').evaluate(e => { e.click(); e.click(); });
      await p.waitForFunction(() => !__qa.ws.busy && !document.querySelector('#pxd-panel').open);
      const afterCopy = await rows(p); assert.equal(afterCopy.length, before.length + 1); assert.notEqual((await state(p)).id, initial.id);
      assert.equal(afterCopy.filter(row => row.name === '新しく選んだPXD').length, 1); assert.ok(before.every(row => afterCopy.some(after => after.id === row.id)));
      // Old works also require the explicit copy action and retain their source bytes.
      let oldBytes = await p.evaluate(async () => Array.from(await __qa.encodePxd(await __qa.raw.load('qa-old'))));
      await openImport(p); await p.locator('#project-import-list [data-project-id="qa-old"]').click();
      assert.equal((await rows(p)).length, afterCopy.length);
      oldBytes = await p.evaluate(async () => {
        const old = await __qa.raw.load('qa-old');
        const newer = await __qa.raw.save({ ...old, manifest: { ...old.manifest, title: '原本の新しい版' } }, { expectedRevisionId: old.revisionId });
        return Array.from(await __qa.encodePxd(newer));
      });
      await p.locator('#project-import-copy').click();
      await p.waitForFunction(() => !__qa.ws.busy && !document.querySelector('#pxd-panel').open);
      assert.equal((await rows(p)).length, afterCopy.length + 1);
      assert.equal(await p.evaluate(() => __qa.ws.currentProject.manifest.title), '以前の海', 'copies the previewed revision, not a newer unseen source');
      assert.deepEqual(await p.evaluate(async () => Array.from(await __qa.encodePxd(await __qa.raw.load('qa-old')))), oldBytes);
      // A recoverable list failure clears its error after retry.
      await p.evaluate(() => { window.nativeTransaction = IDBDatabase.prototype.transaction; IDBDatabase.prototype.transaction = function (...args) { throw new DOMException('Synthetic list failure', 'UnknownError'); }; });
      await openImport(p); assert.equal(await p.locator('#project-import-retry').isVisible(), true);
      await p.evaluate(() => { IDBDatabase.prototype.transaction = nativeTransaction; });
      await p.locator('#project-import-retry').click();
      await p.waitForFunction(() => document.querySelector('#project-import-retry').hidden && document.querySelector('#project-import-list').getAttribute('aria-busy') === 'false');
      assert.doesNotMatch(await p.locator('#project-import-pane').textContent(), /取り込み用の作品を読み出せませんでした/);
      // Existing ordinary multi-selection/deletion retains its explicit confirmation.
      await p.evaluate(() => __qa.ws.showProjects({ pane: 'library' })); await p.locator('#project-select').click(); await p.locator('#project-select-all').click();
      await p.locator('#project-delete-selected').click(); await p.locator('#project-delete-cancel').click(); assert.equal((await rows(p)).length, afterCopy.length + 1);
      await p.locator('#project-select-cancel').click();
      assert.deepEqual(errors, []);
      report.checks.push({ width, status: 'PASS', checks: ['same 3/6-column gallery and previews', 'no horizontal overflow', 'search and keyboard tabs', 'image-free fallback', 'chooser cancel/invalid file remain read-only', 'PXD preview and remove candidate do not save', 'close during file read ignores stale result', 'newer file wins', 'repeated explicit copy makes one work', 'previewed revision copied; latest source preserved byte-for-byte', 'list retry clears recovered error', 'ordinary multiple delete cancel remains intact'] });
      console.log('PASS', width);
    } catch (error) { report.status = 'FAIL'; report.checks.push({ width, status: 'FAIL', error: error.stack, errors }); await p.screenshot({ path: `${out}/failure-${width}.png` }); console.error(error); }
    finally { await context.close(); }
  }
  const context = await browser.newContext(); await context.route('**/*', r => new URL(r.request().url()).origin === base ? r.continue() : r.abort());
  const p = await context.newPage(); await p.goto(base + '/__qa'); await seed(p, true); await openImport(p);
  assert.match(await p.locator('#project-import-pane .project-list__empty').textContent(), /以前の作品はまだありません/);
  assert.equal(await p.locator('#pxd-open').isEnabled(), true); await context.close(); report.checks.push({ emptySources: 'PASS' });
} finally { await writeFile(`${out}/report.json`, JSON.stringify(report, null, 2)); await browser.close(); await new Promise(r => server.close(r)); }
if (report.status !== 'PASS') process.exitCode = 1;
