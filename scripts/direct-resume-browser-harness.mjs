#!/usr/bin/env node
/** Disposable localhost-only browser regression for same-project entry and CAS. */
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
const base = process.env.PIXIEED_BROWSER_BASE_URL || 'http://127.0.0.1:4273';
assert.ok(['localhost', '127.0.0.1'].includes(new URL(base).hostname));
const output = process.env.PIXIEED_RESUME_OUTPUT || '/tmp/pixieed-resume-browser-20261107';
const modulePath = process.env.PIXIEED_PLAYWRIGHT_MODULE || join(homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs');
const { chromium } = await import(pathToFileURL(modulePath).href);
const browser = await chromium.launch({ headless: true, ...(process.env.PIXIEED_CHROME_EXECUTABLE ? { executablePath: process.env.PIXIEED_CHROME_EXECUTABLE } : {}) });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
const report = { browser: browser.version(), base, assetMode: process.env.PIXIEED_RESUME_ASSET_MODE || 'production-build', cases: [], pageErrors: [], limitations: ['Local assets with isolated storage only; production user data, physical devices, and installed Safari were not tested.'] };
const directKey = 'pixieed:pxd:last:direct-workspace:v1';
await mkdir(output, { recursive: true });
await context.route('**/*', route => {
  const request = route.request(), url = new URL(request.url());
  if (url.origin !== new URL(base).origin || !['GET', 'HEAD'].includes(request.method())) return route.abort();
  return route.continue();
});
await context.addInitScript(() => {
  if (navigator.mediaDevices) Object.defineProperty(navigator.mediaDevices, 'getUserMedia', { configurable: true, value: async () => { throw new DOMException('No hardware in local QA', 'NotAllowedError'); } });
});
context.on('page', page => { page.on('pageerror', error => report.pageErrors.push(error.message)); page.setDefaultTimeout(20000); });
const page = await context.newPage();
const state = page => page.evaluate(async () => {
  const rt = window.__PIXIEED_CREATION_HOST__.runtime, workspace = rt.draw.workspace;
  return { projectId: workspace.currentProject.projectId, revisionId: workspace.persistedProject?.revisionId, title: workspace.currentProject.manifest.title, persisted: workspace.persisted, dirty: workspace.dirty, image: (await rt.getState()).image.hash };
});
const ready = page => page.waitForFunction(() => window.__PIXIEED_CREATION_HOST__?.runtime?.state.ready && document.documentElement.dataset.toolDirect === 'work' && !document.querySelector('#main').inert);
async function open(page, path = '/draw/') {
  await page.goto(base + path);
  await page.waitForFunction(() => { const start = document.querySelector('[data-embed-start]'); return document.documentElement.dataset.toolDirect === 'work' || start?.checkVisibility() && start.getAttribute('aria-busy') !== 'true'; });
  if (!await page.evaluate(() => document.documentElement.dataset.toolDirect === 'work')) await page.locator('[data-embed-start]').click();
  await ready(page);
}
async function save(page) { await page.evaluate(() => window.__PIXIEED_CREATION_HOST__.runtime.draw.workspace.save()); }
async function paint(page, x, y) {
  const canvas = page.locator('#draw-canvas'), box = await canvas.boundingBox();
  const size = await canvas.evaluate(node => ({ width: node.width, height: node.height }));
  await page.mouse.click(box.x + (x + .5) * box.width / size.width, box.y + (y + .5) * box.height / size.height);
}
async function records(page) {
  return page.evaluate(async () => {
    if (!(await indexedDB.databases()).some(db => db.name === 'pixieed-pxd-v1')) return [];
    const request = indexedDB.open('pixieed-pxd-v1');
    const db = await new Promise((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    try { return await new Promise((resolve, reject) => { const request = db.transaction('projects').objectStore('projects').getAll(); request.onsuccess = () => resolve(request.result.map(row => ({ id: row.projectId, head: row.history.at(-1)?.revisionId, history: row.history.length }))); request.onerror = () => reject(request.error); }); }
    finally { db.close(); }
  });
}
try {
  await open(page);
  assert.equal((await records(page)).length, 0, 'fresh entry creates no stored work');
  await paint(page, 2, 2); await save(page);
  await page.locator('#creation-file-open').click();
  await page.locator('#project-tab-current').click();
  await page.locator('#project-title').fill('再開テスト の続き');
  await page.locator('#project-rename').click();
  await page.waitForFunction(() => document.querySelector('.project-bar__name').textContent === '再開テスト の続き' && !window.__PIXIEED_CREATION_HOST__.runtime.draw.workspace.busy);
  await page.locator('#project-close').click();
  const original = await state(page);
  let saved = original;
  for (const [index, path] of ['/draw/', '/tools/start/draw/', '/draw/', '/tools/start/draw/'].entries()) {
    await open(page, path);
    const resumed = await state(page);
    assert.equal(resumed.projectId, original.projectId);
    assert.equal(resumed.title, original.title);
    assert.equal(resumed.image, saved.image);
    assert.equal(resumed.persisted, true);
    assert.equal(resumed.dirty, false);
    assert.equal((await records(page)).length, 1);
    assert.equal(new URL(page.url()).searchParams.get('pxd'), original.projectId);
    const before = await records(page);
    await save(page);
    assert.deepEqual((await records(page)).map(row => row.id), before.map(row => row.id), 'resaving must keep the same catalog identity');
    await paint(page, 4 + index, 4 + index);
    await page.waitForFunction(() => !window.__PIXIEED_CREATION_HOST__.runtime.draw.workspace.dirty && window.__PIXIEED_CREATION_HOST__.runtime.draw.workspace.persisted);
    saved = await state(page);
    assert.equal(saved.projectId, original.projectId);
    assert.notEqual(saved.image, resumed.image, 'the resumed work is editable and autosaves');
    assert.equal((await records(page)).length, 1);
    report.cases.push({ name: `normal-resume-${index + 1}`, path, id: saved.projectId, title: saved.title });
  }
  // Old shared and draw pointers are still accepted, but never fork the identity.
  for (const key of ['pixieed:pxd:last:creation', 'pixieed:pxd:last:draw']) {
    await page.evaluate(({ directKey, key, saved }) => {
      localStorage.removeItem(directKey); localStorage.removeItem('pixieed:pxd:last:creation'); localStorage.removeItem('pixieed:pxd:last:draw');
      localStorage.setItem(key, JSON.stringify({ projectId: saved.projectId, revisionId: saved.revisionId, fork: true }));
    }, { directKey, key, saved });
    await open(page);
    assert.deepEqual(await state(page), saved);
    assert.equal((await records(page)).length, 1);
    report.cases.push({ name: 'legacy-pointer-resume', key });
  }
  // Explanation/return and a reload must retain the current project without duplication.
  await page.locator('[data-shell-explanation]').click();
  await page.locator('[data-embed-start]').click(); await ready(page);
  assert.deepEqual(await state(page), saved);
  await page.reload(); await ready(page);
  assert.deepEqual(await state(page), saved);
  report.cases.push({ name: 'explanation-return-and-reload', projects: (await records(page)).length });

  // Two normal entries share the same saved identity. The stale tab must not overwrite it.
  const second = await context.newPage(); await open(second);
  assert.equal((await state(second)).projectId, original.projectId);
  await paint(page, 12, 12); await save(page);
  const winner = await state(page);
  await paint(second, 14, 14);
  const stale = await state(second);
  assert.notEqual(stale.image, winner.image);
  const code = await second.evaluate(() => window.__PIXIEED_CREATION_HOST__.runtime.draw.workspace.save().then(() => null, error => error.code));
  assert.equal(code, 'PXD_STORE_CONFLICT');
  assert.equal((await state(second)).image, stale.image);
  assert.equal((await records(page))[0].head, winner.revisionId);
  assert.equal((await records(page)).length, 1);
  report.cases.push({ name: 'normal-two-tab-conflict', code, savedHeadPreserved: true, unsavedPixelsPreserved: true, projects: 1 });

  // The user's explicit duplicate action remains a safe conflict recovery path.
  await second.locator('#creation-file-open').click();
  await second.locator('#project-tab-current').click();
  await second.locator('.project-more > summary').click();
  await second.locator('#project-duplicate').click();
  await second.waitForFunction(id => window.__PIXIEED_CREATION_HOST__.runtime.draw.workspace.currentProject.projectId !== id && window.__PIXIEED_CREATION_HOST__.runtime.draw.workspace.persisted && !window.__PIXIEED_CREATION_HOST__.runtime.draw.workspace.busy, original.projectId);
  const duplicate = await state(second);
  assert.notEqual(duplicate.projectId, original.projectId);
  assert.equal(duplicate.image, stale.image);
  assert.equal((await records(page)).length, 2);
  assert.equal((await records(page)).find(row => row.id === original.projectId).head, winner.revisionId);
  report.cases.push({ name: 'explicit-duplicate-after-conflict', projects: 2, sourcePreserved: true });
  await open(second);
  assert.deepEqual(await state(second), duplicate, 'an explicitly duplicated work also resumes in place');
  assert.equal((await records(page)).length, 2);
  report.cases.push({ name: 'resume-explicit-copy', projects: 2 });

  await second.locator('#creation-file-open').click();
  await second.locator('#project-tab-library').click();
  assert.equal(await second.locator('.project-gallery__tile').count(), 2);
  await second.screenshot({ path: join(output, 'two-works-after-explicit-copy.png'), fullPage: true });
  assert.deepEqual(report.pageErrors, []);
  report.result = 'PASS';
} catch (error) {
  report.result = 'FAIL'; report.failure = error.stack;
  await page.screenshot({ path: join(output, 'failure.png'), fullPage: true }).catch(() => {});
  process.exitCode = 1;
} finally {
  await writeFile(join(output, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  await context.close(); await browser.close();
}
