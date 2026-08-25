export const title = 'PiXiEEDstudio / iDRAW / SITE-400 ローカルRoute';
const mountedHosts = new WeakMap();

/**
 * This route is loaded only after the isolated Core Shell has passed its
 * server-route and feature-flag checks.  It mounts a status projection, not
 * the full Draw2 workspace, so the initial Shell never imports Draw2's heavy
 * Canvas/Timeline bundle.
 */
export function mount({ host } = {}) {
  if (!(host instanceof HTMLElement)) {
    return Promise.resolve({ mounted: false, status: 'INVALID_HOST' });
  }
  const existing = mountedHosts.get(host);
  if (existing !== undefined) return existing;
  const mountPromise = (async () => {
    host.innerHTML = `
      <section class="hero" data-site400-route="local" aria-labelledby="route-draw2-heading">
        <span class="hero__eyebrow">SITE-400 / isolated local route</span>
        <h1 class="hero__title" id="route-draw2-heading" tabindex="-1">PiXiEEDstudio / iDRAW</h1>
        <p class="muted">Server-authorized Registry Providerのローカル確認です。Pixel、PXD、Storage payloadはこのRouteへ渡しません。</p>
        <div class="card" data-site400-local-status-host aria-label="SITE-400 local status"></div>
      </section>
    `;
    const statusHost = host.querySelector('[data-site400-local-status-host]');
    if (!(statusHost instanceof HTMLElement)) {
      return { mounted: false, status: 'STATUS_HOST_MISSING' };
    }
    const module = await import('../../../pixiedraw2/dist/site400-browser-entry.js');
    return module.mountSite400BrowserEntry({ host: statusHost, featureFlag: 'on' });
  })();
  mountedHosts.set(host, mountPromise);
  return mountPromise;
}

export function render() {
  return { state: 'local-route', tool: 'draw2', package: 'SITE-400' };
}
