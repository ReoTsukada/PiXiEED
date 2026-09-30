/**
 * /pass/ — the AdSense Offerwall page. The Offerwall (rewarded ad only, access 1 hour) is set to appear
 * on this page only. Watching it grants one hour (never stacked). When no Offerwall appears, today's free
 * hour is given instead, once per day. Opened in a new tab by requestPass(); the tool tab gets the pass
 * through storage, so this page only has to close itself or go back.
 */
import { adMode, claimDailyFree, formatPassRemaining, grantFromAd, hasPass, passRemainingMs, PASS_HOURS, safeReturn } from './pixieed-pass.mjs?v=20260930-rewarded-gpt-1';

const ADSENSE = 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-9801602250480253';
const APPEAR_MS = 12000; // no Offerwall by then → no ad
const SETTLE_MS = 1500; // the Offerwall must stay gone this long before the hour is granted

const track = (name, params = {}) => { try { globalThis.gtag?.('event', name, params); } catch {} };
const clock = document.getElementById('passClock');
const text = document.getElementById('passText');
const back = document.getElementById('passBack');
const returnTo = safeReturn(new URLSearchParams(location.search).get('return'));

function finish(message) {
  text.textContent = message;
  clock.textContent = hasPass() ? formatPassRemaining(passRemainingMs()) : `${PASS_HOURS}時間`;
  back.hidden = false;
  back.focus({ preventScroll: true });
}
back.addEventListener('click', () => {
  if (window.opener && !window.opener.closed) { window.close(); window.setTimeout(() => location.replace(returnTo), 300); }
  else location.replace(returnTo);
});

/** Anything Google puts over the page for the Offerwall or its ad. */
export function offerwallCovering(doc = document) {
  for (const el of doc.querySelectorAll('body > div[class*="fc-"], .fc-message-root, .fc-dialog-container, .fc-monetization-dialog-container')) {
    const box = el.getBoundingClientRect();
    if (box.width * box.height > 0 && getComputedStyle(el).display !== 'none' && getComputedStyle(el).visibility !== 'hidden') return true;
  }
  const area = innerWidth * innerHeight;
  for (const frame of doc.querySelectorAll('iframe')) {
    if (!/google|doubleclick/.test(frame.src || frame.id || frame.name || '')) continue;
    const box = frame.getBoundingClientRect();
    if (box.width * box.height > area * 0.6) return true;
  }
  return false;
}

async function noAd() {
  let free = false;
  try { free = await claimDailyFree(); } catch {}
  track(free ? 'pass_granted' : 'pass_no_ad', free ? { method: 'free_no_ad' } : {});
  finish(free ? `いまは広告がないので、本日の無料分として${PASS_HOURS}時間使えます。`
    : hasPass() ? '特典が使えます。' : 'いまは広告がありません。無料分は明日0時にまた受け取れます。');
}

function watchOfferwall() {
  let seen = false; let settleTimer = 0; let done = false;
  const stop = () => { done = true; observer.disconnect(); window.clearInterval(poll); window.clearTimeout(appearTimer); window.clearTimeout(settleTimer); };
  const check = () => {
    if (done) return;
    if (offerwallCovering()) {
      if (!seen) { seen = true; track('pass_offerwall_shown'); window.clearTimeout(appearTimer); text.textContent = '広告を最後まで見ると、1時間使えます。'; }
      window.clearTimeout(settleTimer); settleTimer = 0;
      return;
    }
    if (seen && !settleTimer) settleTimer = window.setTimeout(async () => {
      if (offerwallCovering()) { settleTimer = 0; return; }
      stop();
      let granted = false;
      try { granted = await grantFromAd(); } catch {}
      if (granted) track('pass_granted', { method: 'ad' });
      finish(hasPass() ? `${PASS_HOURS}時間、すべての特典が使えます。` : '特典を付けられませんでした。もう一度お試しください。');
    }, SETTLE_MS);
  };
  const observer = new MutationObserver(check);
  observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'class'] });
  const poll = window.setInterval(check, 500);
  const appearTimer = window.setTimeout(() => { if (!seen) { stop(); void noAd(); } }, APPEAR_MS);
}

function start() {
  if (hasPass()) { finish(`特典はあと${formatPassRemaining(passRemainingMs())}使えます。`); return; }
  if (adMode() === 'test') {
    let left = 5; text.textContent = `テスト広告 ${left}`;
    const timer = window.setInterval(async () => {
      left -= 1; text.textContent = `テスト広告 ${left}`;
      if (left > 0) return;
      window.clearInterval(timer);
      await grantFromAd();
      finish(`${PASS_HOURS}時間、すべての特典が使えます。`);
    }, 1000);
    return;
  }
  const script = document.createElement('script');
  script.async = true; script.src = ADSENSE; script.crossOrigin = 'anonymous';
  script.addEventListener('error', () => finish('広告を読み込めませんでした。通信や広告ブロックの設定をご確認ください。'), { once: true });
  document.head.append(script);
  watchOfferwall();
}
start();
