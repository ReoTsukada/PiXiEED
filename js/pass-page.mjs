/**
 * /pass/ — the AdSense Offerwall page. The Offerwall (rewarded ad only, access 1 hour) is set to appear
 * on this page only. Watching it grants one hour (never stacked). When no Offerwall appears, today's free
 * hour is given instead, once per day. Opened in a new tab by requestPass(); the tool tab gets the pass
 * through storage, so this page only has to close itself or go back.
 */
import { adMode, claimDailyFree, formatPassRemaining, grantFromAd, hasPass, passRemainingMs, PASS_HOURS, safeReturn } from './pixieed-pass.mjs?v=20260930-rewarded-gpt-1';

const ADSENSE = 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-9801602250480253';
const APPEAR_MS = 15000; // no Offerwall by then → today's free hour (the Offerwall still grants if it comes later)
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

/** Anything Google puts over the page for the Offerwall or its ad: a large fixed layer that is not ours. */
export function offerwallCovering(doc = document) {
  const area = innerWidth * innerHeight;
  const ours = (el) => el.closest?.('.site-header, .pass-page, .px-pass-backdrop');
  const big = (el) => {
    const box = el.getBoundingClientRect();
    if (box.width * box.height < area * 0.3) return false;
    const style = getComputedStyle(el);
    return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) > 0.05;
  };
  // Funding Choices' own containers (class names vary between versions)
  for (const el of doc.querySelectorAll('[class*="fc-"], [id*="fc-"]')) if (!ours(el) && big(el)) return true;
  // any fixed/absolute layer added directly to <html> or <body>
  for (const el of [...doc.documentElement.children, ...doc.body.children]) {
    if (el === doc.body || el === doc.head || ours(el) || /^(SCRIPT|STYLE|LINK|INS)$/.test(el.tagName)) continue;
    const position = getComputedStyle(el).position;
    if ((position === 'fixed' || position === 'absolute') && big(el)) return true;
  }
  for (const frame of doc.querySelectorAll('iframe')) if (!ours(frame) && big(frame)) return true;
  return false;
}

async function noAd() {
  let free = false;
  try { free = await claimDailyFree(); } catch {}
  track(free ? 'pass_granted' : 'pass_no_ad', free ? { method: 'free_no_ad' } : {});
  finish(free ? `いまは広告がないので、本日の無料分として${PASS_HOURS}時間使えます。`
    : hasPass() ? '特典が使えます。' : 'いまは広告がありません。無料分は明日0時にまた受け取れます。');
}

let offerwallComing = false;
function watchOfferwall() {
  let seen = false; let settleTimer = 0; let done = false;
  const stop = () => { done = true; observer.disconnect(); window.clearInterval(poll); window.clearTimeout(appearTimer); window.clearTimeout(settleTimer); };
  const check = () => {
    if (done) return;
    if (offerwallCovering()) {
      if (!seen) { seen = true; track('pass_offerwall_shown'); window.clearTimeout(appearTimer); text.textContent = '広告を最後まで見ると、1時間使えます。'; back.hidden = true; }
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
  observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'class', 'hidden'] });
  const poll = window.setInterval(check, 400);
  // Watching continues after this: an Offerwall that shows up late still grants its hour.
  const appearTimer = window.setTimeout(() => { if (!seen && !offerwallComing) void noAd(); }, APPEAR_MS);
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
  window.googlefc = window.googlefc || {};
  window.googlefc.controlledMessagingFunction = (message) => {
    offerwallComing = true; text.textContent = '広告を準備しています…';
    try { message.proceed(true); } catch {}
  };
  const script = document.createElement('script');
  script.async = true; script.src = ADSENSE; script.crossOrigin = 'anonymous';
  script.addEventListener('error', () => finish('広告を読み込めませんでした。通信や広告ブロックの設定をご確認ください。'), { once: true });
  document.head.append(script);
  watchOfferwall();
}
start();
