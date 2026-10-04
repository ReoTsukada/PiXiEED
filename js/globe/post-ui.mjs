/**
 * Posting UI for the globe: pins on the sphere, the composer, the work viewer,
 * the gallery and the login gate.
 *
 * Decisions this implements: login required; a work's location is a single pin;
 * posting from a cell stores that cell's centre as an exact coordinate; the title
 * is required; a pin can also come from a Google Maps link / pasted coordinates
 * (parsed offline, so it costs nothing).
 */
import { lookupCell, projectGeoToScreen } from './geometry.mjs?v=20260921-grid11-1';
import { formatCoordinates, googleMapsUrl, parseLocationInput } from './geo-input.mjs?v=20260921-post-1';
import { fitPixelImage, inspectPixelImage, PIXEL_LIMITS } from './post-image.mjs?v=20261004-post-size-256-1';
import { createDemoAuth, createPostStore } from './post-store.mjs?v=20260921-post-1';
import { PUZZLE_HANDOFF_META_KEY } from '../creation/puzzle-handoff.mjs?v=20260928-puzzle-handoff-1';

const TITLE_MAX = 60;
const CAPTION_MAX = 140;
const PIN_VISIBLE_DEPTH = 0.06;
const PUBLIC_POST_ID = /^(?:showcase:)?[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const $ = (root, selector) => root.querySelector(selector);
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

function el(tag, className, attributes = {}) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  for (const [key, value] of Object.entries(attributes)) {
    if (value === true) node.setAttribute(key, '');
    else if (value !== false && value != null) node.setAttribute(key, value);
  }
  return node;
}

function formatDate(timestamp) {
  try { return new Intl.DateTimeFormat('ja-JP', { year: 'numeric', month: 'long', day: 'numeric' }).format(timestamp); } catch { return ''; }
}

function pixelImage(post, className = '') {
  const image = el('img', className, { alt: '', draggable: 'false' });
  image.src = post.image.dataUrl;
  image.width = post.image.width;
  image.height = post.image.height;
  return image;
}

const SOURCE_LABEL = Object.freeze({
  cell: 'セルの中心',
  'map-link': 'Googleマップのリンク',
  coordinates: '入力した座標',
  geolocation: '現在地',
  globe: '地球でタップ',
  sample: 'サンプル'
});

export function initPostUi({ renderer, stage, store = createPostStore(), auth = createDemoAuth(), accountSlot = null } = {}) {
  if (!renderer || !stage) throw new Error('initPostUi requires a renderer and a stage');

  // ---- DOM ----------------------------------------------------------------------------------
  const pinLayer = el('div', 'pin-layer');
  pinLayer.setAttribute('aria-hidden', 'false');
  const draftPin = el('div', 'pin-draft', { hidden: true });
  draftPin.innerHTML = '<span class="pin-draft__ring"></span><span class="pin-draft__dot"></span>';
  pinLayer.append(draftPin);

  const dock = el('div', 'post-dock');
  const composeButton = el('button', 'post-fab', { type: 'button', 'aria-label': 'ドット絵を置く' });
  composeButton.hidden = true; // The site navigation owns the primary posting action.
  composeButton.innerHTML = '<img class="post-fab__icon" src="/assets/icons/pixieed/add.svg" alt=""><i class="post-fab__draft" hidden></i>';
  const galleryButton = el('button', 'post-dock__secondary', { type: 'button', 'aria-label': '地図の投稿一覧' });
  galleryButton.innerHTML = '<img src="/assets/icons/pixieed/artwork.svg" alt=""><span>投稿を見る</span><span class="post-dock__count">0</span>';
  dock.append(composeButton, galleryButton);

  const hint = el('div', 'place-hint', { hidden: true, role: 'status' });
  hint.textContent = '地球のセルをタップすると、ピンがそこに移ります';

  const toast = el('div', 'post-toast', { role: 'status', 'aria-live': 'polite' });

  const composer = el('aside', 'sheet composer', { hidden: true, 'aria-label': 'ドット絵を置く' });
  composer.innerHTML = `
    <header class="sheet__head">
      <h2 data-compose-title>ドット絵を置く</h2>
      <button type="button" class="sheet__close" data-close aria-label="閉じる"><img src="/assets/icons/pixieed/close.svg" alt=""></button>
    </header>
    <div class="peek-bar" data-peek-bar hidden><span>地球のセルをタップしてピンを置く</span><button type="button" class="primary" data-peek-done>決定</button></div>
    <ol class="steps" aria-label="投稿の進み具合">
      <li data-step="art"><b>1</b>絵</li><li data-step="title"><b>2</b>題名</li><li data-step="place"><b>3</b>場所</li>
    </ol>
    <form class="composer__form" novalidate>
      <section class="field puzzle-handoff" data-puzzle-panel hidden aria-label="パズル投稿の確認">
        <h3 data-puzzle-title>パズル</h3>
        <p data-puzzle-description></p>
        <label class="post-confirm"><input type="checkbox" data-puzzle-rights> この絵と正解データを投稿する権利があり、内容を確認しました。公開後は誰でも遊べる作品として扱われることを理解しています。</label>
      </section>
      <section class="field" aria-labelledby="c-art">
        <h3 id="c-art">絵</h3>
        <div class="drop" data-drop tabindex="0" role="button" aria-label="ドット絵を選ぶ">
          <span class="drop__pixels" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i></span>
          <strong>ドット絵をドロップ</strong>
          <span>クリックで選ぶ ・ 貼り付け（Ctrl/⌘+V）も使えます</span>
          <small>PNG / WebP ・ 長辺${PIXEL_LIMITS.maxSize}pxまで ・ ${PIXEL_LIMITS.maxColors}色まで ・ 横長・縦長も可 ・ 拡大保存も等倍に戻します</small>
        </div>
        <a class="camera-link" data-camera-link href="/pixel-camera.html?from=globe" target="_top" rel="noopener">ドット絵カメラで撮って作る</a>
        <input type="file" accept="image/png,image/webp" data-file hidden>
        <div class="art" data-art hidden>
          <div class="art__stage"><img data-art-image alt="選んだドット絵のプレビュー"></div>
          <div class="art__meta"><span data-art-meta></span><button type="button" class="link" data-replace>選び直す</button></div>
        </div>
        <p class="field__error" data-art-error role="alert"></p>
        <label class="post-confirm" data-art-confirm><input type="checkbox" data-art-made> 自分で制作したドット絵です</label>
        <p class="post-confirm" data-camera-origin hidden>ドット絵カメラで撮影した画像として投稿します。</p>
      </section>
      <section class="field" aria-labelledby="c-title">
        <h3 id="c-title">題名 <em>必須</em></h3>
        <input type="text" data-title maxlength="${TITLE_MAX}" placeholder="作品の名前" autocomplete="off" aria-labelledby="c-title">
        <div class="field__row"><span></span><small data-title-count>0/${TITLE_MAX}</small></div>
        <textarea data-caption rows="2" maxlength="${CAPTION_MAX}" placeholder="ひとこと（任意）— この場所に置く理由など" aria-label="ひとこと（任意）"></textarea>
      </section>
      <section class="field" aria-labelledby="c-place">
        <h3 id="c-place">場所 <em>ピン</em></h3>
        <div class="place" data-place>
          <div class="place__icon" aria-hidden="true"></div>
          <div class="place__text">
            <strong data-place-main>まだ置いていません</strong>
            <span data-place-sub>地球のセルをタップするか、下の方法で決めます</span>
          </div>
        </div>
        <label class="smart">
          <span>Googleマップのリンク、または座標を貼り付け</span>
          <input type="text" data-smart inputmode="text" spellcheck="false" autocomplete="off" placeholder="https://www.google.com/maps/…  /  35.6895, 139.6917">
        </label>
        <p class="smart__status" data-smart-status role="status"></p>
        <div class="place__actions">
          <button type="button" class="chip chip--globe" data-pick-globe>地球で選ぶ</button>
          <button type="button" class="chip" data-geolocate>現在地を使う</button>
        </div>
        <details class="howto">
          <summary>Googleマップから座標をとるには</summary>
          <ol>
            <li>パソコン：場所を開き、アドレスバーのURLをそのまま貼り付け</li>
            <li>スマホ：地図を長押ししてピンを立て、出てきた数字（35.68…, 139.69…）をタップしてコピー</li>
            <li>「共有→リンクをコピー」の短縮リンク（maps.app.goo.gl）は読み取れません</li>
          </ol>
        </details>
        <p class="note">公開される場所は、選んだ<b>セル単位</b>です。入力した正確な緯度・経度は公開されません。</p>
      </section>
      <footer class="composer__foot">
        <p data-missing role="status"></p>
        <button type="submit" class="primary" data-submit disabled>置く</button>
      </footer>
    </form>
    <div class="composer__done" data-done hidden>
      <div class="done__art"><img data-done-image alt=""></div>
      <h3>置きました</h3>
      <p data-done-text></p>
      <div class="done__actions">
        <button type="button" class="primary" data-done-view>地球で見る</button>
        <button type="button" class="ghost" data-done-again>もう1枚置く</button>
      </div>
    </div>`;

  const viewer = el('aside', 'sheet viewer', { hidden: true, 'aria-label': '作品' });
  viewer.innerHTML = `
    <header class="sheet__head">
      <h2 data-v-kicker>作品</h2>
      <button type="button" class="sheet__close" data-close aria-label="閉じる"><img src="/assets/icons/pixieed/close.svg" alt=""></button>
    </header>
    <div class="viewer__art"><img data-v-image alt=""></div>
    <h3 class="viewer__title" data-v-title></h3>
    <p class="viewer__caption" data-v-caption></p>
    <dl class="viewer__facts">
      <div><dt>作者</dt><dd data-v-author></dd></div>
      <div><dt>日付</dt><dd data-v-date></dd></div>
      <div><dt>ピン</dt><dd><span data-v-coords></span> <a data-v-map target="_blank" rel="noopener noreferrer">Googleマップで開く</a></dd></div>
    </dl>
    <div class="viewer__actions">
      <button type="button" class="ghost" data-v-prev aria-label="前の作品">←</button>
      <button type="button" class="ghost" data-v-focus>地球で見る</button>
      <button type="button" class="ghost" data-v-next aria-label="次の作品">→</button>
      <a class="viewer__puzzle" data-v-puzzle target="_top" hidden>遊ぶ</a>
      <button type="button" class="viewer__like" data-v-like aria-pressed="false" hidden>♡ いいね</button>
      <button type="button" class="danger" data-v-delete hidden>削除</button>
    </div>`;

  const gallery = el('aside', 'sheet gallery', { hidden: true, 'aria-label': '地図の投稿一覧' });
  gallery.innerHTML = `
    <header class="sheet__head">
      <h2>地図の投稿</h2>
      <button type="button" class="sheet__close" data-close aria-label="閉じる"><img src="/assets/icons/pixieed/close.svg" alt=""></button>
    </header>
    <div class="tabs" aria-label="投稿を絞り込む"><button type="button" data-tab="art" aria-pressed="true">ドット絵</button><button type="button" data-tab="camera" aria-pressed="false">カメラ</button><a class="tabs__profile-link" href="/profile/?view=posts" target="_top">投稿した絵</a></div>
    <div class="gallery__grid" data-grid></div>
    <p class="gallery__empty" data-empty hidden></p>`;

  const modal = el('div', 'post-modal', { hidden: true });
  modal.innerHTML = `
    <button type="button" class="post-modal__backdrop" data-close aria-label="閉じる"></button>
    <form class="post-modal__card" role="dialog" aria-modal="true" aria-labelledby="login-title">
      <h2 id="login-title">ログインして置く</h2>
      <p>投稿にはログインが必要です。作品には作者名が表示されます。</p>
      <label><span>表示名</span><input type="text" data-login-name maxlength="24" placeholder="例：アルタ" autocomplete="nickname"></label>
      <button type="submit" class="primary">ログインして続ける</button>
      <p class="field__error" data-login-error role="alert"></p>
    </form>`;

  stage.append(pinLayer, dock, hint, toast, composer, viewer, gallery, modal);

  // ---- state --------------------------------------------------------------------------------
  const state = { image: null, postKind: 'pixel_art', puzzle: null, puzzleHandoff: null, pin: null, submitting: false, done: null, viewerId: null, tab: 'art', pendingAfterLogin: null, likeStates: new Map(), requestKey: null, requestFingerprint: null };
  const markers = new Map(); // post id -> button
  let toastTimer = 0;
  let deleteTimer = 0;

  const say = (message) => {
    toast.textContent = message;
    toast.classList.add('is-on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('is-on'), 3200);
  };
  const currentUser = () => auth.getUser();
  const posts = () => store.list();
  const isMine = (post) => Boolean(currentUser()) && post.author?.id === currentUser().id && !post.sample;
  const view = () => renderer.getSnapshot().view;

  function flyTo(latitude, longitude, minZoom = 5) {
    // Keep the target in the free part of the stage: above the bottom sheet on phones,
    // left of the side sheet on desktop.
    const zoom = Math.max(view().zoom, minZoom);
    const camera = renderer.getSnapshot().camera;
    let centerLatitude = latitude;
    let centerLongitude = longitude;
    if (camera && openSheet()) {
      const scale = camera.radius * zoom;
      const narrow = stage.clientWidth < 680;
      if (narrow) centerLatitude = clamp(latitude - (stage.clientHeight * 0.2 / scale) * 57.2958, -85, 85);
      else centerLongitude = longitude + (190 / scale) * 57.2958 / Math.max(0.2, Math.cos(latitude * Math.PI / 180));
    }
    renderer.setView({ centerLongitude, centerLatitude, zoom });
  }

  // ---- panels ---------------------------------------------------------------------------------
  const sheets = { composer, viewer, gallery };
  function showSheet(name) {
    if (name !== 'composer') invalidateLocationRequest();
    for (const [key, node] of Object.entries(sheets)) node.hidden = key !== name;
    stage.classList.toggle('has-sheet', Boolean(name));
    stage.classList.toggle('is-composing', name === 'composer');
    hint.hidden = !(name === 'composer' && !state.done);
    if (name !== 'composer') setPeek(false);
    if (name !== 'viewer') { state.viewerId = null; syncMarkerSelection(); }
    document.querySelector('#selectionPanel')?.toggleAttribute('data-suppressed', Boolean(name));
    refresh();
  }
  const openSheet = () => Object.entries(sheets).find(([, node]) => !node.hidden)?.[0] || null;
  const closeSheets = () => showSheet(null);

  // ---- composer ---------------------------------------------------------------------------
  const setPeek = (on) => { composer.classList.toggle('is-peek', on); $(composer, '[data-peek-bar]').hidden = !on; };
  const c = {
    form: $(composer, 'form'),
    drop: $(composer, '[data-drop]'),
    file: $(composer, '[data-file]'),
    art: $(composer, '[data-art]'),
    artImage: $(composer, '[data-art-image]'),
    artMeta: $(composer, '[data-art-meta]'),
    artError: $(composer, '[data-art-error]'),
    artMade: $(composer, '[data-art-made]'),
    artConfirm: $(composer, '[data-art-confirm]'),
    cameraOrigin: $(composer, '[data-camera-origin]'),
    title: $(composer, '[data-title]'),
    titleCount: $(composer, '[data-title-count]'),
    caption: $(composer, '[data-caption]'),
    placeMain: $(composer, '[data-place-main]'),
    placeSub: $(composer, '[data-place-sub]'),
    place: $(composer, '[data-place]'),
    smart: $(composer, '[data-smart]'),
    smartStatus: $(composer, '[data-smart-status]'),
    geolocate: $(composer, '[data-geolocate]'),
    missing: $(composer, '[data-missing]'),
    submit: $(composer, '[data-submit]'),
    done: $(composer, '[data-done]'),
    doneImage: $(composer, '[data-done-image]'),
    doneText: $(composer, '[data-done-text]'),
    steps: composer.querySelectorAll('.steps li')
  };
  const puzzlePanel = $(composer, '[data-puzzle-panel]');
  const puzzleRights = $(composer, '[data-puzzle-rights]');
  let locationRequestSequence = 0;
  let imageRequestSequence = 0;

  function invalidateLocationRequest() {
    locationRequestSequence += 1;
    if (c.geolocate.disabled) {
      c.geolocate.disabled = false;
      if (c.smartStatus.textContent === '現在地の許可を確認しています…') {
        c.smartStatus.textContent = ''; c.smartStatus.dataset.state = '';
      }
    }
  }

  async function makeRequestFingerprint() {
    const content = JSON.stringify({ title: c.title.value.trim(), caption: c.caption.value.trim(), pin: state.pin && { latitude: state.pin.latitude, longitude: state.pin.longitude, cellId: state.pin.cellId }, postKind: state.postKind, image: state.image?.dataUrl || '', puzzle: state.puzzle });
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(content));
    return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  }
  function persistPuzzleRetry() {
    if (!state.puzzleHandoff) return;
    try { sessionStorage.setItem(PUZZLE_HANDOFF_META_KEY, JSON.stringify({ title: c.title.value, caption: c.caption.value, pin: state.pin && { latitude: state.pin.latitude, longitude: state.pin.longitude, source: state.pin.source, label: state.pin.label || '' }, requestKey: state.requestKey, requestFingerprint: state.requestFingerprint })); } catch { /* the handoff payload remains available */ }
  }
  function invalidateRequestKey() { state.requestKey = null; state.requestFingerprint = null; persistPuzzleRetry(); }

  function syncComposer() {
    const title = c.title.value.trim();
    const okArt = Boolean(state.image);
    const okOrigin = state.postKind === 'pixel_camera' || c.artMade.checked;
    const okPuzzleRights = !state.puzzle || puzzleRights.checked;
    const okTitle = title.length > 0;
    const okPlace = Boolean(state.pin);
    c.steps.forEach((step) => step.classList.toggle('is-done', { art: okArt, title: okTitle, place: okPlace }[step.dataset.step]));
    const missing = [!okArt && '絵', !okOrigin && '制作確認', !okPuzzleRights && '権利確認', !okTitle && '題名', !okPlace && '場所'].filter(Boolean);
    c.submit.disabled = missing.length > 0 || state.submitting;
    c.missing.textContent = state.submitting ? '置いています…' : (missing.length ? `あと：${missing.join(' ・ ')}` : '準備できました');
    c.titleCount.textContent = `${c.title.value.length}/${TITLE_MAX}`;
    c.art.hidden = !okArt;
    c.drop.hidden = okArt;
    c.artConfirm.hidden = state.postKind === 'pixel_camera';
    c.cameraOrigin.hidden = state.postKind !== 'pixel_camera';
    puzzlePanel.hidden = !state.puzzle;
    c.submit.textContent = state.puzzle ? '審査に送る' : '置く';
    if (state.puzzle) {
      $(composer, '[data-puzzle-title]').textContent = state.puzzle.mode === 'spot_difference' ? '間違い探しを一緒に投稿' : 'もの探しを一緒に投稿';
      $(composer, '[data-puzzle-description]').textContent = state.puzzle.mode === 'spot_difference' ? `${state.puzzle.definition.candidates.length}個の正解候補と変更後の絵を、審査用データとして送ります。` : `${state.puzzle.definition.targets.length}個の名前付き対象を、審査用データとして送ります。`;
    }
    $(composer, '[data-compose-title]').textContent = state.postKind === 'pixel_camera' ? 'カメラで撮った絵を置く' : 'ドット絵を置く';
    composeButton.querySelector('.post-fab__draft').hidden = !(okArt || okTitle || okPlace) || Boolean(state.done);
    if (state.pin) {
      c.place.classList.add('is-set');
      c.placeMain.textContent = formatCoordinates(state.pin.latitude, state.pin.longitude);
      const where = state.pin.label ? `${state.pin.label} ・ ` : '';
      c.placeSub.textContent = `${where}${SOURCE_LABEL[state.pin.source] || 'ピン'}`;
    } else {
      c.place.classList.remove('is-set');
      c.placeMain.textContent = 'まだ置いていません';
      c.placeSub.textContent = '地球のセルをタップするか、下の方法で決めます';
    }
    positionDraftPin();
  }

  async function setImage(file, { fromCamera = false, puzzlePayload = null, keepScale = false } = {}) {
    const imageSequence = ++imageRequestSequence;
    invalidateLocationRequest();
    c.artError.textContent = '';
    if (!file) return;
    if (!puzzlePayload) {
      state.puzzle = null; puzzleRights.checked = false; invalidateRequestKey();
      if (state.puzzleHandoff) { const discard = state.puzzleHandoff.onDiscard; state.puzzleHandoff = null; discard?.(); }
    }
    state.postKind = fromCamera ? 'pixel_camera' : 'pixel_art';
    state.image = null;
    syncComposer();
    try {
      const inspected = await inspectPixelImage(file, { keepScale: keepScale || fromCamera || Boolean(puzzlePayload) });
      if (imageSequence !== imageRequestSequence) return;
      state.image = inspected;
      c.artImage.src = inspected.dataUrl;
      const display = fitPixelImage(inspected.width, inspected.height, 232, 232);
      c.artImage.style.width = `${display.width}px`;
      c.artImage.style.height = `${display.height}px`;
      c.artMeta.textContent = `${inspected.width}×${inspected.height}px ・ ${inspected.colorCount}色${inspected.scale > 1 ? ` ・ ${inspected.scale}倍から等倍に戻しました` : ''}`;
    } catch (error) {
      if (imageSequence !== imageRequestSequence) return;
      state.image = null;
      c.artError.textContent = error instanceof Error ? error.message : '画像を確認できませんでした。';
    }
    if (state.image && puzzlePayload) {
      const expected = puzzlePayload.image;
      const actual = new Uint8Array(await file.arrayBuffer());
      if (imageSequence !== imageRequestSequence) return;
      let binary = ''; for (let offset = 0; offset < actual.length; offset += 0x8000) binary += String.fromCharCode(...actual.subarray(offset, offset + 0x8000));
      if (btoa(binary) !== expected.base64 || state.image.width !== expected.width || state.image.height !== expected.height || state.image.colorCount !== expected.colorCount || actual.length !== expected.size) {
        state.image = null; c.artError.textContent = '元画像とパズルの投稿データが一致しません。作成画面からもう一度送ってください。';
      } else {
        state.image = { ...expected, dataUrl: `data:image/png;base64,${expected.base64}` };
        state.puzzle = structuredClone(puzzlePayload.puzzle);
        state.requestKey = null; state.requestFingerprint = null;
      }
    }
    c.file.value = '';
    syncComposer();
  }

  function setPin(pin, { fly = false } = {}) {
    invalidateLocationRequest();
    const cell = lookupCell(pin.longitude, pin.latitude);
    if (!state.pin || state.pin.latitude !== pin.latitude || state.pin.longitude !== pin.longitude || state.pin.cellId !== cell.cellId) invalidateRequestKey();
    state.pin = { ...pin, cellId: cell.cellId };
    if (fly) flyTo(pin.latitude, pin.longitude, 6);
    syncComposer();
  }

  function pinFromSelection(selection) {
    const center = selection.center || selection.cell?.center;
    if (!center) return null;
    return { latitude: Number(center.latitude.toFixed(6)), longitude: Number(center.longitude.toFixed(6)), source: 'cell', label: selection.ownerLabel && selection.ownerLabel !== '土地セル' ? selection.ownerLabel : '' };
  }

  function resetComposer() {
    invalidateLocationRequest();
    imageRequestSequence += 1;
    state.image = null; state.postKind = 'pixel_art'; state.puzzle = null; state.pin = null; state.submitting = false; state.done = null; state.requestKey = null; state.requestFingerprint = null; puzzleRights.checked = false;
    c.form.reset();
    c.artError.textContent = ''; c.smartStatus.textContent = ''; c.smartStatus.dataset.state = '';
    c.form.hidden = false; c.done.hidden = true;
    syncComposer();
  }

  function needLogin(action) {
    if (currentUser()) return false;
    state.pendingAfterLogin = action;
    modal.hidden = false;
    $(modal, '[data-login-name]').focus();
    return true;
  }

  function openComposer({ selection = null, file = null, postKind = 'pixel_art', puzzlePayload = null, keepScale = false, useCurrentLocation = false } = {}) {
    if (needLogin(() => openComposer({ selection, file, postKind, puzzlePayload, keepScale, useCurrentLocation }))) return;
    invalidateLocationRequest();
    imageRequestSequence += 1;
    if (state.done) resetComposer();
    showSheet('composer');
    if (useCurrentLocation) {
      state.pin = null;
      invalidateRequestKey();
      c.smart.value = '';
      c.smartStatus.textContent = '';
      c.smartStatus.dataset.state = '';
      syncComposer();
    }
    if (selection) { const pin = pinFromSelection(selection); if (pin) setPin(pin); }
    if (file) {
      const imagePromise = setImage(file, { fromCamera: postKind === 'pixel_camera', puzzlePayload, keepScale });
      if (useCurrentLocation) requestCurrentLocation();
      return imagePromise;
    }
    if (useCurrentLocation) requestCurrentLocation();
    else if (!state.image) requestAnimationFrame(() => c.drop.focus({ preventScroll: true }));
    return Promise.resolve();
  }

  async function openPuzzleComposer({ file, payload, metadata = null, onSuccess = null, onDiscard = null } = {}) {
    if (!file || !payload?.puzzle || payload.image?.mimeType !== 'image/png') return false;
    state.puzzleHandoff = { onSuccess, onDiscard };
    state.puzzle = null; state.image = null;
    await openComposer({ file, postKind: 'pixel_art', puzzlePayload: payload });
    if (metadata) {
      c.title.value = typeof metadata.title === 'string' ? metadata.title.slice(0, TITLE_MAX) : '';
      c.caption.value = typeof metadata.caption === 'string' ? metadata.caption.slice(0, CAPTION_MAX) : '';
      if (Number.isFinite(metadata.pin?.latitude) && Number.isFinite(metadata.pin?.longitude)) setPin({ latitude: metadata.pin.latitude, longitude: metadata.pin.longitude, source: metadata.pin.source || 'cell', label: String(metadata.pin.label || '').slice(0, 80) });
      if (typeof metadata.requestKey === 'string' && metadata.requestKey && metadata.requestFingerprint === await makeRequestFingerprint()) {
        state.requestKey = metadata.requestKey; state.requestFingerprint = metadata.requestFingerprint;
      }
    }
    puzzleRights.checked = false; syncComposer();
    persistPuzzleRetry();
    return Boolean(state.puzzle);
  }

  $(composer, '[data-close]').addEventListener('click', closeSheets);
  $(composer, '[data-pick-globe]').addEventListener('click', () => setPeek(true));
  $(composer, '[data-peek-done]').addEventListener('click', () => setPeek(false));
  c.drop.addEventListener('click', () => c.file.click());
  c.drop.addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); c.file.click(); } });
  $(composer, '[data-replace]').addEventListener('click', () => c.file.click());
  c.file.addEventListener('change', () => setImage(c.file.files?.[0]));
  c.title.addEventListener('input', () => { invalidateRequestKey(); syncComposer(); });
  c.caption.addEventListener('input', invalidateRequestKey);
  c.artMade.addEventListener('change', () => { persistPuzzleRetry(); syncComposer(); });
  puzzleRights.addEventListener('change', () => { persistPuzzleRetry(); syncComposer(); });

  let smartTimer = 0;
  c.smart.addEventListener('input', () => {
    clearTimeout(smartTimer);
    smartTimer = setTimeout(() => {
      const result = parseLocationInput(c.smart.value);
      if (result.reason === 'empty') { c.smartStatus.textContent = ''; c.smartStatus.dataset.state = ''; return; }
      if (result.ok) {
        setPin({ latitude: result.latitude, longitude: result.longitude, source: result.source === 'map-link' ? 'map-link' : 'coordinates' }, { fly: true });
        c.smartStatus.textContent = `読み取りました：${formatCoordinates(result.latitude, result.longitude)}`;
        c.smartStatus.dataset.state = 'ok';
      } else {
        c.smartStatus.textContent = result.message;
        c.smartStatus.dataset.state = 'error';
      }
    }, 180);
  });

  function requestCurrentLocation() {
    invalidateLocationRequest();
    const sequence = locationRequestSequence;
    if (!navigator.geolocation) {
      c.smartStatus.textContent = 'このブラウザでは現在地を使えません。'; c.smartStatus.dataset.state = 'error';
      return;
    }
    c.geolocate.disabled = true;
    c.smartStatus.textContent = '現在地の許可を確認しています…'; c.smartStatus.dataset.state = '';
    const isCurrent = () => sequence === locationRequestSequence && openSheet() === 'composer' && !state.done;
    navigator.geolocation.getCurrentPosition((position) => {
      if (!isCurrent()) return;
      const latitude = position.coords.latitude;
      const longitude = position.coords.longitude;
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
        c.geolocate.disabled = false;
        c.smartStatus.textContent = '現在地の座標を確認できませんでした。もう一度お試しください。'; c.smartStatus.dataset.state = 'error';
        return;
      }
      setPin({ latitude, longitude, source: 'geolocation' }, { fly: true });
      c.smartStatus.textContent = '現在地を選びました。内容を確認してから投稿してください。'; c.smartStatus.dataset.state = 'ok';
    }, (error) => {
      if (!isCurrent()) return;
      c.geolocate.disabled = false;
      const message = error?.code === 1 ? '現在地の利用が許可されませんでした。設定を確認するか、地球で選んでください。'
        : error?.code === 3 ? '現在地の確認が時間切れになりました。再試行するか、地球で選んでください。'
          : '現在地を取得できませんでした。再試行するか、地球で選んでください。';
      c.smartStatus.textContent = message; c.smartStatus.dataset.state = 'error';
    }, { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 });
  }
  c.geolocate.addEventListener('click', requestCurrentLocation);

  c.form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (c.submit.disabled || state.submitting) return;
    const user = currentUser();
    if (!user) { needLogin(() => c.form.requestSubmit()); return; }
    invalidateLocationRequest();
    state.submitting = true; syncComposer();
    try {
      const fingerprint = await makeRequestFingerprint();
      if (!state.requestKey || state.requestFingerprint !== fingerprint) { state.requestKey = crypto.randomUUID(); state.requestFingerprint = fingerprint; }
      persistPuzzleRetry();
      const record = await store.add({
        postKind: state.postKind,
        title: c.title.value.trim(),
        caption: c.caption.value.trim(),
        image: { dataUrl: state.image.dataUrl, mimeType: state.image.mimeType, size: state.image.size, width: state.image.width, height: state.image.height, colorCount: state.image.colorCount },
        pin: { latitude: state.pin.latitude, longitude: state.pin.longitude, cellId: state.pin.cellId, source: state.pin.source },
        author: { id: user.id, name: user.name }, requestKey: state.requestKey, puzzle: state.puzzle
      });
      state.puzzleHandoff?.onSuccess?.(); state.puzzleHandoff = null;
      state.done = record;
      c.doneImage.src = record.image.dataUrl;
      const display = fitPixelImage(record.image.width, record.image.height, 160, 160);
      c.doneImage.style.width = `${display.width}px`; c.doneImage.style.height = `${display.height}px`;
      c.doneText.textContent = record.status === 'pending'
        ? `「${record.title}」を受け付けました。確認後、このセルに表示されます。`
        : `「${record.title}」を ${formatCoordinates(record.pin.latitude, record.pin.longitude)} に置きました。`;
      $(composer, '[data-done-view]').textContent = record.status === 'pending' ? '地球儀へ戻る' : '地球で見る';
      c.form.hidden = true; c.done.hidden = false; hint.hidden = true;
      state.submitting = false; syncComposer();
      if (record.status !== 'pending') {
        flyTo(record.pin.latitude, record.pin.longitude, 6);
        refresh({ pop: record.id });
      }
    } catch (error) {
      state.submitting = false; syncComposer();
      say(error instanceof Error ? error.message : '置けませんでした。もう一度試してください。');
    }
  });

  $(composer, '[data-done-view]').addEventListener('click', () => {
    const id = state.done?.id;
    const pending = state.done?.status === 'pending';
    resetComposer();
    if (pending) closeSheets();
    else if (id) openViewer(id);
  });
  $(composer, '[data-done-again]').addEventListener('click', () => { resetComposer(); c.drop.focus({ preventScroll: true }); });

  // Drag & drop / paste anywhere on the stage.
  let dragDepth = 0;
  const hasFiles = (event) => [...(event.dataTransfer?.types || [])].includes('Files');
  stage.addEventListener('dragenter', (event) => { if (hasFiles(event)) { dragDepth += 1; stage.classList.add('is-dropping'); } });
  stage.addEventListener('dragleave', () => { dragDepth = Math.max(0, dragDepth - 1); if (!dragDepth) stage.classList.remove('is-dropping'); });
  stage.addEventListener('dragover', (event) => { if (hasFiles(event)) event.preventDefault(); });
  stage.addEventListener('drop', (event) => {
    dragDepth = 0; stage.classList.remove('is-dropping');
    if (!hasFiles(event)) return;
    event.preventDefault();
    const file = [...event.dataTransfer.files].find((item) => item.type.startsWith('image/'));
    if (!file) { say('画像ファイル（PNG / WebP）をドロップしてください。'); return; }
    if (openSheet() === 'composer' && !state.done) setImage(file); else openComposer({ file });
  });
  window.addEventListener('paste', (event) => {
    if (openSheet() !== 'composer' || state.done) return;
    const file = [...(event.clipboardData?.files || [])].find((item) => item.type.startsWith('image/'));
    if (file) { event.preventDefault(); setImage(file); }
  });

  // ---- login ------------------------------------------------------------------------------------
  const loginForm = $(modal, 'form');
  $(modal, '.post-modal__backdrop').addEventListener('click', () => { modal.hidden = true; state.pendingAfterLogin = null; });
  loginForm.addEventListener('submit', (event) => {
    event.preventDefault();
    try {
      auth.login($(modal, '[data-login-name]').value);
      modal.hidden = true;
      $(modal, '[data-login-error]').textContent = '';
      const next = state.pendingAfterLogin; state.pendingAfterLogin = null;
      say(`${currentUser().name} としてログインしました`);
      next?.();
    } catch (error) {
      $(modal, '[data-login-error]').textContent = error.message;
    }
  });

  function renderAccount() {
    if (!accountSlot) return;
    accountSlot.replaceChildren();
    const user = currentUser();
    if (user?.id === 'anonymous') return;
    if (user) {
      const name = el('span', 'account__name'); name.textContent = user.name;
      const out = el('button', 'account__button', { type: 'button' }); out.textContent = 'ログアウト';
      out.addEventListener('click', () => { auth.logout(); say('ログアウトしました'); });
      accountSlot.append(name, out);
    } else {
      const login = el('button', 'account__button account__button--primary', { type: 'button' }); login.textContent = 'ログイン';
      login.addEventListener('click', () => { modal.hidden = false; $(modal, '[data-login-name]').focus(); });
      accountSlot.append(login);
    }
  }

  // ---- viewer ---------------------------------------------------------------------------------
  const v = {
    image: $(viewer, '[data-v-image]'), title: $(viewer, '[data-v-title]'), caption: $(viewer, '[data-v-caption]'),
    author: $(viewer, '[data-v-author]'), date: $(viewer, '[data-v-date]'), coords: $(viewer, '[data-v-coords]'), puzzle: $(viewer, '[data-v-puzzle]'),
    map: $(viewer, '[data-v-map]'), del: $(viewer, '[data-v-delete]'), like: $(viewer, '[data-v-like]'), kicker: $(viewer, '[data-v-kicker]')
  };

  function openViewer(id, { fly = true } = {}) {
    const post = posts().find((item) => item.id === id);
    if (!post) return false;
    state.viewerId = id;
    const artBox = window.innerWidth < 680 ? 176 : 288;
    showSheet('viewer');
    const displayImage = (width, height) => {
      const display = fitPixelImage(width, height, artBox, artBox);
      v.image.style.width = `${display.width}px`; v.image.style.height = `${display.height}px`;
    };
    v.image.onload = () => {
      if (state.viewerId === id && v.image.naturalWidth > 0) displayImage(v.image.naturalWidth, v.image.naturalHeight);
    };
    displayImage(post.image.width, post.image.height);
    v.image.src = post.image.dataUrl;
    if (v.image.complete && v.image.naturalWidth > 0) displayImage(v.image.naturalWidth, v.image.naturalHeight);
    v.image.alt = post.title;
    v.title.textContent = post.title;
    v.caption.textContent = post.caption || '';
    v.caption.hidden = !post.caption;
    v.author.textContent = post.author?.name || '—';
    v.date.textContent = formatDate(post.createdAt);
    v.coords.textContent = formatCoordinates(post.pin.latitude, post.pin.longitude);
    v.map.href = googleMapsUrl(post.pin.latitude, post.pin.longitude);
    v.kicker.textContent = post.postKind === 'pixel_camera' ? 'ドット絵カメラ投稿' : (post.sample ? 'サンプル作品' : 'ドット絵作品');
    v.puzzle.hidden = !['spot_difference', 'hidden_object'].includes(post.puzzleMode) || !/^[0-9a-f-]{36}$/i.test(String(post.id));
    v.puzzle.href = v.puzzle.hidden ? '#' : `/play/${post.puzzleMode === 'hidden_object' ? 'hidden-object' : 'spot-difference'}/?postPuzzle=${encodeURIComponent(post.id)}`;
    v.puzzle.setAttribute('aria-label', post.puzzleMode === 'spot_difference' ? '間違い探しを遊ぶ' : 'もの探しを遊ぶ');
    v.del.hidden = !isMine(post) || !(store.canRemove === true || store.capabilities?.remove === true);
    v.del.textContent = '削除'; v.del.dataset.armed = '';
    v.like.hidden = post.likeable !== true || typeof store.setLike !== 'function' || typeof store.hasLiked !== 'function';
    v.like.disabled = false;
    const likeState = state.likeStates.get(id) || { confirmed: false, desired: false, running: false, loaded: false };
    state.likeStates.set(id, likeState);
    v.like.disabled = !likeState.loaded;
    syncLikeButton(likeState);
    if (!likeState.loaded && !likeState.loading && !likeState.loadError) requestLikeStatus(id, likeState);
    if (fly) flyTo(post.pin.latitude, post.pin.longitude, Math.min(view().zoom > 3 ? view().zoom : 3.2, 6));
    syncMarkerSelection();
    return true;
  }

  async function openLinkedPost(id) {
    if (!PUBLIC_POST_ID.test(String(id || ''))) return false;
    if (openViewer(id)) return true;
    if (!id.startsWith('showcase:') && typeof store.ensurePublishedById === 'function') {
      showSheet('gallery');
      say('作品を読み込んでいます。');
      try {
        if (await store.ensurePublishedById(id)) return openViewer(id);
      } catch {
        say('作品を読み込めませんでした。時間をおいて再試行してください。');
        return false;
      }
    }
    showSheet('gallery');
    renderGallery();
    say('この作品は現在公開されていません。');
    return false;
  }

  function stepViewer(direction) {
    const list = posts();
    const index = list.findIndex((item) => item.id === state.viewerId);
    if (index < 0 || list.length < 2) return;
    openViewer(list[(index + direction + list.length) % list.length].id);
  }

  $(viewer, '[data-close]').addEventListener('click', closeSheets);
  $(viewer, '[data-v-prev]').addEventListener('click', () => stepViewer(-1));
  $(viewer, '[data-v-next]').addEventListener('click', () => stepViewer(1));
  $(viewer, '[data-v-focus]').addEventListener('click', () => { const post = posts().find((item) => item.id === state.viewerId); if (post) flyTo(post.pin.latitude, post.pin.longitude, 8); });
  function syncLikeButton(likeState) {
    if (likeState.loadError) {
      v.like.textContent = '状態を読み込めません。再試行';
      v.like.setAttribute('aria-label', 'いいね状態を再読み込みする');
      v.like.removeAttribute('aria-pressed');
      return;
    }
    if (likeState.loading) {
      v.like.textContent = 'いいね状態を確認中…';
      v.like.setAttribute('aria-label', 'いいね状態を確認中');
      v.like.removeAttribute('aria-pressed');
      return;
    }
    v.like.setAttribute('aria-pressed', String(likeState.desired));
    v.like.textContent = likeState.running ? (likeState.desired ? '♥ 保存中…' : '♡ 取り消し中…') : (likeState.desired ? '♥ いいね済み' : '♡ いいね');
    v.like.setAttribute('aria-label', likeState.desired ? 'いいねを取り消す' : 'いいねする');
  }
  function requestLikeStatus(id, likeState) {
    if (likeState.loading || likeState.loaded) return;
    likeState.loadError = false;
    likeState.loading = true;
    if (state.viewerId === id) { v.like.disabled = true; syncLikeButton(likeState); }
    Promise.resolve().then(() => store.hasLiked(id)).then((liked) => {
      likeState.confirmed = Boolean(liked);
      if (!likeState.running) likeState.desired = likeState.confirmed;
      likeState.loaded = true;
    }).catch((error) => {
      likeState.loadError = true;
      if (state.viewerId === id) say(error?.message || 'いいね状態を読み込めませんでした。再試行できます。');
    }).finally(() => {
      likeState.loading = false;
      if (state.viewerId === id) { v.like.disabled = false; syncLikeButton(likeState); }
    });
  }
  v.like.addEventListener('click', () => {
    const id = state.viewerId;
    if (v.like.disabled) return;
    const post = posts().find((item) => item.id === id);
    if (!post?.likeable || typeof store.setLike !== 'function' || typeof store.hasLiked !== 'function') return;
    const likeState = state.likeStates.get(id) || { confirmed: false, desired: false, running: false, loaded: false };
    state.likeStates.set(id, likeState);
    if (likeState.loadError || !likeState.loaded) {
      requestLikeStatus(id, likeState);
      return;
    }
    likeState.desired = !likeState.desired;
    syncLikeButton(likeState);
    if (likeState.running) return;
    likeState.running = true;
    syncLikeButton(likeState);
    (async () => {
      try {
        while (likeState.confirmed !== likeState.desired) {
          const target = likeState.desired;
          await store.setLike(id, target);
          likeState.confirmed = target;
        }
      } catch (error) {
        likeState.desired = likeState.confirmed;
        say(error?.message || 'いいねを保存できませんでした。');
      } finally {
        likeState.running = false;
        if (state.viewerId === id) syncLikeButton(likeState);
      }
    })();
  });
  v.del.addEventListener('click', async () => {
    if (!(store.canRemove === true || store.capabilities?.remove === true) || typeof store.remove !== 'function') return;
    if (v.del.dataset.armed !== '1') {
      v.del.dataset.armed = '1'; v.del.textContent = '本当に削除する';
      clearTimeout(deleteTimer); deleteTimer = setTimeout(() => { v.del.dataset.armed = ''; v.del.textContent = '削除'; }, 3500);
      return;
    }
    const id = state.viewerId;
    await store.remove(id);
    closeSheets(); say('削除しました');
  });

  // ---- gallery ------------------------------------------------------------------------------
  const g = { grid: $(gallery, '[data-grid]'), empty: $(gallery, '[data-empty]'), tabs: gallery.querySelectorAll('[data-tab]') };
  function renderGallery() {
    const list = posts().filter((post) => state.tab === 'camera' ? post.postKind === 'pixel_camera' : post.postKind !== 'pixel_camera');
    g.grid.replaceChildren(...list.map((post) => {
      const cell = el('button', 'tile', { type: 'button', 'aria-label': post.title });
      const art = el('span', 'tile__art'); art.append(pixelImage(post));
      const label = el('span', 'tile__title'); label.textContent = post.title;
      const kind = el('span', 'tile__kind'); kind.textContent = post.postKind === 'pixel_camera' ? 'カメラ' : 'ドット絵';
      cell.append(art, label, kind);
      cell.addEventListener('click', () => openViewer(post.id));
      return cell;
    }));
    g.empty.hidden = list.length > 0;
    g.empty.textContent = state.tab === 'camera' ? 'カメラ投稿はまだありません。' : 'ドット絵作品はまだありません。';
    g.tabs.forEach((tab) => tab.setAttribute('aria-pressed', String(tab.dataset.tab === state.tab)));
    galleryButton.querySelector('.post-dock__count').textContent = String(posts().length);
  }
  g.tabs.forEach((tab) => tab.addEventListener('click', () => { state.tab = tab.dataset.tab; renderGallery(); }));
  $(gallery, '[data-close]').addEventListener('click', closeSheets);
  galleryButton.addEventListener('click', () => { if (openSheet() === 'gallery') closeSheets(); else { renderGallery(); showSheet('gallery'); } });
  composeButton.addEventListener('click', () => { if (openSheet() === 'composer') closeSheets(); else openComposer(); });

  // ---- pins on the globe ------------------------------------------------------------------
  function ensureMarker(post) {
    let marker = markers.get(post.id);
    if (marker) return marker;
    marker = el('button', 'pin', { type: 'button', 'data-id': post.id });
    marker.classList.toggle('pin--camera', post.postKind === 'pixel_camera');
    marker.append(pixelImage(post, 'pin__art'));
    const badge = el('span', 'pin__count', { hidden: true }); marker.append(badge);
    const label = el('span', 'pin__label'); label.textContent = post.postKind === 'pixel_camera' ? `カメラ · ${post.title}` : post.title; marker.append(label);
    marker.setAttribute('aria-label', post.postKind === 'pixel_camera' ? `ドット絵カメラ投稿：${post.title}` : `ドット絵作品：${post.title}`);
    marker.addEventListener('pointerdown', (event) => event.stopPropagation());
    marker.addEventListener('click', (event) => { event.stopPropagation(); openViewer(post.id, { fly: false }); });
    pinLayer.append(marker);
    markers.set(post.id, marker);
    return marker;
  }

  function positionDraftPin() {
    const snapshot = renderer.getSnapshot();
    if (!state.pin || composer.hidden || state.done || !snapshot.camera) { draftPin.hidden = true; return; }
    const point = projectGeoToScreen(state.pin.longitude, state.pin.latitude, snapshot.camera);
    draftPin.hidden = point.depth < PIN_VISIBLE_DEPTH;
    draftPin.style.transform = `translate(${point.x}px, ${point.y}px)`;
  }

  function syncMarkerSelection() {
    for (const [id, marker] of markers) marker.classList.toggle('is-selected', id === state.viewerId);
  }

  function refresh({ pop = '' } = {}) {
    const snapshot = renderer.getSnapshot();
    const camera = snapshot.camera;
    if (!camera) return;
    const list = posts();
    const live = new Set(list.map((post) => post.id));
    for (const [id, marker] of markers) if (!live.has(id)) { marker.remove(); markers.delete(id); }
    const zoom = snapshot.view.zoom;
    const size = zoom < 1.6 ? 22 : zoom < 4 ? 30 : zoom < 9 ? 42 : 56;
    const kept = [];
    const ordered = [...list].sort((a, b) => (a.id === state.viewerId ? -1 : b.id === state.viewerId ? 1 : 0));
    for (const post of ordered) {
      const marker = ensureMarker(post);
      const point = projectGeoToScreen(post.pin.longitude, post.pin.latitude, camera);
      if (point.depth < PIN_VISIBLE_DEPTH) { marker.hidden = true; continue; }
      const host = kept.find((item) => Math.hypot(item.x - point.x, item.y - point.y) < size * 0.86);
      if (host) { host.count += 1; marker.hidden = true; continue; }
      marker.hidden = false;
      marker.style.setProperty('--size', `${size}px`);
      marker.style.setProperty('--fade', String(clamp((point.depth - PIN_VISIBLE_DEPTH) / 0.22, 0, 1)));
      marker.style.transform = `translate(${point.x}px, ${point.y}px)`;
      marker.classList.toggle('is-mine', isMine(post));
      if (pop && post.id === pop) { marker.classList.remove('is-pop'); void marker.offsetWidth; marker.classList.add('is-pop'); }
      kept.push({ x: point.x, y: point.y, count: 1, marker });
    }
    for (const item of kept) {
      const badge = item.marker.querySelector('.pin__count');
      badge.hidden = item.count < 2;
      badge.textContent = item.count > 99 ? '99+' : String(item.count);
    }
    positionDraftPin();
  }

  // ---- wiring -------------------------------------------------------------------------------
  store.subscribe(() => { refresh(); if (!gallery.hidden) renderGallery(); else galleryButton.querySelector('.post-dock__count').textContent = String(posts().length); });
  auth.subscribe(() => { renderAccount(); refresh(); if (!gallery.hidden) renderGallery(); if (!viewer.hidden) openViewer(state.viewerId, { fly: false }); });
  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') { if (!modal.hidden) { modal.hidden = true; state.pendingAfterLogin = null; } else closeSheets(); return; }
    if (openSheet() === 'viewer' && !/INPUT|TEXTAREA|SELECT/.test(event.target?.tagName || '')) {
      if (event.key === 'ArrowLeft') stepViewer(-1);
      if (event.key === 'ArrowRight') stepViewer(1);
    }
  });
  new ResizeObserver(() => refresh()).observe(stage);
  renderAccount();
  syncComposer();
  store.ready.then(() => { refresh(); renderGallery(); });
  refresh();

  return {
    refresh,
    /** Called with every globe pick. Returns true when the pick was used to move the draft pin. */
    handlePick(selection) {
      if (openSheet() !== 'composer' || state.done) return false;
      if (!selection) return true;
      const pin = pinFromSelection(selection);
      if (pin) { setPin(pin); c.smart.value = ''; c.smartStatus.textContent = ''; if (composer.classList.contains('is-peek')) setPeek(false); }
      return true;
    },
    openComposer,
    openPuzzleComposer,
    openViewer,
    openLinkedPost,
    close: closeSheets,
    store,
    auth,
    getState: () => ({ sheet: openSheet(), pin: state.pin, image: Boolean(state.image), posts: posts().length, user: currentUser() }),
    setImageFile: setImage,
    setPin,
    setTitle(text) { c.title.value = text; syncComposer(); }
  };
}
