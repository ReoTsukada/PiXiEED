(function () {
  'use strict';

  const SUPABASE_URL = 'https://kyyiuakrqomzlikfaire.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_gnc61sD2hZvGHhEW8bQMoA_lrL07SN4';
  const AUTH_STORAGE_KEY = 'sb-kyyiuakrqomzlikfaire-auth-token';
  const VIEWER_KEY_STORAGE = 'pixieed:creator-play-viewer-key:v1';
  const REQUIRED_SECONDS = 10;
  let activeRun = 0;
  let timer = 0;

  function accessToken() {
    try {
      const parsed = JSON.parse(localStorage.getItem(AUTH_STORAGE_KEY) || 'null');
      const token = parsed?.access_token || parsed?.session?.access_token || parsed?.currentSession?.access_token || '';
      const payload = JSON.parse(atob(String(token).split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
      return Number(payload?.exp || 0) * 1000 > Date.now() + 30000 ? token : '';
    } catch (_error) { return ''; }
  }

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
    const digest = new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)));
    return Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('');
  }

  async function record(appKey, contentKey, seconds, run) {
    if (run !== activeRun) return;
    const viewerKeyHash = await sha256(viewerSecret());
    if (!viewerKeyHash) return;
    const token = accessToken();
    await fetch(`${SUPABASE_URL}/rest/v1/rpc/creator_record_valid_play_v1`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${token || SUPABASE_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        input_app_key: appKey,
        input_content_key: contentKey,
        input_viewer_key_hash: viewerKeyHash,
        input_engaged_seconds: Math.max(REQUIRED_SECONDS, Math.min(3600, seconds))
      })
    });
  }

  function track(appKey, contentKey) {
    window.clearInterval(timer);
    const run = ++activeRun;
    let seconds = 0;
    timer = window.setInterval(() => {
      if (run !== activeRun || document.visibilityState !== 'visible' || !document.hasFocus()) return;
      seconds += 1;
      if (seconds < REQUIRED_SECONDS) return;
      window.clearInterval(timer);
      record(String(appKey || ''), String(contentKey || ''), seconds, run).catch(() => {});
    }, 1000);
  }

  function stop() {
    activeRun += 1;
    window.clearInterval(timer);
  }

  window.addEventListener('pagehide', stop);
  window.PiXiEEDCreatorPlayRewards = Object.freeze({ track, stop });
})();
