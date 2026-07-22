(function () {
  'use strict';

  const VIEWER_KEY_STORAGE = 'pixieed:market-viewer-key:v1';
  const REQUIRED_VISIBLE_SECONDS = 5;
  let trackedAssetId = '';
  let visibleSeconds = 0;
  let timer = 0;
  let submitted = false;

  function viewerSecret() {
    try {
      let value = localStorage.getItem(VIEWER_KEY_STORAGE) || '';
      if (!value) {
        value = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}-${Math.random()}`;
        localStorage.setItem(VIEWER_KEY_STORAGE, value);
      }
      return value;
    } catch (_error) {
      return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}-${Math.random()}`;
    }
  }

  async function sha256(value) {
    if (!globalThis.crypto?.subtle) return '';
    const bytes = new TextEncoder().encode(String(value || ''));
    const digest = new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', bytes));
    return Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('');
  }

  async function submit() {
    if (submitted || !trackedAssetId || document.visibilityState !== 'visible') return;
    submitted = true;
    window.clearInterval(timer);
    try {
      const access = window.PiXiEEDMarketAccess ? await window.PiXiEEDMarketAccess.check() : null;
      if (!access?.client) return;
      const viewerKeyHash = await sha256(viewerSecret());
      if (!viewerKeyHash) return;
      await access.client.rpc('market_record_valid_pageview_v1', {
        input_asset_id: trackedAssetId,
        input_viewer_key_hash: viewerKeyHash,
        input_dwell_seconds: Math.max(REQUIRED_VISIBLE_SECONDS, Math.min(3600, visibleSeconds))
      });
    } catch (_error) {
      // Reward tracking must never block the product page.
    }
  }

  function tick() {
    if (document.visibilityState !== 'visible' || !document.hasFocus()) return;
    visibleSeconds += 1;
    if (visibleSeconds >= REQUIRED_VISIBLE_SECONDS) submit();
  }

  function track(asset) {
    if (!asset?.id || trackedAssetId) return;
    trackedAssetId = String(asset.id);
    timer = window.setInterval(tick, 1000);
  }

  window.addEventListener('pagehide', () => window.clearInterval(timer), { once: true });
  window.PiXiEEDMarketPageviewRewards = Object.freeze({ track });
})();
