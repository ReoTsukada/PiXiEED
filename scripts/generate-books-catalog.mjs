import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { normalizeProduct, validAmazonUrl } from '../js/books-room-catalog.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifestPath = path.join(root, 'assets/books/room-products.json');
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
if (!Array.isArray(manifest)) throw new Error('Books catalog must be an array');
const isLocalImagePath = value => typeof value === 'string'
  && value.startsWith('/assets/books/')
  && !value.includes('\\')
  && value.split('/').slice(1).every(segment => segment && segment !== '.' && segment !== '..')
  && value.split('/').slice(3).every(segment => /^[A-Za-z0-9._-]+$/.test(segment))
  && /\.(?:png|jpe?g|webp)$/i.test(value);
const products = manifest.filter(p => p && p.enabled !== false && p.visible !== false && p.sample !== true);
const associateDisclosure = 'Amazon のアソシエイトとして、PiXiEED は適格販売により収入を得ています。価格・販売条件は販売先のAmazonでご確認ください。';
const categoryOrder = ['books', 'toys', 'tools', 'gadgets'];
const categoryCounts = Object.fromEntries(categoryOrder.map(category => [category, products.filter(product => (product.category || 'books') === category).length]));
const listedProducts = [];
for (const category of categoryOrder) {
  const groups = new Map();
  products.forEach((product, index) => {
    if ((product.category || 'books') !== category) return;
    const key = product.workId || product.id;
    if (!groups.has(key)) groups.set(key, { index, products: [] });
    groups.get(key).products.push({ index, product });
  });
  [...groups.values()].sort((a, b) => a.index - b.index).forEach(group => {
    group.products.sort((a, b) => a.index - b.index).forEach(item => listedProducts.push(item.product));
  });
}
const ids = new Set();
for (const product of products) {
  if (!normalizeProduct(product) || ids.has(product.id) || !validAmazonUrl(product.amazonUrl, product.asin)) {
    throw new Error(`Invalid or duplicate catalog product: ${product?.id || '(missing id)'}`);
  }
  ids.add(product.id);
  if (product.sourceUrl) {
    let source;
    try { source = new URL(product.sourceUrl); } catch { throw new Error(`Invalid source URL: ${product.id}`); }
    if (source.protocol !== 'https:' || source.username || source.password || source.port || !product.sourceLabel) throw new Error(`Invalid source URL/label: ${product.id}`);
  }
  if (product.image && (!isLocalImagePath(product.image.src) || !product.image.alt || !product.image.creator || !product.image.rights || !product.image.source)) {
    throw new Error(`Product image requires a local image, alt text, creator, rights, and source: ${product.id}`);
  }
  if (product.image && (!Number.isSafeInteger(product.image.width) || product.image.width < 1 || !Number.isSafeInteger(product.image.height) || product.image.height < 1)) throw new Error(`Product image dimensions must be positive integers: ${product.id}`);
  if (product.shopThumbnail && (!isLocalImagePath(product.shopThumbnail.src)
      || ![32, 96].includes(product.shopThumbnail.width)
      || product.shopThumbnail.height !== product.shopThumbnail.width)) {
    throw new Error(`Shop thumbnail must be a local 32x32 or 96x96 image: ${product.id}`);
  }
}

const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const categoryLabel = { books: '本', toys: 'おもちゃ', tools: '制作道具', gadgets: 'ガジェット' };
function card(p) {
  const author = p.author ? `<p class="product-card__byline">${esc(p.author)}${p.publisher ? ` · ${esc(p.publisher)}` : ''}</p>` : (p.publisher ? `<p class="product-card__byline">${esc(p.publisher)}</p>` : '');
  const authorMarkup = author ? `${author}\n            ` : '';
  const metadataMarkup = p.metadataNote ? `<p class="product-card__byline product-card__metadata-note">${esc(p.metadataNote)}</p>\n            ` : '';
  const source = p.sourceUrl && p.sourceLabel ? `<a class="product-card__source" href="${esc(p.sourceUrl)}" target="_blank" rel="noopener noreferrer">${esc(p.sourceLabel)} <span aria-hidden="true">↗</span><span class="sr-only">（新しいタブ）</span></a>` : '<span class="product-card__source product-card__source--missing">出典情報未登録</span>';
  const image = p.image
    ? `<div class="product-card__image"><img src="${esc(p.image.src)}" alt="${esc(p.image.alt || p.title)}" width="${Number(p.image.width) || 640}" height="${Number(p.image.height) || 480}" loading="lazy"></div>`
    : p.shopThumbnail
      ? `<div class="product-card__image product-card__thumbnail" data-size="${p.shopThumbnail.width}"><img src="${esc(p.shopThumbnail.src)}" alt="" width="${p.shopThumbnail.width}" height="${p.shopThumbnail.height}" loading="lazy"></div>`
      : '';
  return `        <article class="product-card" id="${esc(p.id)}" data-product-id="${esc(p.id)}" data-books-product-id="${esc(p.id)}" data-asin="${esc(p.asin)}" data-category="${esc(p.category || 'books')}" data-format="${esc(p.format || '')}" data-title="${esc(p.title)}" data-description="${esc(p.description || '')}" data-author="${esc(p.author || '')}" data-publisher="${esc(p.publisher || '')}" data-source-label="${esc(p.sourceLabel || '')}" data-source-url="${esc(p.sourceUrl || '')}" data-image-src="${esc(p.image?.src || p.shopThumbnail?.src || '')}" data-work-id="${esc(p.workId || '')}" data-metadata-note="${esc(p.metadataNote || '')}">
          ${image}
          <div class="product-card__body">
            <div class="product-card__meta"><span>${esc(categoryLabel[p.category] || '本')}</span><span>${esc(p.format || '形式未登録')}</span></div>
            <h3>${esc(p.title)}</h3>
            <p class="product-card__description">${esc(p.description || '')}</p>
            ${authorMarkup}${metadataMarkup}
            <div class="product-card__actions"><button type="button" class="product-card__details" data-product-details="${esc(p.id)}" aria-haspopup="dialog" aria-controls="product-detail" aria-label="${esc(p.title)}の詳細を見る" hidden>詳細を見る <span aria-hidden="true">→</span></button>${source}<a class="product-card__amazon" data-commerce-link hidden href="#" target="_blank" rel="sponsored noopener noreferrer">Amazonで価格を確認 <span aria-hidden="true">↗</span><span class="sr-only">（外部サイト・新しいタブ）</span></a><p class="product-card__commerce-pending" data-commerce-pending hidden>商品リンクは準備中</p></div>
          </div>
        </article>`;
}

function render(route) {
  const preview = route === 'preview';
  const robots = preview ? '<meta name="robots" content="noindex,follow">' : '';
  const intro = `<!doctype html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  ${robots}
  <meta name="description" content="ドット絵の本、おもちゃ、制作道具、ガジェットを見つけるPiXiEEDのカタログ。商品画像は未掲載で、出典と販売先を分けて案内します。">
  <link rel="canonical" href="https://pixieed.jp/books/">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="PiXiEED">
  <meta property="og:locale" content="ja_JP">
  <meta property="og:title" content="ドット絵の本と道具｜PiXiEED">
  <meta property="og:description" content="ドット絵の本、おもちゃ、制作道具、ガジェットを見つけるPiXiEEDのカタログ。商品画像は未掲載で、出典と販売先を分けて案内します。">
  <meta property="og:url" content="https://pixieed.jp/books/">
  <meta property="og:image" content="https://pixieed.jp/assets/og/site.png">
  <meta property="og:image:type" content="image/png">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:image:alt" content="PiXiEEDのロゴと「つくる・あそぶ・つながる」">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="ドット絵の本と道具｜PiXiEED">
  <meta name="twitter:description" content="ドット絵の本、おもちゃ、制作道具、ガジェットを見つけるPiXiEEDのカタログ。商品画像は未掲載で、出典と販売先を分けて案内します。">
  <meta name="twitter:image" content="https://pixieed.jp/assets/og/site.png">
  <meta name="twitter:image:alt" content="PiXiEEDのロゴと「つくる・あそぶ・つながる」">
  <link rel="icon" href="/favicon-96.png" sizes="96x96" type="image/png">
  <link rel="icon" href="/favicon.ico" sizes="any">
  <link rel="apple-touch-icon" href="/apple-touch-icon.png" sizes="180x180">
  <link rel="manifest" href="/manifest.webmanifest">
  <link rel="stylesheet" href="/css/site.css?rev=20261012-nav-polish-1">
  <link rel="stylesheet" href="/css/pixieed-design-system.css?rev=20261012-nav-polish-1">
  <link rel="stylesheet" href="/css/books.css?rev=20261015-visual-polish-1">
  <link rel="stylesheet" href="/css/site-draw-cta.css?rev=20261014-route-cta-1">
  <title>ドット絵の本と道具｜PiXiEED</title>
<link rel="stylesheet" href="/css/site-header.css?rev=20261012-nav-polish-1">
</head>
<body class="books-page">
  <a class="skip-link" href="#catalog">商品一覧へ</a>
  <header class="catalog-header"><div class="catalog-header__inner"><a href="/" class="catalog-brand" aria-label="PiXiEED ホーム"><span aria-hidden="true">P</span> PiXiEED</a><p>PIXEL PLAY · CATALOG</p></div></header>
  <main id="catalog">
    <section class="catalog-intro" aria-labelledby="page-title"><div class="catalog-wrap catalog-intro__inner">
      <h1 id="page-title">ドット絵の本と道具</h1>
      <p class="catalog-disclosure"><span>広告</span> Amazonアソシエイトリンクを含みます</p>
    </div></section>
    <section class="catalog-section catalog-wrap" aria-labelledby="page-title">
      <noscript><p class="catalog-noscript">商品一覧と商品情報は以下でご覧いただけます。絞り込み操作にはJavaScriptが必要です。</p></noscript>
      <form class="catalog-filters" id="catalog-filters" role="search" hidden>
        <label class="catalog-search-label sr-only" for="catalog-query">商品名・説明・著者・出版社で検索</label>
        <div class="catalog-search"><input id="catalog-query" name="q" type="search" autocomplete="off" placeholder="本・道具を検索" aria-label="商品名・説明・著者・出版社で検索"><button type="button" data-clear-search aria-label="検索文字をクリア">クリア</button></div>
        <details class="catalog-more-filters" id="catalog-more-filters">
          <summary aria-label="カテゴリ・種別・並び替えを選ぶ"><span>絞り込み</span><span class="catalog-more-filters__selection" data-extra-filter-summary>指定なし</span></summary>
          <div class="catalog-more-filters__panel">
          <fieldset class="catalog-category-filter"><legend>カテゴリ</legend><div class="catalog-chips" role="group" aria-label="カテゴリ">
            <button type="button" data-category-filter="all" data-category-label="すべて" aria-label="すべて ${products.length}件" aria-pressed="true"><span>すべて</span><span class="catalog-chip-count" data-category-count>${products.length}</span></button><button type="button" data-category-filter="books" data-category-label="本" aria-label="本 ${categoryCounts.books}件" aria-pressed="false"><span>本</span><span class="catalog-chip-count" data-category-count>${categoryCounts.books}</span></button><button type="button" data-category-filter="toys" data-category-label="おもちゃ" aria-label="おもちゃ ${categoryCounts.toys}件" aria-pressed="false"><span>おもちゃ</span><span class="catalog-chip-count" data-category-count>${categoryCounts.toys}</span></button><button type="button" data-category-filter="tools" data-category-label="制作道具" aria-label="制作道具 ${categoryCounts.tools}件" aria-pressed="false"><span>制作道具</span><span class="catalog-chip-count" data-category-count>${categoryCounts.tools}</span></button><button type="button" data-category-filter="gadgets" data-category-label="ガジェット" aria-label="ガジェット ${categoryCounts.gadgets}件" aria-pressed="false"><span>ガジェット</span><span class="catalog-chip-count" data-category-count>${categoryCounts.gadgets}</span></button>
          </div></fieldset>
          <div class="catalog-filter-row">
            <label for="catalog-format">種別・仕様<select id="catalog-format" name="format"><option value="all">すべて</option></select></label>
            <label for="catalog-sort">並び順<select id="catalog-sort" name="sort"><option value="listed">掲載順</option><option value="name">名前順</option></select></label>
          </div>
          </div>
        </details>
        <p class="catalog-count" data-product-count aria-live="polite">${products.length}件</p>
        <div class="catalog-filter-status" hidden><p data-filter-summary aria-live="polite"></p><button type="button" data-reset-filters hidden>条件を解除</button></div>
      </form>
      <div class="product-grid" data-product-grid>
${listedProducts.map(card).join('\n')}
      </div>
      <div class="catalog-empty" data-empty-state hidden><p>条件に合う商品はありません。</p></div>
      <aside class="books-editor-invite" aria-label="ドット絵をつくる"><a href="/draw/" data-draw-cta data-draw-context="books">本で見つけたドット絵を、エディターで試してみる →</a></aside>
    </section>
    <section class="catalog-extra catalog-wrap" aria-labelledby="catalog-extra-title" hidden><div class="catalog-extra__copy"><p class="catalog-eyebrow">COMING LATER</p><h2 id="catalog-extra-title">PiXiEEDのグッズ</h2><p>準備ができたら、PiXiEEDのオリジナルグッズをこちらで紹介します。</p></div><div class="catalog-ad-slot" aria-label="広告掲載予定"><span>広告掲載予定</span></div></section>
  </main>
  <footer class="catalog-footer"><div class="catalog-wrap"><p class="catalog-footer__notice" id="associate-status" aria-live="polite">${associateDisclosure}</p><p class="catalog-image-note">商品画像は使用許諾未確認のため未掲載です。確認待ち情報は各商品の詳細をご覧ください。</p><p>© PiXiEED</p><a href="/about/">PiXiEEDについて</a><a href="/guide/">利用ガイド</a><a href="/privacy/">プライバシー</a></div></footer>
  <dialog class="product-detail" id="product-detail" aria-labelledby="product-detail-title">
    <div class="product-detail__header"><span>商品詳細</span><button type="button" data-detail-close aria-label="詳細を閉じて一覧に戻る">一覧に戻る <span aria-hidden="true">×</span></button></div>
    <div class="product-detail__content" data-detail-body></div>
    <p class="product-detail__notice">購入手続きは外部販売先のAmazonで行います。販売先のリンクは新しいタブで開きます。</p>
    <p class="product-detail__gate">商品リンクを確認できないため、購入リンクは利用できません。</p>
  </dialog>
  <script type="module" src="/js/books-catalog.mjs?rev=20261015-shop-compact-1"></script>
  <script type="module" src="/js/books-commerce.mjs?rev=20261015-shop-thumbnails-1"></script>
<script type="module" src="/js/site-header.mjs?rev=20261016-tool-shell-1"></script>
</body>
</html>
`;
  return intro.replace(/[ \t]+$/gm, '');
}

await writeFile(path.join(root, 'books/index.html'), render('catalog'));
await writeFile(path.join(root, 'books/room-preview.html'), render('preview'));
