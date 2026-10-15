/** GPT rewarded adapter. Importing this module has no network or global side effects. */
export const GPT_SCRIPT_URL = 'https://securepubads.g.doubleclick.net/tag/js/gpt.js';
export const LIVE_DELIVERY_ENABLED = false;
const bootstraps = new WeakMap();
const activeSlots = new WeakMap();

function loadSdk(win, doc, timeoutMs, schedule, cancelSchedule) {
  if (!win || !doc) return Promise.reject(new Error('ブラウザ広告APIを利用できません。'));
  if (win.googletag?.apiReady) {
    let existing = bootstraps.get(win);
    if (!existing) { existing = { servicesEnabled: true }; bootstraps.set(win, existing); }
    return Promise.resolve(existing);
  }
  const prior = bootstraps.get(win);
  if (prior?.promise) return prior.promise;
  if (win.googletag || doc.querySelector?.(`script[src*="${new URL(GPT_SCRIPT_URL).host}"]`)) {
    return Promise.reject(new Error('GPTは読み込み中です。少し待ってから再試行してください。'));
  }
  const bootstrap = { servicesEnabled: false, promise: null };
  bootstraps.set(win, bootstrap);
  win.googletag = { cmd: [] };
  bootstrap.promise = new Promise((resolve, reject) => {
    let done = false;
    const script = doc.createElement('script');
    const timer = schedule(() => finish(new Error('GPTの読み込みがタイムアウトしました。')) , timeoutMs);
    function finish(error) {
      if (done) return;
      done = true;
      try { cancelSchedule(timer); } catch {}
      script.onload = script.onerror = null;
      if (error) reject(error); else resolve(bootstrap);
    }
    script.src = GPT_SCRIPT_URL; script.async = true; script.crossOrigin = 'anonymous';
    script.dataset.pixieedRewarded = 'true';
    script.onload = () => win.googletag?.apiReady ? finish() : finish(new Error('GPT APIを利用できません。'));
    script.onerror = () => finish(new Error('GPTを読み込めませんでした。'));
    doc.head.append(script);
  });
  return bootstrap.promise;
}

export function createGptRewardedAdapter({
  emit = () => {}, enabled = false, adUnitPath = '/23379831154/pixieed_rewarded',
  windowRef = globalThis.window, documentRef = globalThis.document,
  timeoutMs = 10_000, schedule = setTimeout, cancelSchedule = clearTimeout
} = {}) {
  let disposed = false, slot = null, pubads = null, readyEvent = null, started = false, shown = false;
  let slotDestroyed = false, reserved = false;
  const handlers = [];
  const safeEmit = event => { if (!disposed) { try { emit(event); } catch {} } };
  function releaseSlot() {
    if (!slot || slotDestroyed) return;
    slotDestroyed = true;
    try { windowRef.googletag.destroySlots([slot]); } catch {}
    if (reserved && activeSlots.get(windowRef) === slot) activeSlots.delete(windowRef);
    reserved = false;
  }
  function destroy() {
    if (disposed) return;
    disposed = true; readyEvent = null;
    for (const [name, callback] of handlers) { try { pubads?.removeEventListener(name, callback); } catch {} }
    handlers.length = 0; releaseSlot();
  }
  const bind = (name, callback) => {
    const handler = event => { if (!disposed && slot && event?.slot === slot) callback(event); };
    handlers.push([name, handler]); pubads.addEventListener(name, handler);
  };
  return {
    async prepare() {
      if (!enabled) { safeEmit({ type: 'unsupported', message: 'リワード広告は現在無効です。' }); return; }
      if (disposed || started) return;
      if (!adUnitPath || typeof adUnitPath !== 'string') { safeEmit({ type: 'unsupported' }); return; }
      if (activeSlots.has(windowRef)) { safeEmit({ type: 'error', message: '広告を準備しています。' }); return; }
      started = true;
      const bootstrap = await loadSdk(windowRef, documentRef, timeoutMs, schedule, cancelSchedule);
      if (disposed) return;
      await new Promise((resolve, reject) => {
        try {
          const tag = windowRef.googletag;
          const create = () => {
            if (disposed) { resolve(); return; }
            try {
              const format = tag.enums?.OutOfPageFormat?.REWARDED;
              if (format === undefined) { safeEmit({ type: 'unsupported' }); resolve(); return; }
              slot = tag.defineOutOfPageSlot(adUnitPath, format);
              if (!slot) { safeEmit({ type: 'unsupported' }); resolve(); return; }
              activeSlots.set(windowRef, slot); reserved = true;
              pubads = tag.pubads(); slot.addService(pubads);
              bind('slotRenderEnded', event => { if (event.isEmpty) safeEmit({ type: 'noFill' }); });
              bind('rewardedSlotReady', event => {
                if (shown || slotDestroyed) return;
                readyEvent = event; safeEmit({ type: 'ready' });
              });
              bind('rewardedSlotGranted', event => safeEmit({ type: 'granted', payload: event.payload }));
              bind('rewardedSlotVideoCompleted', () => safeEmit({ type: 'videoCompleted' }));
              bind('rewardedSlotClosed', () => safeEmit({ type: 'closed' }));
              if (!bootstrap.servicesEnabled) { tag.enableServices(); bootstrap.servicesEnabled = true; }
              tag.display(slot); resolve();
            } catch (error) { destroy(); reject(error); }
          };
          if (tag.apiReady) create(); else tag.cmd.push(create);
        } catch (error) { reject(error); }
      });
    },
    show() {
      if (disposed || !readyEvent || slotDestroyed || shown) return false;
      const current = readyEvent; readyEvent = null;
      try { shown = current.makeRewardedVisible() === true; } catch { shown = false; }
      return shown;
    },
    // Closed is visual only; keep this slot's receipt listener alive for the controller grace period.
    close() { readyEvent = null; },
    destroy
  };
}
