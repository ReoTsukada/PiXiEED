import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const screenshotsRequire = createRequire(new URL('../tools/screenshots/package.json', import.meta.url));
const { chromium } = screenshotsRequire('playwright');
const targetUrl = process.env.PIXIEEDRAW_TEST_URL || 'http://127.0.0.1:8000/pixiedraw/';

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(String(error?.stack || error)));
  await page.route(/googlesyndication|doubleclick|google-analytics|googletagmanager|fonts\.googleapis|supabase\.co/, route => route.abort());
  await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 20_000 });
  await page.waitForTimeout(1_500);
  await page.click('#startupActionNew');
  await page.waitForSelector('#newProjectDialog[open]');
  await page.fill('#newProjectName', 'timeline-tap-sync');
  await page.click('#confirmNewProject');
  await page.waitForFunction(() => !document.getElementById('newProjectDialog')?.open, null, { timeout: 15_000 });
  await page.evaluate(async () => {
    document.getElementById('addFrame')?.click();
    document.getElementById('addFrame')?.click();
    document.getElementById('addLayer')?.click();
    await new Promise(resolve => window.setTimeout(resolve, 120));
  });
  async function clickTimelineControl(selector, marker) {
    const target = await page.evaluate(({ selector, marker }) => {
      const candidates = Array.from(document.querySelectorAll(selector));
      const active = document.querySelector('.timeline-slot.is-active');
      const control = candidates.find(candidate => candidate instanceof HTMLButtonElement && candidate !== active && !candidate.disabled);
      if (!(control instanceof HTMLButtonElement)) return null;
      control.dataset[marker] = 'true';
      return {
        frame: control.dataset.timelineFrameIndex || null,
        layer: control.dataset.timelineLayerIndex || null,
      };
    }, { selector, marker });
    assert.ok(target, `${selector} must have a selectable control`);
    await page.evaluate(attribute => {
      const control = document.querySelector(`[${attribute}="true"]`);
      if (!(control instanceof HTMLButtonElement)) {
        throw new Error(`timeline control not found: ${attribute}`);
      }
      control.click();
    }, `data-${marker.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`)}`);
    await page.waitForTimeout(120);
    return target;
  }

  const slotTarget = await clickTimelineControl('.timeline-slot[data-timeline-frame-index][data-timeline-layer-index]', 'timelineTapSyncSlot');
  let active = await page.evaluate(() => document.querySelector('.timeline-slot.is-active')?.dataset);
  assert.equal(active?.timelineFrameIndex, slotTarget.frame, 'a cell click must select its frame');
  assert.equal(active?.timelineLayerIndex, slotTarget.layer, 'a cell click must select its layer');

  const layerTarget = await clickTimelineControl('.timeline-layer-tag[data-timeline-layer-index]', 'timelineTapSyncLayer');
  active = await page.evaluate(() => document.querySelector('.timeline-slot.is-active')?.dataset);
  assert.equal(active?.timelineLayerIndex, layerTarget.layer, 'a layer label click must select its layer');

  const frameTarget = await clickTimelineControl('.timeline-frame-button[data-timeline-frame-index]', 'timelineTapSyncFrame');
  active = await page.evaluate(() => document.querySelector('.timeline-slot.is-active')?.dataset);
  assert.equal(active?.timelineFrameIndex, frameTarget.frame, 'a frame label click must select its frame');

  await page.evaluate(() => document.getElementById('removeLayer')?.click());
  await page.waitForTimeout(120);
  const layerCountAfterRemove = await page.evaluate(() => {
    const frameIndexes = new Set(Array.from(document.querySelectorAll('.timeline-slot[data-timeline-frame-index]'))
      .map(slot => slot.dataset.timelineFrameIndex));
    return Array.from(frameIndexes).map(frameIndex => document.querySelectorAll(
      `.timeline-slot[data-timeline-frame-index="${frameIndex}"]`
    ).length);
  });
  assert.deepEqual(layerCountAfterRemove, [1, 1, 1], 'remove layer must remove the selected track from every frame');

  await page.evaluate(() => document.getElementById('removeFrame')?.click());
  await page.waitForTimeout(120);
  const frameCountAfterRemove = await page.evaluate(() => document.querySelectorAll('.timeline-frame-button').length);
  assert.equal(frameCountAfterRemove, 2, 'remove frame must remove the active frame');
  assert.deepEqual(pageErrors, []);
  console.log('PiXiEEDraw timeline cell/frame/layer synchronization passed.');
} finally {
  await browser.close();
}
