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
    await page.waitForFunction(() => typeof window.PiXiEEDCardFeedAds?.renderProgressively === 'function');
    const result = await page.evaluate(async () => {
      const grid = document.createElement('section');
      grid.style.cssText = 'display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;width:min(100%,720px);margin:100px auto';
      document.body.appendChild(grid);
      const cards = Array.from({ length: 7 }, (_, index) => {
        const card = document.createElement('article');
        card.className = 'test-card'; card.textContent = String(index + 1);
        return card;
      });
      const task = window.PiXiEEDCardFeedAds.renderProgressively({
        grid,
        cards,
        createAd: () => {
          const ad = document.createElement('aside');
          ad.className = 'test-ad';
          ad.innerHTML = '<ins class="adsbygoogle"></ins>';
          return ad;
        },
        requestAd: (ad) => window.setTimeout(() => ad.querySelector('ins')?.setAttribute('data-ad-status', 'unfilled'), 600),
      });
      await new Promise((resolve) => setTimeout(resolve, 150));
      const initialCards = grid.querySelectorAll('.test-card').length;
      await task;
      const finalCards = grid.querySelectorAll('.test-card').length;
      const ads = grid.querySelectorAll('.test-ad').length;
      const overflow = document.documentElement.scrollWidth > document.documentElement.clientWidth;
      grid.remove();
      return { initialCards, finalCards, ads, overflow };
    });
    assert.ok(result.initialCards < 7, `${path} ${viewport.join('x')} must pause after the first three rendered rows`);
    assert.equal(result.finalCards, 7, `${path} ${viewport.join('x')} must reveal remaining cards after ad outcome`);
    assert.equal(result.ads, 1, `${path} ${viewport.join('x')} must insert one shared ad between batches`);
    assert.equal(result.overflow, false, `${path} ${viewport.join('x')} must not overflow horizontally`);
    console.log(`${path} ${viewport.join('x')}: progressive feed passed`);
    await page.close();
  }
} finally {
  await browser.close();
}
