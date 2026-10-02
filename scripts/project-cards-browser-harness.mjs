#!/usr/bin/env node
/** Local-only project cards, touch gestures, deletion, restoration and save safety. */
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
const base = process.env.PIXIEED_BROWSER_BASE_URL || 'http://127.0.0.1:4182';
const origin = new URL(base).origin;
assert.ok(['localhost', '127.0.0.1'].includes(new URL(base).hostname));
const { chromium } = await import(pathToFileURL(process.env.PIXIEED_PLAYWRIGHT_MODULE || '/Users/tsukadareine/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs').href);
const browser = await chromium.launch({ headless: true });
const viewports = [{ width: 320, height: 568 }, { width: 390, height: 844 }, { width: 844, height: 390 }, { width: 1280, height: 800 }];
let checks = 0;
async function projectImage(page, id) {
  return page.evaluate(async id => {
    const project = await (await import('/js/creation/pxd-store.mjs')).createPxdStore().load(id);
    if (!project) return null;
    const { componentImageRole } = await import('/js/creation/project-components.mjs');
    const image = await (await import('/js/creation/pxd-project.mjs')).readPxdImage(project, componentImageRole(project, project.manifest.toolProject.tool));
    return { id: project.projectId, width: image.width, height: image.height, rgba: Array.from(image.rgba) };
  }, id);
}
async function library(page) {
  if (!await page.locator('#pxd-panel').evaluate(el => el.open)) await page.locator('#project-open').click();
  await page.locator('#project-tab-library').click();
}
async function touchCard(page, cdp, id, kind = 'hold') {
  const card = page.locator(`.project-card[data-project-id="${id}"]`);
  await card.scrollIntoViewIfNeeded(); const box = await card.boundingBox();
  const x = box.x + box.width / 2, y = box.y + box.height / 2;
  const point = (id, dx = 0, dy = 0) => ({ id, x: x + dx, y: y + dy, radiusX: 2, radiusY: 2, force: 1 });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point(1)] });
  if (kind === 'move') await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [point(1, 0, -30)] });
  if (kind === 'multi') await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point(1), point(2, 30)] });
  if (kind === 'hold') await page.locator('#project-delete-confirm').waitFor();
  else await page.waitForTimeout(650); // Deliberately exceed the hold threshold after cancellation.
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}
try {
  for (const viewport of viewports) {
    const context = await browser.newContext({ viewport, hasTouch: true });
    await context.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
    const page = await context.newPage(), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const cdp = await context.newCDPSession(page);
    for (const tool of ['draw', 'audio']) {
      await page.goto(`${base}/${tool}/`); await page.waitForFunction(() => !document.querySelector('main').inert);
      const fixture = await page.evaluate(async tool => {
        const { createPxdProject } = await import('/js/creation/pxd-codec.mjs');
        const { putPxdSharedImage } = await import('/js/creation/pxd-project.mjs');
        const { importToolProject } = await import('/js/creation/tool-project-import.mjs');
        const { createToolProjectStore } = await import('/js/creation/tool-project-store.mjs');
        const result = {};
        for (const label of ['A', 'B']) {
          const rgba = new Uint8ClampedArray(32 * 16 * 4);
          for (let y = 0; y < 16; y++) for (let x = 0; x < 32; x++) {
            const rgb = label === 'A' ? (x < 16 ? [230, 80, 70] : [250, 220, 90]) : (y < 8 ? [60, 170, 110] : [80, 150, 210]);
            rgba.set([...rgb, 255], (y * 32 + x) * 4);
          }
          const input = await putPxdSharedImage(createPxdProject({ manifest: { title: `テスト作品${label}` } }), { width: 32, height: 16, rgba });
          const project = await createToolProjectStore(tool).save(await importToolProject(input, tool), { expectedRevisionId: null });
          result[label] = { id: project.projectId, revision: project.revisionId };
          if (label === 'B') {
            const other = tool === 'draw' ? 'audio' : 'draw';
            const copy = await createToolProjectStore(other).save(await importToolProject(project, other), { expectedRevisionId: null });
            result.copy = { id: copy.projectId };
          }
        }
        return result;
      }, tool);
      const url = item => `${base}/${tool}/?` + new URLSearchParams({ pxd: item.id, pxdRevision: item.revision });
      await page.goto(url(fixture.A)); await page.waitForFunction(() => !document.querySelector('main').inert);
      const originalA = await projectImage(page, fixture.A.id), originalB = await projectImage(page, fixture.B.id), originalCopy = await projectImage(page, fixture.copy.id);
      await library(page);
      const card = page.locator(`.project-card[data-project-id="${fixture.B.id}"]`);
      assert.equal(await card.locator('canvas').isVisible(), true);
      const thumb = await card.locator('canvas').evaluate(el => { const r = el.getBoundingClientRect(); return { width: r.width, rendering: getComputedStyle(el).imageRendering }; });
      assert.ok(thumb.width >= 64); assert.equal(thumb.rendering, 'pixelated'); checks++;
      for (const kind of ['move', 'multi']) {
        await touchCard(page, cdp, fixture.B.id, kind);
        assert.equal(await page.locator('#project-delete-confirm').count(), 0, `${kind} cancels deletion`);
        assert.equal(new URL(page.url()).searchParams.get('pxd'), fixture.A.id); checks++;
      }
      await touchCard(page, cdp, fixture.B.id);
      assert.equal(await page.locator('.project-card-actions').count(), 0, 'Long press directly opens confirmation');
      const confirmation = page.locator('.project-delete-dialog');
      assert.equal(await confirmation.locator('canvas').isVisible(), true);
      assert.equal(await page.locator('#project-delete-cancel').evaluate(el => el === document.activeElement), true, await page.evaluate(() => document.activeElement.outerHTML));
      const fit = await confirmation.evaluate(el => { const r = el.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth + 1 && r.top >= 0 && r.bottom <= innerHeight + 1 && document.documentElement.scrollWidth <= innerWidth + 1; });
      assert.equal(fit, true); checks++;
      if (viewport.width === 390 && tool === 'draw') await page.screenshot({ path: '/tmp/pixieed-project-delete-confirm.png' });
      await page.locator('#project-delete-cancel').click();
      assert.equal(new URL(page.url()).searchParams.get('pxd'), fixture.A.id);
      assert.deepEqual(await projectImage(page, fixture.B.id), originalB); checks++;
      await library(page);
      // The existing gesture helper ignores delayed native touch menus for one second.
      await page.waitForTimeout(1100);
      await card.click({ button: 'right' });
      assert.equal(await page.locator('#project-card-actions-copy').isVisible(), true);
      await page.locator('#project-card-actions-delete').click();
      assert.equal(await page.locator('.project-delete-dialog canvas').isVisible(), true);
      await page.locator('#project-delete-cancel').click(); await library(page); checks++;
      await card.focus(); await page.keyboard.press('Shift+F10');
      await page.locator('#project-card-actions-close').click(); checks++;
      await page.locator('#project-close').click();
      // Edit A, then delete B before A's one-second autosave would normally fire.
      if (tool === 'draw') await page.locator('#draw-palette [data-color-index="-1"]').click();
      else await page.locator('#audio-tool-pen').click(); // The active pen switches to eraser.
      const canvas = page.locator(tool === 'draw' ? '#draw-canvas' : '#audio-pixel-canvas');
      const box = await canvas.boundingBox(), size = await canvas.evaluate(el => ({ width: el.width, height: el.height }));
      await page.mouse.click(box.x + 4.5 * box.width / size.width, box.y + 4.5 * box.height / size.height);
      await library(page); await touchCard(page, cdp, fixture.B.id);
      await page.locator('#project-delete-confirm').click();
      await page.waitForFunction(() => document.querySelector('#project-open').dataset.state === 'saved');
      assert.equal(await projectImage(page, fixture.B.id), null);
      const editedA = await projectImage(page, fixture.A.id); assert.notDeepEqual(editedA.rgba, originalA.rgba);
      assert.equal(editedA.id, originalA.id); assert.deepEqual(await projectImage(page, fixture.copy.id), originalCopy); checks++;
      await library(page); await page.locator('.project-trash > summary').click();
      await page.locator(`#project-restore-${fixture.B.id}`).click();
      await card.waitFor({ state: 'visible' });
      assert.deepEqual(await projectImage(page, fixture.B.id), originalB); checks++;
      await card.click(); await page.waitForFunction(id => new URLSearchParams(location.search).get('pxd') === id, fixture.B.id);
      assert.deepEqual(await projectImage(page, fixture.A.id), editedA); checks++;
    }
    for (const [tool, path] of [['camera', '/pixel-camera.html'], ['jigsaw', '/jigsaw/'], ['spot_difference', '/spot-difference/'], ['hidden_object', '/hidden-object/']]) {
      await page.goto(`${base}${path}`); await page.locator('#project-open').waitFor();
      const fixture = await page.evaluate(async tool => {
        const { createPxdProject } = await import('/js/creation/pxd-codec.mjs');
        const { putPxdSharedImage } = await import('/js/creation/pxd-project.mjs');
        const { cloneAsToolProject, createToolProjectStore } = await import('/js/creation/tool-project-store.mjs');
        const rgba = new Uint8ClampedArray(16 * 16 * 4);
        for (let i = 0; i < 16 * 16; i++) rgba.set([70, 150, 210, 255], i * 4);
        const input = await putPxdSharedImage(createPxdProject({ manifest: { title: '確認用の作品' } }), { width: 16, height: 16, rgba });
        const saved = await createToolProjectStore(tool).save(cloneAsToolProject(input, tool), { expectedRevisionId: null });
        return saved.projectId;
      }, tool);
      await library(page); await touchCard(page, cdp, fixture);
      assert.equal(await page.locator('.project-delete-dialog canvas').isVisible(), true);
      assert.equal(await page.locator('.project-delete-dialog').evaluate(el => {
        const r = el.getBoundingClientRect();
        return r.left >= 0 && r.right <= innerWidth + 1 && r.top >= 0 && r.bottom <= innerHeight + 1 && document.documentElement.scrollWidth <= innerWidth + 1;
      }), true); checks++;
      await page.locator('#project-delete-cancel').click();
      assert.notEqual(await projectImage(page, fixture), null); checks++;
      await library(page); await touchCard(page, cdp, fixture);
      await page.locator('#project-delete-confirm').click();
      await page.waitForFunction(async id => !(await (await import('/js/creation/pxd-store.mjs')).createPxdStore().load(id)), fixture);
      checks++;
      await library(page); await page.locator('.project-trash > summary').click();
      await page.locator(`#project-restore-${fixture}`).click();
      await page.locator(`.project-card[data-project-id="${fixture}"]`).waitFor();
      assert.notEqual(await projectImage(page, fixture), null); checks++;
    }
    assert.deepEqual(errors, []); await context.close();
    console.log(`PASS project cards ${viewport.width}×${viewport.height}`);
  }
  console.log(`${checks}/${checks} PASS: native emulated touch holds, cancellation, previews, desktop/keyboard, delete/restore, unrelated project and autosave safety. Physical devices UNTESTED.`);
} finally { await browser.close(); }
