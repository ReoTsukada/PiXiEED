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
      const leadingGrid = document.createElement('section');
      leadingGrid.style.cssText = 'display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;width:min(100%,720px);margin:100px auto';
      document.body.appendChild(leadingGrid);
      const leadingCards = Array.from({ length: 8 }, (_, index) => {
        const card = document.createElement('article');
        card.className = 'leading-test-card'; card.textContent = String(index + 1);
        return card;
      });
      const leadingTask = window.PiXiEEDCardFeedAds.renderProgressively({
        grid: leadingGrid,
        cards: leadingCards,
        leadingAdAfterCards: 1,
        createAd: ({ placement } = {}) => {
          const ad = document.createElement('aside');
          ad.className = placement === 'leading' ? 'leading-test-ad' : 'leading-test-break-ad';
          ad.innerHTML = '<ins class="adsbygoogle"></ins>';
          return ad;
        },
        requestAd: (ad) => window.setTimeout(() => ad.querySelector('ins')?.setAttribute('data-ad-status', 'unfilled'), 600),
      });
      await new Promise((resolve) => setTimeout(resolve, 150));
      const leadingInitialCards = leadingGrid.querySelectorAll('.leading-test-card').length;
      const leadingInitialOrder = Array.from(leadingGrid.children).slice(0, 2).map(node => node.className);
      await leadingTask;
      const leadingFinalCards = leadingGrid.querySelectorAll('.leading-test-card').length;
      const leadingAds = leadingGrid.querySelectorAll('.leading-test-ad, .leading-test-break-ad').length;
      leadingGrid.remove();
      return { initialCards, finalCards, ads, overflow, leadingInitialCards, leadingInitialOrder, leadingFinalCards, leadingAds };
    });
    assert.ok(result.initialCards < 7, `${path} ${viewport.join('x')} must pause after the first three rendered rows`);
    assert.equal(result.finalCards, 7, `${path} ${viewport.join('x')} must reveal remaining cards after ad outcome`);
    assert.equal(result.ads, 1, `${path} ${viewport.join('x')} must insert one shared ad between batches`);
    assert.equal(result.leadingInitialCards, 5, `${path} ${viewport.join('x')} must count the second-cell ad inside the first three rows`);
    assert.deepEqual(result.leadingInitialOrder, ['leading-test-card', 'leading-test-ad'], `${path} ${viewport.join('x')} must place the leading ad in the second grid cell`);
    assert.equal(result.leadingFinalCards, 8, `${path} ${viewport.join('x')} must release the remaining leading-feed cards`);
    assert.equal(result.leadingAds, 2, `${path} ${viewport.join('x')} must keep the leading ad plus the later three-row break ad`);
    assert.equal(result.overflow, false, `${path} ${viewport.join('x')} must not overflow horizontally`);
    console.log(`${path} ${viewport.join('x')}: progressive feed passed`);
    await page.close();
  }
} finally {
  await browser.close();
}
