/** Public, finite conversion targets. Never interpret a URL as a file or code. */
export const CONVERSION_TARGETS = Object.freeze({
  png: 'PNG', jpeg: 'JPEG', webp: 'WebP', gif: 'GIF', apng: 'APNG', svg: 'SVG',
  bmp: 'BMP', tiff: 'TIFF', tga: 'TGA', qoi: 'QOI', ico: 'ICO',
  ppm: 'PPM', pgm: 'PGM', pbm: 'PBM', pam: 'PAM', wav: 'WAV', aiff: 'AIFF', au: 'AU'
});
export const FORMAT_GUIDES = Object.freeze(['qoi', 'tga', 'tiff', 'ico', 'netpbm', 'aiff', 'au', 'bmp']);
export const PUBLIC_GUIDE_PATHS = Object.freeze([
  '/output/', '/output/text/', '/output/formats/', ...FORMAT_GUIDES.map(slug => `/output/formats/${slug}/`)
].flatMap(path => [path, `${path}index.html`]));
export function conversionHref(target) {
  if (!Object.hasOwn(CONVERSION_TARGETS, target)) throw new TypeError('Unknown conversion target');
  return `/output/work/?mode=convert&to=${target}`;
}
export function requestedConversion(location = {}) {
  if (!['/output/work/', '/output/work/index.html'].includes(location.pathname)) return null;
  const query = new URLSearchParams(location.search || '');
  if (query.has('id') || query.has('file') || query.has('text') || query.getAll('mode').length !== 1
      || query.get('mode') !== 'convert' || query.getAll('to').length !== 1) return null;
  const target = query.get('to');
  return Object.hasOwn(CONVERSION_TARGETS, target) ? target : null;
}
export function resolveConversionTarget(target, options) {
  if (!Object.hasOwn(CONVERSION_TARGETS, target)) return { available: false, label: '' };
  return { available: Array.from(options || []).some(option => option.value === target && !option.disabled), label: CONVERSION_TARGETS[target] };
}
const mounted = new WeakMap();
/** Attach after the existing converter/text UI. No automatic processing or upload.
 * The observer only watches the finite capability list, not file names or content.
 */
export function installConversionIntent(doc = document, win = window) {
  if (mounted.has(doc)) return mounted.get(doc);
  const target = requestedConversion(win.location), main = doc.getElementById('main');
  const select = main?.querySelector('[data-format]'), drop = main?.querySelector('[data-drop]');
  if (!target || !select || !drop || typeof win.MutationObserver !== 'function') return null;
  let enabled = true, applying = false;
  const panel = doc.createElement('section'); panel.className = 'convert-intent'; panel.setAttribute('aria-label', '選んだ変換の目的');
  const message = doc.createElement('p'); message.setAttribute('role', 'status'); message.setAttribute('aria-live', 'polite');
  message.textContent = `${CONVERSION_TARGETS[target]}へ変換します。まず素材を選んでください。`;
  const clear = doc.createElement('button'); clear.type = 'button'; clear.textContent = '指定を解除';
  const stylesheet = doc.createElement('link'); stylesheet.rel = 'stylesheet'; stylesheet.href = '/css/conversion-intent.css?rev=20261028-discovery-1'; doc.head.append(stylesheet);
  panel.append(message, clear); drop.parentElement.insertBefore(panel, drop);
  function apply() {
    if (!enabled || !select.options.length) return;
    const state = resolveConversionTarget(target, select.options);
    if (!state.available) {
      message.textContent = `${state.label}は、この素材・ブラウザーでは選べません。下の保存形式から対応する形式を選んでください。`;
      panel.dataset.state = 'unavailable';
      return;
    }
    applying = true;
    try {
      if (select.value !== target) {
        select.value = target;
        select.dispatchEvent(new win.Event('change', { bubbles: true }));
      }
      message.textContent = `${state.label}を選択しました。設定を確認してから変換できます。`;
      panel.dataset.state = 'ready';
    } finally { applying = false; }
  }
  function release() {
    enabled = false; panel.hidden = true; observer.disconnect();
    // The address is intentionally left untouched: no IDs, project state or query
    // parameters are rewritten. The choice is not persisted beyond this page.
  }
  function onChange() { if (!applying) release(); }
  const observer = new win.MutationObserver(apply);
  observer.observe(select, { childList: true });
  select.addEventListener('change', onChange); clear.addEventListener('click', release);
  function cleanup() { observer.disconnect(); select.removeEventListener('change', onChange); clear.removeEventListener('click', release); mounted.delete(doc); }
  win.addEventListener('pagehide', event => { if (!event.persisted) cleanup(); }, { once: true });
  const result = { apply, cleanup }; mounted.set(doc, result); apply(); return result;
}
