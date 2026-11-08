#!/usr/bin/env node
/** Reproduce asynchronous mobile input locks without touching existing user storage. */
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
const base = process.env.PIXIEED_BROWSER_BASE_URL || 'http://127.0.0.1:4290';
assert.ok(['localhost', '127.0.0.1'].includes(new URL(base).hostname));
const output = process.env.PIXIEED_TOUCH_OUTPUT || '/tmp/pixieed-draw-touch';
const { chromium } = await import(pathToFileURL(process.env.PIXIEED_PLAYWRIGHT_MODULE || join(homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs')).href);
const browser = await chromium.launch({ headless: true, ...(process.env.PIXIEED_CHROME_EXECUTABLE ? { executablePath: process.env.PIXIEED_CHROME_EXECUTABLE } : {}) });
const report = { browser: browser.version(), cases: [], failures: [], limitations: ['Isolated synthetic work on localhost; network gates model slow loads, not a physical mobile device.'] };
const ready = page => page.waitForFunction(() => window.__PIXIEED_CREATION_HOST__?.runtime?.state.ready && !document.querySelector('#main').inert && !document.documentElement.hasAttribute('data-direct-loading'));
async function waitGate(gate) { for (let i = 0; i < 200 && !gate.hit; i++) await new Promise(r => setTimeout(r, 30)); assert.equal(gate.hit, true, 'loader reached the delay gate'); }
async function fixture(name, run) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: 'block' });
  const gate = { path: null, hit: false, release: null };
  await context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.origin !== new URL(base).origin || !['GET', 'HEAD'].includes(request.method())) return route.abort();
    if (gate.path?.test(url.pathname)) { gate.path = null; gate.hit = true; await new Promise(resolve => { gate.release = resolve; }); }
    return route.continue().catch(() => {});
  });
  await context.addInitScript(() => { if (navigator.mediaDevices) navigator.mediaDevices.getUserMedia = async () => { throw new DOMException('Synthetic camera denial', 'NotAllowedError'); }; });
  const page = await context.newPage(), row = { name, errors: [] }; report.cases.push(row); page.setDefaultTimeout(15000);
  page.on('pageerror', e => row.errors.push(e.message));
  try { await page.goto(`${base}/tools/start/draw/?workspace=1&runtime=direct`); await page.locator('#project-start-new').tap(); await ready(page); await run(page, gate, row); assert.deepEqual(row.errors, []); row.result = 'PASS'; console.log('PASS', name); }
  catch (error) { row.result = 'FAIL'; row.error = error.stack; row.diagnostics = await page.evaluate(() => ({ text: document.body.innerText, html: document.querySelector('#pxd-panel')?.outerHTML, state: window.__PIXIEED_CREATION_HOST__?.runtime?.state })).catch(() => null); report.failures.push({ name, error: error.message }); console.error('FAIL', name, error.message); }
  finally { gate.release?.(); await context.close(); }
}
async function paint(page) {
  const before = await page.evaluate(() => window.__PIXIEED_CREATION_HOST__.getState());
  const box = await page.locator('#draw-canvas').boundingBox(); await page.touchscreen.tap(box.x + box.width * .4, box.y + box.height * .4);
  const after = await page.evaluate(() => window.__PIXIEED_CREATION_HOST__.getState());
  assert.notEqual(after.image.hash, before.image.hash, 'a real finger tap reaches the unlocked canvas');
}
async function seedRoles(page) {
  return page.evaluate(async () => {
    const [{ createPxdProject, encodePxd }, { createDrawDocument }, { putPxdDrawDocument }, { createToolProjectStore }] = await Promise.all([
      import('/js/creation/pxd-codec.mjs'), import('/js/creation/draw-core.mjs'), import('/js/creation/pxd-project.mjs'), import('/js/creation/tool-project-store.mjs')
    ]);
    let project = createPxdProject({ projectId: 'synthetic-touch-roles', revisionId: 'synthetic-touch-revision', manifest: { title: 'Disposable image-role test', toolProject: { tool: 'draw', schemaVersion: 1 } } });
    project = await putPxdDrawDocument(project, createDrawDocument(16), 'draw');
    project = await putPxdDrawDocument(project, createDrawDocument(16), 'audio');
    delete project.manifest.editorState; delete project.manifest.creationProject;
    const store = createToolProjectStore('draw'), saved = await store.save(project);
    localStorage.setItem('pixieed:pxd:last:direct-workspace:v1', JSON.stringify({ projectId: saved.projectId, revisionId: saved.revisionId }));
    const original = await store.load(saved.projectId, saved.revisionId);
    return { id: saved.projectId, revision: saved.revisionId, bytes: Array.from(await encodePxd(original)) };
  });
}
async function verifyStored(page, original) {
  const current = await page.evaluate(async ({ id, revision }) => {
    const { createToolProjectStore } = await import('/js/creation/tool-project-store.mjs'), { encodePxd } = await import('/js/creation/pxd-codec.mjs');
    const store = createToolProjectStore('draw');
    return { bytes: Array.from(await encodePxd(await store.load(id, revision))), count: (await store.listProjects()).projects.length };
  }, original);
  assert.deepEqual(current.bytes, original.bytes, 'cancellation preserves every stored byte'); assert.equal(current.count, 1, 'no automatic duplicate');
}
await mkdir(output, { recursive: true });
try {
  for (const timing of ['before-choice', 'visible-choice']) await fixture(`hide-${timing}`, async (page, gate, row) => {
    const original = await seedRoles(page);
    if (timing === 'before-choice') gate.path = /\/creation-runtime(?:\.bundle)?\.mjs$/;
    await page.goto(`${base}/tools/start/draw/?workspace=1&runtime=direct&pxd=${original.id}&pxdRevision=${original.revision}`, { waitUntil: 'domcontentloaded' });
    if (timing === 'before-choice') await waitGate(gate); else await page.locator('#creation-project-role').waitFor({ state: 'visible' });
    await page.evaluate(() => { window.__hideDone = false; window.__PIXIEED_CREATION_HOST__.hide().finally(() => { window.__hideDone = true; }); });
    gate.release?.();
    await page.waitForFunction(() => window.__hideDone);
    assert.equal(await page.locator('dialog:modal').count(), 0, 'no hidden modal traps the page');
    await page.locator('[data-embed-start]').waitFor({ state: 'visible' });
    await verifyStored(page, original);
    await page.locator('[data-embed-start]').tap();
    await page.locator('#pxd-panel[open]').waitFor({ state: 'visible' });
    assert.match(await page.locator('#project-sheet-title').textContent(), /前回の作品/);
    await page.locator(`.project-gallery__tile[data-project-id="${original.id}"]`).tap();
    await page.locator('#creation-project-role [data-image-role=draw]').tap(); await ready(page);
    await verifyStored(page, original); await paint(page);
    row.checks = ['hide settles', 'no invisible modal', 'same saved bytes and one identity', 'explicit role selection resumes finger drawing'];
  });
  for (const order of ['workspace-first', 'mode-first']) await fixture(`overlap-${order}`, async (page, gate, row) => {
    await page.evaluate(() => {
      window.__replaceDone = false; window.__replaceEntered = false;
      window.__PIXIEED_CREATION_HOST__.runtime.draw.workspace.beforeReplace(() => new Promise(resolve => { window.__replaceEntered = true; window.__releaseReplace = resolve; })).finally(() => { window.__replaceDone = true; });
    });
    await page.waitForFunction(() => window.__replaceEntered);
    gate.path = /\/draw-music(?:\.bundle)?\.mjs$/;
    await page.locator('#creation-mode-menu summary').tap(); await page.locator('#creation-mode-panel [data-creation-mode=audio]').tap(); await waitGate(gate);
    if (order === 'workspace-first') {
      await page.evaluate(() => window.__releaseReplace()); await page.waitForFunction(() => window.__replaceDone);
      assert.equal(await page.locator('#main').evaluate(n => n.inert), true, 'mode loading still owns its lock');
      gate.release();
    } else {
      gate.release();
      await page.waitForFunction(() => window.__PIXIEED_CREATION_HOST__.runtime.state.mode === 'audio' && !window.__PIXIEED_CREATION_HOST__.runtime.state.switching);
      assert.equal(await page.locator('#main').evaluate(n => n.inert), true, 'unfinished workspace operation still owns its lock');
      await page.evaluate(() => window.__releaseReplace()); await page.waitForFunction(() => window.__replaceDone);
    }
    await ready(page); await page.waitForFunction(() => !window.__PIXIEED_CREATION_HOST__.runtime.state.switching);
    assert.equal(await page.locator('#main').evaluate(n => n.inert), false);
    await paint(page);
    row.checks = ['unfinished owner retains lock', 'all completed owners release lock', 'finger drawing resumes'];
  });
  await fixture('workspace-transfer-to-audio', async (page, gate, row) => {
    await paint(page); const before = await page.evaluate(() => window.__PIXIEED_CREATION_HOST__.getState());
    await page.locator('#creation-file-open').tap(); await page.locator('#project-tab-current').tap();
    await page.locator('#project-send-audio').tap();
    await page.waitForFunction(() => window.__PIXIEED_CREATION_HOST__.runtime.state.mode === 'audio' && !window.__PIXIEED_CREATION_HOST__.runtime.state.switching && !window.__PIXIEED_CREATION_HOST__.runtime.draw.workspace.busy);
    await ready(page); assert.equal((await page.evaluate(() => window.__PIXIEED_CREATION_HOST__.getState())).timeline.hash, before.timeline.hash);
    row.checks = ['mode navigation inside workspace transaction remains supported', 'same pixels', 'no lingering lock'];
  });
} finally { await browser.close(); await writeFile(join(output, 'lifecycle-report.json'), JSON.stringify(report, null, 2)); }
if (report.failures.length) process.exitCode = 1;
