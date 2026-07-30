import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const requireFromScreenshots = createRequire(new URL('../tools/screenshots/package.json', import.meta.url));
const { chromium } = requireFromScreenshots('playwright');
const browser = await chromium.launch({ headless: true });

try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.goto('http://127.0.0.1:8000/pixiedraw/', { waitUntil: 'domcontentloaded', timeout: 20000 });
  await page.waitForSelector('.pixieed-shared-top-ad.is-local-preview', { timeout: 10000 });
  const result = await page.evaluate(() => {
    const banner = document.querySelector('.pixieed-shared-top-ad');
    const pseudo = banner ? getComputedStyle(banner.querySelector('.ad-block'), '::after') : null;
    const rect = banner?.getBoundingClientRect();
    return {
      localPreview: banner?.classList.contains('is-local-preview') === true,
      height: rect?.height || 0,
      previewText: pseudo?.content || '',
    };
  });
  assert.equal(result.localPreview, true);
  assert.equal(result.height, 50);
  assert.match(result.previewText, /広告プレビュー/);
  console.log('PiXiEEDraw portrait local ad preview browser check passed.');
} finally {
  await browser.close();
}
