/**
 * Compatibility API for the former timed pass and rewarded-ad flow.
 * Every registered creative feature is now available without a pass, and requests never interrupt work.
 * Old pass and daily-claim storage is intentionally left untouched.
 */
import { passConfig } from '../data/site-config.js?rev=20261001-free-tools-1';

const PRO_KEY = 'pixieed:pro:v1';
const NO_AD_KEY = 'pixieed:pass:no-ad-at:v1';
const NO_AD_DAY_KEY = 'pixieed:pass:no-ad-day:v1';
export const PASS_HOURS = Number(passConfig?.passHours) > 0 ? Number(passConfig.passHours) : 1;
export const PASS_MAX_HOURS = 2;

/** Registered feature ids remain available to existing applications and diagnostics. */
export const PERKS = new Map([
  ['camera.gif-long', 'ドット絵カメラ：GIFを10秒・なめらかに'],
  ['audio.canvas-wide', 'すべての制作ツール：256px・32色の共通キャンバス'],
  ['project.canvas-expanded', 'すべての制作ツール：256px・32色の共通キャンバス'],
  ['audio.instruments-extra', 'ドットで音楽：追加の音色'],
  ['draw.timelapse-detail', 'PiXiEEDraw：工程多め・8秒のタイムラプス'],
  ['pixfind.hint', '間違い探し・かくれもの：追加ヒント'],
  ['jigsaw.hint', 'ジグソー：追加ヒント']
]);
export function registerPerk(id, label) { PERKS.set(id, label); }

const read = (key) => { try { return globalThis.localStorage?.getItem(key) ?? null; } catch { return null; } };
const write = (key, value) => {
  try {
    if (value === null) globalThis.localStorage?.removeItem(key);
    else globalThis.localStorage?.setItem(key, value);
    return true;
  } catch { return false; }
};

export function hasPro() { return read(PRO_KEY) === '1'; }
/** Deprecated timer display: the unlimited feature model has no remaining-time clock. */
export function passRemainingMs(_now = Date.now()) { return 0; }
export function hasPass() { return true; }
export function hasPerk(id) { return PERKS.has(id); }
/** Kept for callers that subscribe to legacy state; unlimited access never changes. */
export function onPassChange(_listener) { return () => {}; }
/** Diagnostic enum is retained for old callers; neither mode opens an ad. */
export function adMode(currentLocation = typeof location === 'undefined' ? null : location) {
  return currentLocation && /^(localhost|127\.0\.0\.1)$/.test(currentLocation.hostname) ? 'test' : 'offerwall';
}
export function safeReturn(value) {
  const text = String(value || '');
  return /^\/(?![/\\])/.test(text) && !text.startsWith('/pass/') ? text : '/';
}
/** Deprecated rewarded-ad callback. Ads no longer grant or change feature access. */
export async function grantFromAd() { return false; }
/** Former rewarded-ad entry point retained as an inert compatibility export. */
export async function showRewardedAd(_options = {}) { return 'none'; }
/** The compatibility call reports no active wall and does not inspect or monitor the DOM. */
export async function showOfferwall(_options = {}) { return 'none'; }

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
  if (legacyDay !== today && !(storedAt > 0 && localDay(storedAt) === today)) return 0;
  const nextDay = new Date(checkedNow);
  nextDay.setHours(24, 0, 0, 0);
  return Math.max(0, nextDay.getTime() - checkedNow);
}
export function freeWithoutAdAvailable(now = Date.now(), readKey = read) { return freeWithoutAdWaitMs(now, readKey) === 0; }
/** Legacy daily-claim APIs are inert and never alter old storage or feature access. */
export function useFreeWithoutAd(_now = Date.now(), _writeKey = write) { return false; }
export async function claimFreeWithoutAd(_grantPass, _options = {}) { return false; }
export function claimDailyFree() { return false; }
export function shouldGrantFreeWithoutAd(_result) { return false; }

/** Legacy request names resolve successfully immediately and never open a dialog or start ad work. */
export function requestPass(_options = {}) { return Promise.resolve(true); }
export function formatPassRemaining(ms) {
  if (ms === Infinity) return 'Pro';
  const minutes = Math.ceil(Math.max(0, Number(ms) || 0) / 60000);
  return `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}`;
}
