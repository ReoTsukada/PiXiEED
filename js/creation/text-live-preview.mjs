/** Latest-request-only scheduling. No network, downloads or storage. */
export function createPreviewQueue({ active, hasSource, render, onState = () => {}, timers = globalThis, delay = 180 }) {
  let version = 0, timer = null, task = null, disposed = false, automatic = true, composing = false, state = 'inactive';
  const publish = (next, error = null) => { state = next; onState(next, error); };
  function abort() {
    version++;
    if (timer !== null) timers.clearTimeout(timer);
    timer = null;
    task?.abort(); task = null;
  }
  async function execute(expected) {
    timer = null;
    if (disposed || expected !== version || !active() || !hasSource() || composing) return;
    const controller = new AbortController(); task = controller;
    publish('rendering');
    try {
      await render(controller.signal);
      if (!disposed && expected === version && !controller.signal.aborted && active()) publish('ready');
    } catch (error) {
      if (!disposed && expected === version && !controller.signal.aborted) publish('error', error);
    } finally { if (task === controller) task = null; }
  }
  function request({ immediate = false, force = false } = {}) {
    if (disposed) return;
    abort();
    if (!active()) { publish('inactive'); return; }
    if (!hasSource()) { publish('empty'); return; }
    if (composing || (!automatic && !force)) { publish('paused'); return; }
    publish('queued');
    const expected = version;
    timer = timers.setTimeout(() => { void execute(expected); }, immediate ? 0 : delay);
  }
  return {
    get state() { return state; },
    get automatic() { return automatic; },
    request,
    pause() { if (!disposed) { abort(); publish(active() ? 'paused' : 'inactive'); } },
    setAutomatic(value) { automatic = Boolean(value); request(); },
    setComposing(value) { composing = Boolean(value); request(); },
    destroy() { abort(); disposed = true; },
  };
}

/** Bind the existing text engine; the generated result remains its source of truth. */
export function installTextLivePreview({ root, getMode, hasSource, render, document: doc = document, window: win = window }) {
  const $ = selector => root.querySelector(selector);
  const panel = $('[data-tx-output-pane]');
  const controls = doc.createElement('div'); controls.className = 'tx-live-controls';
  controls.innerHTML = '<label class="tx-check"><input data-tx-live-auto type="checkbox" checked>リアルタイムプレビュー</label><button class="tx-link" data-tx-live-refresh type="button" hidden>プレビューを更新</button><button class="tx-link" data-tx-live-cancel type="button" hidden>中止</button><p>設定を変えると自動更新。確認してから出力・コピーできます。</p>';
  panel.append(controls);
  const sheet = doc.createElement('link'); sheet.rel = 'stylesheet'; sheet.href = '/css/text-live-preview.css?rev=20261030-live-text-1'; doc.head.append(sheet);
  const auto = $('[data-tx-live-auto]'), refresh = $('[data-tx-live-refresh]'), cancel = $('[data-tx-live-cancel]');
  const badge = $('[data-tx-badge]'), result = $('[data-tx-result]'), card = root.querySelector('.tx-result-card');
  const active = () => getMode() === 'output';
  const actionSelector = '[data-tx-result] a[download],[data-tx-result] button';
  let queue;
  function onState(state, error) {
    const isActive = active(), ready = state === 'ready', working = state === 'queued' || state === 'rendering';
    root.dataset.txLiveState = state;
    card.setAttribute('aria-busy', String(working));
    card.classList.toggle('tx-preview-stale', isActive && !ready && !result.hidden);
    for (const action of root.querySelectorAll(actionSelector)) {
      if (isActive && !ready) {
        action.dataset.txLiveBlocked = '';
        action.setAttribute('aria-disabled', 'true');
        if (action.tagName === 'BUTTON') action.disabled = true;
      } else if (action.hasAttribute('data-tx-live-blocked')) {
        action.removeAttribute('data-tx-live-blocked'); action.removeAttribute('aria-disabled');
        if (action.tagName === 'BUTTON' && root.getAttribute('aria-busy') !== 'true') action.disabled = false;
      }
    }
    cancel.hidden = !working;
    refresh.hidden = !isActive || !hasSource() || (auto.checked && !['paused','error'].includes(state));
    if (isActive) {
      const previous = !result.hidden;
      const messages = {
        empty: '文字にするファイルを選んでください。',
        queued: '設定変更を反映しています…',
        rendering: '文字プレビューを作成しています…',
        ready: 'プレビューを更新しました。確認してから出力・コピーできます。',
        paused: '自動更新を停止しています。「プレビューを更新」で再開できます。',
        error: error?.message || 'プレビューを作成できませんでした。設定・素材を確認してください。',
      };
      $('[data-tx-status]').textContent = (messages[state] || '') + (previous && !ready ? ' 表示中の結果は前回のものです。' : '');
      if (!ready) badge.textContent = previous ? '前回の結果（未反映）' : working ? '更新中…' : 'プレビュー';
    }
    root.dispatchEvent(new win.CustomEvent('pixieed:text-preview', { bubbles: true }));
  }
  queue = createPreviewQueue({ active, hasSource, render, onState, timers: win });
  const changed = event => {
    if (event.target.matches('[data-tx-style],[data-tx-columns],[data-tx-characters],[data-tx-invert],[data-tx-attach]')) queue.request();
  };
  const guard = event => {
    if (active() && queue.state !== 'ready' && event.target.closest(actionSelector)) {
      event.preventDefault(); event.stopImmediatePropagation();
    }
  };
  root.addEventListener('input', changed); root.addEventListener('change', changed);
  root.addEventListener('click', guard, true);
  auto.addEventListener('change', () => queue.setAutomatic(auto.checked));
  refresh.addEventListener('click', () => queue.request({ immediate: true, force: true }));
  cancel.addEventListener('click', () => queue.pause());
  const composing = event => {
    if (event.target.matches('[data-tx-characters]')) queue.setComposing(event.type === 'compositionstart');
  };
  root.addEventListener('compositionstart', composing); root.addEventListener('compositionend', composing);
  const onHide = event => { queue.pause(); if (!event.persisted) api.destroy(); };
  const onShow = event => { if (event.persisted) queue.request(); };
  win.addEventListener('pagehide', onHide); win.addEventListener('pageshow', onShow);
  const api = {
    get state() { return queue.state; },
    get hasSource() { return hasSource(); },
    invalidate: () => queue.request(),
    refresh: () => queue.request({ immediate: true, force: true }),
    cancel: () => queue.pause(),
    destroy() {
      queue.destroy(); root.removeEventListener('input', changed); root.removeEventListener('change', changed); root.removeEventListener('click', guard, true);
      root.removeEventListener('compositionstart', composing); root.removeEventListener('compositionend', composing);
      win.removeEventListener('pagehide', onHide); win.removeEventListener('pageshow', onShow);
    },
  };
  root.textLivePreview = api;
  queue.request();
  return api;
}
