/** One checked geometry transaction; failed loads never replace the live index. */
export function createMapGeometryLoader({ assets, apply, onState = () => {}, fetchJson = async (url, options) => {
  const response = await fetch(url, options);
  if (!response.ok) throw new Error(`Map geometry ${response.status}`);
  return response.json();
}, timeoutMs = 20000 } = {}) {
  let state = assets.length ? 'pending' : 'ready', flight = null, destroyed = false, controller = null;
  function notify(next) { state = next; if (!destroyed) onState(next); }
  function load({ reload = false } = {}) {
    if (destroyed) return Promise.reject(new Error('Map geometry loader is closed.'));
    if (flight) return flight;
    if (state === 'ready') return Promise.resolve(true);
    controller = new AbortController();
    const activeController = controller, signal = activeController.signal;
    notify('loading');
    let timer;
    const timeout = new Promise((_, reject) => { timer = setTimeout(() => { activeController.abort(); reject(new Error('Map geometry timed out.')); }, timeoutMs); });
    const operation = Promise.all(assets.map(async ({ kind, url, checksum }) => [kind, await fetchJson(`${url}?v=${encodeURIComponent(checksum)}`, { cache: reload ? 'reload' : 'force-cache', signal })]))
      .then(async entries => {
        if (destroyed || signal.aborted) throw new Error('Map geometry load cancelled.');
        await apply(Object.fromEntries(entries), { signal });
        if (destroyed || signal.aborted) throw new Error('Map geometry load cancelled.');
        notify('ready');
        return true;
      });
    flight = Promise.race([operation, timeout]).catch(error => { activeController.abort(); if (!destroyed) notify('error'); throw error; })
      .finally(() => { clearTimeout(timer); flight = null; controller = null; });
    return flight;
  }
  return Object.freeze({ load, getState: () => state, destroy() { destroyed = true; controller?.abort(); } });
}
