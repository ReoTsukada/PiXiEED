import { createWorkspaceHistoryEntry, isWorkspaceRequested } from './tool-workspace-state.mjs?rev=20261017-workspace-entry-1';

const DRAFT_KEY = 'pixieed:pxd:last:direct-workspace:v1';
const attributes = node => [...node.attributes].map(a => [a.name, a.value]);
// This existing global dialog can be mounted by the public header before the
// editor. It belongs to both views, rather than the hidden introduction DOM.
const isSharedRewardRoot = node => node.tagName === 'ASIDE' && Boolean(node.querySelector(':scope > .pixieed-site-reward'));
function restoreAttributes(node, saved) {
  for (const a of [...node.attributes]) node.removeAttribute(a.name);
  for (const [name, value] of saved) node.setAttribute(name, value);
}

/** A single retained, real creation runtime in this document. No editor bootstrap is evaluated. */
export function installDirectToolShell({ section, mode, search }) {
  const body = document.body, html = document.documentElement;
  let runtime = null, mounting = null, open = false, generation = 0, disposed = false, activated = false;
  let description = null, shellAttributes = null, workAttributes = null, bodyObserver = null, headObserver = null;
  let pendingActivation = null, scroll = null, teardown = null, reloadRequired = false, barFrame = 0;
  let loadingCardTimer = 0, loadingCardVisible = false, coreReady = false, cameraPhaseObserver = null;
  const owned = new Map(), styles = new Map(), startupHints = new Set();
  const styleStates = new WeakMap();
  const barObserver = window.ResizeObserver ? new ResizeObserver(() => {
    if (!barFrame) barFrame = requestAnimationFrame(() => { barFrame = 0; viewport(); });
  }) : null;
  const lifecycle = new AbortController();
  const recordStyleEvent = event => {
    const link = event.target;
    if (link?.matches?.('link[rel="stylesheet"]')) styleStates.set(link, event.type === 'load' ? 'loaded' : 'error');
  };
  document.head.addEventListener('load', recordStyleEvent, true);
  document.head.addEventListener('error', recordStyleEvent, true);
  const start = document.querySelector('[data-embed-start]');
  const status = section.querySelector('[data-embed-status]');
  const bootstrapBack = document.querySelector('[data-direct-bootstrap-back]');
  const bar = document.createElement('div'); bar.className = 'tool-direct__bar px-site-header px-header-inner'; bar.dataset.directChrome = ''; bar.hidden = true;
  const bootCue = document.createElement('div'); bootCue.className = 'tool-direct__boot-cue'; bootCue.dataset.directChrome = ''; bootCue.hidden = true;
  const bootCueStatus = document.createElement('p'); bootCueStatus.setAttribute('role', 'status'); bootCueStatus.setAttribute('aria-live', 'polite');
  const bootCueBack = document.createElement('button'); bootCueBack.type = 'button'; bootCueBack.textContent = '説明へ戻る';
  bootCue.append(bootCueStatus, bootCueBack);
  const label = document.createElement('strong'); label.textContent = 'PiXiEEDraw';
  const message = document.createElement('span'); message.className = 'tool-direct__status'; message.setAttribute('role', 'status');
  const retry = document.createElement('button'); retry.type = 'button'; retry.textContent = '再試行'; retry.hidden = true;
  const recovery = document.createElement('button'); recovery.type = 'button'; recovery.textContent = '作品を選ぶ'; recovery.hidden = true;
  const explanation = document.createElement('button'); explanation.type = 'button'; explanation.textContent = '?'; explanation.setAttribute('aria-label', '説明を見る'); explanation.title = '説明を見る'; explanation.dataset.shellExplanation = '';
  explanation.className = 'tool-direct__help';
  const chromeMoves = [];
  bar.append(label, message, retry, recovery, explanation);
  barObserver?.observe(bar);
  const publicApi = Object.freeze({ kind: 'direct', get active() { return open && !disposed; }, get runtime() { return runtime; }, getState: () => runtime?.getState(), show: () => show(true), hide: () => hide(true), dispose });
  window.__PIXIEED_CREATION_HOST__ = publicApi;

  function setIntent(value, replace = false) {
    const entry = createWorkspaceHistoryEntry(location.href, history.state, value);
    const unchanged = entry.url === `${location.pathname}${location.search}${location.hash}`;
    history[replace || unchanged ? 'replaceState' : 'pushState'](entry.state, '', entry.url);
  }
  function syncRetainedRoute() {
    if (!runtime || disposed) return;
    const url = new URL(location.href), workspace = runtime.draw.workspace;
    if (workspace.restoreError) return;
    // Browser history toggles visibility. A retained editor keeps its own latest
    // project/revision and mode; reloading the resumed URL must restore that state.
    for (const key of ['pxd','pxdRevision','pxdImage','modePxd','modePxdRevision','modePxdImage','modeProjectTool']) url.searchParams.delete(key);
    const project = workspace.persisted ? workspace.persistedProject : null;
    if (project?.projectId && project?.revisionId) {
      url.searchParams.set('pxd', project.projectId); url.searchParams.set('pxdRevision', project.revisionId);
      const role = project.manifest?.creationProject?.imageRole || runtime.draw.getRestoreImageRole();
      if (role && role !== 'main') url.searchParams.set('pxdImage', role);
    }
    url.searchParams.set('mode', runtime.modes.mode);
    history.replaceState(history.state, '', `${url.pathname}${url.search}${url.hash}`);
  }
  function showRestoreState() {
    if (!runtime || disposed) return;
    const error = runtime.draw.workspace.restoreError;
    recovery.hidden = !error;
    message.textContent = error ? `作品を開けませんでした。${error}` : '';
    status.textContent = error ? message.textContent : '編集を保持しています。';
    bar.classList.toggle('tool-direct__bar--recovery', Boolean(error));
    const main = document.querySelector('#main');
    if (open && main) main.inert = Boolean(error) || runtime.draw.workspace.busy;
    viewport();
  }
  function own(node) {
    if (node === description || node === bar || node === bootCue || owned.has(node) || node.tagName === 'SCRIPT' || isSharedRewardRoot(node)) return;
    owned.set(node, { hidden: node.hidden, inert: node.inert });
    node.dataset.directOwned = '';
    if (!open) { node.hidden = true; node.inert = true; }
  }
  function ownStyle(node) {
    if (!node.matches?.('link[rel="stylesheet"],style') || styles.has(node) || node.hasAttribute('data-direct-shell-style')) return;
    styles.set(node, node.disabled === true);
    if (node.matches('link[rel="stylesheet"]') && !styleStates.has(node)) styleStates.set(node, 'pending');
    if (!open && runtime) node.disabled = true;
  }
  function addStartupHint(rel, href, as = '') {
    const exists = [...document.head.querySelectorAll('link')].some(node =>
      node.rel === rel && node.href === href && (!as || node.as === as));
    if (exists) return;
    const hint = document.createElement('link');
    hint.rel = rel;
    if (as) hint.as = as;
    hint.href = href;
    hint.dataset.directStartupHint = '';
    startupHints.add(hint);
    document.head.append(hint);
  }
  function primeStartupDownloads(template) {
    const existingStylesheets = new Set([...document.head.querySelectorAll('link[rel="stylesheet"]')].map(node => node.href));
    for (const source of template.head.querySelectorAll('link[rel="modulepreload"][href]')) {
      const href = new URL(source.getAttribute('href'), location.origin);
      if (href.origin === location.origin) addStartupHint('modulepreload', href.href);
    }
    const modeStylesheet = new URL('/css/creation-modes.css?rev=20261017-editor-improvements-1', location.origin);
    if (!existingStylesheets.has(modeStylesheet.href)) addStartupHint('preload', modeStylesheet.href, 'style');
  }
  function clearStartupHints() {
    for (const hint of startupHints) hint.remove();
    startupHints.clear();
  }
  function viewport() {
    if (!open) return;
    const view = window.visualViewport;
    let changed = false;
    for (const [name, value] of Object.entries({ top:view?.offsetTop || 0, height:view?.height || innerHeight, width:view?.width || innerWidth })) {
      const key = `--tool-direct-${name}`, next = `${value}px`;
      if (html.style.getPropertyValue(key) !== next) { html.style.setProperty(key, next); changed = true; }
    }
    const height = `${bar.getBoundingClientRect().height || 64}px`;
    changed ||= html.style.getPropertyValue('--tool-direct-bar') !== height;
    html.style.setProperty('--tool-direct-bar', height);
    if (changed) window.dispatchEvent(new Event('resize'));
  }
  function moveIntoBar(node) {
    if (!node?.parentNode || node.parentNode === bar || chromeMoves.some(item => item.node === node)) return;
    const marker = document.createComment('direct-tool-header-position');
    node.before(marker);
    chromeMoves.push({ node, marker });
    bar.insertBefore(node, explanation);
  }
  function restoreBarNodes() {
    for (const { node, marker } of chromeMoves.splice(0)) {
      if (marker.parentNode) marker.replaceWith(node);
      else node.remove();
    }
    document.querySelector('.tool-direct__merged-header')?.classList.remove('tool-direct__merged-header');
  }
  function mergeEditorChrome() {
    if (!open || !bar.isConnected) return;
    const header = [...owned.keys()].find(node => node.matches?.('.site-header'));
    if (header) header.classList.add('tool-direct__merged-header');
    const projectBar = document.querySelector('.project-bar.px-tool-header-files');
    const controls = header?.querySelector('.px-tool-header-controls') || document.querySelector('.px-tool-header-controls');
    moveIntoBar(projectBar);
    moveIntoBar(controls);
    const rewardStatus = document.querySelector('.pixieed-site-reward-status');
    if (rewardStatus && !bar.contains(rewardStatus)) moveIntoBar(rewardStatus);
  }
  function useWork() {
    if (!description) return;
    description.hidden = true; description.inert = true;
    for (const header of description.querySelectorAll('.site-header')) { header.dataset.directShellHeader = ''; header.classList.remove('site-header'); }
    restoreAttributes(body, workAttributes);
    html.dataset.toolDirect = 'work';
    for (const [node, state] of owned) { node.hidden = state.hidden; node.inert = state.inert; }
    for (const [node, disabled] of styles) node.disabled = disabled;
    bar.hidden = coreReady || !loadingCardVisible; bootCue.hidden = !loadingCardVisible; mergeEditorChrome(); viewport();
  }
  function useDescription({ restoreFocus = true } = {}) {
    if (!description) return;
    restoreBarNodes();
    for (const [node, state] of owned) { state.hidden = node.hidden; state.inert = node.inert; node.hidden = true; node.inert = true; }
    for (const node of styles.keys()) node.disabled = true;
    workAttributes = attributes(body);
    restoreAttributes(body, shellAttributes);
    html.dataset.toolDirect = 'explanation';
    for (const key of ['--tool-direct-top','--tool-direct-height','--tool-direct-width','--tool-direct-bar']) html.style.removeProperty(key);
    bar.hidden = true;
    description.hidden = false; description.inert = false;
    for (const header of description.querySelectorAll('[data-direct-shell-header]')) header.classList.add('site-header');
    start.textContent = runtime ? '作業に戻る' : '作業を始める'; start.setAttribute('aria-expanded', 'false');
    if (scroll) window.scrollTo({ top: scroll.y, left: scroll.x, behavior: 'instant' });
    if (restoreFocus) start.focus({ preventScroll: true });
  }
  function prepareHost(template) {
    if (!description) {
    shellAttributes = attributes(body); scroll = { x: scrollX, y: scrollY };
    description = document.createElement('div'); description.dataset.directDescription = '';
    const main = document.querySelector('#main');
    if (main) { main.id = 'tool-shell-main'; }
    const skip = document.querySelector('.skip-link[href="#main"]'); if (skip) skip.setAttribute('href', '#tool-shell-main');
    const shared = [...body.children].filter(isSharedRewardRoot);
    description.append(...[...body.childNodes].filter(node => !shared.includes(node))); body.append(description, bar, bootCue, ...shared);
    for (const header of description.querySelectorAll('.site-header')) { header.dataset.directShellHeader = ''; header.classList.remove('site-header'); }
    headObserver = new MutationObserver(records => { for (const record of records) for (const node of record.addedNodes) if (node.nodeType === 1) ownStyle(node); });
    headObserver.observe(document.head, { childList: true });
    bodyObserver = new MutationObserver(records => {
      for (const record of records) for (const node of record.addedNodes) if (node.nodeType === 1 && node.parentElement === body) own(node);
      label.textContent = { draw:'PiXiEEDraw', camera:'PiXiEED カメラ', audio:'PiXiEED 音楽' }[body.dataset.creationMode] || 'PiXiEEDraw';
      updateCameraStatus();
    });
    bodyObserver.observe(body, { childList: true, attributes: true, attributeFilter: ['data-creation-mode'] });
    }
    for (const attr of [...body.attributes]) if (!['class','data-page','data-tool-name','data-tool-short'].includes(attr.name)) body.removeAttribute(attr.name);
    for (const name of ['class','data-page','data-tool-name','data-tool-short']) {
      const value = template.body.getAttribute(name); if (value === null) body.removeAttribute(name); else body.setAttribute(name, value);
    }
    workAttributes = attributes(body);
    for (const node of [...template.body.children]) {
      if (node.matches('script,.skip-link,.site-footer')) continue;
      if (node.matches('main')) node.querySelector('.draw-title')?.remove();
      body.append(document.importNode(node, true)); own(body.lastElementChild);
    }
    const header = [...owned.keys()].find(n => n.matches('.site-header'));
    header?.querySelector('.brand')?.remove();
    useWork();
  }
  function checkAlive() { if (disposed) throw new DOMException('編集画面を閉じました。', 'AbortError'); }
  function clearAttempt() {
    for (const node of owned.keys()) node.remove(); owned.clear();
    for (const node of styles.keys()) node.remove(); styles.clear();
    clearStartupHints();
    workAttributes = null;
  }
  function setLoadingStage(text) {
    message.textContent = text;
    status.textContent = text;
    bootCueStatus.textContent = text;
  }
  async function waitForShellStyles() {
    const links = [...document.querySelectorAll('link[data-direct-shell-required]')];
    for (const link of links) {
      const state = link.dataset.directShellState;
      if (state === 'error') {
        reloadRequired = true;
        throw new Error('画面の表示を読み込めませんでした。再読み込みして再試行してください。');
      }
      if (state === 'loaded') continue;
      await new Promise((resolve, reject) => {
        const finish = () => {
          link.removeEventListener('load', loaded);
          link.removeEventListener('error', failed);
          lifecycle.signal.removeEventListener('abort', aborted);
          if (link.dataset.directShellState === 'error') failed();
          else if (link.dataset.directShellState === 'loaded') resolve();
          else reject(new Error('画面の表示を読み込めませんでした。'));
        };
        const loaded = () => finish();
        const failed = () => {
          link.removeEventListener('load', loaded);
          link.removeEventListener('error', failed);
          lifecycle.signal.removeEventListener('abort', aborted);
          reloadRequired = true;
          reject(new Error('画面の表示を読み込めませんでした。再読み込みして再試行してください。'));
        };
        const aborted = () => {
          link.removeEventListener('load', loaded);
          link.removeEventListener('error', failed);
          lifecycle.signal.removeEventListener('abort', aborted);
          reject(new DOMException('編集画面を閉じました。', 'AbortError'));
        };
        lifecycle.signal.addEventListener('abort', aborted, { once: true });
        link.addEventListener('load', loaded, { once: true });
        link.addEventListener('error', failed, { once: true });
        // Close the small gap between reading the state and attaching events.
        if (link.dataset.directShellState === 'loaded') finish();
        else if (link.dataset.directShellState === 'error') failed();
        else if (lifecycle.signal.aborted) aborted();
      });
    }
    window.__PIXIEED_DIRECT_SHELL_CSS__?.release();
  }
  async function waitForMountedStyles() {
    for (;;) {
      await Promise.resolve(); // Let the head observer register links appended in the preceding mount task.
      const pending = [...styles.keys()].filter(node => node.matches?.('link[rel="stylesheet"]') && node.isConnected !== false);
      const unsettled = pending.filter(link => {
        const state = styleStates.get(link);
        if (state === 'error') { reloadRequired = true; throw new Error('編集画面の表示を読み込めませんでした。再読み込みして再試行してください。'); }
        if (state === 'loaded') return false;
        return true;
      });
      if (!unsettled.length) {
        await Promise.resolve();
        const current = [...styles.keys()].filter(node => node.matches?.('link[rel=stylesheet]') && node.isConnected !== false);
        if (pending.length === current.length && pending.every((node, index) => node === current[index])) return;
        continue;
      }
      await Promise.all(unsettled.map(link => new Promise((resolve, reject) => {
        const cleanup = () => {
          link.removeEventListener('load', onLoad);
          link.removeEventListener('error', onError);
          lifecycle.signal.removeEventListener('abort', onAbort);
        };
        const onLoad = () => { cleanup(); styleStates.set(link, 'loaded'); resolve(); };
        const onError = () => { cleanup(); styleStates.set(link, 'error'); reloadRequired = true; reject(new Error('編集画面の表示を読み込めませんでした。再読み込みして再試行してください。')); };
        const onAbort = () => { cleanup(); reject(new DOMException('編集画面を閉じました。', 'AbortError')); };
        link.addEventListener('load', onLoad, { once: true });
        link.addEventListener('error', onError, { once: true });
        lifecycle.signal.addEventListener('abort', onAbort, { once: true });
        const state = styleStates.get(link);
        if (state === 'loaded') onLoad();
        else if (state === 'error') onError();
        else if (lifecycle.signal.aborted) onAbort();
      })));
    }
  }
  function cameraPhaseText() {
    if (!coreReady || !open || runtime?.modes.mode !== 'camera') return '';
    const phase = document.querySelector('#pixelStudio')?.dataset.startupPhase;
    return ({ request: 'カメラとの接続を待っています…', video: '映像を受け取りました。表示を準備しています…', processing: '最初の画像を処理しています…' })[phase] || '';
  }
  function updateCameraStatus() {
    if (coreReady && !runtime?.draw.workspace.restoreError) {
      const text = cameraPhaseText();
      if (message.textContent !== text) message.textContent = text;
    }
  }
  function observeCameraPhase() {
    cameraPhaseObserver?.disconnect();
    cameraPhaseObserver = new MutationObserver(updateCameraStatus);
    cameraPhaseObserver.observe(body, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-startup-phase'] });
    updateCameraStatus();
  }
  async function loadRuntime() {
    if (runtime) return runtime;
    if (mounting) return mounting;
    mounting = (async () => {
      setLoadingStage('編集画面を取得しています…');
      const response = await fetch('/draw/editor.html', { credentials: 'same-origin', signal: lifecycle.signal });
      if (!response.ok) throw new Error('編集画面を読み込めませんでした。');
      const template = new DOMParser().parseFromString(await response.text(), 'text/html');
      checkAlive();
      // Head preloads are honored only after explicit workspace start. Scripts
      // remain excluded, and the runtime itself waits until editor CSS settles.
      primeStartupDownloads(template);
      prepareHost(template);
      // Start evaluating the already-required graph while the editor styles load.
      // The handled result is consumed only after CSS and restore-state checks.
      const runtimeImport = (async () => await import('./creation/creation-runtime.mjs?rev=20261024-all-tools-offerwall-1'))()
        .then(module => ({ module }), error => { reloadRequired = true; return { error }; });
      const cssLoads = [];
      const existing = new Set([...document.querySelectorAll('link[rel="stylesheet"]')].map(n => n.href));
      for (const source of template.head.querySelectorAll('link[rel="stylesheet"]')) {
        const href = new URL(source.getAttribute('href'), location.origin).href;
        if (existing.has(href)) continue;
        const link = document.createElement('link'); link.rel = 'stylesheet'; link.href = href;
        cssLoads.push(new Promise((resolve, reject) => {
          const abort = () => reject(new DOMException('編集画面を閉じました。', 'AbortError'));
          const finish = error => { lifecycle.signal.removeEventListener('abort', abort); link.onload = link.onerror = null; if (error) { reloadRequired = true; reject(error); } else resolve(); };
          lifecycle.signal.addEventListener('abort', abort, { once: true });
          link.onload = () => finish(); link.onerror = () => finish(new Error('編集画面の表示を読み込めませんでした。'));
        }));
        document.head.append(link); ownStyle(link); existing.add(href);
      }
      if (cssLoads.length) setLoadingStage('表示を読み込んでいます…');
      await Promise.all(cssLoads);
      await waitForShellStyles();
      checkAlive();
      setLoadingStage('編集機能を読み込んでいます…');
      const adapted = new URL(location.href); adapted.search = search.toString(); if (open) adapted.searchParams.set('workspace', '1'); else adapted.searchParams.delete('workspace'); adapted.searchParams.set('runtime', 'direct');
      history.replaceState(history.state, '', `${adapted.pathname}${adapted.search}${adapted.hash}`);
      let initialPointer, initialRestoreError = '';
      if (!adapted.searchParams.has('pxd') && !adapted.searchParams.has('modePxd')) {
        try {
          const direct = localStorage.getItem(DRAFT_KEY);
          const last = JSON.parse(direct !== null ? direct : localStorage.getItem('pixieed:pxd:last:creation') || localStorage.getItem('pixieed:pxd:last:draw') || 'null');
          if (last !== null && (typeof last?.projectId !== 'string' || !last.projectId || typeof last?.revisionId !== 'string' || !last.revisionId)) throw new Error('INVALID_DRAFT_POINTER');
          if (last?.projectId && last?.revisionId) initialPointer = { ...last, fork: true };
        } catch { initialRestoreError = '前回の作品の記録を確認できません。作品一覧から選び直してください。元の保存内容は保持しています。'; }
      }
      const importedRuntime = await runtimeImport;
      if (importedRuntime.error) throw importedRuntime.error;
      const { mountCreationRuntime } = importedRuntime.module;
      checkAlive();
      setLoadingStage(initialPointer ? '保存済みの作品を開いています…' : '制作画面を組み立てています…');
      runtime = await mountCreationRuntime({ signal: lifecycle.signal, isActive: () => open && !disposed, role: mode, requestedMode: mode, search: adapted.search, restoreLast: false, initialPointer, workspaceOptions: { rememberKey: DRAFT_KEY, rememberShared: false, allowImplicitImport: false, initialRestoreError }, deferInitialMode: true, onBootPhase: phase => {
        const labels = { draw: '編集画面を準備しています…', workspace: '作品と保存状態を確認しています…', mode: '選択したモードを準備しています…' };
        if (labels[phase] && open) setLoadingStage(labels[phase]);
      } });
      checkAlive();
      clearStartupHints();
      observeCameraPhase();
      return runtime;
    })();
    return mounting;
  }
  async function show(updateHistory = false) {
    if (disposed) return;
    if (!description && html.dataset.directShellStylesFailed === '') {
      status.textContent = '画面の表示を読み込めませんでした。再読み込みして再試行してください。';
      status.removeAttribute('aria-busy');
      start.setAttribute('aria-busy', 'false'); start.setAttribute('aria-disabled', 'false');
      const bootstrapRetry = document.querySelector('[data-direct-bootstrap-retry]');
      if (bootstrapRetry) bootstrapRetry.hidden = false;
      return;
    }
    delete html.dataset.directError;
    const token = ++generation; open = true;
    coreReady = false;
    syncRetainedRoute();
    if (updateHistory) setIntent(true);
    start.setAttribute('aria-busy', 'true'); start.setAttribute('aria-disabled', 'true');
    status.setAttribute('aria-busy', 'true'); retry.hidden = true; html.dataset.directLoading = '';
    loadingCardVisible = false; bar.hidden = true;
    clearTimeout(loadingCardTimer);
    // A fresh mount gets immediate status in the stable shell. Resuming an
    // already-retained runtime may keep the short warm-cache flicker filter.
    const immediate = !runtime;
    if (immediate) { loadingCardVisible = true; bar.hidden = true; bootCue.hidden = false; }
    else loadingCardTimer = window.setTimeout(() => {
      loadingCardTimer = 0;
      if (open && !disposed) { loadingCardVisible = true; bar.hidden = true; bootCue.hidden = false; }
    }, 300);
    if (description && workAttributes) useWork();
    setLoadingStage('制作画面を準備しています…');
    try {
      const editor = await loadRuntime();
      if (generation !== token || !open || disposed) return;
      syncRetainedRoute();
      setLoadingStage('選択したモードを準備しています…');
      const activation = editor.activate(activated ? null : mode);
      pendingActivation = activation;
      await activation; if (pendingActivation === activation) pendingActivation = null; activated = true;
      await waitForMountedStyles();
      // A newer show owns this retained runtime. Hide/dispose own suspension.
      if (generation !== token || !open || disposed) return;
      mergeEditorChrome();
      clearTimeout(loadingCardTimer); loadingCardTimer = 0; loadingCardVisible = true; bar.hidden = false; bootCue.hidden = true;
      workAttributes = attributes(body); label.textContent = { draw:'PiXiEEDraw', camera:'PiXiEED カメラ', audio:'PiXiEED 音楽' }[editor.state.mode];
      coreReady = true;
      start.setAttribute('aria-busy', 'false'); start.setAttribute('aria-disabled', 'false'); start.setAttribute('aria-expanded', 'true');
      status.removeAttribute('aria-busy');
      showRestoreState(); delete html.dataset.directLoading; delete html.dataset.directBootstrap;
      if (bootstrapBack) bootstrapBack.hidden = true;
      updateCameraStatus();
      viewport(); window.dispatchEvent(new Event('resize'));
      if (document.activeElement === start) document.querySelector('#draw-canvas')?.focus({ preventScroll: true });
    } catch (error) {
      if (disposed || generation !== token) return;
      clearTimeout(loadingCardTimer); loadingCardTimer = 0; loadingCardVisible = true; bar.hidden = false; bootCue.hidden = true;
      coreReady = false;
      html.dataset.directError = '';
      const requiredStylesFailed = reloadRequired && String(error?.message || '').includes('表示を読み込めませんでした');
      if (!requiredStylesFailed) delete html.dataset.directLoading;
      message.textContent = error.message || '起動できませんでした。'; retry.hidden = false;
      retry.textContent = reloadRequired ? '再読み込みして再試行' : '再試行';
      if (!description) {
        html.dataset.directBootstrap = '';
        if (bootstrapBack) bootstrapBack.hidden = false;
        const bootstrapRetry = document.querySelector('[data-direct-bootstrap-retry]');
        if (bootstrapRetry) bootstrapRetry.hidden = false;
      } else { delete html.dataset.directBootstrap; if (bootstrapBack) bootstrapBack.hidden = true; }
      status.textContent = '起動できませんでした。再試行できます。';
      status.removeAttribute('aria-busy');
      start.setAttribute('aria-busy', 'false'); start.setAttribute('aria-disabled', 'false');
    }
  }
  async function hide(updateHistory = false) {
    if (!open || disposed) return;
    const focusBeforeWait = document.activeElement;
    const shellControlHadFocus = [start, explanation, bootCueBack].includes(focusBeforeWait);
    ++generation; open = false;
    coreReady = false; clearTimeout(loadingCardTimer); loadingCardTimer = 0;
    syncRetainedRoute();
    if (updateHistory) setIntent(false);
    if (mounting && !runtime) setLoadingStage('説明へ戻っています…');
    try {
      if (runtime) runtime.suspend();
      // Initialization owns document-wide selectors until it has finished.
      if (mounting && !runtime) await mounting.catch(() => {});
      if (!runtime) clearStartupHints();
      if (runtime) runtime.suspend();
      if (pendingActivation) await pendingActivation.catch(() => {});
    } catch (error) {
      // Pending transforms must remain available for explicit commit/cancel.
      open = true; setIntent(true, true); message.textContent = error.message; bootCueStatus.textContent = error.message; return;
    }
    if (open || disposed) return;
    for (const [node] of owned) { if (node.matches('dialog[open]')) node.close(); for (const dialog of node.querySelectorAll('dialog[open]')) dialog.close(); }
    if (description) useDescription({ restoreFocus: shellControlHadFocus && document.activeElement === focusBeforeWait }); else bar.hidden = true;
    bootCue.hidden = true;
    delete html.dataset.directLoading;
    delete html.dataset.directBootstrap;
    if (bootstrapBack) bootstrapBack.hidden = true;
    start.setAttribute('aria-busy', 'false'); start.setAttribute('aria-disabled', 'false');
    status.removeAttribute('aria-busy');
    status.textContent = runtime?.draw.workspace.restoreError || (runtime ? '編集を保持しています。' : '必要なときに起動できます。');
  }
  function dispose() {
    if (disposed) return teardown; disposed = true; open = false; ++generation;
    runtime?.dispose(); lifecycle.abort(); document.head.removeEventListener('load', recordStyleEvent, true); document.head.removeEventListener('error', recordStyleEvent, true); barObserver?.disconnect(); cameraPhaseObserver?.disconnect(); clearTimeout(loadingCardTimer); cancelAnimationFrame(barFrame);
    // Keep ownership observers until an in-flight mount has released its partial scope.
    teardown = Promise.allSettled([mounting, pendingActivation]).then(() => {
    runtime?.dispose(); bodyObserver?.disconnect(); headObserver?.disconnect();
    restoreBarNodes();
    clearAttempt();
    bar.remove(); bootCue.remove();
    if (description) {
      restoreAttributes(body, shellAttributes);
      for (const header of description.querySelectorAll('[data-direct-shell-header]')) { header.classList.add('site-header'); delete header.dataset.directShellHeader; }
      const main = description.querySelector('#tool-shell-main'); if (main) main.id = 'main';
      description.querySelector('.skip-link[href="#tool-shell-main"]')?.setAttribute('href', '#main');
      description.replaceWith(...description.childNodes);
    }
    delete html.dataset.directError; delete html.dataset.toolDirect; delete html.dataset.directLoading; delete html.dataset.directBootstrap;
    if (bootstrapBack) bootstrapBack.hidden = true;
    for (const key of ['--tool-direct-top','--tool-direct-height','--tool-direct-width','--tool-direct-bar']) html.style.removeProperty(key);
    if (window.__PIXIEED_CREATION_HOST__ === publicApi) delete window.__PIXIEED_CREATION_HOST__;
    });
    return teardown;
  }
  start.addEventListener('click', () => { if (start.getAttribute('aria-disabled') === 'true') return; void show(true); }, { signal: lifecycle.signal });
  bootCueBack.addEventListener('click', () => void hide(true), { signal: lifecycle.signal });
  explanation.addEventListener('click', () => void hide(true), { signal: lifecycle.signal });
  recovery.addEventListener('click', () => void runtime?.draw.workspace.showProjects({ pane: 'library' }), { signal: lifecycle.signal });
  document.addEventListener('pixieed:project-restore-state', () => { showRestoreState(); syncRetainedRoute(); }, { signal: lifecycle.signal });
  retry.addEventListener('click', () => { if (reloadRequired) { location.reload(); return; } if (!runtime) { mounting = null; clearAttempt(); } void show(false); }, { signal: lifecycle.signal });
  window.addEventListener('popstate', () => { if (isWorkspaceRequested(location.href, history.state)) void show(false); else void hide(false); }, { signal: lifecycle.signal });
  for (const target of [window, window.visualViewport].filter(Boolean)) target.addEventListener('resize', viewport, { signal: lifecycle.signal, passive: true });
  window.visualViewport?.addEventListener('scroll', viewport, { signal: lifecycle.signal, passive: true });
  document.addEventListener('keydown', event => {
    if (!open || event.defaultPrevented || event.key !== 'Escape' || document.querySelector('dialog[open],details[open]')) return;
    event.preventDefault(); void hide(true);
  }, { signal: lifecycle.signal });
  window.addEventListener('pagehide', event => { if (!event.persisted) dispose(); }, { signal: lifecycle.signal });
  if (isWorkspaceRequested(location.href, history.state)) void show(false);
  return publicApi;
}
