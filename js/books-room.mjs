import { normalizeProduct, validAmazonUrl } from './books-room-catalog.mjs';

(() => {
  const canvas = document.querySelector('#room-canvas');
  const stage = document.querySelector('#room-stage');
  const select = document.querySelector('#room-product-select');
  const openProductButton = document.querySelector('#room-product-open');
  const helpButton = document.querySelector('#room-help');
  const helpDialog = document.querySelector('#room-help-dialog');
  const helpClose = document.querySelector('#room-help-close');
  const productPanel = document.querySelector('#room-product-panel');
  const productTitle = document.querySelector('#room-product-title');
  const productDescription = document.querySelector('#room-product-description');
  const productFormat = document.querySelector('#room-product-format');
  const productAmazon = document.querySelector('#room-product-amazon');
  const productCommerce = document.querySelector('#room-product-commerce');
  const productAdLabel = document.querySelector('#room-product-ad-label');
  const productDisclosure = document.querySelector('#room-product-disclosure');
  const articleActions = document.querySelector('#room-article-actions');
  const articleOpen = document.querySelector('#room-article-open');
  const articleExternal = document.querySelector('#room-article-external');
  const productClose = document.querySelector('#room-product-close');
  const readerDialog = document.querySelector('#room-reader-dialog');
  const readerTitle = document.querySelector('#room-reader-title');
  const readerSource = document.querySelector('#room-reader-source');
  const readerFrame = document.querySelector('#room-reader-frame');
  const readerExternal = document.querySelector('#room-reader-external');
  const readerClose = document.querySelector('#room-reader-close');
  const status = document.querySelector('#room-status');
  const motionToggle = document.querySelector('#room-motion-toggle');
  if (!canvas || !stage || !select || !openProductButton || !helpButton || !helpDialog || !helpClose
      || !productPanel || !productTitle || !productDescription || !productFormat || !productAmazon
      || !productClose || !status || !motionToggle) return;
  const readerUiReady = Boolean(articleOpen && articleExternal && readerDialog && readerTitle && readerSource
    && readerFrame && readerExternal && readerClose);

  const context = canvas.getContext('2d', { alpha: false });
  if (!context) status.textContent = '店内の表示は使えませんが、下の商品一覧から選べます。';
  canvas.tabIndex = canvas.tabIndex >= 0 ? canvas.tabIndex : 0;
  canvas.setAttribute('aria-label', '矢印キーまたはWASDで歩き、EnterかEで近くの商品・記事を選べるドット絵のお店');

  const fallbackScene = {
    worldSize: { width: 896, height: 640 },
    spawn: { x: 130, y: 300, facing: 'up' },
    movementBounds: { left: 32, top: 132, right: 864, bottom: 608 },
    shelves: [
      { id: 'shelf-books', label: 'ドット絵の本', x: 72, y: 148, width: 238, height: 108 },
      { id: 'shelf-art', label: '描き方と作品', x: 329, y: 148, width: 238, height: 108 },
      { id: 'shelf-play', label: 'つくって遊ぶ', x: 586, y: 148, width: 238, height: 108 },
      { id: 'shelf-reading', label: '読んで楽しむ', x: 329, y: 390, width: 238, height: 108 },
    ],
    productSpots: [
      { id: 'product-dot-classroom', x: 138, y: 216, shelf: 'shelf-books' },
      { id: 'product-pochipochi', x: 250, y: 216, shelf: 'shelf-books' },
      { id: 'product-background', x: 386, y: 216, shelf: 'shelf-art' },
      { id: 'product-new-pixel-art', x: 448, y: 216, shelf: 'shelf-art' },
      { id: 'product-famicom', x: 510, y: 216, shelf: 'shelf-art' },
      { id: 'product-3d-dot', x: 664, y: 216, shelf: 'shelf-play' },
      { id: 'product-dot-notebook', x: 776, y: 216, shelf: 'shelf-play' },
    ],
    articleSpots: [{ id: 'article-pixel-start', x: 448, y: 458, shelf: 'shelf-reading' }],
    tilemap: { src: '/assets/books/room-tilemap.json' },
    assets: {
      background: null,
      character: { src: null, frameWidth: 16, frameHeight: 16, frames: 1, fps: 6, directionRows: ['down'] },
      products: {},
    },
  };
  const directions = new Set(['up', 'down', 'left', 'right']);
  const keyDirections = new Map([
    ['ArrowUp', 'up'], ['w', 'up'], ['W', 'up'],
    ['ArrowDown', 'down'], ['s', 'down'], ['S', 'down'],
    ['ArrowLeft', 'left'], ['a', 'left'], ['A', 'left'],
    ['ArrowRight', 'right'], ['d', 'right'], ['D', 'right'],
  ]);
  const productById = new Map();
  const articleById = new Map();
  const sprites = { background: null, character: null, products: new Map() };
  let tilemapRenderer = null;
  let movementUnavailable = false;
  let scene = fallbackScene;
  let products = [];
  let articles = [];
  let commerceConfig = { associateName: '', enrollmentConfirmed: false };
  let productSpots = [];
  let articleSpots = [];
  let itemReturnFocus = null;
  let readerReturnFocus = null;
  let viewportWidth = 1;
  let viewportHeight = 1;
  let pixelRatio = 1;
  let viewScale = 1;
  let cameraX = 0;
  let cameraY = 0;
  let previousFrame = 0;
  let frameRequest = 0;
  let elapsed = 0;
  let imageFallbacks = 0;
  let ready = false;
  let movement = null;
  let pointerGesture = null;
  let userMotionEnabled = true;
  const heldKeys = new Set();
  const player = { x: 130, y: 300, facing: 'up', walking: false };
  const tilePalette = ['#d6b080', '#bf805a', '#e0bf82', '#729087', '#bc684d', '#55757a'];

  status.textContent = 'お店を準備しています。自作素材がない場合は、仮のドット絵で表示します。';
  canvas.dataset.ready = 'false';

  function isReducedMotion() {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
      || document.documentElement.dataset.pixieedMotion === 'reduced';
  }

  function syncMotionControl() {
    const reduced = isReducedMotion();
    if (reduced) userMotionEnabled = false;
    motionToggle.disabled = reduced;
    motionToggle.setAttribute('aria-pressed', String(userMotionEnabled && !reduced));
    motionToggle.textContent = userMotionEnabled && !reduced ? '動き ON' : '動き OFF';
    motionToggle.setAttribute('aria-label', reduced ? '動き OFF（端末またはサイトの設定で動きを抑えています）' : motionToggle.textContent);
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function validScene(candidate) {
    if (!candidate || !Number.isFinite(candidate.worldSize?.width) || !Number.isFinite(candidate.worldSize?.height)
        || !Array.isArray(candidate.productSpots) || !Array.isArray(candidate.shelves)) return false;
    const spots = candidate.productSpots.every((spot) => typeof spot.id === 'string'
      && Number.isFinite(spot.x) && Number.isFinite(spot.y));
    const articleSpots = candidate.articleSpots === undefined || (Array.isArray(candidate.articleSpots)
      && candidate.articleSpots.every((spot) => typeof spot.id === 'string'
        && Number.isFinite(spot.x) && Number.isFinite(spot.y)));
    const tilemap = candidate.tilemap === undefined || candidate.tilemap === null
      || (typeof candidate.tilemap.src === 'string' && candidate.tilemap.src.length > 0);
    return spots && articleSpots && tilemap
      && Number.isFinite(candidate.spawn?.x) && Number.isFinite(candidate.spawn?.y);
  }

  function validProduct(candidate) {
    const normalized = normalizeProduct(candidate);
    if (!normalized) return false;
    const asin = String(normalized.asin || '');
    const url = validAmazonUrl(normalized.amazonUrl, asin);
    return {
      ...normalized,
      id: normalized.id,
      kind: 'product',
      asin,
      title: normalized.title,
      description: String(normalized.description || ''),
      format: String(normalized.format || ''),
      amazonUrl: url,
    };
  }

  function safeArticleUrl(rawUrl) {
    if (typeof rawUrl !== 'string' || !rawUrl || rawUrl !== rawUrl.trim() || rawUrl.includes('\\') || rawUrl.startsWith('//')) return '';
    const explicitScheme = /^[a-z][a-z0-9+.-]*:/i.test(rawUrl);
    if (explicitScheme && !rawUrl.toLowerCase().startsWith('https://')) return '';
    try {
      const url = new URL(rawUrl, window.location.origin);
      if (url.username || url.password) return '';
      if (explicitScheme && url.protocol !== 'https:') return '';
      if (!explicitScheme && url.origin !== window.location.origin) return '';
      if (explicitScheme && url.origin === window.location.origin) return '';
      return url.href;
    } catch {
      return '';
    }
  }

  function validArticle(candidate) {
    if (!candidate || typeof candidate.id !== 'string' || typeof candidate.title !== 'string') return false;
    const url = safeArticleUrl(candidate.url);
    const embedUrl = safeArticleUrl(candidate.embedUrl);
    if (!url || !embedUrl || new URL(embedUrl).origin !== window.location.origin) return false;
    return {
      id: candidate.id,
      kind: 'article',
      title: candidate.title,
      description: String(candidate.description || ''),
      source: String(candidate.source || ''),
      url,
      embedUrl,
    };
  }

  async function fetchJson(path) {
    const url = new URL(path, window.location.origin);
    if (url.origin !== window.location.origin) throw new Error('same-origin data only');
    const response = await fetch(url.href, { credentials: 'same-origin', signal: AbortSignal.timeout(5000) });
    if (!response.ok) throw new Error(`request failed: ${response.status}`);
    return response.json();
  }

  async function fetchTilemapJson(path) {
    const url = new URL(path, window.location.origin);
    if (url.origin !== window.location.origin) throw new Error('same-origin tilemap only');
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 5000);
    try {
      const response = await fetch(url.href, { credentials: 'same-origin', signal: controller.signal });
      if (!response.ok) throw new Error(`tilemap request failed: ${response.status}`);
      return await response.json();
    } finally {
      window.clearTimeout(timeoutId);
    }
  }

  function safeAssetUrl(source) {
    if (typeof source !== 'string' || !source.startsWith('/assets/books/')) return '';
    try {
      const url = new URL(source, window.location.origin);
      if (url.origin !== window.location.origin || !url.pathname.startsWith('/assets/books/')
          || url.pathname.split('/').includes('..')) return '';
      return url.href;
    } catch {
      return '';
    }
  }

  function loadImage(source) {
    const url = safeAssetUrl(source);
    if (!url) return Promise.resolve(null);
    return new Promise((resolve) => {
      let settled = false;
      const finish = (image) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timeoutId);
        resolve(image);
      };
      const image = new Image();
      const timeoutId = window.setTimeout(() => {
        imageFallbacks += 1;
        image.onload = null;
        image.onerror = null;
        finish(null);
      }, 5000);
      image.onload = () => finish(image);
      image.onerror = () => {
        imageFallbacks += 1;
        finish(null);
      };
      image.src = url;
    });
  }

  async function loadSprites() {
    const assets = scene.assets || {};
    const backgroundPromise = loadImage(assets.background?.src || assets.background);
    const characterPromise = loadImage(assets.character?.src);
    const productEntries = Object.entries(assets.products || {});
    const productPromises = productEntries.map(async ([id, spec]) => [id, await loadImage(spec?.src)]);
    const [background, character, productResults] = await Promise.all([
      backgroundPromise,
      characterPromise,
      Promise.all(productPromises),
    ]);
    sprites.background = background;
    sprites.character = character;
    sprites.products = new Map(productResults.filter(([, image]) => Boolean(image)));
  }

  async function loadTilemap() {
    tilemapRenderer = null;
    const source = scene.tilemap?.src;
    if (typeof source !== 'string') return false;
    try {
      const mapUrl = safeAssetUrl(source);
      if (!mapUrl) throw new Error('tilemap path must be a same-origin asset');
      const data = await fetchTilemapJson(mapUrl);
      const module = await import('./books-room-tilemap.mjs');
      if (!module.validateTilemap(data)) throw new TypeError('invalid tilemap');
      const map = module.normalizeTilemap(data);
      const tileset = await loadImage(map.tileset?.src);
      const renderer = module.createTilemapRenderer(map, tileset);
      if (!renderer?.canvas || !Number.isFinite(renderer.width) || !Number.isFinite(renderer.height)
          || !Number.isFinite(renderer.tileSize) || !Number.isFinite(renderer.columns) || !Number.isFinite(renderer.rows)
          || typeof renderer.canStandAt !== 'function') throw new TypeError('invalid tilemap renderer');
      tilemapRenderer = renderer;
      scene = { ...scene, worldSize: { width: renderer.width, height: renderer.height } };
      return true;
    } catch {
      tilemapRenderer = null;
      return false;
    }
  }

  function populateCatalog() {
    select.replaceChildren();
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = '商品・記事を選ぶ';
    placeholder.selected = true;
    select.append(placeholder);
    const productGroups = new Map();
    const articleGroup = document.createElement('optgroup');
    articleGroup.label = '記事';
    for (const item of products) {
      const option = document.createElement('option');
      option.value = item.id;
      option.textContent = item.title;
      const category = ({ books: '本', toys: 'おもちゃ', tools: '制作道具' })[item.category] || '商品';
      if (!productGroups.has(category)) {
        const group = document.createElement('optgroup');
        group.label = category;
        productGroups.set(category, group);
      }
      productGroups.get(category).append(option);
    }
    for (const item of articles) {
      const option = document.createElement('option');
      option.value = item.id;
      option.textContent = item.title;
      articleGroup.append(option);
    }
    for (const group of productGroups.values()) select.append(group);
    if (articles.length && readerUiReady) select.append(articleGroup);
    select.disabled = products.length === 0 && (!articles.length || !readerUiReady);
    openProductButton.disabled = select.disabled || !select.value;
  }

  function setDialogOpen(dialog) {
    stopMovement();
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
  }

  function closeDialog(dialog) {
    if (typeof dialog.close === 'function') dialog.close();
    else dialog.removeAttribute('open');
    stopMovement();
  }

  function anyDialogOpen() {
    return helpDialog.open || Boolean(readerDialog?.open);
  }

  function detailActive() {
    return productPanel.dataset.active === 'true';
  }

  function focusCanvas() {
    if (window.matchMedia('(max-width: 700px)').matches) {
      canvas.scrollIntoView({ behavior: 'auto', block: 'nearest' });
    }
    canvas.focus({ preventScroll: true });
  }

  function openItem(id) {
    if (anyDialogOpen()) return;
    const item = productById.get(id) || (readerUiReady ? articleById.get(id) : null);
    if (!item) return;
    stopMovement();
    itemReturnFocus = document.activeElement;
    select.value = item.id;
    productTitle.textContent = item.title;
    productDescription.textContent = item.description;
    if (item.kind === 'article') {
      productFormat.textContent = `出典：${item.source}`;
    } else {
      const statusNote = item.sample ? '見本データ／実在の商品ではありません'
        : item.linkStatus === 'unconfigured' ? 'Amazonリンク未設定'
          : item.linkStatus === 'invalid' ? 'Amazonリンクを確認中' : '';
      productFormat.textContent = [`形式：${item.format || '商品ページでご確認ください'}`, statusNote].filter(Boolean).join('／');
    }
    const commerceReady = commerceConfig.enrollmentConfirmed === true
      && typeof commerceConfig.associateName === 'string' && commerceConfig.associateName.trim().length > 0;
    const validLink = item.kind === 'product' && !item.sample
      ? validAmazonUrl(item.amazonUrl, item.asin) : '';
    productAmazon.hidden = item.kind !== 'product' || !commerceReady || !validLink;
    if (productCommerce) productCommerce.hidden = item.kind !== 'product' || item.sample === true;
    if (articleActions) articleActions.hidden = item.kind !== 'article';
    productAmazon.href = validLink || '#';
    productAmazon.rel = 'sponsored noopener noreferrer';
    productAmazon.target = '_blank';
    productAmazon.textContent = 'Amazonで商品を見る ↗';
    productAmazon.setAttribute('aria-label', `${item.title}をAmazonで商品を見る（新しいタブ）`);
    const disclosureReady = commerceConfig.enrollmentConfirmed === true && commerceReady;
    if (productAdLabel) productAdLabel.textContent = disclosureReady
      ? '広告／Amazonアソシエイト'
      : '広告／Amazonアソシエイト（運営者・加入状況を確認中）';
    if (productDisclosure) {
      productDisclosure.hidden = !disclosureReady;
      productDisclosure.textContent = disclosureReady
        ? `Amazon のアソシエイトとして、${commerceConfig.associateName.trim()}は適格販売により収入を得ています。`
        : '';
    }
    if (articleOpen) {
      articleOpen.hidden = item.kind !== 'article';
      articleOpen.textContent = 'ここで読む';
      articleOpen.dataset.articleId = item.kind === 'article' ? item.id : '';
    }
    if (articleExternal) {
      articleExternal.hidden = item.kind !== 'article';
      articleExternal.href = item.kind === 'article' ? item.url : '#';
      articleExternal.target = '_blank';
      articleExternal.rel = 'noopener noreferrer';
      articleExternal.setAttribute('aria-label', `${item.title}を別のタブで開く`);
    }
    productPanel.dataset.active = 'true';
    productPanel.setAttribute('aria-label', `${item.title}の詳細`);
    productPanel.scrollIntoView({ behavior: 'auto', block: 'nearest' });
    productTitle.focus({ preventScroll: true });
  }

  function closeReader() {
    if (readerFrame) readerFrame.removeAttribute('src');
    if (readerDialog?.open) closeDialog(readerDialog);
    else stopMovement();
    productPanel.dataset.active = 'false';
    productPanel.removeAttribute('aria-label');
    readerReturnFocus = null;
    focusCanvas();
  }

  function openReader(id, returnFocus = document.activeElement) {
    if (!readerUiReady || helpDialog.open || readerDialog.open) return;
    const article = articleById.get(id);
    if (!article) return;
    stopMovement();
    readerReturnFocus = itemReturnFocus?.isConnected ? itemReturnFocus : returnFocus;
    readerTitle.textContent = article.title;
    readerSource.textContent = article.source;
    readerFrame.title = `${article.title}（記事本文）`;
    readerFrame.removeAttribute('src');
    readerExternal.href = article.url;
    readerExternal.target = '_blank';
    readerExternal.rel = 'noopener noreferrer';
    readerExternal.setAttribute('aria-label', `${article.title}を別のタブで開く`);
    if (typeof readerDialog.showModal === 'function') readerDialog.showModal();
    else readerDialog.setAttribute('open', '');
    readerFrame.src = article.embedUrl;
  }

  function itemSpriteMetrics(spot, image = sprites.products.get(spot.id)) {
    if (!image) return { width: 16, height: 16, frames: 1, valid: false };
    const spec = scene.assets?.products?.[spot.id] || {};
    const width = Math.max(1, Number(spec.frameWidth) || 16);
    const height = Math.max(1, Number(spec.frameHeight) || 16);
    const frames = Math.max(1, Math.floor(Number(spec.frames) || Math.floor(image.naturalWidth / width)));
    const valid = width * frames <= image.naturalWidth && height <= image.naturalHeight;
    return valid ? { width, height, frames, valid: true } : { width: 16, height: 16, frames: 1, valid: false };
  }

  function hitItem(worldX, worldY) {
    let closest = null;
    let nearestDistance = Infinity;
    for (const spot of [...productSpots, ...articleSpots]) {
      const { width, height } = itemSpriteMetrics(spot);
      const centerY = spot.y - height / 2;
      const halfWidth = Math.max(width / 2, 22 / viewScale);
      const halfHeight = Math.max(height / 2, 22 / viewScale);
      const dx = worldX - spot.x;
      const dy = worldY - centerY;
      if (Math.abs(dx) > halfWidth || Math.abs(dy) > halfHeight) continue;
      const distance = dx * dx + dy * dy;
      if (distance < nearestDistance) {
        closest = spot;
        nearestDistance = distance;
      }
    }
    return closest;
  }

  function openNearestItem() {
    if (anyDialogOpen() || (products.length === 0 && articles.length === 0)) return;
    let closest = null;
    let shortest = Infinity;
    for (const spot of [...productSpots, ...articleSpots]) {
      const { height } = itemSpriteMetrics(spot);
      const distance = Math.hypot(player.x - spot.x, player.y - (spot.y - height / 2));
      if (distance < shortest) {
        closest = spot;
        shortest = distance;
      }
    }
    if (closest && shortest <= 150) openItem(closest.id);
    else status.textContent = '棚の近くまで歩いてから、EnterかEで商品・記事を見られます。';
  }

  function stopMovement() {
    heldKeys.clear();
    movement = null;
    const gesture = pointerGesture;
    pointerGesture = null;
    player.walking = false;
    if (gesture && canvas.hasPointerCapture?.(gesture.pointerId)) {
      try { canvas.releasePointerCapture(gesture.pointerId); } catch { /* capture may already be gone */ }
    }
  }

  function updateMovementFromKeys() {
    if (anyDialogOpen() || detailActive() || heldKeys.size === 0) {
      if (!pointerGesture?.walking) movement = null;
      return;
    }
    const lastKey = Array.from(heldKeys).at(-1);
    movement = keyDirections.get(lastKey) || null;
  }

  function setFacing(direction) {
    if (directions.has(direction)) player.facing = direction;
  }

  function handlePointerDown(event) {
    if (event.button !== undefined && event.button !== 0) return;
    if (anyDialogOpen() || detailActive()) return;
    stopMovement();
    canvas.focus({ preventScroll: true });
    pointerGesture = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      lastX: event.clientX,
      lastY: event.clientY,
      moved: false,
      walking: false,
    };
    try { canvas.setPointerCapture(event.pointerId); } catch { /* pointer capture is optional */ }
  }

  function handlePointerMove(event) {
    const gesture = pointerGesture;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    gesture.lastX = event.clientX;
    gesture.lastY = event.clientY;
    const dx = event.clientX - gesture.startX;
    const dy = event.clientY - gesture.startY;
    if (!gesture.moved && Math.hypot(dx, dy) < 12) return;
    gesture.moved = true;
    gesture.walking = true;
    if (Math.abs(dx) >= Math.abs(dy)) {
      movement = dx < 0 ? 'left' : 'right';
    } else {
      movement = dy < 0 ? 'up' : 'down';
    }
    setFacing(movement);
    player.walking = true;
    event.preventDefault();
  }

  function screenToWorld(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: cameraX + (clientX - rect.left) / viewScale,
      y: cameraY + (clientY - rect.top) / viewScale,
    };
  }

  function handlePointerUp(event) {
    const gesture = pointerGesture;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    pointerGesture = null;
    movement = null;
    player.walking = false;
    if (!gesture.moved) {
      const point = screenToWorld(event.clientX, event.clientY);
      const spot = hitItem(point.x, point.y);
      if (spot) openItem(spot.id);
    }
    if (canvas.hasPointerCapture?.(event.pointerId)) {
      try { canvas.releasePointerCapture(event.pointerId); } catch { /* capture may already be gone */ }
    }
    updateMovementFromKeys();
  }

  function handlePointerCancel(event) {
    if (!pointerGesture || pointerGesture.pointerId !== event.pointerId) return;
    stopMovement();
  }

  function handlePointerLostCapture(event) {
    if (!pointerGesture || pointerGesture.pointerId !== event.pointerId) return;
    stopMovement();
  }

  function updateCameraAndDebug() {
    const world = scene.worldSize;
    const visibleWidth = viewportWidth / viewScale;
    const visibleHeight = viewportHeight / viewScale;
    cameraX = world.width > visibleWidth ? clamp(player.x - visibleWidth / 2, 0, world.width - visibleWidth) : (world.width - visibleWidth) / 2;
    cameraY = world.height > visibleHeight ? clamp(player.y - visibleHeight / 2, 0, world.height - visibleHeight) : (world.height - visibleHeight) / 2;
    canvas.dataset.playerX = player.x.toFixed(1);
    canvas.dataset.playerY = player.y.toFixed(1);
    canvas.dataset.cameraX = cameraX.toFixed(1);
    canvas.dataset.cameraY = cameraY.toFixed(1);
    canvas.dataset.facing = player.facing;
    canvas.dataset.viewScale = viewScale.toFixed(3);
    canvas.dataset.tileSize = String(tilemapRenderer?.tileSize || 0);
    canvas.dataset.mapColumns = String(tilemapRenderer?.columns || 0);
    canvas.dataset.mapRows = String(tilemapRenderer?.rows || 0);
    canvas.dataset.mapMode = sprites.background ? 'image' : (tilemapRenderer ? 'tilemap' : 'legacy');
    canvas.dataset.ready = String(ready);
  }

  function resizeCanvas() {
    stopMovement();
    const rect = stage.getBoundingClientRect();
    const width = Math.max(1, Math.floor(rect.width || canvas.clientWidth || 1));
    const height = Math.max(1, Math.floor(rect.height || canvas.clientHeight || 1));
    viewportWidth = width;
    viewportHeight = height;
    pixelRatio = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    viewScale = clamp(Math.min(width / 360, height / 420), 0.72, 1.12);
    const backingWidth = Math.max(1, Math.round(width * pixelRatio));
    const backingHeight = Math.max(1, Math.round(height * pixelRatio));
    if (canvas.width !== backingWidth || canvas.height !== backingHeight) {
      canvas.width = backingWidth;
      canvas.height = backingHeight;
    }
    if (context) context.imageSmoothingEnabled = false;
    updateCameraAndDebug();
  }

  function drawWorldBackground() {
    const world = scene.worldSize;
    context.fillStyle = '#dfd4b9';
    context.fillRect(0, 0, world.width, world.height);
    context.fillStyle = '#eadfc5';
    context.fillRect(0, 0, world.width, 132);
    context.fillStyle = '#a96f4f';
    context.fillRect(0, 132, world.width, world.height - 132);
    if (sprites.background) {
      context.drawImage(sprites.background, 0, 0, world.width, world.height);
      return;
    }
    if (tilemapRenderer) {
      context.drawImage(tilemapRenderer.canvas, 0, 0);
      drawShelfLabels();
      return;
    }
    context.fillStyle = '#6f4b3a';
    context.fillRect(0, 124, world.width, 12);
    context.fillStyle = '#c58a5d';
    for (let y = 150; y < world.height; y += 52) {
      context.fillRect(0, y, world.width, 3);
      const offset = (Math.floor(y / 52) % 2) * 42;
      for (let x = offset; x < world.width; x += 132) context.fillRect(x, y + 3, 2, 49);
    }
    drawWindow(72, 34);
    drawPlant(824, 522);
    drawCounter(440, 492);
    drawShelves();
  }

  function drawWindow(x, y) {
    context.fillStyle = '#526a68';
    context.fillRect(x, y, 156, 74);
    context.fillStyle = '#a9c3b3';
    context.fillRect(x + 6, y + 6, 144, 62);
    context.fillStyle = '#e9cf8d';
    context.fillRect(x + 12, y + 12, 54, 50);
    context.fillRect(x + 74, y + 12, 68, 50);
    context.fillStyle = '#526a68';
    context.fillRect(x + 72, y + 6, 5, 62);
    context.fillRect(x + 6, y + 38, 144, 4);
    context.fillStyle = '#6f4b3a';
    context.fillRect(x - 5, y + 72, 166, 8);
  }

  function drawPlant(x, y) {
    context.fillStyle = '#765240';
    context.fillRect(x - 18, y, 36, 30);
    context.fillStyle = '#bd684d';
    context.fillRect(x - 22, y - 6, 44, 9);
    context.fillStyle = '#52745e';
    context.fillRect(x - 5, y - 47, 10, 42);
    context.fillRect(x - 29, y - 34, 22, 12);
    context.fillRect(x + 7, y - 39, 23, 12);
    context.fillRect(x - 22, y - 51, 17, 11);
    context.fillRect(x + 5, y - 55, 18, 12);
    context.fillStyle = '#7e9b68';
    context.fillRect(x - 26, y - 38, 15, 7);
    context.fillRect(x + 10, y - 43, 16, 8);
  }

  function drawCounter(x, y) {
    context.fillStyle = '#604638';
    context.fillRect(x - 78, y, 156, 70);
    context.fillStyle = '#c58a5d';
    context.fillRect(x - 84, y - 9, 168, 14);
    context.fillStyle = '#876047';
    context.fillRect(x - 63, y + 14, 126, 45);
    context.fillStyle = '#e7d8b8';
    context.fillRect(x - 46, y + 24, 92, 4);
    context.fillRect(x - 46, y + 36, 64, 4);
  }

  function drawShelfLabels() {
    for (const shelf of scene.shelves) {
      context.font = 'bold 11px ui-monospace, monospace';
      context.textAlign = 'center';
      const labelWidth = Math.min(shelf.width + 8, context.measureText(shelf.label).width + 12);
      const centerX = shelf.x + shelf.width / 2;
      context.fillStyle = 'rgba(36, 62, 55, .94)';
      context.fillRect(centerX - labelWidth / 2, shelf.y - 21, labelWidth, 17);
      context.fillStyle = '#f1e5c9';
      context.fillText(shelf.label, centerX, shelf.y - 8, shelf.width);
    }
  }

  function drawShelves() {
    for (const shelf of scene.shelves) {
      context.fillStyle = '#5e4235';
      context.fillRect(shelf.x, shelf.y, shelf.width, shelf.height);
      context.fillStyle = '#c58a5d';
      context.fillRect(shelf.x - 5, shelf.y, shelf.width + 10, 12);
      context.fillStyle = '#8c6247';
      context.fillRect(shelf.x + 8, shelf.y + 14, shelf.width - 16, shelf.height - 22);
      context.fillStyle = '#5e4235';
      context.fillRect(shelf.x + 8, shelf.y + 54, shelf.width - 16, 8);
      context.fillRect(shelf.x + 8, shelf.y + 91, shelf.width - 16, 8);
      for (let item = 0; item < 5; item += 1) {
        const x = shelf.x + 18 + item * ((shelf.width - 48) / 5);
        context.fillStyle = tilePalette[(item + Math.round(shelf.x / 100)) % tilePalette.length];
        context.fillRect(x, shelf.y + 24 + (item % 2) * 3, 24, 27 + (item % 3) * 5);
        context.fillStyle = 'rgba(255, 244, 218, .48)';
        context.fillRect(x + 4, shelf.y + 28 + (item % 2) * 3, 4, 19);
      }
    }
    drawShelfLabels();
  }

  function drawFallbackProduct(spot, index) {
    const bob = userMotionEnabled && !isReducedMotion() ? Math.round(Math.sin(elapsed * 2.5 + index) * 0.45) : 0;
    const x = Math.round(spot.x - 8);
    const y = Math.round(spot.y - 16 + bob);
    context.fillStyle = '#493a32';
    context.fillRect(x + 2, y + 1, 12, 14);
    context.fillStyle = tilePalette[index % tilePalette.length];
    context.fillRect(x + 3, y + 1, 10, 12);
    context.fillStyle = '#e6c891';
    context.fillRect(x + 3, y + 1, 2, 12);
    context.fillStyle = '#fff0d2';
    context.fillRect(x + 6, y + 3, 6, 1);
    context.fillRect(x + 6, y + 6, 5, 1);
    context.fillStyle = '#315d50';
    context.fillRect(x + 6, y + 9, 2, 2);
    context.fillRect(x + 9, y + 9, 2, 2);
    context.fillStyle = '#e9d9b7';
    context.fillRect(x + 2, y + 14, 12, 1);
  }

  function drawFallbackArticle(spot, index) {
    const bob = userMotionEnabled && !isReducedMotion() ? Math.round(Math.sin(elapsed * 2.2 + index) * 0.45) : 0;
    const x = Math.round(spot.x - 8);
    const y = Math.round(spot.y - 16 + bob);
    context.fillStyle = '#493a32';
    context.fillRect(x + 2, y, 12, 16);
    context.fillStyle = '#fff8e9';
    context.fillRect(x + 3, y + 1, 10, 13);
    context.fillStyle = '#b84738';
    context.fillRect(x + 5, y + 3, 6, 2);
    context.fillStyle = '#668078';
    context.fillRect(x + 5, y + 7, 6, 1);
    context.fillRect(x + 5, y + 9, 7, 1);
    context.fillRect(x + 5, y + 11, 5, 1);
    context.fillStyle = '#d5bd87';
    context.fillRect(x + 3, y + 14, 10, 1);
  }

  function drawArticleSprite(spot, index, spec, image) {
    if (!image) {
      drawFallbackArticle(spot, index);
      return;
    }
    const metrics = itemSpriteMetrics(spot, image);
    if (!metrics.valid) {
      imageFallbacks += 1;
      drawFallbackArticle(spot, index);
      return;
    }
    const { width: frameWidth, height: frameHeight, frames } = metrics;
    const fps = Math.max(1, Number(spec.fps) || 4);
    const frame = userMotionEnabled && !isReducedMotion() ? Math.floor(elapsed * fps) % frames : 0;
    context.drawImage(image, frame * frameWidth, 0, frameWidth, frameHeight,
      spot.x - frameWidth / 2, spot.y - frameHeight, frameWidth, frameHeight);
  }

  function drawProductSprite(spot, index, spec, image) {
    if (!image) {
      drawFallbackProduct(spot, index);
      return;
    }
    const metrics = itemSpriteMetrics(spot, image);
    if (!metrics.valid) {
      imageFallbacks += 1;
      drawFallbackProduct(spot, index);
      return;
    }
    const { width: frameWidth, height: frameHeight, frames } = metrics;
    const fps = Math.max(1, Number(spec.fps) || 4);
    const frame = userMotionEnabled && !isReducedMotion() ? Math.floor(elapsed * fps) % frames : 0;
    context.drawImage(image, frame * frameWidth, 0, frameWidth, frameHeight, spot.x - frameWidth / 2, spot.y - frameHeight, frameWidth, frameHeight);
  }

  function directionRow(direction, spec) {
    const rows = Array.isArray(spec.directionRows) && spec.directionRows.length ? spec.directionRows : ['down'];
    const index = rows.indexOf(direction);
    return index < 0 ? 0 : index;
  }

  function drawFallbackCharacter() {
    const animated = userMotionEnabled && !isReducedMotion();
    const step = player.walking && animated ? Math.round(Math.sin(elapsed * 13)) : 0;
    const bob = !player.walking && animated ? Math.round(Math.sin(elapsed * 2) * 0.5) : 0;
    const x = Math.round(player.x - 8);
    const y = Math.round(player.y - 16 + bob);
    context.fillStyle = 'rgba(48, 36, 28, .28)';
    context.fillRect(x + 3, y + 15, 10, 1);
    context.fillStyle = '#283c42';
    context.fillRect(x + 4, y + 12 + step, 3, 3);
    context.fillRect(x + 9, y + 12 - step, 3, 3);
    context.fillStyle = '#bd604a';
    context.fillRect(x + 4, y + 7, 8, 5);
    context.fillStyle = '#e7b95e';
    context.fillRect(x + 5, y + 8, 6, 1);
    context.fillStyle = '#efc99d';
    context.fillRect(x + 4, y + 2, 8, 6);
    context.fillStyle = '#315d50';
    context.fillRect(x + 3, y + 1, 10, 3);
    context.fillRect(x + 4, y, 8, 2);
    context.fillStyle = '#293c37';
    if (player.facing === 'left') context.fillRect(x + 5, y + 5, 1, 1);
    else if (player.facing === 'right') context.fillRect(x + 10, y + 5, 1, 1);
    else if (player.facing === 'down') {
      context.fillRect(x + 6, y + 5, 1, 1);
      context.fillRect(x + 9, y + 5, 1, 1);
    } else {
      context.fillStyle = '#426b58';
      context.fillRect(x + 5, y + 3, 6, 2);
    }
  }

  function drawCharacter() {
    const spec = scene.assets?.character || {};
    const image = sprites.character;
    if (!image) {
      drawFallbackCharacter();
      return;
    }
    const frameWidth = Math.max(1, Number(spec.frameWidth) || 16);
    const frameHeight = Math.max(1, Number(spec.frameHeight) || 16);
    const frames = Math.max(1, Math.floor(Number(spec.frames) || 1));
    const rows = Array.isArray(spec.directionRows) && spec.directionRows.length ? spec.directionRows : ['down'];
    const row = directionRow(player.facing, spec);
    if (frameWidth * frames > image.naturalWidth || rows.length * frameHeight > image.naturalHeight) {
      imageFallbacks += 1;
      drawFallbackCharacter();
      return;
    }
    const fps = Math.max(1, Number(spec.fps) || 6);
    const frame = player.walking && userMotionEnabled && !isReducedMotion() ? Math.floor(elapsed * fps) % frames : 0;
    context.drawImage(image, frame * frameWidth, row * frameHeight, frameWidth, frameHeight, player.x - frameWidth / 2, player.y - frameHeight, frameWidth, frameHeight);
  }

  function drawWorld() {
    if (!context) return;
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = '#dfd4b9';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.imageSmoothingEnabled = false;
    context.setTransform(viewScale * pixelRatio, 0, 0, viewScale * pixelRatio, -cameraX * viewScale * pixelRatio, -cameraY * viewScale * pixelRatio);
    drawWorldBackground();
    const orderedSpots = [
      ...productSpots.map((spot) => ({ ...spot, kind: 'product' })),
      ...articleSpots.map((spot) => ({ ...spot, kind: 'article' })),
    ].sort((a, b) => a.y - b.y);
    orderedSpots.forEach((spot, index) => {
      if (spot.kind === 'article') {
        const spec = scene.assets?.products?.[spot.id] || {};
        drawArticleSprite(spot, index, spec, sprites.products.get(spot.id));
        return;
      }
      const spec = scene.assets?.products?.[spot.id] || {};
      drawProductSprite(spot, index, spec, sprites.products.get(spot.id));
    });
    drawCharacter();
  }

  function directionForFrame() {
    if (anyDialogOpen() || detailActive()) return null;
    if (pointerGesture?.walking) return pointerGesture.direction || movement;
    return movement;
  }

  function updatePlayer(deltaSeconds) {
    const direction = directionForFrame();
    if (!direction || movementUnavailable) {
      player.walking = false;
      return;
    }
    player.facing = direction;
    const distance = Math.min(deltaSeconds, 0.05) * 166;
    const bounds = movementLimits();
    const radius = tilemapRenderer ? 3 : 0;
    let nextX = player.x;
    let nextY = player.y;
    if (direction === 'up') nextY = Math.max(bounds.top + radius, player.y - distance);
    if (direction === 'down') nextY = Math.min(bounds.bottom - radius, player.y + distance);
    if (direction === 'left') nextX = Math.max(bounds.left + radius, player.x - distance);
    if (direction === 'right') nextX = Math.min(bounds.right - radius, player.x + distance);
    if (canOccupy(nextX, nextY, radius)) {
      player.x = nextX;
      player.y = nextY;
      player.walking = distance > 0;
    } else {
      player.walking = false;
    }
  }

  function frame(timestamp) {
    if (document.hidden) {
      frameRequest = 0;
      return;
    }
    const deltaSeconds = previousFrame ? (timestamp - previousFrame) / 1000 : 0;
    previousFrame = timestamp;
    if (userMotionEnabled && !isReducedMotion()) elapsed += Math.min(deltaSeconds, 0.05);
    updatePlayer(deltaSeconds);
    updateCameraAndDebug();
    drawWorld();
    frameRequest = window.requestAnimationFrame(frame);
  }

  function startFrameLoop() {
    if (frameRequest || document.hidden) return;
    previousFrame = 0;
    frameRequest = window.requestAnimationFrame(frame);
  }

  function movementLimits() {
    const original = scene.movementBounds || fallbackScene.movementBounds;
    if (!tilemapRenderer) return original;
    const mapBounds = {
      left: 0,
      top: 0,
      right: Math.max(0, scene.worldSize.width),
      bottom: Math.max(0, scene.worldSize.height),
    };
    const intersection = {
      left: Math.max(mapBounds.left, original.left),
      top: Math.max(mapBounds.top, original.top),
      right: Math.min(mapBounds.right, original.right),
      bottom: Math.min(mapBounds.bottom, original.bottom),
    };
    return intersection.right > intersection.left && intersection.bottom > intersection.top
      ? intersection : mapBounds;
  }

  function canOccupy(x, y, radius = 3) {
    const bounds = movementLimits();
    if (x - radius < bounds.left || x + radius > bounds.right
        || y - radius < bounds.top || y + radius > bounds.bottom) return false;
    if (tilemapRenderer) return tilemapRenderer.canStandAt(x, y, radius);
    return scene.shelves.every(shelf => x + radius <= shelf.x || x - radius >= shelf.x + shelf.width
      || y + radius <= shelf.y || y - radius >= shelf.y + shelf.height);
  }

  function findWalkableSpawn(spawn, bounds) {
    const radius = tilemapRenderer ? 3 : 0;
    const x = clamp(spawn.x, bounds.left + radius, bounds.right - radius);
    const y = clamp(spawn.y, bounds.top + radius, bounds.bottom - radius);
    if (!tilemapRenderer || tilemapRenderer.canStandAt(x, y, 3)) return { x, y, available: true };
    let closest = null;
    let distance = Infinity;
    for (let row = 0; row < tilemapRenderer.rows; row += 1) {
      for (let column = 0; column < tilemapRenderer.columns; column += 1) {
        const candidateX = (column + 0.5) * tilemapRenderer.tileSize;
        const candidateY = (row + 0.5) * tilemapRenderer.tileSize;
        if (candidateX < bounds.left + radius || candidateX > bounds.right - radius
            || candidateY < bounds.top + radius || candidateY > bounds.bottom - radius
            || !tilemapRenderer.canStandAt(candidateX, candidateY, 3)) continue;
        const candidateDistance = Math.hypot(candidateX - x, candidateY - y);
        if (candidateDistance < distance) {
          closest = { x: candidateX, y: candidateY, available: true };
          distance = candidateDistance;
        }
      }
    }
    return closest || { x, y, available: false };
  }

  function setScene(candidate) {
    if (validScene(candidate)) scene = { ...fallbackScene, ...candidate, assets: candidate.assets || fallbackScene.assets };
    if (tilemapRenderer) scene = { ...scene, worldSize: { width: tilemapRenderer.width, height: tilemapRenderer.height } };
    const bounds = movementLimits();
    const spawn = findWalkableSpawn({
      x: Number(scene.spawn?.x) || fallbackScene.spawn.x,
      y: Number(scene.spawn?.y) || fallbackScene.spawn.y,
    }, bounds);
    player.x = spawn.x;
    player.y = spawn.y;
    movementUnavailable = !spawn.available;
    player.facing = directions.has(scene.spawn?.facing) ? scene.spawn.facing : 'down';
    productSpots = scene.productSpots.filter((spot) => productById.has(spot.id));
    articleSpots = (scene.articleSpots || []).filter((spot) => articleById.has(spot.id) && readerUiReady);
  }

  async function initialize() {
    const [sceneResult, productsResult, articlesResult, commerceResult] = await Promise.allSettled([
      fetchJson('/assets/books/room-scene.json'),
      fetchJson('/assets/books/room-products.json'),
      fetchJson('/assets/books/room-articles.json'),
      fetchJson('/assets/books/room-commerce.json'),
    ]);
    if (commerceResult.status === 'fulfilled' && commerceResult.value
        && typeof commerceResult.value === 'object') {
      commerceConfig = {
        associateName: typeof commerceResult.value.associateName === 'string' ? commerceResult.value.associateName.trim() : '',
        enrollmentConfirmed: commerceResult.value.enrollmentConfirmed === true,
      };
    }
    if (sceneResult.status === 'fulfilled' && validScene(sceneResult.value)) setScene(sceneResult.value);
    else setScene(fallbackScene);
    if (productsResult.status === 'fulfilled' && Array.isArray(productsResult.value)) {
      products = productsResult.value.map(validProduct).filter(Boolean);
      products.forEach((product) => productById.set(product.id, product));
    } else {
      status.textContent = '商品リストを読み込めません。時間をおいて再読み込みしてください。';
    }
    if (articlesResult.status === 'fulfilled' && Array.isArray(articlesResult.value)) {
      articles = articlesResult.value.map(validArticle).filter(Boolean);
      articles.forEach((article) => articleById.set(article.id, article));
    }
    // Resolve both shelf types only after the manifests have populated their ID maps.
    setScene(scene);
    populateCatalog();
    const tilemapLoaded = await loadTilemap();
    setScene(scene);
    await loadSprites();
    ready = true;
    resizeCanvas();
    canvas.dataset.ready = 'true';
    if (context && (imageFallbacks || sceneResult.status !== 'fulfilled')) {
      status.textContent = '自作画像がない、または読み込めないため、仮のドット絵で表示しています。下の商品・記事一覧からも選べます。';
    } else if (context) {
      status.textContent = 'スワイプで歩き、棚のアイコンをタップ。下の商品・記事一覧からも選べます。';
    } else {
      status.textContent = '店内の表示は使えませんが、下の商品・記事一覧から選べます。';
    }
    if (productsResult.status !== 'fulfilled') status.textContent += ' 商品一覧を読み込めませんでした。';
    if (articlesResult.status !== 'fulfilled') status.textContent += ' 記事一覧を読み込めませんでした。';
    if (!tilemapLoaded && scene.tilemap?.src) status.textContent += ' タイル地図を読み込めないため、従来の背景で表示しています。';
    if (movementUnavailable) status.textContent += ' 通れる場所がないため、画面下の商品・記事一覧をご利用ください。';
    startFrameLoop();
  }

  canvas.addEventListener('pointerdown', handlePointerDown);
  canvas.addEventListener('pointermove', handlePointerMove, { passive: false });
  canvas.addEventListener('pointerup', handlePointerUp);
  canvas.addEventListener('pointercancel', handlePointerCancel);
  canvas.addEventListener('lostpointercapture', handlePointerLostCapture);
  canvas.addEventListener('keydown', (event) => {
    if (anyDialogOpen() || event.target !== canvas) return;
    const direction = keyDirections.get(event.key);
    if (direction) {
      event.preventDefault();
      heldKeys.delete(event.key);
      heldKeys.add(event.key);
      updateMovementFromKeys();
      return;
    }
    if (event.key === 'Enter' || event.key.toLowerCase() === 'e') {
      event.preventDefault();
      openNearestItem();
    }
  });
  canvas.addEventListener('blur', stopMovement);
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || !detailActive() || anyDialogOpen()) return;
    event.preventDefault();
    productPanel.dataset.active = 'false';
    productPanel.removeAttribute('aria-label');
    stopMovement();
    focusCanvas();
  });
  window.addEventListener('keyup', (event) => {
    if (heldKeys.delete(event.key)) updateMovementFromKeys();
  });
  window.addEventListener('blur', stopMovement);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      stopMovement();
      if (frameRequest) window.cancelAnimationFrame(frameRequest);
      frameRequest = 0;
      previousFrame = 0;
    } else startFrameLoop();
  });
  canvas.addEventListener('contextmenu', (event) => event.preventDefault());
  select.addEventListener('change', () => {
    status.textContent = select.value ? '「見る」を押すと説明を見られます。' : '';
    openProductButton.disabled = select.disabled || !select.value;
  });
  openProductButton.addEventListener('click', () => openItem(select.value));
  articleOpen?.addEventListener('click', () => openReader(articleOpen.dataset.articleId, itemReturnFocus));
  readerClose?.addEventListener('click', closeReader);
  readerDialog?.addEventListener('cancel', (event) => {
    event.preventDefault();
    closeReader();
  });
  helpButton.addEventListener('click', () => setDialogOpen(helpDialog));
  helpClose.addEventListener('click', () => closeDialog(helpDialog));
  productClose.addEventListener('click', () => {
    productPanel.dataset.active = 'false';
    productPanel.removeAttribute('aria-label');
    stopMovement();
    focusCanvas();
  });
  helpDialog.addEventListener('cancel', stopMovement);
  motionToggle.addEventListener('click', () => {
    if (isReducedMotion()) return;
    userMotionEnabled = !userMotionEnabled;
    syncMotionControl();
    status.textContent = userMotionEnabled ? '穏やかな動きをつけました。' : '動きを止めました。';
  });
  const motionMedia = window.matchMedia('(prefers-reduced-motion: reduce)');
  const onMotionChange = () => syncMotionControl();
  if (motionMedia.addEventListener) motionMedia.addEventListener('change', onMotionChange);
  else motionMedia.addListener?.(onMotionChange);
  new MutationObserver(onMotionChange).observe(document.documentElement, { attributes: true, attributeFilter: ['data-pixieed-motion'] });
  syncMotionControl();

  const resizeObserver = typeof ResizeObserver === 'function' ? new ResizeObserver(resizeCanvas) : null;
  resizeObserver?.observe(stage);
  window.addEventListener('resize', resizeCanvas, { passive: true });
  window.addEventListener('orientationchange', resizeCanvas, { passive: true });
  resizeCanvas();
  drawWorld();
  initialize().catch(() => {
    setScene(fallbackScene);
    products = [];
    articles = [];
    populateCatalog();
    ready = true;
    resizeCanvas();
    status.textContent = 'お店のデータを読み込めません。ページを再読み込みしてください。';
    startFrameLoop();
  });
})();
