/**
 * PiXiEED pass — one rewarded ad gives one hour of every perk, everywhere on PiXiEED. It never stacks.
 *
 * Any page or tool asks `hasPerk('some.perk')`. The answer is yes while the pass is valid or for Pro.
 * New services only register a perk id; they never show ads themselves.
 * Ads only appear after the person taps 「広告を見る」: that opens /pass/, where the AdSense Offerwall
 * (rewarded ad only) runs; watching it grants PASS_HOURS from then (js/pass-page.mjs).
 * The first use each local day is free, and so is a visit to /pass/ when no ad appears — once per day.
 * Ordinary AdSense Auto ads are separate: they never grant this pass.
 * Only on localhost a 5-second stand-in ad is shown so the flow can be tried.
 */
import { passConfig } from '../data/site-config.js?rev=20260928-pass-1h-1';

const track = (name, params = {}) => { try { globalThis.gtag?.('event', name, params); } catch {} };
const STORE_KEY = 'pixieed:pass:v1';
const PRO_KEY = 'pixieed:pro:v1';
export const PASS_HOURS = Number(passConfig?.passHours) > 0 ? Number(passConfig.passHours) : 1;
const PASS_MS = PASS_HOURS * 60 * 60 * 1000;

/** Everything a pass unlocks, across PiXiEED. Services add theirs with registerPerk(). */
export const PERKS = new Map([
  ['camera.gif-long', 'ドット絵カメラ：GIFを10秒・なめらかに'],
  ['audio.canvas-wide', 'すべての制作ツール：256px・32色の共通キャンバス'],
  ['project.canvas-expanded', 'すべての制作ツール：256px・32色の共通キャンバス'],
  ['audio.instruments-extra', 'ドットで音楽：追加の音色'],
  ['draw.timelapse-detail', 'かんたんドット：工程多め・8秒のタイムラプス'],
  ['pixfind.hint', '間違い探し・かくれもの：追加ヒント'],
  ['jigsaw.hint', 'ジグソー：追加ヒント']
]);
export function registerPerk(id, label) { PERKS.set(id, label); }

const read = (key) => { try { return localStorage.getItem(key); } catch { return null; } };
const write = (key, value) => { try { if (value === null) localStorage.removeItem(key); else localStorage.setItem(key, value); return true; } catch { return false; } };
let memoryUntil = 0;
let memoryFallbackActive = false;
function until() {
  let raw;
  try { raw = localStorage.getItem(STORE_KEY); } catch { return memoryFallbackActive ? memoryUntil : 0; }
  if (raw === null) return memoryFallbackActive ? memoryUntil : 0;
  try {
    const stored = Number(JSON.parse(raw)?.until);
    return Number.isFinite(stored) && stored > 0 ? Math.max(stored, memoryFallbackActive ? memoryUntil : 0) : (memoryFallbackActive ? memoryUntil : 0);
  } catch { return memoryFallbackActive ? memoryUntil : 0; }
}

export function hasPro() { return read(PRO_KEY) === '1'; }
export function passRemainingMs(now = Date.now()) { return hasPro() ? Infinity : Math.max(0, until() - now); }
export function hasPass() { return passRemainingMs() > 0; }
export function hasPerk(id) { return PERKS.has(id) && hasPass(); }

const listeners = new Set();
/** Called whenever the pass starts, ends, or changes in another tab. Returns an unsubscribe function. */
export function onPassChange(listener) { listeners.add(listener); return () => listeners.delete(listener); }
let expiryTimer = 0;
function notify() {
  window.clearTimeout(expiryTimer);
  const left = passRemainingMs();
  // pages hide the perk coins (css/pixieed-design-system.css) while the pass runs
  if (typeof document !== 'undefined' && document.documentElement) document.documentElement.dataset.pass = left > 0 ? 'active' : 'none';
  if (left > 0 && left !== Infinity) expiryTimer = window.setTimeout(notify, Math.min(left + 50, 2 ** 31 - 1));
  for (const listener of listeners) { try { listener({ active: left > 0, remainingMs: left }); } catch (error) { console.warn(error); } }
  renderSlots();
}
if (typeof window !== 'undefined') window.addEventListener('storage', (event) => {
  if (event.key === STORE_KEY || event.key === PRO_KEY || event.key === NO_AD_KEY || event.key === NO_AD_DAY_KEY || event.key === null) {
    if (event.key === STORE_KEY || event.key === null) { memoryUntil = 0; memoryFallbackActive = false; }
    notify();
  }
});

function withPassLock(callback) {
  const locks = globalThis.navigator?.locks;
  if (locks?.request) return locks.request(STORE_KEY, callback);
  return callback();
}
function applyGrant({ notifyChange = true } = {}) {
  const next = Math.max(until(), Date.now() + PASS_MS); // one hour from now, never stacked
  const saved = write(STORE_KEY, JSON.stringify({ until: next }));
  memoryUntil = saved ? 0 : next;
  memoryFallbackActive = !saved;
  if (notifyChange) notify();
  return next;
}
async function grant() {
  return withPassLock(applyGrant);
}

// ---- ad provider: the AdSense Offerwall on /pass/ --------------------------------------------------------
/** The page that shows the AdSense Offerwall (its only choice is a rewarded ad) and grants the hour. */
export const PASS_PAGE = '/pass/';
export function passPageUrl(returnTo = typeof location === 'undefined' ? '/' : location.pathname + location.search + location.hash) {
  return `${PASS_PAGE}?return=${encodeURIComponent(safeReturn(returnTo))}`;
}
/** Only same-site paths are followed back. */
export function safeReturn(value) {
  const text = String(value || '');
  return /^\/(?![/\\])/.test(text) && !text.startsWith(PASS_PAGE) ? text : '/';
}
function showTestAd(sheet) {
  return new Promise((resolve) => {
    const box = sheet.querySelector('.px-pass-test'); box.hidden = false;
    let left = 5; box.textContent = `テスト広告 ${left}`;
    const timer = window.setInterval(() => { left--; box.textContent = `テスト広告 ${left}`; if (left <= 0) { window.clearInterval(timer); box.hidden = true; resolve('granted'); } }, 1000);
  });
}
export function adMode(currentLocation = typeof location === 'undefined' ? null : location) {
  if (currentLocation && /^(localhost|127\.0\.0\.1)$/.test(currentLocation.hostname)) return 'test';
  return 'offerwall';
}
/** One watched ad = one hour from now. The hour never stacks: while a pass runs, nothing is added. */
export async function grantFromAd() {
  return withPassLock(() => {
    if (passRemainingMs() > 0) return false;
    applyGrant();
    return true;
  });
}
// ---- one free pass per local day, shared with the legacy day key -----------------------------------------
const NO_AD_KEY = 'pixieed:pass:no-ad-at:v1';
const NO_AD_DAY_KEY = 'pixieed:pass:no-ad-day:v1';
let memoryNoAdAt = 0;
export function localDay(now = Date.now()) {
  const date = new Date(Number.isFinite(now) ? now : Date.now());
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
function storedNoAdAt(readKey) {
  let raw = null;
  try { raw = readKey(NO_AD_KEY); } catch {}
  if (raw === null || raw === undefined || String(raw).trim() === '') return 0;
  const at = Number(raw);
  return Number.isFinite(at) && at >= 0 ? at : 0;
}
export function freeWithoutAdWaitMs(now = Date.now(), readKey = read) {
  const checkedNow = Number.isFinite(now) ? now : Date.now();
  const today = localDay(checkedNow);
  const storedAt = storedNoAdAt(readKey);
  let legacyDay = null;
  try { legacyDay = readKey(NO_AD_DAY_KEY); } catch {}
  const storedUsedToday = storedAt > 0 && localDay(storedAt) === today;
  const memoryUsedToday = readKey === read && memoryNoAdAt > 0 && localDay(memoryNoAdAt) === today;
  const usedToday = legacyDay === today || storedUsedToday || memoryUsedToday;
  if (!usedToday) return 0;
  const nextDay = new Date(checkedNow);
  nextDay.setHours(24, 0, 0, 0);
  return Math.max(0, nextDay.getTime() - checkedNow);
}
export function freeWithoutAdAvailable(now = Date.now(), readKey = read) {
  return freeWithoutAdWaitMs(now, readKey) === 0;
}
export function useFreeWithoutAd(now = Date.now(), writeKey = write) {
  const usedAt = Number.isFinite(now) && now >= 0 ? now : Date.now();
  let savedAt = false; let savedDay = false;
  try { savedAt = writeKey(NO_AD_KEY, String(usedAt)) === true; } catch {}
  try { savedDay = writeKey(NO_AD_DAY_KEY, localDay(usedAt)) === true; } catch {}
  if (writeKey === write) memoryNoAdAt = Math.max(memoryNoAdAt, usedAt);
  return savedAt && savedDay;
}
/** Claim the daily no-ad hour atomically with any other pass grant. */
export async function claimFreeWithoutAd(grantPass, { now = () => Date.now(), readKey = read, writeKey = write } = {}) {
  return withPassLock(() => {
    const claimedAt = now();
    if (!freeWithoutAdAvailable(claimedAt, readKey)) return false;
    grantPass();
    useFreeWithoutAd(claimedAt, writeKey);
    if (typeof window !== 'undefined' && typeof document !== 'undefined') notify();
    return true;
  });
}
/** /pass/ found no ad: today's free hour, if not yet taken. */
export function claimDailyFree() { return claimFreeWithoutAd(() => applyGrant({ notifyChange: false })); }
/** Nothing to watch on /pass/ (no Offerwall appeared) → today's free hour, once. */
export function shouldGrantFreeWithoutAd(result) {
  return result === 'nofill' || result === 'unsupported' || result === 'timeout';
}

// ---- the one sheet --------------------------------------------------------------------------------------
const STYLE = `
.px-pass-backdrop{position:fixed;inset:0;z-index:2147483000;display:grid;align-items:end;justify-items:center;background:rgba(0,0,0,.38);animation:px-pass-fade .18s ease-out}
.px-pass{box-sizing:border-box;width:min(100% - 1.2rem,24rem);margin:0 0 calc(env(safe-area-inset-bottom,0px) + .8rem);padding:1.1rem 1.1rem 1rem;border-radius:1.4rem;background:rgba(20,24,28,.96);color:#f4f6f5;border:1px solid rgba(255,255,255,.12);box-shadow:0 24px 60px rgba(0,0,0,.45);font:500 .9rem/1.5 system-ui,-apple-system,"Hiragino Sans","Noto Sans JP",sans-serif;animation:px-pass-up .24s cubic-bezier(.2,.8,.2,1);max-height:calc(100dvh - env(safe-area-inset-top,0px) - env(safe-area-inset-bottom,0px) - 1.6rem);overflow:auto}
.px-pass h2{margin:0 0 .25rem;font-size:1.02rem;font-weight:800;display:flex;align-items:center;gap:.5rem}
.px-pass h2 i{display:inline-grid;place-items:center;min-width:2.6rem;height:1.6rem;padding:0 .4rem;border-radius:999px;background:#ffd35a;color:#15171b;font-style:normal;font-size:.78rem}
.px-pass p{margin:0 0 .9rem;color:rgba(244,246,245,.72);font-size:.84rem}
.px-pass .px-pass-perk{color:#fff;font-weight:700}
.px-pass-perks{display:grid;gap:.35rem;margin:0 0 .75rem;padding-left:1.15rem;font-size:.8rem;line-height:1.4}
.px-pass-note{display:block;margin:0 0 .9rem;color:rgba(244,246,245,.65);font-size:.72rem;line-height:1.5}
.px-pass-actions{display:flex;gap:.5rem}
.px-pass button{flex:1;height:2.9rem;border:0;border-radius:999px;font:inherit;font-weight:800;cursor:pointer}
.px-pass .px-pass-go{background:#e75445;color:#fff;box-shadow:0 10px 26px rgba(231,84,69,.35)}
.px-pass .px-pass-no{flex:0 0 auto;padding:0 1.1rem;background:rgba(255,255,255,.1);color:#f4f6f5}
.px-pass button:disabled{opacity:.5;cursor:default}
.px-pass-test{margin:0 0 .8rem;padding:.9rem;border-radius:1rem;background:repeating-linear-gradient(45deg,#2a2f35 0 10px,#252a2f 10px 20px);text-align:center;font-weight:800;letter-spacing:.06em}
.px-pass-test[hidden]{display:none}
.px-pass-chip{display:inline-flex;align-items:center;gap:.3rem;height:1.7rem;padding:0 .6rem;border-radius:999px;background:rgba(255,211,90,.95);color:#15171b;font:800 .72rem/1 system-ui,-apple-system,sans-serif;font-variant-numeric:tabular-nums;white-space:nowrap}
.px-pass-chip[hidden]{display:none}
@keyframes px-pass-fade{from{opacity:0}}@keyframes px-pass-up{from{transform:translateY(1.5rem);opacity:0}}
@media (prefers-reduced-motion:reduce){.px-pass-backdrop,.px-pass{animation:none}}`;
function ensureStyle() { if (document.getElementById('px-pass-style')) return; const style = document.createElement('style'); style.id = 'px-pass-style'; style.textContent = STYLE; document.head.appendChild(style); }

let open = null;
/**
 * Ask for the pass. Resolves true once the pass is valid (already valid → true at once).
 * `extend` (the header button) shows the time left while a pass runs; one hour never stacks.
 * `perk` only changes the wording, the pass always unlocks everything.
 */
export function requestPass({ perk = '', extend = false } = {}) {
  const active = hasPass();
  if (active && !extend) return Promise.resolve(true);
  if (open) return open;
  ensureStyle();
  const mode = adMode();
  let offeredFree = !active && freeWithoutAdAvailable();
  const backdrop = document.createElement('div'); backdrop.className = 'px-pass-backdrop';
  backdrop.innerHTML = `<section class="px-pass" role="dialog" aria-modal="true" aria-labelledby="px-pass-title">
    <h2 id="px-pass-title"><i>${PASS_HOURS}時間</i>PiXiEEDの特典</h2>
    <p></p><ul class="px-pass-perks" aria-label="共通特典"></ul><small class="px-pass-note"></small><div class="px-pass-test" hidden></div>
    <div class="px-pass-actions"><button type="button" class="px-pass-no">あとで</button><button type="button" class="px-pass-go"></button></div>
  </section>`;
  const text = backdrop.querySelector('p');
  const perkLabel = PERKS.get(perk);
  text.textContent = active
    ? `特典はあと${formatPassRemaining(passRemainingMs())}使えます。終わったら、また広告1本で${PASS_HOURS}時間使えます。`
    : offeredFree ? `本日の無料分として、広告なしで全ツール共通の特典を${PASS_HOURS}時間受け取れます。`
      : `広告を1本見ると、PiXiEEDのすべての特典が${PASS_HOURS}時間使えます。`;
  const perkList = backdrop.querySelector('.px-pass-perks');
  if (perkList) for (const label of new Set(PERKS.values())) { const item = document.createElement('li'); item.textContent = label; perkList.appendChild(item); }
  const passNote = backdrop.querySelector('.px-pass-note');
  if (passNote) passNote.textContent = active ? '' : '時間はページを閉じても進みます。制作中の内容は残ります。';
  if (perkLabel && !active) { const line = document.createElement('span'); line.className = 'px-pass-perk'; line.textContent = `（${perkLabel} など）`; text.appendChild(line); }
  const go = backdrop.querySelector('.px-pass-go'); const no = backdrop.querySelector('.px-pass-no');
  go.textContent = active ? 'OK' : offeredFree ? `無料で${PASS_HOURS}時間使う` : '広告を見る';
  if (active) no.hidden = true;
  const returnFocus = document.activeElement;
  document.body.appendChild(backdrop);
  track('pass_sheet_open', { perk: perk || (extend ? 'header' : ''), state: active ? 'active' : offeredFree ? 'free' : 'ad' });
  go.focus({ preventScroll: true });
  open = new Promise((resolve) => {
    let stopWatching = () => {};
    const close = (result) => {
      stopWatching();
      backdrop.remove(); document.removeEventListener('keydown', onKey); open = null;
      if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true });
      resolve(result);
    };
    const onKey = (event) => {
      if (event.key === 'Escape' && !no.disabled) { close(hasPass()); return; }
      if (event.key !== 'Tab') return;
      const focusable = [...backdrop.querySelectorAll('button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])')].filter((item) => !item.hidden);
      if (!focusable.length) { event.preventDefault(); return; }
      const first = focusable[0]; const last = focusable.at(-1);
      if (event.shiftKey && (document.activeElement === first || !backdrop.contains(document.activeElement))) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || !backdrop.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKey);
    backdrop.addEventListener('pointerdown', (event) => { if (event.target === backdrop && !no.disabled) close(hasPass()); });
    no.addEventListener('click', () => close(hasPass()));
    go.addEventListener('click', async () => {
      if (active || hasPass()) { close(true); return; }
      go.disabled = true; no.disabled = true;
      if (offeredFree) {
        try {
          if (await claimFreeWithoutAd(() => applyGrant({ notifyChange: false }))) { track('pass_granted', { method: 'free' }); close(true); return; }
        } catch {}
        offeredFree = false;
        text.textContent = `今日の無料分は受け取り済みです。広告を1本見ると${PASS_HOURS}時間使えます。`;
        go.disabled = false; no.disabled = false; go.textContent = '広告を見る';
        return;
      }
      if (mode === 'test') {
        const result = await showTestAd(backdrop);
        if (result === 'granted') { try { await grantFromAd(); } catch {} }
        close(hasPass());
        return;
      }
      // The Offerwall lives on its own page. A new tab keeps this page (and the work on it) as it is;
      // the pass arrives here through storage as soon as the ad is watched.
      const url = passPageUrl();
      track('pass_ad_open', { perk });
      let tab = null;
      try { tab = window.open(url, '_blank'); } catch {}
      if (!tab) { location.href = url; return; }
      text.textContent = '開いたページで広告を見終わると、ここでも特典が使えるようになります。';
      go.textContent = '広告を見ています…'; no.disabled = false;
      stopWatching = onPassChange(({ active: now }) => { if (now) close(true); });
    });
  });
  return open;
}

// ---- remaining-time chip: pages put <span data-pass-slot></span> where it should appear ------------------
export function formatPassRemaining(ms) { if (ms === Infinity) return 'Pro'; const m = Math.ceil(ms / 60000); return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`; }
let chipTimer = 0;
function renderSlots() {
  if (typeof document === 'undefined') return;
  ensureStyle();
  const left = passRemainingMs();
  for (const slot of document.querySelectorAll('[data-pass-slot]')) {
    slot.classList.add('px-pass-chip');
    slot.hidden = left <= 0;
    slot.textContent = `★ ${formatPassRemaining(left)}`;
    slot.setAttribute('aria-label', left === Infinity ? 'Pro：特典が使えます' : `特典はあと${formatPassRemaining(left)}使えます`);
  }
  window.clearTimeout(chipTimer);
  if (left > 0 && left !== Infinity) chipTimer = window.setTimeout(renderSlots, 30000);
}
if (typeof document !== 'undefined') { if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', notify); else notify(); }
if (typeof document !== 'undefined' && typeof window !== 'undefined') {
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') notify(); });
  window.addEventListener('pageshow', notify);
}
