// Independent local regression: no production data, accounts, ads or submissions.
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
const modulePath = process.env.PIXIEED_PLAYWRIGHT_MODULE;
if (!modulePath) throw new Error('Set PIXIEED_PLAYWRIGHT_MODULE to the installed Playwright runtime.');
const { chromium } = await import(pathToFileURL(modulePath).href);
const base = process.env.PIXIEED_BROWSER_BASE_URL || 'http://127.0.0.1:4182';
if (!['localhost', '127.0.0.1', '[::1]'].includes(new URL(base).hostname)) throw new Error('Local server required.');
const browser = await chromium.launch({ headless: true });
try {
  for (const [width, height] of [[320, 568], [390, 844], [844, 390], [1280, 800]]) {
    for (const mode of ['spot-difference', 'hidden-object']) {
      const context = await browser.newContext({ viewport: { width, height }, reducedMotion: 'reduce' });
      const page = await context.newPage(); const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.route('**/*', route => new URL(route.request().url()).origin === new URL(base).origin ? route.continue() : route.fulfill({ status: 200, json: [] }));
      await page.goto(`${base}/tools/`);
      const id = await page.evaluate(async mode => {
        const { createIndexedDbDraftAdapter, createLocalDraftStore } = await import('/js/creation/local-drafts.mjs');
        const { createDrawDocument } = await import('/js/creation/draw-core.mjs');
        const { detectDifferenceCandidates, confirmDifferenceCandidates } = await import('/js/creation/spot-difference-core.mjs');
        const { createHiddenObjectDraft, confirmHiddenObjectTargets } = await import('/js/creation/hidden-object-core.mjs');
        const store = createLocalDraftStore(createIndexedDbDraftAdapter());
        const sourceId = crypto.randomUUID(), id = crypto.randomUUID();
        const original = createDrawDocument(16); original.pixels.fill(0);
        const before = await store.save({ draftId: sourceId, kind: 'pixel_art', document: original });
        const ref = revision => ({ draftId: sourceId, assetId: revision.asset.assetId, revisionId: revision.revisionId, contentHash: revision.documentHash, hashScheme: revision.hashScheme });
        let draft;
        if (mode === 'spot-difference') {
          const changed = structuredClone(original); changed.pixels[4 * 16 + 4] = 2; changed.pixels[12 * 16 + 12] = 3;
          const after = await store.save({ draftId: sourceId, kind: 'pixel_art', document: changed });
          draft = confirmDifferenceCandidates({ schemaVersion: 1, gameId: id, ...detectDifferenceCandidates(original, changed), before: ref(before), after: ref(after), confirmed: false, publication: 'draft', published: false });
        } else {
          draft = confirmHiddenObjectTargets(createHiddenObjectDraft({ gameId: id, width: 16, height: 16, source: ref(before), targets: [{ id: 'a', name: '花', pixels: [4 * 16 + 4] }, { id: 'b', name: '星', pixels: [12 * 16 + 12] }] }));
        }
        await store.save({ draftId: id, kind: mode === 'spot-difference' ? 'spot_difference' : 'hidden_object', document: draft, source: { type: 'local_draft_copy', assetId: before.asset.assetId, revisionId: before.revisionId } });
        return id;
      }, mode);
      await page.goto(`${base}/play/${mode}/?${mode === 'spot-difference' ? 'localSpot' : 'localHidden'}=${id}`);
      await page.waitForFunction(() => document.querySelector('#pixfind-progress')?.textContent.includes('0 / 2'));
      const fit = await page.evaluate(() => {
        const image = document.querySelector('#pixfind-original').getBoundingClientRect(), area = document.querySelector('#pixfind-play-area').getBoundingClientRect();
        return { image: { x: image.x, y: image.y, width: image.width, height: image.height }, area: { x: area.x, y: area.y, width: area.width, height: area.height }, fits: image.x >= area.x - 1 && image.y >= area.y - 1 && image.right <= area.right + 1 && image.bottom <= area.bottom + 1 };
      });
      assert.equal(fit.fits, true, `${mode} ${width}x${height} initial image clipped: ${JSON.stringify(fit)}`);
      const at = async (x, y) => page.evaluate(({ x, y }) => {
        const image = document.querySelector('#pixfind-original'), r = image.getBoundingClientRect();
        return { x: r.left + x / image.naturalWidth * r.width, y: r.top + y / image.naturalHeight * r.height };
      }, { x, y });
      const first = await at(4.5, 4.5);
      await page.mouse.click(first.x, first.y);
      assert.match(await page.locator('#pixfind-progress').textContent(), /1 \/ 2/);
      assert.equal(await page.locator('#pixfind-game-status').getAttribute('data-visible'), 'true');
      await page.mouse.click(first.x, first.y);
      assert.match(await page.locator('#pixfind-progress').textContent(), /1 \/ 2/);
      assert.notEqual(await page.locator('#pixfind-game-status').getAttribute('data-feedback'), 'miss');
      const miss = await at(8.5, 1.5);
      await page.mouse.click(miss.x, miss.y);
      assert.equal(await page.locator('#pixfind-game-status').getAttribute('data-feedback'), 'miss');
      assert.equal(await page.locator('#pixfind-game-status').getAttribute('data-visible'), 'true');
      const second = await at(12.5, 12.5);
      await page.mouse.move(second.x, second.y); await page.mouse.down();
      await page.mouse.move(second.x - 12, second.y - 12, { steps: 4 }); await page.mouse.up();
      assert.match(await page.locator('#pixfind-progress').textContent(), /1 \/ 2/, 'drag must not answer');
      const rectangles = await page.evaluate(() => {
        const area = document.querySelector('#pixfind-play-area').getBoundingClientRect(), nav = document.querySelector('.app-tabs').getBoundingClientRect();
        const status = document.querySelector('#pixfind-game-status');
        return { overflowX: document.documentElement.scrollWidth > innerWidth, overflowY: document.documentElement.scrollHeight > innerHeight + 1, areaHeight: area.height, overlapsNav: area.bottom > nav.top + 1, statusVisible: getComputedStyle(status).height !== '0px', animation: getComputedStyle(document.querySelector('#pixfind-play-area'), '::after').animationName, rows: getComputedStyle(document.querySelector('#pixfind-game')).gridTemplateRows };
      });
      assert.equal(rectangles.overflowX, false); assert.equal(rectangles.overflowY, false);
      assert.equal(rectangles.overlapsNav, false); assert.ok(rectangles.areaHeight > 70, `${mode} ${width}x${height}: ${JSON.stringify(rectangles)}`);
      assert.equal(rectangles.animation, 'none'); assert.deepEqual(errors, []);
      await page.screenshot({ path: `/tmp/pixieed-${mode}-play-review-${width}.png` });
      console.log(JSON.stringify({ mode, width, height, correctRepeatMissDrag: 'PASS', reducedMotion: 'PASS', ...rectangles, errors: 0 }));
      await context.close();
    }
  }
} finally { await browser.close(); }
