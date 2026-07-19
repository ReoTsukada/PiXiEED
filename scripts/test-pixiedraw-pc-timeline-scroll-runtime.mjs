import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const screenshotsRequire = createRequire(new URL('../tools/screenshots/package.json', import.meta.url));
const { chromium } = screenshotsRequire('playwright');
const targetUrl = process.env.PIXIEEDRAW_TEST_URL || 'http://127.0.0.1:8000/pixiedraw/';
const viewport = {
  width: Math.max(901, Math.round(Number(process.env.PIXIEEDRAW_TEST_WIDTH) || 1280)),
  height: Math.max(480, Math.round(Number(process.env.PIXIEEDRAW_TEST_HEIGHT) || 720)),
};

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport });
  await page.route(
    /googlesyndication|doubleclick|google-analytics|googletagmanager|fonts\.googleapis|supabase\.co/,
    route => route.abort()
  ).catch(() => {});
  await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 20_000 });
  await page.waitForTimeout(2_500);
  await page.click('#startupActionNew');
  await page.waitForSelector('#newProjectDialog[open]');
  await page.fill('#newProjectName', 'timeline-scroll-runtime');
  await page.click('#confirmNewProject');
  await page.waitForFunction(
    () => !document.getElementById('newProjectDialog')?.open,
    null,
    { timeout: 15_000 }
  );

  await page.evaluate(async () => {
    for (let index = 0; index < 48; index += 1) {
      document.getElementById('addFrame')?.click();
      await new Promise(resolve => window.setTimeout(resolve, 0));
    }
    for (let index = 0; index < 20; index += 1) {
      document.getElementById('addLayer')?.click();
      await new Promise(resolve => window.setTimeout(resolve, 0));
    }
  });
  await page.waitForTimeout(1_000);

  const compactBefore = await page.evaluate(() => {
    const dock = document.getElementById('bottomTimelineDock');
    const wrapper = document.querySelector('.timeline-matrix-wrapper');
    const outer = document.querySelector('#panelFrames .panel-section__body');
    return {
      compact: dock?.dataset.compact || '',
      wrapperClientWidth: wrapper?.clientWidth || 0,
      wrapperScrollWidth: wrapper?.scrollWidth || 0,
      wrapperClientHeight: wrapper?.clientHeight || 0,
      wrapperScrollHeight: wrapper?.scrollHeight || 0,
      outerClientWidth: outer?.clientWidth || 0,
      outerScrollWidth: outer?.scrollWidth || 0,
    };
  });
  assert.equal(compactBefore.compact, 'true');
  assert.ok(compactBefore.wrapperScrollWidth > compactBefore.wrapperClientWidth);
  assert.ok(compactBefore.wrapperScrollHeight <= compactBefore.wrapperClientHeight + 1);
  assert.ok(compactBefore.outerScrollWidth <= compactBefore.outerClientWidth + 1);

  const wrapperBox = await page.locator('.timeline-matrix-wrapper').boundingBox();
  assert.ok(wrapperBox);
  await page.mouse.move(wrapperBox.x + wrapperBox.width / 2, wrapperBox.y + wrapperBox.height / 2);
  await page.mouse.wheel(0, 480);
  await page.waitForTimeout(100);
  const compactWheel = await page.evaluate(() => {
    const wrapper = document.querySelector('.timeline-matrix-wrapper');
    return { left: wrapper?.scrollLeft || 0, top: wrapper?.scrollTop || 0 };
  });
  assert.ok(compactWheel.left > 0, 'normal desktop wheel must move the compact frame strip horizontally');
  assert.equal(compactWheel.top, 0);

  const compactEnd = await page.evaluate(() => {
    const wrapper = document.querySelector('.timeline-matrix-wrapper');
    const outer = document.querySelector('#panelFrames .panel-section__body');
    const lastHeader = [...document.querySelectorAll('.timeline-cell--frame-header')].at(-1);
    wrapper.scrollLeft = Number.MAX_SAFE_INTEGER;
    const wrapperRect = wrapper.getBoundingClientRect();
    const outerRect = outer.getBoundingClientRect();
    const headerRect = lastHeader.getBoundingClientRect();
    return {
      maxScrollLeft: wrapper.scrollWidth - wrapper.clientWidth,
      scrollLeft: wrapper.scrollLeft,
      visibleInWrapper: headerRect.left >= wrapperRect.left - 1 && headerRect.right <= wrapperRect.right + 1,
      visibleInOuter: headerRect.left >= outerRect.left - 1 && headerRect.right <= outerRect.right + 1,
    };
  });
  assert.equal(compactEnd.scrollLeft, compactEnd.maxScrollLeft);
  assert.equal(compactEnd.visibleInWrapper, true);
  assert.equal(compactEnd.visibleInOuter, true);

  await page.evaluate(() => {
    const layout = document.querySelector('.layout');
    const dock = document.getElementById('bottomTimelineDock');
    layout?.style.setProperty('--bottom-rail-height', '280px');
    if (dock) dock.dataset.compact = 'false';
    document.body.classList.remove('is-bottom-timeline-compact');
  });
  await page.waitForTimeout(100);

  const expandedBefore = await page.evaluate(() => {
    const wrapper = document.querySelector('.timeline-matrix-wrapper');
    const outer = document.querySelector('#panelFrames .panel-section__body');
    wrapper.scrollLeft = 0;
    wrapper.scrollTop = 0;
    return {
      wrapperClientWidth: wrapper.clientWidth,
      wrapperScrollWidth: wrapper.scrollWidth,
      wrapperClientHeight: wrapper.clientHeight,
      wrapperScrollHeight: wrapper.scrollHeight,
      outerClientWidth: outer.clientWidth,
      outerScrollWidth: outer.scrollWidth,
      outerClientHeight: outer.clientHeight,
      outerScrollHeight: outer.scrollHeight,
    };
  });
  assert.ok(expandedBefore.wrapperScrollWidth > expandedBefore.wrapperClientWidth);
  assert.ok(expandedBefore.wrapperScrollHeight > expandedBefore.wrapperClientHeight);
  assert.ok(expandedBefore.outerScrollWidth <= expandedBefore.outerClientWidth + 1);
  assert.ok(expandedBefore.outerScrollHeight <= expandedBefore.outerClientHeight + 1);

  const expandedEnd = await page.evaluate(() => {
    const wrapper = document.querySelector('.timeline-matrix-wrapper');
    const outer = document.querySelector('#panelFrames .panel-section__body');
    const lastHeader = [...document.querySelectorAll('.timeline-cell--frame-header')].at(-1);
    const lastLayer = [...document.querySelectorAll('.timeline-cell--layer-main')].at(-1);
    wrapper.scrollLeft = Number.MAX_SAFE_INTEGER;
    wrapper.scrollTop = Number.MAX_SAFE_INTEGER;
    const wrapperRect = wrapper.getBoundingClientRect();
    const outerRect = outer.getBoundingClientRect();
    const headerRect = lastHeader.getBoundingClientRect();
    const layerRect = lastLayer.getBoundingClientRect();
    const within = (rect, viewport) => (
      rect.left >= viewport.left - 1
      && rect.right <= viewport.right + 1
      && rect.top >= viewport.top - 1
      && rect.bottom <= viewport.bottom + 1
    );
    return {
      maxScrollLeft: wrapper.scrollWidth - wrapper.clientWidth,
      maxScrollTop: wrapper.scrollHeight - wrapper.clientHeight,
      scrollLeft: wrapper.scrollLeft,
      scrollTop: wrapper.scrollTop,
      headerVisibleInWrapper: within(headerRect, wrapperRect),
      headerVisibleInOuter: within(headerRect, outerRect),
      layerVisibleInWrapper: within(layerRect, wrapperRect),
      layerVisibleInOuter: within(layerRect, outerRect),
    };
  });
  assert.equal(expandedEnd.scrollLeft, expandedEnd.maxScrollLeft);
  assert.equal(expandedEnd.scrollTop, expandedEnd.maxScrollTop);
  assert.equal(expandedEnd.headerVisibleInWrapper, true);
  assert.equal(expandedEnd.headerVisibleInOuter, true);
  assert.equal(expandedEnd.layerVisibleInWrapper, true);
  assert.equal(expandedEnd.layerVisibleInOuter, true);

  console.log(JSON.stringify({ viewport, compactBefore, compactWheel, compactEnd, expandedBefore, expandedEnd }, null, 2));
} finally {
  await browser.close();
}
