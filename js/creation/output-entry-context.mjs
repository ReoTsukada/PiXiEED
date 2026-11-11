/** Keep new editor handoff pointers in this tab, not in an advertising URL.
 * This does not isolate same-origin advertising scripts from browser storage.
 */
export const OUTPUT_ENTRY_STATE = 'pixieedOutputRequest';
export const OUTPUT_PENDING_KEY = 'pixieed-output-entry-v1';
const paths = new Set(['/output/work/', '/output/work/index.html', '/tools/start/convert/']);
const UUID = /^[a-f\d]{8}-[a-f\d]{4}-4[a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i;
// Match the existing staged-output lifetime so slow/offline navigation keeps working.
const MAX_PENDING_AGE = 7 * 24 * 60 * 60 * 1000;

export function isOutputEntryPath(path) { return paths.has(path); }
function pointer(value, path) {
  if (!value || value.version !== 1 || value.path !== path || !['id', 'file'].includes(value.key)
      || !UUID.test(value.id || '') || typeof value.advanced !== 'boolean') return null;
  return { version: 1, path, key: value.key, id: value.id, advanced: value.advanced };
}
function parseTarget(href, origin) {
  const url = new URL(href, origin);
  if (url.origin !== origin || !paths.has(url.pathname) || url.hash) throw new Error('出力先を確認できません。');
  const keys = [...url.searchParams.keys()];
  const key = keys.includes('id') ? 'id' : keys.includes('file') ? 'file' : null;
  if (!key || keys.some(name => name !== key && name !== 'view') || url.searchParams.getAll(key).length !== 1
      || (url.searchParams.has('view') && (url.searchParams.getAll('view').length !== 1 || url.searchParams.get('view') !== 'advanced')))
    throw new Error('出力の指定を確認できません。');
  const value = pointer({ version: 1, path: url.pathname, key, id: url.searchParams.get(key), advanced: url.searchParams.get('view') === 'advanced' }, url.pathname);
  if (!value) throw new Error('出力を特定できません。');
  return { url, value };
}
function queryFor(value) {
  const query = new URLSearchParams({ [value.key]: value.id });
  if (value.advanced) query.set('view', 'advanced');
  return '?' + query;
}

/** Legacy explicit URLs retain priority; a clean history entry may restore its pointer. */
export function outputEntrySearch(location = globalThis.location, history = globalThis.history) {
  if (!paths.has(location?.pathname)) return location?.search || '';
  if (location.search) return location.search;
  const value = pointer(history?.state?.[OUTPUT_ENTRY_STATE], location.pathname);
  return value ? queryFor(value) : '';
}

/** Consume only our public entry marker, never an ordinary direct visit. */
export function prepareOutputEntry(win = globalThis.window, now = Date.now) {
  if (!win || !paths.has(win.location.pathname) || win.location.search !== '?entry=1' || win.location.hash) return false;
  const raw = win.sessionStorage.getItem(OUTPUT_PENDING_KEY);
  let queued;
  try { queued = JSON.parse(raw); } catch { throw new Error('出力の受け渡しを確認できません。制作画面からもう一度書き出してください。'); }
  const value = pointer(queued, win.location.pathname);
  if (!value || !Number.isFinite(queued.createdAt) || queued.createdAt > now() || now() - queued.createdAt > MAX_PENDING_AGE)
    throw new Error('出力の受け渡しが期限切れです。制作画面からもう一度書き出してください。');
  // Commit reload/back restoration before removing the queued handoff.
  win.history.replaceState({ ...win.history.state, [OUTPUT_ENTRY_STATE]: value }, '', win.location.pathname);
  try { win.sessionStorage.removeItem(OUTPUT_PENDING_KEY); } catch { /* The history entry is authoritative now. */ }
  return true;
}

/** A staged source change stays on a clean URL and updates only this history entry. */
export function replaceOutputEntry(href, win = globalThis.window) {
  const { url, value } = parseTarget(href, win.location.origin);
  const path = paths.has(win.location.pathname) ? win.location.pathname : url.pathname;
  const retained = { ...value, path };
  win.history.replaceState({ ...win.history.state, [OUTPUT_ENTRY_STATE]: retained }, '', path);
  return retained;
}

/** Transfer no bytes or names. Storage-blocked browsers keep the legacy, ad-denied route. */
export function navigateOutputEntry(href, win = globalThis.window, location = win?.location, now = Date.now) {
  const { url, value } = parseTarget(href, location.origin);
  const doc = win?.document;
  let storage;
  try { storage = win?.sessionStorage; } catch { location.assign(url.href); return false; }
  if (!doc?.createElement || !doc.body || !storage) { location.assign(url.href); return false; }
  const queued = JSON.stringify({ ...value, createdAt: now() });
  let prior = null;
  try {
    prior = storage.getItem(OUTPUT_PENDING_KEY);
    storage.setItem(OUTPUT_PENDING_KEY, queued);
    if (storage.getItem(OUTPUT_PENDING_KEY) !== queued) throw new Error('handoff_storage_unavailable');
  } catch { location.assign(url.href); return false; }
  const link = doc.createElement('a');
  link.href = url.pathname + '?entry=1';
  link.rel = 'noreferrer'; link.referrerPolicy = 'no-referrer'; link.hidden = true;
  doc.body.append(link);
  try { link.click(); }
  catch (error) {
    try { if (prior === null) storage.removeItem(OUTPUT_PENDING_KEY); else storage.setItem(OUTPUT_PENDING_KEY, prior); } catch {}
    throw error;
  } finally { link.remove(); }
  return true;
}
