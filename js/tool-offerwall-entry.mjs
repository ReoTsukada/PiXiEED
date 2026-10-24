import { displayAdConfig } from '../data/site-config.js?rev=20261008-map-detail-1';

const PUBLISHER = displayAdConfig?.client;
const SDK_URL = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${PUBLISHER}`;

/** Ask the site policy to permit a fresh setup URL; this never represents restored work. */
export function notifyToolEntryReady(fresh) {
  const policy = globalThis.window?.__PIXIEED_OFFERWALL_ENTRY__;
  if (!policy || typeof policy.ready !== 'function') return false;
  return policy.ready({ fresh: fresh === true });
}

export function subscribeToolEntry(listener) {
  const policy = globalThis.window?.__PIXIEED_OFFERWALL_ENTRY__;
  return policy?.subscribe?.(listener) || (() => {});
}

/** Load the existing provider SDK only while the site policy currently permits the Offerwall. */
export function maybeLoadOfferwallSDK({ window: win = globalThis.window, document: doc = globalThis.document } = {}) {
  if (!/^ca-pub-\d{16}$/.test(PUBLISHER || '') || !win?.__PIXIEED_OFFERWALL_ENTRY__?.isEligible?.() || !doc?.head || win.top !== win.self
      || win.location?.origin !== 'https://pixieed.jp') return Promise.resolve(false);
  if (sdkPromise) return sdkPromise;

  const existing = doc.querySelector?.(`script[src="${SDK_URL}"]`);
  if (existing) {
    sdkPromise = new Promise((resolve) => {
      if (existing.dataset?.loaded === 'true' || existing.readyState === 'complete' || win.adsbygoogle) resolve(true);
      else {
        existing.addEventListener?.('load', () => resolve(true), { once: true });
        existing.addEventListener?.('error', () => resolve(false), { once: true });
      }
    });
    return sdkPromise;
  }

  const script = doc.createElement('script');
  script.async = true;
  script.crossOrigin = 'anonymous';
  script.src = SDK_URL;
  sdkPromise = new Promise((resolve) => {
    script.addEventListener?.('load', () => resolve(true), { once: true });
    script.addEventListener?.('error', () => resolve(false), { once: true });
    doc.head.append(script);
  });
  // Failure is terminal for this page; there is no timer or automatic retry.
  return sdkPromise;
}

export function maybeLoadToolOfferwallProvider() {
  return maybeLoadOfferwallSDK();
}

let sdkPromise;

/** Install a nonblocking page-lifetime subscription; eligible updates may load the SDK once. */
export function bootToolOfferwallEntry() {
  return subscribeToolEntry(({ eligible }) => {
    if (eligible) void maybeLoadOfferwallSDK();
  });
}

// The classic policy is injected before module scripts; if it is absent this safely no-ops.
const stopOfferwallEntrySubscription = bootToolOfferwallEntry();
void stopOfferwallEntrySubscription;
