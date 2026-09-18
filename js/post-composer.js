import { supabaseConfig } from '../data/site-config.js?rev=20260918-post-v1';

const SESSION_KEY = 'PiXiEED:supabase-session:v1';
const MAX_BYTES = 512 * 1024;
const MIN_PIXELS = 8;
const MAX_PIXELS = 128;
const MAX_COLORS = 512;
const ALLOWED_MIME = new Set(['image/png', 'image/webp']);

function readStoredSession() {
  try {
    const session = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null');
    return session?.access_token ? session : null;
  } catch {
    return null;
  }
}

function storeSession(session) {
  try {
    if (session?.access_token) localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    else localStorage.removeItem(SESSION_KEY);
  } catch {
    // セッションを保存できない環境でも、現在の投稿だけは続行できる。
  }
}

function isConfigured() {
  return Boolean(String(supabaseConfig.url || '').trim() && String(supabaseConfig.publishableKey || '').trim());
}

function supabaseHeaders(token = '') {
  const key = String(supabaseConfig.publishableKey || '').trim();
  return {
    apikey: key,
    Authorization: `Bearer ${token || key}`,
    'Content-Type': 'application/json',
    Accept: 'application/json'
  };
}

async function readError(response) {
  try {
    const payload = await response.json();
    return String(payload?.error_description || payload?.msg || payload?.message || payload?.error || '接続に失敗しました。');
  } catch {
    return '接続に失敗しました。';
  }
}

async function refreshSession(session) {
  if (!session?.refresh_token) return null;
  const endpoint = `${String(supabaseConfig.url).replace(/\/$/, '')}/auth/v1/token?grant_type=refresh_token`;
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: supabaseHeaders(),
    body: JSON.stringify({ refresh_token: session.refresh_token })
  });
  if (!response.ok) return null;
  const next = await response.json();
  storeSession(next);
  return next;
}

async function ensureAnonymousSession() {
  if (!isConfigured()) throw new Error('投稿機能の接続設定がまだありません。');
  const current = readStoredSession();
  const expiresAt = Number(current?.expires_at || 0) * 1000;
  if (current?.access_token && (!expiresAt || expiresAt > Date.now() + 30_000)) return current;
  const refreshed = await refreshSession(current);
  if (refreshed?.access_token) return refreshed;
  const endpoint = `${String(supabaseConfig.url).replace(/\/$/, '')}/auth/v1/signup`;
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: supabaseHeaders(),
    body: JSON.stringify({ data: { app: 'pixieed', mode: 'anonymous-posting' } })
  });
  if (!response.ok) throw new Error(await readError(response));
  const session = await response.json();
  if (!session?.access_token) throw new Error('匿名セッションを開始できませんでした。');
  storeSession(session);
  return session;
}

function fileToBase64(file) {
  return file.arrayBuffer().then((buffer) => {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    const chunkSize = 0x8000;
    for (let index = 0; index < bytes.length; index += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
    }
    return btoa(binary);
  });
}

async function inspectPixelImage(file) {
  if (!(file instanceof File)) throw new Error('画像を選んでください。');
  if (!ALLOWED_MIME.has(file.type)) throw new Error('PNGまたはWebPのドット絵を選んでください。');
  if (file.size > MAX_BYTES) throw new Error('画像は512KB以内にしてください。');
  if (typeof window.createImageBitmap !== 'function') throw new Error('このブラウザでは画像を確認できません。');
  const bitmap = await window.createImageBitmap(file);
  try {
    if (bitmap.width < MIN_PIXELS || bitmap.height < MIN_PIXELS || bitmap.width > MAX_PIXELS || bitmap.height > MAX_PIXELS) {
      throw new Error(`画像サイズは${MIN_PIXELS}〜${MAX_PIXELS}pxにしてください。`);
    }
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('画像を読み込めませんでした。');
    context.imageSmoothingEnabled = false;
    context.drawImage(bitmap, 0, 0);
    const pixels = context.getImageData(0, 0, bitmap.width, bitmap.height).data;
    const colors = new Set();
    for (let index = 0; index < pixels.length; index += 4) {
      colors.add(`${pixels[index]},${pixels[index + 1]},${pixels[index + 2]},${pixels[index + 3]}`);
      if (colors.size > MAX_COLORS) break;
    }
    if (colors.size > MAX_COLORS) throw new Error(`色数が多すぎます。${MAX_COLORS}色以内のドット絵にしてください。`);
    return {
      width: bitmap.width,
      height: bitmap.height,
      colorCount: colors.size,
      base64: await fileToBase64(file)
    };
  } finally {
    bitmap.close();
  }
}

function makeLocationContext(cell) {
  if (!cell) return null;
  const grid = Number(cell.dataset.cellGrid || String(cell.dataset.cellKey || '').split(':')[0]);
  const x = Number(cell.dataset.cellX);
  const y = Number(cell.dataset.cellY);
  const prefectureCode = String(cell.dataset.prefectureCode || '').padStart(2, '0');
  if (![64, 128, 256, 512].includes(grid) || !Number.isInteger(x) || !Number.isInteger(y) || !prefectureCode) return null;
  return { grid, x, y, prefectureCode, label: cell.getAttribute('aria-label') || '' };
}

export function bindUserPostComposer(root, options = {}) {
  if (!root) return null;
  const panel = document.createElement('aside');
  panel.className = 'map-post-drawer';
  panel.hidden = true;
  panel.setAttribute('aria-label', 'ドット絵を投稿');
  panel.innerHTML = `
    <button class="map-post-drawer__backdrop" type="button" data-post-backdrop aria-label="投稿パネルを閉じる"></button>
    <section class="map-post-drawer__panel" role="dialog" aria-modal="true" aria-labelledby="map-post-title">
      <div class="map-post-drawer__head"><div><span class="eyebrow">user post</span><h2 id="map-post-title">地図に絵を置く</h2></div><button class="map-post-drawer__close" type="button" data-post-close aria-label="投稿パネルを閉じる">×</button></div>
      <p class="map-post-drawer__lead">小さなドット絵と場所を選ぶと、確認後にそのセルへ表示されます。</p>
      <form class="map-post-form" data-post-form novalidate>
        <label class="map-post-form__file"><span>作品画像</span><input type="file" accept="image/png,image/webp" data-post-file required><small>PNG / WebP・8〜128px・512KB以内</small></label>
        <div class="map-post-form__preview" data-post-preview hidden><img data-post-preview-image alt="選択したドット絵のプレビュー"><span data-post-image-meta></span></div>
        <label><span>作品名</span><input type="text" maxlength="60" placeholder="作品の名前" data-post-title required></label>
        <label><span>ひとこと <small>任意</small></span><textarea rows="3" maxlength="180" placeholder="この場所に置いた理由など" data-post-caption></textarea></label>
        <section class="map-post-location" aria-labelledby="map-post-location-title"><div class="map-post-location__head"><strong id="map-post-location-title">置く場所</strong><span data-post-location-state>未選択</span></div><p data-post-location-summary>地図のセルを選ぶか、現在地を使えます。</p><div class="map-post-location__actions"><button class="button button--quiet" type="button" data-post-map-location>地図から選ぶ</button><button class="button button--quiet" type="button" data-post-current-location>現在地を使う</button></div></section>
        <p class="map-post-form__status" data-post-status role="status" aria-live="polite"></p>
        <button class="button button--primary map-post-form__submit" type="submit" data-post-submit disabled>投稿を送る</button>
      </form>
    </section>`;
  root.append(panel);

  const form = panel.querySelector('[data-post-form]');
  const fileInput = panel.querySelector('[data-post-file]');
  const preview = panel.querySelector('[data-post-preview]');
  const previewImage = panel.querySelector('[data-post-preview-image]');
  const imageMeta = panel.querySelector('[data-post-image-meta]');
  const titleInput = panel.querySelector('[data-post-title]');
  const captionInput = panel.querySelector('[data-post-caption]');
  const locationSummary = panel.querySelector('[data-post-location-summary]');
  const locationState = panel.querySelector('[data-post-location-state]');
  const status = panel.querySelector('[data-post-status]');
  const submit = panel.querySelector('[data-post-submit]');
  const currentLocationButton = panel.querySelector('[data-post-current-location]');
  const mapLocationButton = panel.querySelector('[data-post-map-location]');
  let state = { mapCell: null, device: null, file: null, meta: null, objectUrl: '', submitted: false };
  let returnFocus = null;

  const setStatus = (message, kind = '') => {
    if (!status) return;
    status.textContent = message;
    status.dataset.state = kind;
  };
  const syncLocation = () => {
    const hasCell = Boolean(state.mapCell);
    const hasDevice = Boolean(state.device);
    if (locationState) locationState.textContent = hasCell || hasDevice ? '選択済み' : '未選択';
    if (locationSummary) {
      if (hasCell && hasDevice) locationSummary.textContent = `${state.mapCell.label || '地図のセル'} / 現在地も保存`;
      else if (hasCell) locationSummary.textContent = `${state.mapCell.label || '地図のセル'}（公開位置はセルに丸めます）`;
      else if (hasDevice) locationSummary.textContent = `現在地を取得しました（精度 約${Math.round(state.device.accuracy || 0)}m）`;
      else locationSummary.textContent = '地図のセルを選ぶか、現在地を使えます。';
    }
  };
  const syncSubmit = () => {
    const complete = Boolean(state.meta && titleInput?.value.trim() && (state.mapCell || state.device));
    if (submit) submit.disabled = !complete || state.submitted;
  };
  const clearPreview = () => {
    if (state.objectUrl) URL.revokeObjectURL(state.objectUrl);
    state.objectUrl = '';
    if (previewImage) previewImage.removeAttribute('src');
    if (imageMeta) imageMeta.textContent = '';
    if (preview) preview.hidden = true;
  };
  const close = ({ restoreFocus = true } = {}) => {
    panel.hidden = true;
    root.dataset.postOpen = 'false';
    document.body.classList.remove('is-post-drawer-open');
    if (restoreFocus && returnFocus instanceof HTMLElement) returnFocus.focus({ preventScroll: true });
  };
  const open = (context = {}) => {
    returnFocus = context.returnFocus || document.activeElement;
    clearPreview();
    state = { mapCell: context.cell ? makeLocationContext(context.cell) : (context.mapCell || null), device: null, file: null, meta: null, objectUrl: '', submitted: false };
    form?.reset();
    setStatus(isConfigured() ? '' : '接続準備中です。設定後に投稿を送信できます。', isConfigured() ? '' : 'pending');
    syncLocation();
    syncSubmit();
    panel.hidden = false;
    root.dataset.postOpen = 'true';
    document.body.classList.add('is-post-drawer-open');
    window.requestAnimationFrame(() => titleInput?.focus({ preventScroll: true }));
  };

  panel.querySelector('[data-post-close]')?.addEventListener('click', () => close());
  panel.querySelector('[data-post-backdrop]')?.addEventListener('click', () => close());
  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !panel.hidden) close();
  });
  fileInput?.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    state.file = null;
    state.meta = null;
    clearPreview();
    if (!file) return syncSubmit();
    setStatus('画像を確認しています…', 'working');
    try {
      const meta = await inspectPixelImage(file);
      state.file = file;
      state.meta = meta;
      state.objectUrl = URL.createObjectURL(file);
      if (previewImage) previewImage.src = state.objectUrl;
      if (imageMeta) imageMeta.textContent = `${meta.width}×${meta.height}px・${meta.colorCount}色`;
      if (preview) preview.hidden = false;
      setStatus('ドット絵として受け付けられるサイズです。', 'ok');
    } catch (error) {
      fileInput.value = '';
      setStatus(error instanceof Error ? error.message : '画像を確認できませんでした。', 'error');
    }
    syncSubmit();
  });
  titleInput?.addEventListener('input', syncSubmit);
  mapLocationButton?.addEventListener('click', () => {
    close({ restoreFocus: false });
    setStatus('');
    options.onRequestMapCell?.();
  });
  currentLocationButton?.addEventListener('click', () => {
    if (!navigator.geolocation) {
      setStatus('この端末では現在地を取得できません。地図からセルを選んでください。', 'error');
      return;
    }
    currentLocationButton.disabled = true;
    setStatus('現在地を確認しています…', 'working');
    navigator.geolocation.getCurrentPosition((position) => {
      state.device = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy: position.coords.accuracy
      };
      currentLocationButton.disabled = false;
      setStatus('現在地を取得しました。正確な座標は公開せず、確認用に保管します。', 'ok');
      syncLocation();
      syncSubmit();
    }, () => {
      currentLocationButton.disabled = false;
      setStatus('現在地を取得できませんでした。ブラウザの許可を確認するか、地図から選んでください。', 'error');
    }, { enableHighAccuracy: false, maximumAge: 60_000, timeout: 8_000 });
  });
  form?.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!state.file || !state.meta || !titleInput?.value.trim() || (!state.mapCell && !state.device)) return;
    if (!isConfigured()) {
      setStatus('投稿接続が未設定です。Supabaseの公開設定を入れるまで送信されません。', 'pending');
      return;
    }
    submit.disabled = true;
    setStatus('投稿を送っています…', 'working');
    try {
      const session = await ensureAnonymousSession();
      const endpoint = `${String(supabaseConfig.url).replace(/\/$/, '')}/functions/v1/${encodeURIComponent(supabaseConfig.createPostFunction || 'create-post')}`;
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { ...supabaseHeaders(session.access_token), Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({
          title: titleInput.value.trim(),
          caption: captionInput?.value.trim() || '',
          image: { mimeType: state.file.type, size: state.file.size, width: state.meta.width, height: state.meta.height, colorCount: state.meta.colorCount, base64: state.meta.base64 },
          location: { mapCell: state.mapCell, device: state.device }
        })
      });
      if (!response.ok) throw new Error(await readError(response));
      state.submitted = true;
      setStatus('受け付けました。確認が終わると地図のセルに表示されます。', 'ok');
      options.onSubmitted?.();
    } catch (error) {
      submit.disabled = false;
      setStatus(error instanceof Error ? error.message : '投稿できませんでした。時間をおいて試してください。', 'error');
    }
  });

  return {
    open,
    close,
    isOpen: () => !panel.hidden,
    makeLocationContext
  };
}
