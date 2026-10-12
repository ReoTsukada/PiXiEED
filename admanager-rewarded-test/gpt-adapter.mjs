/** Isolated GPT Web rewarded adapter. No SDK/global/network side effects on import.
 * Sources: https://developers.google.com/publisher-tag/samples/display-rewarded-ad
 * https://developers.google.com/publisher-tag/reference#googletag.events.RewardedSlotClosedEvent
 */
export const GPT_SCRIPT_URL = 'https://securepubads.g.doubleclick.net/tag/js/gpt.js';
export const REWARDED_AD_UNIT = '/23379831154/pixieed_rewarded';
// Real delivery is outside this local implementation's authorization.
export const LIVE_DELIVERY_ENABLED = false;
const bootstraps = new WeakMap();

function loadSdk(win, doc, timeoutMs, schedule, cancelSchedule) {
  const existing = bootstraps.get(win);
  if (existing) return win.googletag?.apiReady ? Promise.resolve(existing) : existing.promise;
  if (win.googletag || doc.querySelector('script[src*="securepubads.g.doubleclick.net"]')) {
    return Promise.reject(new Error('別のGPTが存在します。この隔離テストでは混在させません。'));
  }
  const bootstrap = { servicesEnabled: false, promise: null };
  bootstraps.set(win, bootstrap);
  win.googletag = { cmd: [] };
  bootstrap.promise = new Promise((resolve, reject) => {
    let finished = false;
    const finish = error => {
      if (finished) return;
      finished = true; cancelSchedule(timer);
      script.onload = script.onerror = null;
      // A timed-out script may still execute later. Retain this page's one
      // bootstrap rather than introduce a second SDK and race its global state.
      error ? reject(new Error(`${error.message} ページを再読み込みしてください。自動では再要求しません。`)) : resolve(bootstrap);
    };
    const script = doc.createElement('script');
    script.src = GPT_SCRIPT_URL; script.async = true; script.crossOrigin = 'anonymous';
    script.dataset.gamRewardedTestSdk = 'true';
    const timer = schedule(() => finish(new Error('GPTの読み込みがタイムアウトしました。')), timeoutMs);
    script.onerror = () => finish(new Error('GPTを読み込めませんでした。'));
    script.onload = () => win.googletag?.apiReady ? finish() : finish(new Error('GPTのAPIを利用できません。'));
    doc.head.append(script);
  });
  return bootstrap.promise;
}

export function createGptAdapter({ emit, enabled = false, optIn = false,
  windowRef = globalThis.window, documentRef = globalThis.document,
  timeoutMs = 10000, schedule = setTimeout, cancelSchedule = clearTimeout } = {}) {
  let disposed = false, slot = null, pubads = null, ready = null, slotDestroyed = false, closed = false, started = false, shown = false;
  const listeners = new Map();
  function closeSlot() {
    if (!slot || slotDestroyed) return;
    slotDestroyed = true; ready = null;
    try { windowRef.googletag.destroySlots([slot]); } catch { /* cleanup must not award anything */ }
  }
  function destroy() {
    if (disposed) return;
    disposed = true; closeSlot();
    for (const [name, listener] of listeners) pubads?.removeEventListener(name, listener);
    listeners.clear(); ready = null;
  }
  const bind = (name, callback) => {
    const handler = event => { if (!disposed && event.slot === slot) callback(event); };
    listeners.set(name, handler); pubads.addEventListener(name, handler);
  };
  return {
    async prepare() {
      if (!enabled) throw new Error('実広告の配信は未承認・無効です。モックを使用してください。');
      if (!optIn) throw new Error('広告視聴の明示的なopt-inが必要です。');
      if (disposed || started) return;
      started = true;
      const bootstrap = await loadSdk(windowRef, documentRef, timeoutMs, schedule, cancelSchedule);
      if (disposed) return;
      await new Promise((resolve, reject) => windowRef.googletag.cmd.push(() => {
        if (disposed) { resolve(); return; }
        try {
          const tag = windowRef.googletag, format = tag.enums?.OutOfPageFormat?.REWARDED;
          if (format === undefined) { emit({ type: 'unsupported' }); resolve(); return; }
          slot = tag.defineOutOfPageSlot(REWARDED_AD_UNIT, format);
          if (!slot) { emit({ type: 'unsupported' }); resolve(); return; }
          pubads = tag.pubads(); slot.addService(pubads);
          bind('slotRenderEnded', event => { if (event.isEmpty) emit({ type: 'noFill' }); });
          bind('rewardedSlotReady', event => {
            if (closed || slotDestroyed || shown) return;
            ready = event; emit({ type: 'ready' });
          });
          bind('rewardedSlotGranted', event => emit({ type: 'granted', payload: event.payload }));
          bind('rewardedSlotVideoCompleted', () => emit({ type: 'videoCompleted' }));
          bind('rewardedSlotClosed', () => {
            closed = true; closeSlot(); emit({ type: 'closed' });
            // Keep this attempt's receipt listeners until explicit retry/disposal.
            // Closed can precede Granted. GPT does not guarantee post-destroy delivery.
          });
          if (!bootstrap.servicesEnabled) { tag.enableServices(); bootstrap.servicesEnabled = true; }
          tag.display(slot); resolve();
        } catch (error) { destroy(); reject(error); }
      }));
    },
    show() {
      if (disposed || closed || !ready || slotDestroyed || shown) return false;
      const event = ready; ready = null;
      shown = event.makeRewardedVisible() === true;
      return shown;
    },
    close: closeSlot,
    destroy
  };
}
