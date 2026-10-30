import { displayAdConfig } from '../../data/site-config.js?rev=20261008-map-detail-1';
import { getAdsenseLoader } from '../display-ads.mjs?rev=20261024-public-layout-1';

const mounted = new WeakMap();
const paths = new Set(['/tools/start/convert/', '/output/work/']);
const allowedQuery = new Map([['mode', new Set(['convert'])], ['text', new Set(['input', 'output'])]]);

/** Google's unfill-optimized preserves the unit, but is not a filled advertising creative.
 * https://support.google.com/adsense/answer/10762946
 */
export function conversionAdDeliveryState(status) {
  return ['filled', 'unfilled', 'unfill-optimized'].includes(status) ? status : 'pending';
}
const preservesUnit = unit => ['filled', 'unfill-optimized'].includes(conversionAdDeliveryState(unit?.dataset.adStatus));

/** Private handoffs and arbitrary query data never become advertising URLs. */
export function conversionAdEligible({ origin, pathname, search = '', hash = '', topLevel = false } = {}) {
  if (!topLevel || !['https://pixieed.jp', 'https://www.pixieed.jp'].includes(origin)
      || !paths.has(pathname) || (hash && hash !== '#main')) return false;
  const query = new URLSearchParams(search);
  for (const key of query.keys()) {
    if (query.getAll(key).length !== 1 || !allowedQuery.get(key)?.has(query.get(key))) return false;
  }
  return true;
}

/** Keep the converter's existing width. A rail is used only in genuinely spare space. */
export function conversionAdLayout({ viewportWidth, viewportHeight, mainRight, frozenSize = null } = {}) {
  if (![viewportWidth, viewportHeight, mainRight].every(Number.isFinite)) return null;
  const spare = viewportWidth - 24 - mainRight - 48;
  const width = frozenSize?.width || (spare >= 300 ? 300 : spare >= 160 && viewportHeight >= 900 ? 160 : viewportWidth < 340 ? 250 : 300);
  const height = frozenSize?.height || (spare >= width && viewportHeight >= 900 ? 600 : 250);
  return { width, height, rail: spare >= width, left: mainRight + 48 };
}

const guideMarkup = `
  <header><p class="conversion-companion__eyebrow">形式と保存のヒント</p><h2>仕上がりに合う形式を選ぶ</h2></header>
  <div class="conversion-companion__intro"><h3>写真と透過画像</h3><p>透過を残す画像にはPNG、透過が不要な写真にはJPEGが候補です。JPEGでは透明部分を保持できません。背景色と画像サイズを確認してから保存してください。</p></div>
  <aside class="conversion-display-ad" aria-label="広告" hidden>
    <span class="conversion-display-ad__label">広告</span><div class="conversion-display-ad__slot"></div>
  </aside>
  <div class="conversion-companion__more">
    <section><h3>容量と大きさ</h3><p>画像の幅・高さを小さくすると、画素数を減らせます。縦横比を保つと形のゆがみを避けられます。JPEGは画質を下げると細部が失われるため、プレビューと用途を見て調整してください。</p></section>
    <section><h3>文字アートと復元コード</h3><p>ASCII・点字・絵文字などのアートは、画像の見え方を文字で表現します。文字アートだけでは元画像へ完全には戻せません。元のファイルを戻したい場合は復元コードを使います。復元コードやBase64は暗号化ではなく、元のファイルより大きくなる場合があります。</p></section>
    <section><h3>動きと音声</h3><p>アニメーションを静止画にすると動きは残りません。動画・音声の対応形式はブラウザーによって異なります。選べる形式で出力し、利用先でも再生できるか確認してください。</p></section>
    <section><h3>共有前の確認</h3><p>復元コードには元ファイルの情報が含まれます。位置情報や編集情報など、相手に渡してよい内容か確認してください。ダウンロード開始の表示と、端末への保存完了は異なります。保存先はブラウザーのダウンロード一覧で確認できます。</p></section>
  </div>`;

/** One ordinary, non-sticky display unit. Never listens to export or preview completion. */
export function mountConversionDisplayAd({ doc = globalThis.document, win = globalThis.window,
  config = displayAdConfig, load = getAdsenseLoader } = {}) {
  if (!doc || !win) return null;
  const eligible = () => conversionAdEligible({ ...win.location, origin: win.location.origin,
    pathname: win.location.pathname, search: win.location.search, hash: win.location.hash,
    topLevel: win.top === win.self });
  const main = doc.querySelector('main#main');
  if (!eligible() || !main || main.querySelector('[role="alert"]') || mounted.has(doc)) return mounted.get(doc) || null;
  const client = config?.client, slot = config?.slots?.tools;
  if (config?.enabled === false || !/^ca-pub-\d{16}$/.test(client || '') || !/^\d{6,20}$/.test(String(slot || ''))) return null;
  const sheet = doc.createElement('link'); sheet.rel = 'stylesheet';
  sheet.href = '/css/conversion-display-ad.css?rev=20261030-converter-ads-1';
  doc.head.append(sheet);
  const wrapper = doc.createElement('div'); wrapper.className = 'conversion-ad-layout';
  main.before(wrapper); wrapper.append(main);
  const guide = doc.createElement('section'); guide.className = 'conversion-companion';
  guide.setAttribute('aria-label', '変換と保存のガイド'); guide.innerHTML = guideMarkup; wrapper.append(guide);
  const host = guide.querySelector('.conversion-display-ad'), inner = host.querySelector('.conversion-display-ad__slot');
  const unit = doc.createElement('ins'); unit.className = 'adsbygoogle conversion-display-ad__unit';
  unit.dataset.adClient = client; unit.dataset.adSlot = String(slot);
  // Fixed CSS sizes are Google's documented responsive-code variant. No auto expansion.
  unit.dataset.fullWidthResponsive = 'false'; inner.append(unit);
  let requested = false, disposed = false, styled = false, failed = false, frozenSize = null;
  let frame = 0, idle = null, loader, layout;
  const report = (state, reason = '') => {
    host.dataset.adState = state;
    if (reason) host.dataset.adReason = reason;
    else delete host.dataset.adReason;
    doc.dispatchEvent(new win.CustomEvent('pixieed:conversion-ad', {
      detail: { state, reason, layout: layout?.rail ? 'rail' : 'flow', width: layout?.width, height: layout?.height }
    })); // Local diagnostic event only. No filenames, source media or URL parameters.
  };
  const contextReady = () => eligible() && doc.visibilityState !== 'hidden' && !doc.fullscreenElement
    && !main.querySelector('[role="alert"]') && main.getAttribute('aria-busy') !== 'true'
    && !main.querySelector('[aria-busy="true"], [data-tx-live-state="queued"], [data-tx-live-state="rendering"]')
    && !doc.querySelector('dialog[open], .tool-embed--expanded')
    && !main.querySelector('input:focus, textarea:focus, select:focus, [contenteditable="true"]:focus');
  const near = () => {
    const r = unit.getBoundingClientRect();
    const dock = doc.querySelector('.sc-export-status, .public-destination-nav')?.getBoundingClientRect();
    const bottom = dock ? Math.min(win.innerHeight, dock.top - 48) : win.innerHeight;
    return r.width > 0 && r.height > 0 && r.top < bottom - 100 && r.bottom > 0;
  };
  const collapseEmptyBelowView = () => {
    if (!failed || preservesUnit(unit)) return;
    // Never move content while a finger is on the visible area; don't collapse above it either.
    if (host.getBoundingClientRect().top >= win.innerHeight) { host.hidden = true; report('empty', host.dataset.adReason); }
  };
  const markFailed = (reason = 'no-ad-returned') => {
    if (preservesUnit(unit)) return;
    failed = true;
    report(reason === 'no-ad-returned' ? 'unfilled' : 'error', reason);
    collapseEmptyBelowView();
  };
  const onScriptError = () => markFailed('script-load-error');
  function update() {
    frame = 0; if (disposed || !styled) return;
    const rect = main.getBoundingClientRect(), wrap = wrapper.getBoundingClientRect();
    layout = conversionAdLayout({ viewportWidth: doc.documentElement.clientWidth,
      viewportHeight: win.innerHeight, mainRight: rect.right, frozenSize });
    if (!layout) return;
    if (!requested) {
      unit.style.display = 'block'; unit.style.width = `${layout.width}px`; unit.style.height = `${layout.height}px`;
    }
    wrapper.dataset.adLayout = layout.rail ? 'rail' : 'flow';
    wrapper.style.setProperty('--conversion-rail-left', `${layout.left - wrap.left}px`);
    wrapper.style.setProperty('--conversion-ad-width', `${layout.width}px`);
    wrapper.style.setProperty('--conversion-ad-height', `${layout.height}px`);
    // Absolute rail never narrows the editor, and its full document height remains scrollable.
    wrapper.style.minHeight = layout.rail ? `${guide.offsetHeight + 24}px` : '';
    if (!requested) { host.hidden = false; report('ready'); }
    collapseEmptyBelowView();
    if (!requested && idle === null && contextReady() && near()) {
      const request = () => {
        idle = null;
        if (disposed || requested || !styled || !host.isConnected || host.hidden || !contextReady() || !near()) return;
        requested = true; frozenSize = { width: layout.width, height: layout.height }; report('requested');
        try {
          loader = load(doc, win, client);
          if (loader.failed) { onScriptError(); return; }
          loader.errors.add(onScriptError);
          (win.adsbygoogle = win.adsbygoogle || []).push({});
        } catch { markFailed('request-error'); }
      };
      idle = win.requestIdleCallback ? win.requestIdleCallback(request, { timeout: 1500 }) : win.setTimeout(request, 120);
    }
  }
  function schedule() { if (!disposed && !frame) frame = win.requestAnimationFrame(update); }
  sheet.addEventListener('load', () => { styled = true; schedule(); }, { once: true });
  sheet.addEventListener('error', () => { host.hidden = true; report('stylesheet-failed', 'stylesheet-load-error'); }, { once: true });
  const statusObserver = new win.MutationObserver(() => {
    const state = conversionAdDeliveryState(unit.dataset.adStatus);
    if (state === 'filled' || state === 'unfill-optimized') {
      failed = false; host.hidden = false; report(state);
    } else if (state === 'unfilled') markFailed();
  });
  statusObserver.observe(unit, { attributes: true, attributeFilter: ['data-ad-status'] });
  const stateObserver = new win.MutationObserver(schedule);
  stateObserver.observe(main, { attributes: true, subtree: true, attributeFilter: ['aria-busy', 'data-tx-live-state'] });
  const resizeObserver = win.ResizeObserver ? new win.ResizeObserver(schedule) : null;
  resizeObserver?.observe(main); resizeObserver?.observe(guide);
  const intersection = win.IntersectionObserver ? new win.IntersectionObserver(schedule) : null;
  intersection?.observe(host);
  for (const type of ['resize', 'scroll', 'pageshow']) win.addEventListener(type, schedule, { passive: true });
  for (const type of ['visibilitychange', 'fullscreenchange', 'focusout']) doc.addEventListener(type, schedule);
  const onHide = event => { if (!event.persisted) cleanup(); };
  win.addEventListener('pagehide', onHide);
  function cleanup() {
    if (disposed) return; disposed = true;
    win.cancelAnimationFrame(frame);
    if (idle !== null) { if (win.cancelIdleCallback) win.cancelIdleCallback(idle); else win.clearTimeout(idle); }
    statusObserver.disconnect(); stateObserver.disconnect(); resizeObserver?.disconnect(); intersection?.disconnect();
    loader?.errors.delete(onScriptError);
    for (const type of ['resize', 'scroll', 'pageshow']) win.removeEventListener(type, schedule);
    for (const type of ['visibilitychange', 'fullscreenchange', 'focusout']) doc.removeEventListener(type, schedule);
    win.removeEventListener('pagehide', onHide);
  }
  const result = { cleanup, get requested() { return requested; } };
  mounted.set(doc, result); return result;
}
