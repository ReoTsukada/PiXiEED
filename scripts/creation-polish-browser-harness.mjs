/** Local shared-workspace acceptance checks; no real media or external requests. */
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const base = process.env.PIXIEED_BROWSER_BASE_URL || 'http://127.0.0.1:4188';
assert.ok(['localhost', '127.0.0.1'].includes(new URL(base).hostname));
const engine = process.env.PIXIEED_QA_ENGINE || 'chromium';
assert.ok(['chromium', 'webkit'].includes(engine));
const out = process.env.PIXIEED_POLISH_OUTPUT || `/tmp/pixieed-polish-${engine}`;
await mkdir(out, { recursive: true });
const runtime = process.env.PIXIEED_PLAYWRIGHT_MODULE || join(homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs');
const playwright = await import(pathToFileURL(runtime).href);
const executablePath = process.env.PIXIEED_BROWSER_EXECUTABLE;
const browser = await playwright[engine].launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
const report = { engine, engineVersion: browser.version(), executablePath: executablePath || 'Playwright default', base, checks: [], errors: [], permissions: 'real media denied', physicalCamera: 'UNTESTED', actualSound: 'UNTESTED' };
const record = (name, viewport, facts = {}) => report.checks.push({ name, viewport, ...facts });
const settingsPanel = '#creation-project-settings-panel';
async function mode(page, name) {
  await page.locator('#creation-mode-menu > summary').click();
  await page.locator(`[data-creation-mode="${name}"]`).click();
  await page.waitForFunction(name => document.body.dataset.creationMode === name && !document.body.hasAttribute('data-creation-transition'), name);
}
const image = page => page.evaluate(() => Array.from(__polishDraw.getImage().rgba));
const prefs = page => page.evaluate(() => __polishDraw.getOutputPreferences());
try {
  for (const viewport of [{ width: 1280, height: 800 }, { width: 390, height: 844 }, { width: 320, height: 568 }]) {
    const context = await browser.newContext({ viewport, hasTouch: viewport.width < 600 });
    await context.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.origin !== new URL(base).origin) return route.abort();
      if (url.pathname.endsWith('/js/creation/draw-page.mjs?rev=20261020-staged-startup-1')) {
        const response = await route.fetch();
        const source = await response.text();
        const marker = 'return {\n  get workspace() { return pxdBridge; }, dispose: disposeDrawMode,';
        assert.ok(source.includes(marker), 'Draw observation marker exists');
        return route.fulfill({ response, body: source.replace(marker, 'return window.__polishDraw = {\n  get workspace() { return pxdBridge; }, dispose: disposeDrawMode,') });
      }
      return route.continue();
    });
    await context.addInitScript(() => {
      window.__mediaRequests = 0;
      if (navigator.mediaDevices) navigator.mediaDevices.getUserMedia = async () => { window.__mediaRequests++; throw new DOMException('QA denies physical permissions', 'NotAllowedError'); };
    });
    const page = await context.newPage();
    page.on('pageerror', error => report.errors.push(`${viewport.width}: ${error.message}`));
    page.setDefaultTimeout(15000);
    await page.goto(`${base}/draw/`);
    await page.waitForFunction(() => document.documentElement.dataset.creationModesReady === 'true');
    await page.locator('#creation-project-settings-open').click();
    await page.locator('#creation-project-width').fill('32');
    await page.locator('#creation-project-height').fill('32');
    await page.locator('[data-project-action="preview"]').click();
    await page.waitForFunction(() => !document.querySelector('[data-project-action="apply"]').disabled);
    await page.locator('[data-project-action="apply"]').click();
    await page.waitForFunction(() => !document.querySelector('#creation-project-settings-panel form').inert);
    const applied = await page.evaluate(() => ({ dimensions: [__polishDraw.getTimeline().width, __polishDraw.getTimeline().height], status: document.querySelector('.creation-project-settings__preview').textContent }));
    assert.deepEqual(applied.dimensions, [32, 32]); assert.match(applied.status, /適用/); assert.doesNotMatch(applied.status, /プレビューを更新/);
    record('size-apply-success', viewport, applied);
    await page.screenshot({ path: `${out}/${viewport.width}-settings-success.png` });
    await page.locator('#creation-project-width').fill('64');
    assert.match(await page.locator('.creation-project-settings__preview').textContent(), /未適用|プレビュー/);
    assert.equal(await page.locator('[data-project-action="apply"]').isDisabled(), true);
    record('unapplied-input-invalidates-success', viewport);
    await page.keyboard.press('Escape');
    assert.equal(await page.locator(settingsPanel).isVisible(), false);
    assert.equal(await page.evaluate(() => document.activeElement.id), 'creation-project-settings-open');
    record('escape-close-focus', viewport);
    await page.locator('#creation-project-settings-open').click();
    await page.locator('#creation-project-settings-open').click();
    assert.equal(await page.locator(settingsPanel).isVisible(), false);
    record('portaled-launcher-toggle', viewport);
    await page.locator('#creation-project-settings-open').click();
    const before = await image(page);
    if (viewport.width > 600) {
      const box = await page.locator('#draw-canvas').boundingBox();
      await page.mouse.move(box.x + box.width * .2, box.y + box.height * .5);
      await page.mouse.down(); await page.mouse.move(box.x + box.width * .4, box.y + box.height * .5, { steps: 8 }); await page.mouse.up();
    } else await page.locator('#creation-mode-menu > summary').click();
    assert.equal(await page.locator(settingsPanel).isVisible(), false);
    assert.deepEqual(await image(page), before);
    await page.keyboard.press('Escape');
    record('outside-dismiss-no-ink', viewport);
    await page.locator('#creation-project-settings-open').click();
    await page.keyboard.press('Escape');
    await page.locator('#draw-undo').click();
    await page.locator('#creation-project-settings-open').click();
    const undone = await page.evaluate(() => ({ width: __polishDraw.getTimeline().width, input: document.querySelector('#creation-project-width').value }));
    assert.equal(undone.width, 16); assert.equal(Number(undone.input), 16);
    await page.keyboard.press('Escape'); await page.locator('#draw-redo').click();
    await page.locator('#creation-project-settings-open').click();
    assert.equal(await page.evaluate(() => __polishDraw.getTimeline().width), 32);
    record('size-history-current-values', viewport);
    await page.keyboard.press('Escape');

    await mode(page, 'audio');
    const box = await page.locator('#draw-canvas').boundingBox();
    await page.mouse.click(box.x + box.width * .4, box.y + box.height * .4);
    await page.locator('#draw-music-play').click();
    await page.waitForFunction(() => /まだ音が/.test(document.querySelector('#draw-music-transport-status')?.textContent || ''));
    assert.equal(await page.locator('#draw-music-transport-status').isVisible(), true);
    assert.equal(await page.locator('#draw-music-voice-cta').isVisible(), true);
    const layout = await page.locator('#draw-music-feedback').evaluate(node => {
      const rect = node.getBoundingClientRect();
      const actions = [...node.querySelectorAll('button')].filter(button => !button.hidden).map(button => {
        const r = button.getBoundingClientRect(); return { id: button.id, width: r.width, height: r.height, left: r.left, right: r.right };
      });
      const nav = node.parentElement.getBoundingClientRect();
      return { left: rect.left, right: rect.right, bottom: rect.bottom, viewportWidth: innerWidth, navTop: nav.top, actions };
    });
    assert.ok(layout.left >= 0 && layout.right <= layout.viewportWidth && layout.bottom <= layout.navTop);
    for (const action of layout.actions) assert.ok(action.width >= 44 && action.height >= 44 && action.left >= 0 && action.right <= layout.viewportWidth);
    await page.screenshot({ path: `${out}/${viewport.width}-empty-play-visible.png` });
    await page.locator('#draw-music-feedback-dismiss').click();
    assert.equal(await page.locator('#draw-music-feedback').isVisible(), false);
    await page.locator('#draw-music-play').click();
    await page.waitForFunction(() => !document.querySelector('#draw-music-feedback').hidden);
    record('dismiss-and-explicit-play-reopens-reason', viewport);
    await page.evaluate(() => { window.__soundTimelineBefore = __polishDraw.getTimeline(); });
    await page.locator('#draw-music-voice-cta').click();
    await page.waitForFunction(() => !document.querySelector('#draw-color-editor')?.hidden && document.querySelector('#draw-color-editor')?.dataset.activeView === 'sound');
    assert.equal(await page.locator('#draw-music-settings').evaluate(node => node.open), false);
    assert.equal(await page.locator('#draw-music-feedback').isVisible(), false);
    assert.equal(await page.locator('#draw-color-editor').evaluate(node => node.dataset.activeView), 'sound');
    await page.waitForFunction(() => document.activeElement.matches('#datp-candidate-list [data-instrument]'));
    assert.equal(await page.locator('#datp-candidate-list [data-instrument]').evaluate(node => node === document.activeElement), true);
    const unchangedWhileOpening = await page.evaluate(() => ({ sameTimeline: __polishDraw.getTimeline() === window.__soundTimelineBefore, selectedColor: __polishDraw.getEditorState().selectedColor }));
    assert.equal(unchangedWhileOpening.sameTimeline, true);
    record('empty-play-voice-action-opens-sound-tab-without-mutation', viewport, unchangedWhileOpening);
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#draw-color-editor').isVisible(), false);
    assert.equal(await page.evaluate(() => document.activeElement.id), 'draw-music-play');
    record('sound-tab-escape-restores-warning-trigger', viewport);
    await page.locator('#draw-music-output-layer').check();
    await page.locator('#draw-music-output-audio').uncheck();
    await page.locator('#draw-music-loops').selectOption('2');
    const expected = { includeMusic: true, includeAudio: false, loops: 2 };
    assert.deepEqual(await prefs(page), expected);
    const summary = await page.locator('#draw-music-export-summary').textContent();
    assert.match(summary, /音声なし/); assert.match(summary, /2/);
    // Confirm the ordinary debounce, not an explicit QA save, persists these options.
    await page.waitForFunction(() => __polishDraw.workspace.persisted && !__polishDraw.workspace.dirty, null, { timeout: 15000 });
    const originalId = await page.evaluate(() => __polishDraw.workspace.currentProject.projectId);
    await page.reload();
    await page.waitForFunction(() => document.documentElement.dataset.creationModesReady === 'true' && document.body.dataset.creationMode === 'audio' && !document.body.hasAttribute('data-creation-transition'));
    assert.deepEqual(await prefs(page), expected);
    const actualUI = await page.evaluate(() => ({ includeMusic: document.querySelector('#draw-music-output-layer').checked, includeAudio: document.querySelector('#draw-music-output-audio').checked, loops: Number(document.querySelector('#draw-music-loops').value) }));
    assert.deepEqual(actualUI, expected);
    record('output-options-autosave-reload', viewport, { expected, actualUI, summary });
    await page.locator('#project-open').click(); await page.locator('#project-new').click();
    await page.waitForFunction(id => __polishDraw.workspace.currentProject.projectId !== id && !__polishDraw.workspace.busy, originalId);
    assert.deepEqual(await prefs(page), { includeMusic: false, includeAudio: true, loops: 1 });
    await page.locator('#project-open').click();
    await page.locator(`[data-project-id="${originalId}"]`).click();
    await page.waitForFunction(id => __polishDraw.workspace.currentProject.projectId === id && !__polishDraw.workspace.busy, originalId);
    assert.deepEqual(await prefs(page), expected);
    record('output-options-project-isolation-return', viewport);
    await mode(page, 'draw');
    assert.equal(await page.locator('#draw-music-feedback').isVisible(), false);
    await mode(page, 'audio');
    assert.deepEqual(await prefs(page), expected);
    record('music-feedback-owner-and-switch-retention', viewport);
    assert.equal(await page.evaluate(() => __mediaRequests), 0);
    await page.screenshot({ path: `${out}/${viewport.width}-music-return.png` });
    await page.goto(`${base}/draw/?qaReturn=1`);
    await page.waitForFunction(() => document.documentElement.dataset.creationModesReady === 'true');
    await page.locator('#creation-project-settings-open').click();
    await page.goBack();
    await page.waitForFunction(() => document.documentElement.dataset.creationModesReady === 'true' && document.body.dataset.creationMode === 'audio' && !document.body.hasAttribute('data-creation-transition'));
    assert.deepEqual(await prefs(page), expected);
    await page.goForward();
    await page.waitForFunction(() => document.documentElement.dataset.creationModesReady === 'true');
    assert.equal(await page.locator(settingsPanel).isVisible(), false);
    assert.deepEqual(await prefs(page), expected);
    record('browser-back-forward-preserves-work-no-panel-history', viewport);
    await context.close();
  }
  assert.deepEqual(report.errors, []);
  report.status = 'PASS';
} catch (error) { report.status = 'FAIL'; report.failure = error.stack; throw error; }
finally { await writeFile(`${out}/results.json`, JSON.stringify(report, null, 2)); await browser.close(); }
console.log(JSON.stringify({ status: report.status, engine, checks: report.checks.length, out }));
