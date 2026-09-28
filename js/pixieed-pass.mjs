/**
 * PiXiEED pass — every rewarded ad adds one hour of every perk, everywhere on PiXiEED.
 *
 * Any page or tool asks `hasPerk('some.perk')`. The answer is yes while the pass is valid (one rewarded ad
 * adds PASS_HOURS hours) or for Pro. New services only register a perk id; they never show ads themselves.
 * The only place an ad can appear is `requestPass()`, and only after the person taps 「広告を見る」.
 *
 * Ads: Google Ad Manager rewarded ads (GPT) when `passConfig.rewardedAdUnitPath` is set in
 * data/site-config.js. Until then the pass is granted without an ad (and says so). Only on localhost,
 * a 5-second stand-in ad is shown so the flow can be tried without granting a free pass on the public site.
 */
import { passConfig } from '../data/site-config.js?rev=20260928-pass-1h-1';

const STORE_KEY = 'pixieed:pass:v1';
const PRO_KEY = 'pixieed:pro:v1';
export const PASS_HOURS = Number(passConfig?.passHours) > 0 ? Number(passConfig.passHours) : 1;
const PASS_MS = PASS_HOURS * 60 * 60 * 1000;

/** Everything a pass unlocks, across PiXiEED. Services add theirs with registerPerk(). */
export const PERKS = new Map([
  ['camera.gif-long', 'ドット絵カメラ：GIFを10秒・なめらかに'],
  ['audio.canvas-wide', 'ドットで音楽：広いキャンバスで作曲'],
  ['audio.instruments-extra', 'ドットで音楽：追加の音色']
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
  if (left > 0 && left !== Infinity) expiryTimer = window.setTimeout(notify, Math.min(left + 50, 2 ** 31 - 1));
  for (const listener of listeners) { try { listener({ active: left > 0, remainingMs: left }); } catch (error) { console.warn(error); } }
  renderSlots();
}
if (typeof window !== 'undefined') window.addEventListener('storage', (event) => {
  if (event.key === STORE_KEY || event.key === PRO_KEY || event.key === null) {
    if (event.key === STORE_KEY || event.key === null) { memoryUntil = 0; memoryFallbackActive = false; }
    notify();
  }
});

async function grant() {
  const applyGrant = () => {
    const next = Math.max(Date.now(), until()) + PASS_MS;
    const saved = write(STORE_KEY, JSON.stringify({ until: next }));
    memoryUntil = saved ? 0 : next;
    memoryFallbackActive = !saved;
    notify();
    return next;
  };
  const locks = globalThis.navigator?.locks;
  if (locks?.request) return locks.request(STORE_KEY, applyGrant);
  return applyGrant();
}

// ---- ad providers ----------------------------------------------------------------------------------------
function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) { resolve(); return; }
    const script = document.createElement('script'); script.src = src; script.async = true;
    let settled = false; let timer = 0;
    const finish = (error = null) => {
      if (settled) return;
      settled = true; window.clearTimeout(timer);
      if (error) { script.remove(); reject(error); } else resolve();
    };
    timer = window.setTimeout(() => finish(new Error('ad script timeout')), 10000);
    script.onload = () => finish(); script.onerror = () => finish(new Error('ad script'));
    document.head.appendChild(script);
  });
}
/** @internal Google Ad Manager rewarded ad. Resolves 'granted' | 'closed' | 'nofill' | 'unsupported' | 'timeout'. */
export async function showRewardedAd(adUnitPath) {
  await loadScript('https://securepubads.g.doubleclick.net/tag/js/gpt.js');
  const googletag = window.googletag = window.googletag || { cmd: [] };
  return new Promise((resolve) => {
    let settled = false; let slot = null; let pubads = null;
    const listeners = [];
    const done = (result) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      for (const [type, listener] of listeners) pubads.removeEventListener(type, listener);
      if (slot) googletag.destroySlots([slot]);
      resolve(result);
    };
    const timeout = window.setTimeout(() => done('timeout'), 10000);
    let granted = false;
    googletag.cmd.push(() => {
      if (settled) return;
      slot = googletag.defineOutOfPageSlot(adUnitPath, googletag.enums.OutOfPageFormat.REWARDED);
      if (!slot) { done('unsupported'); return; }
      pubads = googletag.pubads();
      slot.addService(pubads);
      const listen = (type, listener) => { pubads.addEventListener(type, listener); listeners.push([type, listener]); };
      listen('rewardedSlotReady', (event) => {
        if (event.slot !== slot) return;
        window.clearTimeout(timeout);
        if (!event.makeRewardedVisible()) done('nofill');
      });
      listen('rewardedSlotGranted', (event) => { if (event.slot === slot) granted = true; });
      listen('rewardedSlotClosed', (event) => { if (event.slot === slot) done(granted ? 'granted' : 'closed'); });
      listen('slotRenderEnded', (event) => { if (event.slot === slot && event.isEmpty) done('nofill'); });
      googletag.enableServices();
      googletag.display(slot);
    });
  });
}
/** Stand-in for trying the flow on localhost: a 5-second countdown in the sheet. */
function showTestAd(sheet) {
  return new Promise((resolve) => {
    const box = sheet.querySelector('.px-pass-test'); box.hidden = false;
    let left = 5; box.textContent = `テスト広告 ${left}`;
    const timer = window.setInterval(() => { left--; box.textContent = `テスト広告 ${left}`; if (left <= 0) { window.clearInterval(timer); box.hidden = true; resolve('granted'); } }, 1000);
  });
}
export function adMode(currentLocation = typeof location === 'undefined' ? null : location) {
  if (currentLocation && /^(localhost|127\.0\.0\.1)$/.test(currentLocation.hostname)) return 'test';
  return passConfig?.rewardedAdUnitPath ? 'rewarded' : 'free';
}
/** Google's public sample rewarded unit: `?ads=test` on the real site checks the whole ad flow on a phone. */
export const SAMPLE_REWARDED_AD_UNIT = '/22639388115/rewarded_web_example';
export function rewardedAdUnit(currentLocation = typeof location === 'undefined' ? null : location, config = passConfig) {
  try { if (new URLSearchParams(currentLocation?.search || '').get('ads') === 'test') return SAMPLE_REWARDED_AD_UNIT; } catch {}
  return config?.rewardedAdUnitPath || '';
}
// ---- no ad to show: once a day the pass is given anyway (having no ad is not the person's fault) ----
const NO_AD_KEY = 'pixieed:pass:no-ad-day:v1';
export function localDay(now = Date.now()) { const d = new Date(now); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
export function freeWithoutAdAvailable(now = Date.now(), readKey = read) { return readKey(NO_AD_KEY) !== localDay(now); }
export function useFreeWithoutAd(now = Date.now(), writeKey = write) { return writeKey(NO_AD_KEY, localDay(now)); }

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
 * Ask for the pass. Shows the sheet; resolves true once the pass is valid (already valid → true at once).
 * `perk` only changes the wording ("… GIFを10秒 …も"), the pass always unlocks everything.
 */
export function requestPass({ perk = '', extend = false } = {}) {
  if (hasPass() && !extend) return Promise.resolve(true);
  if (open) return open;
  ensureStyle();
  const mode = adMode();
  const backdrop = document.createElement('div'); backdrop.className = 'px-pass-backdrop';
  backdrop.innerHTML = `<section class="px-pass" role="dialog" aria-modal="true" aria-labelledby="px-pass-title">
    <h2 id="px-pass-title"><i>${PASS_HOURS}時間</i>${extend ? '特典を追加' : 'PiXiEEDの特典'}</h2>
    <p></p><ul class="px-pass-perks" aria-label="共通特典"></ul><small class="px-pass-note"></small><div class="px-pass-test" hidden></div>
    <div class="px-pass-actions"><button type="button" class="px-pass-no">あとで</button><button type="button" class="px-pass-go"></button></div>
  </section>`;
  const text = backdrop.querySelector('p');
  const perkLabel = PERKS.get(perk);
  text.innerHTML = extend
    ? mode === 'free' ? `準備中のため広告なしで、サイト共通の拡張を使える時間に${PASS_HOURS}時間追加されます。`
      : `広告を1本見ると、サイト共通の拡張を使える時間に${PASS_HOURS}時間追加されます。`
    : mode === 'free' ? `いまは準備中のため、広告なしで${PASS_HOURS}時間すべての特典が使えます。`
      : `広告を1本見ると、PiXiEEDのすべての特典が${PASS_HOURS}時間使えます。`;
  const perkList = backdrop.querySelector('.px-pass-perks');
  if (perkList) for (const label of PERKS.values()) { const item = document.createElement('li'); item.textContent = label; perkList.appendChild(item); }
  const passNote = backdrop.querySelector('.px-pass-note');
  if (passNote) passNote.textContent = '時間はページを閉じても進みます。制作中の内容は残ります。';
  if (perkLabel) { const line = document.createElement('span'); line.className = 'px-pass-perk'; line.textContent = `（${perkLabel} など）`; text.appendChild(line); }
  const go = backdrop.querySelector('.px-pass-go'); const no = backdrop.querySelector('.px-pass-no');
  const goLabel = mode === 'free' ? (extend ? `${PASS_HOURS}時間追加する` : `${PASS_HOURS}時間使う`) : '広告を見る';
  go.textContent = goLabel;
  const returnFocus = document.activeElement;
  document.body.appendChild(backdrop);
  go.focus({ preventScroll: true });
  open = new Promise((resolve) => {
    const close = (result) => {
      backdrop.remove(); document.removeEventListener('keydown', onKey); open = null;
      if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true });
      resolve(result);
    };
    const onKey = (event) => {
      if (event.key === 'Escape' && !go.disabled) { close(false); return; }
      if (event.key !== 'Tab') return;
      const focusable = [...backdrop.querySelectorAll('button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])')].filter((item) => !item.hidden);
      if (!focusable.length) { event.preventDefault(); return; }
      const first = focusable[0]; const last = focusable.at(-1);
      if (event.shiftKey && (document.activeElement === first || !backdrop.contains(document.activeElement))) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || !backdrop.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKey);
    backdrop.addEventListener('pointerdown', (event) => { if (event.target === backdrop && !go.disabled) close(false); });
    no.addEventListener('click', () => close(false));
    let freeReady = false;
    go.addEventListener('click', async () => {
      if (freeReady) { close(true); return; }
      go.disabled = true; no.disabled = true;
      let result = 'granted';
      if (mode === 'test') result = await showTestAd(backdrop);
      else if (mode === 'rewarded') { go.textContent = '広告を準備しています…'; try { result = await showRewardedAd(rewardedAdUnit()); } catch { result = 'timeout'; } }
      if (result === 'granted') {
        try { await grant(); close(true); return; }
        catch { result = 'unavailable'; }
      }
      backdrop.dataset.adResult = result;
      // no ad could be shown (none in stock, unsupported device, or too slow): the day's free hour
      if (result !== 'closed' && result !== 'granted' && freeWithoutAdAvailable()) {
        try {
          await grant(); useFreeWithoutAd();
          freeReady = true; go.disabled = false; no.hidden = true; go.textContent = '使う';
          text.textContent = `広告が見つからなかったので、今日は無料で${PASS_HOURS}時間使えます。`;
          return;
        } catch {}
      }
      go.disabled = false; no.disabled = false;
      go.textContent = goLabel;
      text.textContent = result === 'closed' ? '最後まで見ると特典が使えるようになります。'
        : 'いまは広告を用意できませんでした。少し時間をおいてお試しください。（広告なしの無料分は今日使用済みです）';
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
