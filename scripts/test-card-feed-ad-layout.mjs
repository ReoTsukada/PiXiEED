import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const requireFromScreenshots = createRequire(new URL('../tools/screenshots/package.json', import.meta.url));
const { chromium } = requireFromScreenshots('playwright');

const browser = await chromium.launch({ headless: true });
try {
  for (const [path, viewport] of [
    ['/pixfind/', [390, 844]],
    ['/pixfind/', [1440, 900]],
    ['/market/', [390, 844]],
    ['/market/', [1440, 900]],
  ]) {
    const page = await browser.newPage({ viewport: { width: viewport[0], height: viewport[1] } });
    await page.route(/googlesyndication|doubleclick|google-analytics|googletagmanager|gstatic|fonts\.googleapis|supabase\.co/, route => route.abort());
    await page.goto(`http://127.0.0.1:8000${path}`, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForTimeout(900);
    if (path === '/pixfind/') {
      await page.locator('#startButton').click();
      await page.waitForTimeout(500);
    }
    const result = await page.evaluate(() => {
      const isPixfind = window.location.pathname.startsWith('/pixfind/');
      const grid = document.querySelector(isPixfind ? '#puzzleList' : '#marketGrid');
      const element = document.createElement('aside');
      element.className = isPixfind ? 'puzzle-list-ad' : 'market-ad market-ad--list';
      element.innerHTML = isPixfind
        ? '<div class="puzzle-ad-slot"><ins class="adsbygoogle"></ins></div>'
        : '<ins class="adsbygoogle"></ins>';
      grid?.appendChild(element);
      return {
        overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
        ads: Array.from(document.querySelectorAll('.puzzle-list-ad, .market-ad--list')).map(element => {
        const frame = element.getBoundingClientRect();
        const slot = element.querySelector('ins')?.getBoundingClientRect();
        return {
          frame: [frame.x, frame.y, frame.width, frame.height],
          slot: slot ? [slot.x, slot.y, slot.width, slot.height] : null,
          centered: slot ? Math.abs((frame.x + frame.width / 2) - (slot.x + slot.width / 2)) < 2 : false,
        };
        }),
      };
    });
    assert.equal(result.overflow, false, `${path} ${viewport.join('x')} must not overflow horizontally`);
    result.ads.forEach((ad, index) => {
      assert.ok(ad.frame[3] >= 180, `${path} ad ${index} must reserve its height before a response`);
      assert.equal(ad.centered, true, `${path} ad ${index} must be horizontally centered`);
    });
    console.log(`${path} ${viewport.join('x')}: ${result.ads.length} reserved centered ad(s)`);
    await page.close();
  }
} finally {
  await browser.close();
}
