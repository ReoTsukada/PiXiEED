#!/usr/bin/env node
/** Exercise actual Send buttons; external services and the physical camera stay untouched. */
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
const base = process.env.PIXIEED_BROWSER_BASE_URL || 'http://127.0.0.1:4180';
const origin = new URL(base).origin;
assert.ok(['localhost', '127.0.0.1'].includes(new URL(base).hostname));
const { chromium } = await import(pathToFileURL(process.env.PIXIEED_PLAYWRIGHT_MODULE || '/Users/tsukadareine/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs').href);
const browser = await chromium.launch({ headless: true });
const routes = { draw: '/draw/', audio: '/audio/', camera: '/pixel-camera.html', jigsaw: '/jigsaw/', spot_difference: '/spot-difference/', hidden_object: '/hidden-object/' };
const viewports = [{ width: 320, height: 568 }, { width: 390, height: 844 }, { width: 844, height: 390 }, { width: 1280, height: 800 }];
let checks = 0;
async function snapshot(page, id) {
  return page.evaluate(async id => {
    const { createPxdStore } = await import('/js/creation/pxd-store.mjs');
    const { readPxdImage } = await import('/js/creation/pxd-project.mjs');
    const { componentImageRole } = await import('/js/creation/project-components.mjs');
    const { readPxdAudioState } = await import('/js/creation/pxd-draw-audio.mjs');
    const project = await createPxdStore().load(id || new URLSearchParams(location.search).get('pxd'));
    const image = await readPxdImage(project, componentImageRole(project, project.manifest.toolProject.tool));
    return { id: project.projectId, revision: project.revisionId, tool: project.manifest.toolProject.tool,
      width: image?.width, height: image?.height, rgba: image ? Array.from(image.rgba) : null,
      audio: project.manifest.toolProject.tool === 'audio' ? readPxdAudioState(project) : null };
  }, id);
}
async function tapCell(page, selector, x, y) {
  const canvas = page.locator(selector), box = await canvas.boundingBox();
  const size = await canvas.evaluate(c => ({ width: c.width, height: c.height }));
  await page.mouse.click(box.x + (x + .5) * box.width / size.width, box.y + (y + .5) * box.height / size.height);
}
try {
  for (const viewport of viewports) {
    const context = await browser.newContext({ viewport, acceptDownloads: true });
    await context.route('**/*', r => new URL(r.request().url()).origin === origin ? r.continue() : r.abort());
    await context.addInitScript(() => {
      if (navigator.mediaDevices) navigator.mediaDevices.getUserMedia = async () => {
        const canvas = document.createElement('canvas'); canvas.width = 320; canvas.height = 240;
        const ctx = canvas.getContext('2d'); ctx.fillStyle = '#80bccb'; ctx.fillRect(0, 0, 320, 240);
        ctx.fillStyle = '#ef634d'; ctx.fillRect(80, 80, 80, 80); ctx.fillStyle = '#ffe994'; ctx.fillRect(200, 30, 45, 45);
        return canvas.captureStream(15);
      };
    });
    const page = await context.newPage(), errors = [];
    page.on('pageerror', e => errors.push(e.message));
    for (const sourceTool of ['draw', 'audio', 'camera']) {
      await page.goto(base + routes[sourceTool], { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => !document.querySelector('main').inert);
      if (sourceTool === 'camera') {
        await page.waitForFunction(() => document.querySelector('#pixelStudio').dataset.mode === 'live');
        await page.locator('#capture').click();
        await page.locator('[data-tool-result-transfer]').waitFor();
        await page.locator('[data-tool-result-transfer]').click();
        await page.locator('[data-project-transfer]').first().waitFor();
        await page.keyboard.press('Escape');
        assert.equal(await page.locator('[data-tool-result-view]').isVisible(), true, 'Closing send sheet retains captured preview');
        await page.locator('[data-tool-result-transfer]').click();
      } else {
        await tapCell(page, sourceTool === 'draw' ? '#draw-canvas' : '#audio-pixel-canvas', 4, 4);
        await page.locator(`#${sourceTool}-output > summary`).click();
        const download = page.waitForEvent('download');
        await page.locator(sourceTool === 'draw' ? '#draw-export' : '#audio-export-image').click();
        await download;
        await page.locator('[data-tool-result-transfer]').click();
        await page.locator('[data-project-transfer]').first().waitFor();
        await page.keyboard.press('Escape');
        assert.equal(await page.locator('[data-tool-result-view]').isVisible(), true, 'Closing send sheet retains saved preview');
        await page.locator('[data-tool-result-transfer]').click();
      }
      for (const target of Object.keys(routes).filter(t => t !== 'camera' && t !== sourceTool)) {
        const senderUrl = page.url();
        await page.locator(`[data-project-transfer="${target}"]`).click();
        await page.waitForURL(url => url.pathname === routes[target]);
        await page.waitForFunction(() => !document.querySelector('main').inert && Boolean(new URLSearchParams(location.search).get('pxd')));
        const copy = await snapshot(page);
        const foreignId = new URL(senderUrl).searchParams.get('pxd') || await page.evaluate(() => null);
        const source = foreignId ? await snapshot(page, foreignId) : await page.evaluate(async sourceTool => {
          const { createToolProjectStore } = await import('/js/creation/tool-project-store.mjs');
          const { projects } = await createToolProjectStore(sourceTool).listProjects();
          return projects[0];
        }, sourceTool).then(item => snapshot(page, item.projectId));
        assert.notEqual(copy.id, source.id); assert.equal(copy.tool, target);
        assert.deepEqual(copy.rgba, source.rgba, `${sourceTool} → ${target}: current pixels and colors`);
        const sourceUrl = base + routes[sourceTool] + '?' + new URLSearchParams({ pxd: source.id, pxdRevision: source.revision });
        if (target === 'draw') {
          await tapCell(page, '#draw-canvas', 5, 4);
          await page.locator('#project-open').click(); await page.locator('#pxd-save').click();
          assert.deepEqual(await snapshot(page, source.id), source, 'Destination edits preserve source including music settings');
        }
        const beforeCount = await page.evaluate(async target => (await (await import('/js/creation/tool-project-store.mjs')).createToolProjectStore(target).listProjects()).projects.length, target);
        await page.goto(sourceUrl); await page.waitForFunction(() => !document.querySelector('main').inert);
        if (sourceTool === 'camera') await page.locator('[data-tool-result-transfer]').click();
        else { await page.locator('#project-open').click(); await page.locator('#project-tab-current').click(); }
        // Sending again must create another destination, never reopen or overwrite its previous copy.
        await page.locator(`[data-project-transfer="${target}"]`).click();
        await page.waitForURL(url => url.pathname === routes[target]);
        await page.waitForFunction(() => !document.querySelector('main').inert && Boolean(new URLSearchParams(location.search).get('pxd')));
        const again = await snapshot(page); assert.notEqual(again.id, copy.id);
        assert.equal(await page.evaluate(async target => (await (await import('/js/creation/tool-project-store.mjs')).createToolProjectStore(target).listProjects()).projects.length, target), beforeCount + 1);
        await page.goto(sourceUrl); await page.waitForFunction(() => !document.querySelector('main').inert);
        if (sourceTool === 'camera') await page.locator('[data-tool-result-transfer]').click();
        else { await page.locator('#project-open').click(); await page.locator('#project-tab-current').click(); }
        const fit = await page.locator('#pxd-panel').evaluate(n => { const r = n.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth + 1 && r.top >= 0 && r.bottom <= innerHeight + 1; });
        assert.equal(fit, true, `${viewport.width}: transfer sheet fit`); checks++;
      }
    }
    assert.deepEqual(errors, []); await context.close(); console.log(`PASS transfer controls ${viewport.width}×${viewport.height}`);
  }
  console.log(`${checks}/${checks} sends PASS: latest pixels, fresh copies, repeat sends, unchanged originals; camera simulated, real devices UNTESTED`);
} finally { await browser.close(); }
