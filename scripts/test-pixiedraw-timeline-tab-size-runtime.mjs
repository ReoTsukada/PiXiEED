import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const screenshotsRequire = createRequire(new URL('../tools/screenshots/package.json', import.meta.url));
const { chromium } = screenshotsRequire('playwright');
const targetUrl = process.env.PIXIEEDRAW_TEST_URL || 'http://127.0.0.1:8000/pixiedraw/';

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.route(/googlesyndication|doubleclick|google-analytics|googletagmanager|fonts\.googleapis|supabase\.co/, route => route.abort());
  await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 20_000 });
  await page.waitForTimeout(1_500);
  await page.click('#startupActionNew');
  await page.waitForSelector('#newProjectDialog[open]');
  await page.fill('#newProjectName', 'timeline-tab-size');
  await page.click('#confirmNewProject');
  await page.waitForFunction(() => !document.getElementById('newProjectDialog')?.open, null, { timeout: 15_000 });
  await page.evaluate(async () => {
    document.getElementById('addLayer')?.click();
    await new Promise(resolve => setTimeout(resolve, 80));
    document.getElementById('addLayer')?.click();
    document.getElementById('mobileTabFrames')?.click();
  });
  await page.waitForSelector('.timeline-frame-button');

  const sizes = await page.evaluate(() => {
    const rect = element => {
      const bounds = element?.getBoundingClientRect();
      return bounds ? { width: bounds.width, height: bounds.height } : null;
    };
    const largestRect = selector => Array.from(document.querySelectorAll(selector))
      .map(rect)
      .filter(Boolean)
      .sort((first, second) => (second.width * second.height) - (first.width * first.height))[0] || null;
    const matrix = document.querySelector('.timeline-matrix');
    return {
      timelineSize: matrix ? getComputedStyle(matrix).getPropertyValue('--timeline-cell-size').trim() : '',
      timelineCell: rect(document.querySelector('.timeline-frame-button')),
      visibleLayerTags: Array.from(document.querySelectorAll('.timeline-layer-tag'))
        .filter(element => getComputedStyle(element).display !== 'none' && element.getBoundingClientRect().width > 0)
        .map(element => rect(element)),
      playback: largestRect('#playAnimation'),
      frame: rect(document.querySelector('.timeline-frame-button')),
      rowTops: {
        playback: document.querySelector('#playAnimation')?.getBoundingClientRect().top ?? null,
        frame: document.querySelector('.timeline-frame-button')?.getBoundingClientRect().top ?? null,
        layer: document.querySelector('.timeline-layer-tag')?.getBoundingClientRect().top ?? null,
      },
    };
  });

  assert.equal(sizes.timelineSize, '40px');
  assert.deepEqual(sizes.timelineCell, { width: 40, height: 40 });
  assert.equal(sizes.visibleLayerTags.length, 1);
  assert.deepEqual(sizes.playback, { width: 40, height: 40 });
  assert.deepEqual(sizes.frame, { width: 40, height: 40 });
  assert.ok(sizes.rowTops.frame > sizes.rowTops.playback, 'frame row must follow playback row');
  assert.ok(sizes.rowTops.layer > sizes.rowTops.frame, 'active layer row must follow frame row');
  console.log(`PiXiEEDraw compact timeline: ${sizes.timelineCell.width}px; active layer rows: ${sizes.visibleLayerTags.length}`);
} finally {
  await browser.close();
}
