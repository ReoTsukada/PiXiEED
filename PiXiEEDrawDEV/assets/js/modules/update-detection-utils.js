(() => {
  if (typeof window === 'undefined') return;
  const state = { status: 'idle', currentBuildId: '', availableBuildId: '', currentRevision: 0, availableRevision: 0, releasedAt: '', message: '', updateMode: '', lastCheckedAt: 0, error: null };
  let inFlight = null;
  let dismissedBuild = '';
  let channel = null;
  const render = () => {
    let el = document.getElementById('pixieedrawUpdateNotice');
    if (state.status !== 'update-available' && state.status !== 'required-update') { el?.remove(); return; }
    if (!el) { el = document.createElement('aside'); el.id = 'pixieedrawUpdateNotice'; el.setAttribute('role', 'status'); document.body.append(el); }
    el.setAttribute('aria-live', state.status === 'required-update' ? 'assertive' : 'polite');
    el.innerHTML = `<strong>${state.status === 'required-update' ? '重要な更新があります' : '新しいバージョンがあります'}</strong><span>${state.message || ''}</span><button type="button" data-safe>安全更新は準備中です</button>${state.status === 'optional-update' || state.status === 'update-available' ? '<button type="button" data-later>あとで</button>' : ''}`;
    el.querySelector('[data-later]')?.addEventListener('click', () => { dismissedBuild = state.availableBuildId; try { sessionStorage.setItem('pixieedraw:update-dismissed-build', dismissedBuild); } catch {} render(); });
  };
  const valid = m => m && typeof m.buildId === 'string' && Number.isInteger(m.buildRevision) && m.buildRevision > 0 && ['optional', 'required'].includes(m.updateMode) && typeof m.message === 'string';
  async function check({ force = false } = {}) {
    if (inFlight) return inFlight;
    if (!force && Date.now() - state.lastCheckedAt < 15 * 60 * 1000) return state;
    inFlight = (async () => {
      state.status = 'checking'; state.currentBuildId = window.__PIXIEEDRAW_BUILD_ID__ || ''; state.currentRevision = Number(window.__PIXIEEDRAW_BUILD_REVISION__) || 0;
      try {
        const response = await fetch('version.json', { cache: 'no-store' });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const manifest = await response.json();
        if (!valid(manifest)) { state.status = 'invalid-manifest'; state.error = 'invalid-manifest'; return state; }
        Object.assign(state, { availableBuildId: manifest.buildId, availableRevision: manifest.buildRevision, releasedAt: manifest.releasedAt || '', message: manifest.message, updateMode: manifest.updateMode, lastCheckedAt: Date.now(), error: null });
        if (manifest.buildRevision <= state.currentRevision) { state.status = manifest.buildRevision === state.currentRevision ? 'up-to-date' : 'idle'; return state; }
        state.status = manifest.updateMode === 'required' ? 'required-update' : 'update-available';
        if (manifest.updateMode === 'optional' && dismissedBuild === manifest.buildId) { state.status = 'idle'; return state; }
        channel?.postMessage({ type: 'update-available', buildId: manifest.buildId, buildRevision: manifest.buildRevision, updateMode: manifest.updateMode, message: manifest.message });
        render(); return state;
      } catch (error) { state.status = navigator.onLine === false ? 'offline' : 'failed'; state.error = String(error?.message || error); return state; }
      finally { inFlight = null; }
    })();
    return inFlight;
  }
  function init() {
    try { dismissedBuild = sessionStorage.getItem('pixieedraw:update-dismissed-build') || ''; } catch {}
    if ('BroadcastChannel' in window) { channel = new BroadcastChannel('pixieedraw-update'); channel.onmessage = event => { const data = event.data || {}; if (data.type !== 'update-available' || data.buildId === state.availableBuildId) return; Object.assign(state, { status: data.updateMode === 'required' ? 'required-update' : 'update-available', availableBuildId: data.buildId, availableRevision: data.buildRevision, updateMode: data.updateMode, message: data.message || '' }); render(); }; }
    check(); document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') check(); }); window.addEventListener('online', () => check({ force: true })); window.setInterval(() => check(), 15 * 60 * 1000);
  }
  window.__pixieedrawCheckForUpdates = () => check({ force: true });
  window.__pixieedrawGetUpdateStatus = () => ({ ...state });
  window.__pixieedrawResetUpdateDismissal = () => { dismissedBuild = ''; try { sessionStorage.removeItem('pixieedraw:update-dismissed-build'); } catch {} render(); };
  window.addEventListener('load', init, { once: true });
})();
