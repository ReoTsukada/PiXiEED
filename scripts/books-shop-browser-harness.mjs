import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL, fileURLToPath } from 'node:url';

const base = process.env.PIXIEED_BROWSER_BASE_URL || 'http://127.0.0.1:4193';
assert.ok(['localhost', '127.0.0.1'].includes(new URL(base).hostname));
const { chromium } = await import(pathToFileURL(process.env.PIXIEED_PLAYWRIGHT_MODULE || '/Users/tsukadareine/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs').href);
const output = process.env.PIXIEED_SHOP_EVIDENCE_DIR || '/tmp/pixieed-shop-evidence';
await mkdir(output, { recursive: true });
const origin = new URL(base).origin;
const products = JSON.parse(await readFile(new URL('../assets/books/room-products.json', import.meta.url), 'utf8'));
const activeProducts = products.filter(p => p && p.enabled !== false && p.visible !== false && !p.sample);
const expectedCount = activeProducts.length;
const addedProducts = activeProducts.filter(p => ["B09GS15X9P", "B0B6Z7Y4GV", "B0G7T5VKRP", "B0CYPD1P9V", "B0BQ6GD3PY", "B0CD1PYFHH"].includes(p.asin));
const newBatch = activeProducts.filter(p => ["B0GHSKJYM7", "4839914664", "4591191109", "B09PB3DKVL", "B09MTLJKMY", "B08LQ4SBXD", "B0GQYVXZJD"].includes(p.asin));
const fourLinkBatch = activeProducts.filter(p => ["B08D2Z2N87", "B09BNVC2GB", "B0B49R5XQM", "B0CFQH8QR5"].includes(p.asin));
const commerce = JSON.parse(await readFile(new URL('../assets/books/room-commerce.json', import.meta.url), 'utf8'));
const browser = await chromium.launch({ headless: true });
const checks = [];
async function check(name, action) { await action(); checks.push(name); }
async function selectExtra(page, selector, value) {
  const details = page.locator('#catalog-more-filters');
  if (await details.getAttribute('open') === null) await details.locator('summary').click();
  await page.locator(selector).selectOption(value);
}
async function makePage(options = {}) {
  const context = await browser.newContext({ viewport: options.viewport || { width: 1280, height: 800 }, javaScriptEnabled: options.javaScriptEnabled !== false });
  const page = await context.newPage();
  const errors = [], external = [];
  await context.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => { if (new URL(request.url()).origin !== origin) external.push(request.url()); });
  await page.addInitScript(() => document.addEventListener('books:commerce-ready', () => { document.documentElement.dataset.booksCommerceReady = 'true'; }));
  if (options.records !== undefined) await page.route('**/assets/books/room-products.json', route => route.fulfill({ json: options.records }));
  else if (options.failManifest) await page.route('**/assets/books/room-products.json', route => route.abort());
  if (options.config !== undefined) await page.route('**/assets/books/room-commerce.json', route => route.fulfill({ json: options.config }));
  else if (options.failConfig) await page.route('**/assets/books/room-commerce.json', route => route.abort());
  return { context, page, errors, external };
}
async function ready(page, route = '/books/') {
  await page.goto(`${base}${route}`);
  await page.waitForFunction(() => document.documentElement.dataset.booksCommerceReady === 'true');
}
const visibleCards = page => page.locator('.product-card:not([hidden])');
const ids = async page => visibleCards(page).evaluateAll(cards => cards.map(card => card.id));
try {
  for (const viewport of [{ width: 1280, height: 800 }, { width: 390, height: 844 }, { width: 320, height: 568 }, { width: 844, height: 390 }]) {
    for (const route of ['/books/', '/books/room-preview.html']) {
      const { context, page, errors, external } = await makePage({ viewport });
      await ready(page, route);
      await check(`${route} ${viewport.width}: all static cards, no overflow, responsive columns`, async () => {
        assert.equal(await visibleCards(page).count(), expectedCount);
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
        const columns = await page.locator('[data-product-grid]').evaluate(el => getComputedStyle(el).gridTemplateColumns.split(' ').length);
        assert.equal(columns, viewport.width < 600 ? 1 : viewport.width < 760 ? 2 : viewport.width < 1160 ? 3 : 4);
        assert.equal(await page.locator('.product-card__placeholder').count(), expectedCount);
        assert.equal(await page.locator('.product-card__placeholder small').filter({ hasText: '商品画像未掲載' }).count(), expectedCount);
        assert.equal(await page.locator('.catalog-extra').isVisible(), false);
        assert.equal(await page.locator('.catalog-ad-slot').isVisible(), false);
        assert.equal(await page.locator('.catalog-extra').evaluate(el => el.getBoundingClientRect().height), 0);
        assert.equal(await page.locator('script[src*="adsbygoogle"], script[src*="display-ads"], ins.adsbygoogle').count(), 0);
      });
      await check(`${route} ${viewport.width}: compact category chips and collapsed secondary filters`, async () => {
        const extra = page.locator('#catalog-more-filters');
        assert.equal(await extra.getAttribute('open'), null);
        assert.equal(await page.locator('.catalog-filter-status').isVisible(), false);
        assert.equal(await page.locator('[data-extra-filter-summary]').textContent(), '指定なし');
        const chips = await page.locator('.catalog-chips').evaluate(el => ({
          wrap: getComputedStyle(el).flexWrap,
          scrollWidth: el.scrollWidth,
          clientWidth: el.clientWidth,
          heights: [...el.querySelectorAll('button')].map(button => button.getBoundingClientRect().height),
        }));
        assert.equal(chips.wrap, 'nowrap');
        assert.ok(chips.heights.every(height => height >= 44));
        if (viewport.width < 600) assert.ok(chips.scrollWidth > chips.clientWidth, 'mobile categories reveal horizontal continuation');
        else assert.ok(chips.scrollWidth <= chips.clientWidth, 'wide layout shows every category at once');
      });
      await check(`${route} ${viewport.width}: SEO and no product rich markup`, async () => {
        assert.equal(await page.locator('link[rel="canonical"]').getAttribute('href'), 'https://pixieed.jp/books/');
        const robotsMeta = page.locator('meta[name="robots"]');
        if (route.includes('preview')) assert.equal(await robotsMeta.getAttribute('content'), 'noindex,follow');
        else assert.equal(await robotsMeta.count(), 0, 'the public catalog is indexable');
        assert.ok(await page.locator('meta[name="description"]').getAttribute('content'));
        assert.equal(await page.locator('script[type="application/ld+json"]').count(), 0);
      });
      await check(`${route} ${viewport.width}: confirmed associate config enables exact purchase links, no automatic external request or JS error`, async () => {
        const links = page.locator('[data-commerce-link]:visible');
        assert.equal(await links.count(), expectedCount);
        assert.equal(await page.locator('.product-card__ad-label:visible, .product-card__sales:visible').count(), 0);
        assert.deepEqual(commerce, { associateName: 'PiXiEED', enrollmentConfirmed: true });
        assert.match(await page.locator('#associate-status').textContent(), /Amazon.*アソシエイトとして.*適格販売/);
        for (let i = 0; i < await links.count(); i++) {
          const link = links.nth(i);
          const productId = await link.evaluate(el => el.closest('[data-product-id]').id);
          assert.equal(await link.getAttribute('href'), activeProducts.find(product => product.id === productId).amazonUrl);
          assert.equal(await link.getAttribute('target'), '_blank');
          assert.deepEqual((await link.getAttribute('rel')).split(' ').sort(), ['noopener', 'noreferrer', 'sponsored']);
        }
        assert.equal(external.length, 0);
        assert.deepEqual(errors, []);
      });
      if (route === '/books/' && [390, 1280].includes(viewport.width)) {
        await page.screenshot({ path: `${output}/final-default-${viewport.width}x${viewport.height}.png` });
      }
      await page.screenshot({ path: `${output}/catalog-${route.includes('preview') ? 'preview-' : ''}${viewport.width}x${viewport.height}.png`, fullPage: true });
      await context.close();
    }
  }

  const noJs = await makePage({ javaScriptEnabled: false, viewport: { width: 390, height: 844 } });
  await noJs.page.goto(`${base}/books/`);
  await noJs.page.locator('.product-card').first().waitFor();
  await check('JavaScript off retains all readable cards and hides inert filters', async () => {
    assert.equal(await visibleCards(noJs.page).count(), expectedCount);
    assert.equal(await noJs.page.locator('#catalog-filters').isVisible(), false);
    assert.equal(await noJs.page.locator('[data-commerce-link]:visible').count(), 0);
    assert.equal(await noJs.page.locator('[data-commerce-pending]:visible').count(), 0);
    assert.equal(await noJs.page.locator('.catalog-extra').isVisible(), false);
  });
  await noJs.context.close();

  const search = await makePage({ viewport: { width: 390, height: 844 } });
  await ready(search.page);
  const page = search.page, input = page.getByRole('searchbox', { name: '商品名・説明・著者・出版社で検索' });
  await check('search includes title, description, author, format and persists URL', async () => {
    await input.fill('モトクロス'); await page.keyboard.press('Enter');
    assert.deepEqual(await ids(page), ['product-background', 'product-background-kindle']);
    assert.equal(new URL(page.url()).searchParams.get('q'), 'モトクロス');
    await input.fill('Kindle版');
    assert.deepEqual((await ids(page)).sort(), activeProducts.filter(p => p.format === 'Kindle版').map(p => p.id).sort());
    await input.fill('');
  });
  await check('six added titles, authors, AI label and same-work formats remain searchable', async () => {
    for (const product of addedProducts) {
      await input.fill(product.title);
      assert.ok((await ids(page)).includes(product.id), product.id);
    }
    await input.fill('AIイラスト集');
    assert.deepEqual(await ids(page), ['product-pixel-girl-magic']);
    await input.fill('ZAPOTECO');
    assert.deepEqual(await ids(page), ['product-dot-macrame']);
    await input.fill('JumKujira');
    assert.deepEqual(await ids(page), ['product-pixel-girl-magic']);
    await input.fill('ULTIMATE PIXEL CREW REPORT');
    assert.deepEqual(await ids(page), ['product-background', 'product-background-kindle']);
    await selectExtra(page, '#catalog-format', 'Kindle版');
    assert.deepEqual(await ids(page), ['product-background-kindle']);
    await selectExtra(page, '#catalog-format', '紙の本');
    assert.deepEqual(await ids(page), ['product-background']);
    await selectExtra(page, '#catalog-format', 'all');
    await input.fill('');
    await page.locator('[data-category-filter="books"]').click();
    assert.equal(await visibleCards(page).count(), activeProducts.filter(p => p.category === 'books').length);
    assert.ok(addedProducts.every(product => product.category === 'books'));
    const listed = await ids(page);
    for (const product of addedProducts) assert.ok(listed.includes(product.id));
    await page.locator('[data-category-filter="all"]').click();
  });
  await check('nine-link batch merges two existing cards and exposes seven searchable additions', async () => {
    assert.equal(newBatch.length, 7);
    for (const product of newBatch) {
      await input.fill(product.title);
      assert.ok((await ids(page)).includes(product.id), product.id);
    }
    await input.fill('きろくノート工房');
    assert.deepEqual(await ids(page), ['product-dot-notebook']);
    await input.fill('A4・全80ページ');
    assert.deepEqual(await ids(page), ['product-dot-notebook']);
    await input.fill('');
    await page.locator('[data-category-filter="gadgets"]').click();
    assert.deepEqual(await ids(page), activeProducts.filter(p => p.category === 'gadgets').map(p => p.id));
    await selectExtra(page, '#catalog-format', 'ホワイト');
    assert.deepEqual(await ids(page), ['product-divoom-ditoo-pro-white']);
    await selectExtra(page, '#catalog-format', 'ブラック');
    assert.deepEqual(await ids(page), activeProducts.filter(p => p.category === 'gadgets' && p.format === 'ブラック').map(p => p.id));
    await selectExtra(page, '#catalog-format', 'all');
    await page.locator('[data-category-filter="all"]').click();
    const allIds = await ids(page);
    assert.equal(new Set(allIds).size, expectedCount);
    assert.equal(allIds.filter(id => id === 'product-3d-dot').length, 1);
    assert.equal(allIds.filter(id => id === 'product-dot-notebook').length, 1);
    assert.equal(await page.getByText('商品名未確認', { exact: true }).count(), 0);
  });
  await check('four block links expose confirmed names, distinct brands and correct categories', async () => {
    assert.equal(fourLinkBatch.length, 4);
    for (const product of fourLinkBatch) {
      await input.fill(product.title);
      assert.deepEqual(await ids(page), [product.id]);
    }
    await input.fill('LEGO');
    assert.deepEqual(await ids(page), ['product-lego-white-baseplate-11026', 'product-wyswyg-building-blocks-1200', 'product-block-baseplates-eight']);
    await input.fill('WYSWYG');
    assert.deepEqual(await ids(page), ['product-wyswyg-building-blocks-1200']);
    await input.fill('');
    await page.locator('[data-category-filter="toys"]').click();
    assert.deepEqual(await ids(page), activeProducts.filter(p => p.category === 'toys').map(p => p.id));
    await page.locator('[data-category-filter="all"]').click();
  });
  await check('cat block set stays searchable under a generic name and unconfirmed variant note', async () => {
    await input.fill('猫のブロックセット');
    assert.deepEqual(await ids(page), ['product-cat-block-set']);
    assert.equal(await page.locator('#product-cat-block-set h3').textContent(), '猫のブロックセット');
    assert.match(await page.locator('#product-cat-block-set .product-card__metadata-note').textContent(), /選択種類・猫種/);
    await input.fill('');
  });
  await check('category updates available formats and keyboard-operable filters', async () => {
    const toys = page.locator('[data-category-filter="toys"]');
    await toys.focus(); await page.keyboard.press('Enter');
    assert.equal(await toys.getAttribute('aria-pressed'), 'true');
    assert.deepEqual(await ids(page), activeProducts.filter(p => p.category === 'toys').map(p => p.id));
    const formats = await page.locator('#catalog-format option').allTextContents();
    assert.ok(formats.includes('くもん出版 RD-10'));
    const all = page.locator('[data-category-filter="all"]');
    await all.focus(); await page.keyboard.press('Space');
    assert.equal(await visibleCards(page).count(), expectedCount);
  });
  await check('format filter and listed/name sorting work', async () => {
    await selectExtra(page, '#catalog-format', '紙の本');
    assert.deepEqual((await ids(page)).sort(), activeProducts.filter(p => p.format === '紙の本').map(p => p.id).sort());
    await selectExtra(page, '#catalog-format', 'all');
    const listed = await ids(page);
    await selectExtra(page, '#catalog-sort', 'name');
    const titles = await visibleCards(page).evaluateAll(cards => cards.map(card => card.dataset.title));
    assert.deepEqual(titles, [...titles].sort((a, b) => a.localeCompare(b, 'ja')));
    await selectExtra(page, '#catalog-sort', 'listed');
    assert.deepEqual(await ids(page), listed);
  });
  await check('zero results expose a reset that restores the catalog', async () => {
    await input.fill('no-such-product');
    assert.equal(await visibleCards(page).count(), 0);
    assert.equal(await page.locator('[data-product-count]').textContent(), '0件');
    await page.locator('[data-reset-filters]:visible').first().click();
    assert.equal(await visibleCards(page).count(), expectedCount);
    assert.equal(await page.evaluate(() => document.activeElement.id), 'catalog-query');
  });
  await search.context.close();

  for (const route of ['/books/', '/books/room-preview.html']) {
    const linked = await makePage({ viewport: { width: 390, height: 844 } });
    const p = linked.page;
    await ready(p, `${route}?category=books&format=${encodeURIComponent('Kindle版')}&q=ULTIMATE%20REPORT&sort=name&ref=local-check`);
    await check(`${route} query deep link, multiword search, reload and detail history retain conditions`, async () => {
      assert.deepEqual(await ids(p), ['product-background-kindle']);
      assert.equal(await p.locator('#catalog-query').inputValue(), 'ULTIMATE REPORT');
      assert.equal(await p.locator('#catalog-format').inputValue(), 'Kindle版');
      assert.notEqual(await p.locator('#catalog-more-filters').getAttribute('open'), null);
      assert.match(await p.locator('[data-extra-filter-summary]').textContent(), /Kindle版.*名前順/);
      await p.reload();
      await p.waitForFunction(() => document.documentElement.dataset.booksCommerceReady === 'true');
      assert.deepEqual(await ids(p), ['product-background-kindle']);
      await p.locator('#product-background-kindle [data-product-details]').click();
      await p.locator('#product-detail').waitFor({ state: 'visible' });
      await p.reload();
      await p.locator('#product-detail').waitFor({ state: 'visible' });
      await p.locator('[data-detail-close]').click();
      await p.locator('#product-detail').waitFor({ state: 'hidden' });
      assert.deepEqual(await ids(p), ['product-background-kindle']);
      assert.equal(new URL(p.url()).hash, '');
      assert.equal(new URL(p.url()).searchParams.get('ref'), 'local-check');
      await p.locator('[data-clear-search]').click();
      assert.equal(await p.locator('#catalog-format').inputValue(), 'Kindle版');
      assert.equal(new URL(p.url()).searchParams.has('q'), false);
      await p.locator('[data-reset-filters]:visible').first().click();
      assert.equal(await visibleCards(p).count(), expectedCount);
      assert.equal(new URL(p.url()).search, '?ref=local-check');
      assert.deepEqual(linked.errors, []);
    });
    await check(`${route} grouped listed order, adjacent editions and small empty-photo bands`, async () => {
      const ordered = await ids(p);
      assert.equal(ordered.indexOf('product-background-kindle'), ordered.indexOf('product-background') + 1);
      const categories = await visibleCards(p).evaluateAll(cards => cards.map(card => card.dataset.category));
      assert.deepEqual(categories, [...categories].sort((a, b) => ['books', 'toys', 'tools', 'gadgets'].indexOf(a) - ['books', 'toys', 'tools', 'gadgets'].indexOf(b)));
      assert.ok(await p.locator('.product-grid .product-card__image').evaluateAll(elements => elements.every(el => el.getBoundingClientRect().height <= 50)));
      assert.equal(await p.locator('.product-grid .product-card__commerce-pending:visible').count(), 0);
      assert.equal(await p.locator('.product-grid h3').count(), 25);
      await p.getByRole('searchbox').fill('ポプラ社 世界');
      assert.deepEqual(await ids(p), ['product-dot-sticker-masterpieces']);
    });
    await linked.context.close();
    const invalid = await makePage();
    await ready(invalid.page, `${route}?category=unknown&format=absent&sort=invalid#product=not-a-product`);
    await check(`${route} invalid conditions and product ID safely retain readable catalog`, async () => {
      assert.equal(await visibleCards(invalid.page).count(), expectedCount);
      assert.equal(await invalid.page.locator('#product-detail').isVisible(), false);
      assert.equal(await invalid.page.locator('#catalog-sort').inputValue(), 'listed');
      assert.deepEqual(invalid.errors, []);
    });
    await invalid.context.close();
  }

  for (const config of [{ associateName: 'PiXiEED', enrollmentConfirmed: false }, { associateName: '', enrollmentConfirmed: true }]) {
    const pending = await makePage({ config });
    await ready(pending.page);
    await check(`unconfirmed config ${JSON.stringify(config)} keeps card and detail CTA disabled`, async () => {
      assert.equal(await pending.page.locator('[data-commerce-link]:visible').count(), 0);
      assert.equal(await pending.page.locator('.product-card__ad-label:visible, .product-card__sales:visible').count(), 0);
      await pending.page.locator('[data-product-details]').first().click();
      await pending.page.locator('#product-detail').waitFor({ state: 'visible' });
      assert.equal(await pending.page.locator('#product-detail [data-commerce-link]:visible').count(), 0);
      assert.equal(await pending.page.locator('.product-detail__gate').isVisible(), true);
      assert.equal(await pending.page.locator('.product-detail__notice').isVisible(), false);
      assert.deepEqual(pending.external, []);
      assert.deepEqual(pending.errors, []);
    });
    await pending.context.close();
  }

  const confirmed = await makePage({ config: { associateName: '検証用名称', enrollmentConfirmed: true } });
  await ready(confirmed.page);
  await check('confirmed commerce exposes all exact safe URLs and opens only on explicit click', async () => {
    const links = confirmed.page.locator('[data-commerce-link]:visible');
    assert.equal(await links.count(), expectedCount);
    assert.equal(await confirmed.page.locator('.product-card__ad-label:visible, .product-card__sales:visible').count(), 0);
    assert.match(await confirmed.page.locator('#associate-status').textContent(), /Amazon.*アソシエイトとして.*適格販売/);
    for (let i = 0; i < await links.count(); i++) {
      const link = links.nth(i);
      assert.equal(await link.getAttribute('target'), '_blank');
      assert.deepEqual((await link.getAttribute('rel')).split(' ').sort(), ['noopener', 'noreferrer', 'sponsored']);
      const id = await link.evaluate(el => el.closest('[data-product-id]').id);
      const product = products.find(item => item.id === id);
      assert.equal(await link.getAttribute('href'), product.amazonUrl);
    }
    assert.equal(confirmed.external.length, 0);
    await confirmed.context.route('https://www.amazon.co.jp/**', route => route.fulfill({ status: 200, contentType: 'text/plain', body: 'explicit mock navigation' }));
    const productInput = confirmed.page.locator('#catalog-query');
    await productInput.fill('モトクロス');
    await confirmed.page.locator('#product-background').scrollIntoViewIfNeeded();
    const listUrl = confirmed.page.url(), scrollY = await confirmed.page.evaluate(() => window.scrollY);
    const queryValue = await productInput.inputValue();
    const popupPromise = confirmed.page.waitForEvent('popup');
    await confirmed.page.locator('#product-background [data-commerce-link]').click();
    const popup = await popupPromise;
    await popup.waitForLoadState('domcontentloaded');
    assert.equal(popup.url(), products.find(item => item.id === 'product-background').amazonUrl);
    assert.equal(await popup.locator('body').innerText(), 'explicit mock navigation');
    assert.equal(confirmed.page.url(), listUrl);
    assert.equal(await confirmed.page.evaluate(() => window.scrollY), scrollY);
    assert.equal(await productInput.inputValue(), queryValue);
    await popup.close();
  });
  await check('confirmed detail keeps validated external CTA, new-tab notice and explicit mock navigation', async () => {
    await confirmed.page.locator('#product-background [data-product-details]').click();
    const dialog = confirmed.page.locator('#product-detail');
    await dialog.waitFor({ state: 'visible' });
    assert.equal(await dialog.locator('.product-detail__gate').isVisible(), false);
    const link = dialog.locator('[data-commerce-link]');
    assert.equal(await link.getAttribute('href'), products.find(item => item.id === 'product-background').amazonUrl);
    assert.match(await link.textContent(), /外部サイト・新しいタブ/);
    const popupPromise = confirmed.page.waitForEvent('popup');
    await link.click();
    const popup = await popupPromise;
    await popup.waitForLoadState('domcontentloaded');
    assert.equal(await popup.locator('body').innerText(), 'explicit mock navigation');
    await popup.close();
    assert.equal(await dialog.isVisible(), true);
    await dialog.locator('[data-detail-close]').click();
    await dialog.waitFor({ state: 'hidden' });
  });
  await confirmed.context.close();

  for (const fixture of [
    { name: 'pending identification', mutate: data => { data.find(p => p.id === 'product-pochipochi').enabled = false; data.find(p => p.id === 'product-pochipochi').status = 'pending-identification'; }, hidden: 'product-pochipochi' },
    { name: 'disabled record', mutate: data => { data.find(p => p.id === 'product-pochipochi').enabled = false; }, hidden: 'product-pochipochi' },
    { name: 'missing record', mutate: data => data.filter(p => p.id !== 'product-pochipochi'), hidden: 'product-pochipochi' },
    { name: 'sample record', mutate: data => { data.find(p => p.id === 'product-pochipochi').sample = true; }, hidden: 'product-pochipochi' },
  ]) {
    const initial = structuredClone(products);
    const records = fixture.mutate(initial) || initial;
    const tested = await makePage({ records, config: { associateName: '確認済み', enrollmentConfirmed: true } });
    await ready(tested.page);
    await check(`${fixture.name} is removed and cannot return through search/reset`, async () => {
      assert.equal(await visibleCards(tested.page).count(), expectedCount - 1);
      assert.equal(await tested.page.locator(`#${fixture.hidden}`).isVisible(), false);
      const query = tested.page.locator('#catalog-query');
      await query.fill('ぽちぽち');
      assert.equal(await visibleCards(tested.page).count(), 0);
      await tested.page.locator('[data-reset-filters]:visible').first().click();
      assert.equal(await visibleCards(tested.page).count(), expectedCount - 1);
    });
    await tested.context.close();
  }

  for (const [name, mutate] of [
    ['invalid URL', p => { p.amazonUrl = 'javascript:alert(1)'; }],
    ['ASIN mismatch', p => { p.amazonUrl = 'https://www.amazon.co.jp/dp/B0BZGSNDDY?tag=pixieed-22&linkCode=ll2'; }],
  ]) {
    const records = structuredClone(products); mutate(records.find(p => p.id === 'product-dot-classroom'));
    const tested = await makePage({ records, config: { associateName: '確認済み', enrollmentConfirmed: true } });
    await ready(tested.page);
    await check(`${name} keeps information readable but blocks its CTA`, async () => {
      assert.equal(await visibleCards(tested.page).count(), expectedCount);
      assert.equal(await tested.page.locator('#product-dot-classroom [data-commerce-link]:visible').count(), 0);
      assert.equal(await tested.page.locator('#product-dot-classroom [data-commerce-pending]').getAttribute('hidden'), '');
      assert.equal(await tested.page.locator('[data-commerce-link]:visible').count(), expectedCount - 1);
    });
    await tested.context.close();
  }

  for (const failure of [{ name: 'manifest fetch failure', failManifest: true }, { name: 'commerce config failure', failConfig: true }]) {
    const tested = await makePage(failure); await ready(tested.page);
    await check(`${failure.name} retains static listings and blocks every CTA`, async () => {
      assert.equal(await visibleCards(tested.page).count(), expectedCount);
      assert.equal(await tested.page.locator('[data-commerce-link]:visible').count(), 0);
      assert.equal(await tested.page.locator('[data-commerce-pending]:not([hidden])').count(), 0);
      assert.match(await tested.page.locator('#associate-status').textContent(), /確認できない/);
    });
    await tested.context.close();
  }
  for (const width of [599, 600, 759, 760, 1159, 1160]) {
    const tested = await makePage({ viewport: { width, height: 900 } });
    await ready(tested.page);
    await check(`boundary ${width}: columns, readable titles and no horizontal overflow`, async () => {
      const columns = await tested.page.locator('[data-product-grid]').evaluate(el => getComputedStyle(el).gridTemplateColumns.split(' ').length);
      assert.equal(columns, width < 600 ? 1 : width < 760 ? 2 : width < 1160 ? 3 : 4);
      assert.ok(await tested.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      assert.ok(await tested.page.locator('#product-dot-notebook h3').evaluate(el => el.scrollHeight <= el.clientHeight + 1));
    });
    await tested.context.close();
  }
  for (const width of [320, 390, 1280]) {
    const tested = await makePage({ viewport: { width, height: width === 320 ? 568 : width === 390 ? 844 : 1000 } });
    await ready(tested.page);
    const p = tested.page, dialog = p.locator('#product-detail');
    await check(`detail ${width}: Back/Forward, Escape, focus and scroll restore with filter state intact`, async () => {
      await p.getByRole('searchbox').fill('ドット絵');
      await selectExtra(p, '#catalog-sort', 'name');
      const beforeIds = await ids(p);
      const trigger = p.locator('#product-dot-notebook [data-product-details]');
      await trigger.scrollIntoViewIfNeeded();
      await trigger.focus();
      const position = await p.evaluate(() => scrollY);
      await p.keyboard.press('Enter');
      await dialog.waitFor({ state: 'visible' });
      assert.ok(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth));
      assert.match(p.url(), /#product=product-dot-notebook$/);
      assert.equal(await dialog.getAttribute('aria-labelledby'), 'product-detail-title');
      assert.equal(await dialog.locator('#product-detail-title').textContent(), activeProducts.find(x => x.id === 'product-dot-notebook').title);
      assert.equal(await dialog.locator('[data-commerce-link]:visible').count(), 1);
      assert.equal(await dialog.locator('.product-detail__gate').isVisible(), false);
      assert.equal(await dialog.locator('.product-detail__notice').isVisible(), true);
      for (let i = 0; i < 12; i++) {
        await p.keyboard.press('Tab');
        assert.ok(await p.evaluate(() => document.querySelector('#product-detail').contains(document.activeElement)));
      }
      await p.goBack(); await dialog.waitFor({ state: 'hidden' });
      assert.equal(await p.getByRole('searchbox').inputValue(), 'ドット絵');
      assert.equal(await p.locator('#catalog-sort').inputValue(), 'name');
      assert.deepEqual(await ids(p), beforeIds);
      assert.equal(await trigger.evaluate(el => el === document.activeElement), true);
      await p.waitForFunction(y => Math.abs(scrollY - y) < 3, position);
      await p.goForward(); await dialog.waitFor({ state: 'visible' });
      await p.screenshot({ path: `${output}/final-detail-${width}.png` });
      await p.keyboard.press('Escape'); await dialog.waitFor({ state: 'hidden' });
      await p.waitForFunction(y => Math.abs(scrollY - y) < 3, position);
      assert.equal(await trigger.evaluate(el => el === document.activeElement), true);
    });
    await check(`detail ${width}: repeated close/open and search clear preserve category and format`, async () => {
      await p.locator('[data-clear-search]').click();
      assert.equal(await p.getByRole('searchbox').inputValue(), '');
      assert.equal(await p.getByRole('searchbox').evaluate(el => el === document.activeElement), true);
      await p.locator('[data-category-filter="gadgets"]').click();
      await selectExtra(p, '#catalog-format', 'ブラック');
      await p.getByRole('searchbox').fill('absent-query');
      assert.equal(await visibleCards(p).count(), 0);
      await p.locator('[data-clear-search]').click();
      assert.equal(await p.locator('#catalog-format').inputValue(), 'ブラック');
      assert.equal(await p.locator('[data-category-filter="gadgets"]').getAttribute('aria-pressed'), 'true');
      assert.equal(await visibleCards(p).count(), 2);
      for (let i = 0; i < 3; i++) {
        await visibleCards(p).first().locator('[data-product-details]').click();
        await dialog.waitFor({ state: 'visible' });
        await dialog.locator('[data-detail-close]').click();
        await dialog.waitFor({ state: 'hidden' });
      }
      await p.locator('[data-category-filter="all"]').click();
      await selectExtra(p, '#catalog-format', 'all');
      await selectExtra(p, '#catalog-sort', 'listed');
      assert.equal(await visibleCards(p).count(), 25);
      assert.deepEqual(tested.errors, []);
      assert.deepEqual(tested.external, []);
    });
    if (width === 1280) await check('all 25 actual products open complete detail content and return to the shelf', async () => {
      for (const product of activeProducts) {
        await p.locator(`#${product.id} [data-product-details]`).click();
        await dialog.waitFor({ state: 'visible' });
        assert.equal(await dialog.locator('h2').textContent(), product.title);
        assert.equal(await dialog.locator('[data-product-details]').count(), 0);
        await dialog.locator('[data-detail-close]').click();
        await dialog.waitFor({ state: 'hidden' });
      }
    });
    await p.evaluate(w => scrollTo(0, w === 390 ? document.querySelector('#catalog-title').getBoundingClientRect().top + scrollY - 20 : 0), width);
    await p.screenshot({ path: `${output}/final-catalog-${width}.png` });
    await tested.context.close();
  }
  for (const route of ['/books/', '/books/room-preview.html']) {
    const direct = await makePage();
    await ready(direct.page, `${route}#product=product-cat-block-set`);
    await check(`${route} direct detail: close removes hash without leaving page; reduced motion`, async () => {
      await direct.page.locator('#product-detail').waitFor({ state: 'visible' });
      await direct.page.emulateMedia({ reducedMotion: 'reduce' });
      assert.equal(await direct.page.locator('.product-card').first().evaluate(el => getComputedStyle(el).transitionDuration), '0s');
      await direct.page.locator('[data-detail-close]').click();
      await direct.page.locator('#product-detail').waitFor({ state: 'hidden' });
      assert.equal(new URL(direct.page.url()).hash, '');
      assert.equal(new URL(direct.page.url()).pathname, route);
      assert.equal(await visibleCards(direct.page).count(), expectedCount);
    });
    await direct.context.close();
  }
  const report = { passed: checks.length, checks, screenshots: output, browser: 'local Chromium; no physical-device test', production: 'UNTESTED' };
  await writeFile(`${output}/results.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} finally { await browser.close(); }
