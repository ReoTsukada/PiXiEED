import { displayAdConfig } from '../../data/site-config.js?rev=20261008-map-detail-1';
import { getAdsenseLoader } from '../display-ads.mjs?rev=20261030-event-inline-ads-1';

const mounted = new WeakMap();
const paths = new Set(['/tools/start/convert/', '/output/work/']);
const allowedQuery = new Map([['mode', new Set(['convert'])], ['text', new Set(['input', 'output'])]]);

/** Preserve Google's optimized empty unit without reporting it as a paid creative. */
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

// Essential geometry is available synchronously, even when the decorative CSS is
// cached, slow or unavailable. The ad unit itself also has explicit inline dimensions.
const criticalLayout = `
.conversion-ad-layout{position:relative;width:100%;min-width:0}
.conversion-companion{box-sizing:border-box;width:min(920px,calc(100% - 32px));margin:32px auto 0;padding:24px 0 max(180px,calc(120px + env(safe-area-inset-bottom)))}
.conversion-display-ad{box-sizing:content-box;width:var(--conversion-ad-width,300px);margin:48px auto;padding:0;border:0}
.conversion-display-ad[hidden]{display:none!important}
.conversion-display-ad__label{display:block;height:24px;font:11px/24px system-ui,sans-serif;text-align:center}
.conversion-display-ad__slot,.conversion-display-ad__unit{display:block;box-sizing:content-box;width:var(--conversion-ad-width,300px);height:var(--conversion-ad-height,250px);margin:0;padding:0;border:0}
.conversion-ad-layout[data-ad-layout="rail"] .conversion-companion{position:absolute;top:24px;left:var(--conversion-rail-left);width:var(--conversion-ad-width);margin:0;padding:0 0 180px;border:0}
.conversion-ad-layout[data-ad-layout="rail"] .conversion-companion__intro{display:none}
.conversion-ad-layout[data-ad-layout="rail"] .conversion-display-ad{margin:24px 0 48px}`;

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

/** One normal asynchronous manual unit, requested once without waiting for editor
 * focus, preview idleness, scroll position or a secondary stylesheet load event.
 * No refresh, automatic advertising, overlay, export listener or consent override.
 */
export function mountConversionDisplayAd({ doc = globalThis.document, win = globalThis.window,
  config = displayAdConfig, load = getAdsenseLoader } = {}) {
  if (!doc || !win) return null;
  const eligible = () => conversionAdEligible({ origin: win.location.origin,
    pathname: win.location.pathname, search: win.location.search, hash: win.location.hash,
    topLevel: win.top === win.self });
  const main = doc.querySelector('main#main');
  const errorOnly = () => Boolean(main?.querySelector('[role="alert"]'))
    && !main.querySelector('#output-start,#output-layout,[data-editor]');
  if (!eligible() || !main || errorOnly() || mounted.has(doc)) return mounted.get(doc) || null;
  const client = config?.client, slot = String(config?.slots?.tools || '').trim();
  if (config?.enabled === false || !/^ca-pub-\d{16}$/.test(client || '') || !/^\d{6,20}$/.test(slot)) return null;
  const fallback = doc.createElement('style'); fallback.dataset.conversionAdLayout = '';
  fallback.textContent = criticalLayout; doc.head.append(fallback);
  const sheet = doc.createElement('link'); sheet.rel = 'stylesheet';
  sheet.href = '/css/conversion-display-ad.css?rev=20261030-converter-ads-1';
  const wrapper = doc.createElement('div'); wrapper.className = 'conversion-ad-layout';
  // Reparenting the workspace can blur an input while the user is typing.
  const focused = main.contains(doc.activeElement) ? doc.activeElement : null;
  let selection = null;
  try {
    if (focused && typeof focused.selectionStart === 'number')
      selection = [focused.selectionStart, focused.selectionEnd, focused.selectionDirection];
  } catch { /* Non-text controls have no text selection. */ }
  main.before(wrapper); wrapper.append(main);
  if (focused && doc.activeElement !== focused) {
    focused.focus({ preventScroll: true });
    if (selection) focused.setSelectionRange(...selection);
  }
  const guide = doc.createElement('section'); guide.className = 'conversion-companion';
  guide.setAttribute('aria-label', '変換と保存のガイド'); guide.innerHTML = guideMarkup; wrapper.append(guide);
  const host = guide.querySelector('.conversion-display-ad'), inner = host.querySelector('.conversion-display-ad__slot');
  const unit = doc.createElement('ins'); unit.className = 'adsbygoogle conversion-display-ad__unit';
  unit.dataset.adClient = client; unit.dataset.adSlot = slot;
  unit.dataset.fullWidthResponsive = 'false'; inner.append(unit);
  let requested = false, disposed = false, failed = false, frozenSize = null;
  let frame = 0, idle = null, loader, layout;
  const report = (state, reason = '') => {
    host.dataset.adState = state;
    if (reason) host.dataset.adReason = reason;
    else delete host.dataset.adReason;
    doc.dispatchEvent(new win.CustomEvent('pixieed:conversion-ad', {
      detail: { state, reason, layout: layout?.rail ? 'rail' : 'flow', width: layout?.width, height: layout?.height }
    })); // Local diagnostic only: no filenames, source media or query data.
  };
  const requestBlocker = () => {
    if (!eligible()) return 'private-route';
    if (doc.visibilityState === 'hidden') return 'document-hidden';
    if (doc.fullscreenElement || doc.querySelector('dialog[open], .tool-embed--expanded')) return 'overlay-open';
    if (errorOnly()) return 'error-page';
    if (!host.isConnected || host.hidden) return 'container-hidden';
    const rect = unit.getBoundingClientRect(), css = win.getComputedStyle(unit);
    if (rect.width <= 0 || rect.height <= 0 || !unit.getClientRects().length
        || ['hidden', 'collapse'].includes(css.visibility)) return 'waiting-for-layout';
    return '';
  };
  const collapseEmptyBelowView = () => {
    if (!failed || preservesUnit(unit)) return;
    if (host.getBoundingClientRect().top >= win.innerHeight) { host.hidden = true; report('empty', host.dataset.adReason); }
  };
  const markFailed = (reason = 'no-ad-returned') => {
    if (preservesUnit(unit)) return;
    failed = true; report(reason === 'no-ad-returned' ? 'unfilled' : 'error', reason);
    collapseEmptyBelowView();
  };
  const onScriptError = () => markFailed('script-load-error');
  function update() {
    frame = 0; if (disposed) return;
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
    if (!requested) host.hidden = false;
    wrapper.style.minHeight = layout.rail ? `${guide.offsetHeight + 24}px` : '';
    collapseEmptyBelowView();
    if (requested) return;
    const reason = requestBlocker(); report(reason ? 'waiting' : 'ready', reason);
    if (reason || idle !== null) return;
    const request = () => {
      idle = null;
      if (disposed || requested) return;
      const reason = requestBlocker();
      if (reason) { report('waiting', reason); return; }
      requested = true; frozenSize = { width: layout.width, height: layout.height }; report('requested');
      try {
        loader = load(doc, win, client);
        if (loader.failed) { onScriptError(); return; }
        loader.errors.add(onScriptError);
        (win.adsbygoogle = win.adsbygoogle || []).push({});
      } catch { markFailed('request-error'); }
    };
    idle = win.requestIdleCallback ? win.requestIdleCallback(request, { timeout: 1000 }) : win.setTimeout(request, 0);
  }
  function schedule() { if (!disposed && !frame) frame = win.requestAnimationFrame(update); }
  // Attach before insertion; neither event is a prerequisite for requesting the unit.
  sheet.addEventListener('load', schedule, { once: true });
  sheet.addEventListener('error', () => { host.dataset.adStyle = 'inline-fallback'; schedule(); }, { once: true });
  doc.head.append(sheet);
  const statusObserver = new win.MutationObserver(() => {
    const state = conversionAdDeliveryState(unit.dataset.adStatus);
    if (state === 'filled' || state === 'unfill-optimized') { failed = false; host.hidden = false; report(state); }
    else if (state === 'unfilled') markFailed();
  });
  statusObserver.observe(unit, { attributes: true, attributeFilter: ['data-ad-status'] });
  // Closing a dialog must resume a deferred request, even with no subsequent scroll.
  const overlayObserver = new win.MutationObserver(records => {
    if (records.some(record => record.attributeName === 'open'
        || record.target.classList?.contains('tool-embed')
        || record.target === doc.body)) schedule();
  });
  overlayObserver.observe(doc.body, { attributes: true, subtree: true, attributeFilter: ['open', 'class'] });
  const resizeObserver = win.ResizeObserver ? new win.ResizeObserver(schedule) : null;
  resizeObserver?.observe(main); resizeObserver?.observe(guide);
  const intersection = win.IntersectionObserver ? new win.IntersectionObserver(schedule) : null;
  intersection?.observe(host);
  for (const type of ['resize', 'scroll', 'pageshow', 'popstate', 'hashchange']) win.addEventListener(type, schedule, { passive: true });
  for (const type of ['visibilitychange', 'fullscreenchange']) doc.addEventListener(type, schedule);
  const onHide = event => { if (!event.persisted) cleanup(); };
  win.addEventListener('pagehide', onHide);
  function cleanup() {
    if (disposed) return; disposed = true;
    win.cancelAnimationFrame(frame);
    if (idle !== null) { if (win.cancelIdleCallback) win.cancelIdleCallback(idle); else win.clearTimeout(idle); }
    statusObserver.disconnect(); overlayObserver.disconnect(); resizeObserver?.disconnect(); intersection?.disconnect();
    loader?.errors.delete(onScriptError);
    for (const type of ['resize', 'scroll', 'pageshow', 'popstate', 'hashchange']) win.removeEventListener(type, schedule);
    for (const type of ['visibilitychange', 'fullscreenchange']) doc.removeEventListener(type, schedule);
    win.removeEventListener('pagehide', onHide);
  }
  const result = { cleanup, get requested() { return requested; } };
  mounted.set(doc, result); schedule(); return result;
}
