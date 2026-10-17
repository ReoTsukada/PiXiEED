/** Navigation and presentation for a dedicated puzzle editing session. */
export function mountGameEditorSession({ kind, isActive, isDirty, workspace = () => null }) {
  const body = document.body;
  const label = kind === 'hidden-object' ? 'もの探し' : '間違い探し';
  const destination = `/play/${kind}/`;
  const controls = document.createElement('div'); controls.className = 'game-editor-session';
  const expand = document.createElement('button'); expand.type = 'button'; expand.id = 'game-editor-expand';
  const exit = document.createElement('button'); exit.type = 'button'; exit.id = 'game-editor-exit'; exit.textContent = '編集を終了';
  exit.setAttribute('aria-label', `${label}の編集を終了して一覧へ戻る`);
  controls.append(expand, exit);
  const css = document.createElement('link'); css.rel = 'stylesheet'; css.href = '/css/game-editor-session.css?rev=20261017-game-editor-1'; document.head.append(css);
  let expanded = false, scrollY = 0, previousFocus = null, leaving = false, hasHistoryEntry = false, recovering = false;
  const token = crypto.randomUUID();
  const dirty = () => Boolean(isActive() && isDirty());
  function setExpanded(value, syncFullscreen = true) {
    expanded = value;
    if (value) { scrollY = window.scrollY; previousFocus = document.activeElement; }
    body.classList.toggle('game-editor-expanded', value);
    if (syncFullscreen) {
      if (value && !document.fullscreenElement) void document.documentElement.requestFullscreen?.().catch(() => {});
      else if (!value && document.fullscreenElement === document.documentElement) void document.exitFullscreen?.().catch(() => {});
    }
    expand.textContent = value ? '拡大終了' : '拡大'; expand.setAttribute('aria-expanded', String(value));
    expand.setAttribute('aria-label', value ? '拡大表示を終了' : '編集画面を大きく表示');
    window.dispatchEvent(new Event('resize'));
    if (!value) { window.scrollTo(0, scrollY); if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true }); }
  }
  setExpanded(false, false);
  document.addEventListener('fullscreenchange', () => { if (expanded && !document.fullscreenElement) setExpanded(false, false); });
  const acceptLeave = () => !dirty() || window.confirm('未保存の変更があります。編集を終了しますか？「キャンセル」で編集を続けられます。');
  async function leave(url) {
    if (leaving || !acceptLeave()) return;
    leaving = true;
    try { await workspace()?.pauseForNavigation?.(); location.assign(url); }
    catch { leaving = false; }
  }
  expand.addEventListener('click', () => setExpanded(!expanded));
  exit.addEventListener('click', () => void leave(destination));
  document.addEventListener('click', event => {
    const replacing = event.target.closest?.('#hidden-new,#hidden-image-replace');
    if (replacing && isActive() && !acceptLeave()) { event.preventDefault(); event.stopImmediatePropagation(); return; }
    const link = event.target.closest?.('a[href]');
    if (!link || !isActive() || event.defaultPrevented || link.download || link.getAttribute('href')?.startsWith('#')) return;
    event.preventDefault(); event.stopImmediatePropagation();
    void leave(link.href);
  }, true);
  window.addEventListener('beforeunload', event => {
    if (!leaving && dirty()) { event.preventDefault(); event.returnValue = ''; }
  });
  window.addEventListener('popstate', () => {
    if (!hasHistoryEntry || leaving) return;
    if (recovering) { recovering = false; return; }
    if (history.state?.gameEditorSession === token) return;
    if (!acceptLeave()) { recovering = true; history.go(1); return; }
    leaving = true;
    void Promise.resolve(workspace()?.pauseForNavigation?.()).then(() => history.back());
  });
  window.addEventListener('message', event => {
    if (event.origin !== location.origin || event.data?.type !== 'pixieed-game-draw-escape') return;
    if (![...document.querySelectorAll('iframe.game-draw-host__frame')].some(frame => frame.contentWindow === event.source)) return;
    if (expanded) setExpanded(false);
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && expanded && !event.defaultPrevented && !document.querySelector('dialog[open],details[open]')) {
      event.preventDefault(); setExpanded(false);
    }
  });
  function refresh() {
    const active = Boolean(isActive());
    body.toggleAttribute('data-game-editor-active', active);
    controls.hidden = !active;
    const header = document.querySelector('.header-inner');
    if (header && controls.parentElement !== header) header.append(controls);
    // The game's explicit exit and the header menu own document navigation.
    for (const link of document.querySelectorAll('main a[href]:not([href^="#"])')) {
      if (active) { link.hidden = true; link.inert = true; }
      else { link.hidden = false; link.inert = false; }
    }
    if (active && !hasHistoryEntry) {
      history.pushState({ ...history.state, gameEditorSession: token }, '', location.href); hasHistoryEntry = true;
    }
    if (!active && expanded) setExpanded(false);
  }
  const observer = new MutationObserver(refresh);
  observer.observe(body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
  refresh();
  return { refresh, leave, setExpanded, get dirty() { return dirty(); } };
}
