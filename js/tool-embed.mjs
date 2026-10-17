import { trackSiteEvent, createEmbeddedAnalyticsReceiver } from './site-analytics.mjs?rev=20261017-analytics-integrity-1';

const PROTOCOL = 'pixieed-tool-embed';
const VERSION = 1;
const TOOL_STARTS = new Set(['draw', 'audio', 'pixel-camera']);
const pending = new Map();
const instances = new Map();
const sectionGeneration = new WeakMap();
const originalLabels = new WeakMap();
const expandedSnapshots = new WeakMap();
const startingSections = new WeakMap();
const modeObservers = new WeakMap();
let activeSection = null;

function request(instance, command, detail = {}) {
  const requestId = crypto.randomUUID();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { pending.delete(requestId); reject(new Error('ツールの応答を確認できませんでした。')); }, 10000);
    pending.set(requestId, { instance, resolve, reject, timer });
    instance.frame.contentWindow.postMessage({ kind: PROTOCOL, version: VERSION, channel: instance.channel, requestId, command, ...detail }, location.origin);
  });
}

function makeFrame(section, mode) {
  if (!['http:', 'https:'].includes(location.protocol)) throw new Error('ツールを起動するにはWebサイトを開いてください。');
  const channel = crypto.randomUUID();
  const frame = document.createElement('iframe');
  frame.className = 'tool-embed__frame';
  frame.inert = true;
  frame.title = mode === 'camera' ? 'PiXiEED カメラ' : mode === 'audio' ? 'PiXiEED 音楽エディター' : 'PiXiEEDraw ドット絵エディター';
  frame.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-forms allow-downloads allow-modals');
  frame.setAttribute('allow', "camera 'self'; microphone 'none'; geolocation 'none'");
  const runtime = new URL(section.dataset.embedUrl || '/draw/editor.html', location.href);
  if (runtime.origin !== location.origin) throw new Error('埋め込みツールのURLが正しくありません。');
  runtime.searchParams.set('embed', '1');
  runtime.searchParams.set('embedRole', mode);
  if (!runtime.searchParams.has('mode')) runtime.searchParams.append('mode', mode);
  runtime.searchParams.set('channel', channel);
  frame.src = runtime.href;
  const instance = { section, mode, channel, frame, ready: false, readyPromise: null, readyResolve: null, toolStarts: new Set() };
  instance.readyPromise = new Promise(resolve => { instance.readyResolve = resolve; });
  section.querySelector('[data-embed-stage]').append(frame);
  instance.analyticsReceiver = createEmbeddedAnalyticsReceiver({ channel, source: frame.contentWindow, origin: location.origin });
  frame.addEventListener('load', () => instance.analyticsReceiver.reset());
  instances.set(section, instance);
  observeMode(section);
  return instance;
}

function getInstance(section) { return instances.get(section) || makeFrame(section, section.dataset.toolMode); }

function startSection(button) {
  const target = button.dataset.embedTarget;
  if (!target) return button.closest('[data-tool-embed]');
  const host = document.getElementById(target);
  return host?.matches('[data-tool-embed]') ? host : host?.querySelector('[data-tool-embed]');
}

function startButtons(section) {
  return [...document.querySelectorAll('[data-embed-start]')].filter(button => startSection(button) === section);
}

function updateStartButtons(section, state) {
  for (const button of startButtons(section)) {
    if (!originalLabels.has(button)) originalLabels.set(button, button.textContent.trim());
    // Older embed hosts can keep a local launch button. Dedicated pages use
    // one external primary action that also brings an active editor into view.
    button.hidden = section.contains(button) && state !== 'closed';
    button.setAttribute('aria-expanded', String(state !== 'closed'));
    button.setAttribute('aria-busy', String(state === 'loading'));
    if (!section.contains(button)) button.textContent = state === 'loading' ? 'ツールを準備中…' : state === 'active' ? '編集画面に戻る' : '続きから再開';
  }
}

function showEditor(section) {
  if (section.classList.contains('tool-embed--expanded')) return;
  section.scrollIntoView({ block: 'start', behavior: 'instant' });
}

function setStatus(section, message) {
  const status = section.querySelector('[data-embed-status]');
  if (status) status.textContent = message;
}

function controls(section) {
  let bar = section.querySelector('.tool-embed__controls');
  if (bar) return bar;
  bar = document.createElement('div'); bar.className = 'tool-embed__controls';
  const title = document.createElement('span'); title.className = 'tool-embed__title'; title.textContent = section.dataset.toolMode === 'camera' ? 'PiXiEED カメラ' : section.dataset.toolMode === 'audio' ? 'PiXiEED 音楽' : 'PiXiEEDraw';
  title.id = `tool-embed-dialog-title-${crypto.randomUUID()}`;
  const expand = document.createElement('button'); expand.type = 'button'; expand.dataset.embedExpand = ''; expand.textContent = '大きく使う'; expand.setAttribute('aria-label', 'エディターを大きく表示する'); expand.setAttribute('aria-expanded', 'false');
  const close = document.createElement('button'); close.type = 'button'; close.dataset.embedClose = ''; close.textContent = '閉じる'; close.setAttribute('aria-label', 'ページ内エディターを閉じる');
  bar.append(title, expand, close);
  const help = document.createElement('p'); help.className = 'tool-embed__help';
  help.textContent = section.dataset.toolMode === 'camera' ? '画像読込：下部の［ファイル］→［画像を読み込む］。閉じても続きから再開できます。' : '大きく使っても、閉じても、このページでは続きから再開できます。';
  section.querySelector('[data-embed-stage]').prepend(bar, help); return bar;
}

async function activate(section, { bringIntoView = true, focus = true } = {}) {
  if (startingSections.has(section) || (activeSection === section && section.classList.contains('tool-embed--active'))) { if (bringIntoView) showEditor(section); return; }
  section.classList.remove('tool-embed--failed');
  const generation = (sectionGeneration.get(section) || 0) + 1;
  sectionGeneration.set(section, generation);
  startingSections.set(section, generation);
  const instance = getInstance(section);
  if (activeSection && activeSection !== section) await close(activeSection, { restoreFocus: false });
  activeSection = section;
  section.classList.add('tool-embed--active');
  section.querySelector('[data-embed-stage]').hidden = false;
  updateStartButtons(section, 'loading');
  controls(section);
  resetExpandButton(section);
  setStatus(section, 'ツールを準備しています…');
  if (bringIntoView) showEditor(section);
  try {
    if (!instance.ready) await Promise.race([instance.readyPromise, new Promise((_, reject) => setTimeout(() => reject(new Error('ツールを起動できませんでした。')), 15000))]);
    if (sectionGeneration.get(section) !== generation) return;
    const currentMode = section.dataset.toolMode;
    if (['draw', 'camera', 'audio'].includes(currentMode) && currentMode !== instance.mode) {
      await request(instance, 'mode-change', { mode: currentMode });
      instance.mode = currentMode;
    }
    await request(instance, 'activate');
    if (sectionGeneration.get(section) !== generation) return;
    instance.frame.inert = false;
    updateStartButtons(section, 'active');
    setStatus(section, '編集を保持しています。閉じても続きから再開できます。');
    if (focus) instance.frame.focus({ preventScroll: true });
  } catch (error) {
    if (sectionGeneration.get(section) !== generation) return;
    await close(section);
    const retryHint = section.hasAttribute('data-embed-auto') ? '再試行ボタンを押してください。' : 'もう一度開始ボタンを押してください。';
    setStatus(section, `${error.message} ${retryHint}`);
    if (section.hasAttribute('data-embed-auto')) {
      section.classList.add('tool-embed--active', 'tool-embed--failed');
      section.querySelector('[data-embed-stage]').hidden = false;
      markAutoRetry(section);
    }
  } finally { if (startingSections.get(section) === generation) startingSections.delete(section); }
}

function resetExpandButton(section) {
  const button = section.querySelector('[data-embed-expand]');
  if (!button) return;
  delete button.dataset.embedRetry;
  button.textContent = '大きく使う';
  button.setAttribute('aria-label', 'エディターを大きく表示する');
}

function markAutoRetry(section) {
  const button = section.querySelector('[data-embed-expand]');
  if (!button) return;
  button.dataset.embedRetry = '';
  button.textContent = '再試行';
  button.setAttribute('aria-label', '制作ツールを再試行する');
}

function observeMode(section) {
  if (modeObservers.has(section)) return;
  const observer = new MutationObserver(() => {
    const instance = instances.get(section);
    const mode = section.dataset.toolMode;
    if (!instance?.ready || !['draw', 'camera', 'audio'].includes(mode) || mode === instance.mode) return;
    void request(instance, 'mode-change', { mode }).then(() => {
      instance.mode = mode;
      renderShellMode(section, mode);
    }).catch(() => {});
  });
  observer.observe(section, { attributes: true, attributeFilter: ['data-tool-mode'] });
  modeObservers.set(section, observer);
}

function renderShellMode(section, mode) {
  const labels = {
    draw: ['PiXiEEDraw', 'PiXiEEDraw ドット絵エディター', 'このページで制作する', '描画・カメラ・音楽を同じ作品で切り替えて使えます。'],
    camera: ['PiXiEED カメラ', 'PiXiEED カメラ', 'このページで画像を変換する', '画像の読込や撮影から始め、変換結果を作品に反映できます。'],
    audio: ['PiXiEED 音楽', 'PiXiEED 音楽エディター', 'このページで音楽を作る', '色を音に割り当て、フレームとテンポを編集して曲にします。'],
  }[mode];
  if (!labels) return;
  const [titleText, frameTitle, workspaceTitle, workspaceCopy] = labels;
  const title = section.querySelector('.tool-embed__title');
  if (title) title.textContent = titleText;
  const frame = instances.get(section)?.frame;
  if (frame) frame.title = frameTitle;
  const heading = section.querySelector('#tool-embed-title');
  if (heading) heading.textContent = workspaceTitle;
  const copy = section.querySelector('[data-shell-workspace-copy]');
  if (copy) copy.textContent = workspaceCopy;
}

function acceptShellMode(instance, mode) {
  if (!instance.section.hasAttribute('data-tool-shell') || !['draw', 'camera', 'audio'].includes(mode)) return;
  instance.mode = mode;
  instance.section.dataset.toolMode = mode;
  renderShellMode(instance.section, mode);
}

async function close(section, { restoreFocus = true } = {}) {
  sectionGeneration.set(section, (sectionGeneration.get(section) || 0) + 1);
  startingSections.delete(section);
  const instance = instances.get(section);
  if (instance?.ready) { try { await request(instance, 'suspend'); } catch {} }
  section.classList.remove('tool-embed--active', 'tool-embed--expanded');
  unlockExpandedViewport(section);
  section.removeAttribute('role'); section.removeAttribute('aria-modal');
  restoreLabel(section);
  section.querySelector('[data-embed-stage]').hidden = true;
  updateStartButtons(section, 'closed');
  const expandButton = section.querySelector('[data-embed-expand]');
  if (expandButton) { expandButton.textContent = '大きく使う'; expandButton.setAttribute('aria-label', 'エディターを大きく表示する'); expandButton.setAttribute('aria-expanded', 'false'); }
  if (activeSection === section) activeSection = null;
  releaseInert(section);
  document.dispatchEvent(new CustomEvent('pixieed:tool-embed-expanded', { detail: { section, expanded: false } }));
  if (restoreFocus) {
    const start = startButtons(section).find(button => !button.hidden);
    start?.focus({ preventScroll: true });
    const rect = start?.getBoundingClientRect();
    if (rect && (rect.top < 0 || rect.bottom > innerHeight)) start.scrollIntoView({ block: 'center', behavior: 'instant' });
  }
  setStatus(section, '編集を保持しています。続きから再開できます。');
  section.querySelector('[data-embed-expand]')?.setAttribute('aria-expanded', 'false');
}

const inertSnapshots = new Map();
function acquireInert(section) {
  if (inertSnapshots.has(section)) return;
  const chain = []; let node = section;
  while (node?.parentElement) {
    for (const sibling of node.parentElement.children) if (sibling !== node) chain.push(sibling);
    node = node.parentElement;
  }
  inertSnapshots.set(section, chain.map(element => [element, element.inert]));
  for (const [element] of inertSnapshots.get(section)) element.inert = true;
}
function releaseInert(section) {
  for (const [element, wasInert] of inertSnapshots.get(section) || []) element.inert = wasInert;
  inertSnapshots.delete(section);
}
function restoreLabel(section) {
  if (!originalLabels.has(section)) return;
  const label = originalLabels.get(section);
  if (label === null) section.removeAttribute('aria-labelledby');
  else section.setAttribute('aria-labelledby', label);
}

function styleSnapshot(element, properties) {
  return Object.fromEntries(properties.map(property => [property, {
    value: element.style.getPropertyValue(property),
    priority: element.style.getPropertyPriority(property),
  }]));
}

function restoreStyle(element, snapshot) {
  for (const [property, saved] of Object.entries(snapshot || {})) {
    if (saved.value) element.style.setProperty(property, saved.value, saved.priority);
    else element.style.removeProperty(property);
  }
}

function lockExpandedViewport(section) {
  if (expandedSnapshots.has(section)) return;
  const root = document.documentElement;
  const body = document.body;
  const visualViewport = window.visualViewport;
  const snapshot = {
    scrollX: window.scrollX,
    scrollY: window.scrollY,
    rootStyle: styleSnapshot(root, ['overflow', 'scroll-behavior']),
    bodyStyle: styleSnapshot(body, ['overflow', 'position', 'top', 'left', 'right', 'width', 'scroll-behavior']),
  };
  const updateViewport = () => {
    const viewport = window.visualViewport;
    section.style.setProperty('--tool-embed-viewport-top', `${Math.max(0, viewport?.offsetTop ?? 0)}px`);
    section.style.setProperty('--tool-embed-viewport-left', `${Math.max(0, viewport?.offsetLeft ?? 0)}px`);
    section.style.setProperty('--tool-embed-viewport-width', `${Math.max(1, viewport?.width ?? window.innerWidth)}px`);
    section.style.setProperty('--tool-embed-viewport-height', `${Math.max(1, viewport?.height ?? window.innerHeight)}px`);
  };
  snapshot.updateViewport = updateViewport;
  expandedSnapshots.set(section, snapshot);
  updateViewport();
  root.style.setProperty('overflow', 'hidden');
  body.style.setProperty('overflow', 'hidden');
  body.style.setProperty('position', 'fixed');
  body.style.setProperty('top', `${-snapshot.scrollY}px`);
  body.style.setProperty('left', '0');
  body.style.setProperty('right', '0');
  body.style.setProperty('width', '100%');
  window.addEventListener('resize', updateViewport, { passive: true });
  visualViewport?.addEventListener('resize', updateViewport, { passive: true });
  visualViewport?.addEventListener('scroll', updateViewport, { passive: true });
}

function unlockExpandedViewport(section) {
  const snapshot = expandedSnapshots.get(section);
  if (!snapshot) return;
  window.removeEventListener('resize', snapshot.updateViewport);
  window.visualViewport?.removeEventListener('resize', snapshot.updateViewport);
  window.visualViewport?.removeEventListener('scroll', snapshot.updateViewport);
  restoreStyle(document.documentElement, snapshot.rootStyle);
  restoreStyle(document.body, snapshot.bodyStyle);
  for (const property of ['--tool-embed-viewport-top', '--tool-embed-viewport-left', '--tool-embed-viewport-width', '--tool-embed-viewport-height']) section.style.removeProperty(property);
  expandedSnapshots.delete(section);
  // The site uses smooth scrolling globally. Restore the saved position as an
  // immediate operation, then put each element's original inline style back.
  const root = document.documentElement;
  const body = document.body;
  root.style.setProperty('scroll-behavior', 'auto', 'important');
  body.style.setProperty('scroll-behavior', 'auto', 'important');
  try {
    window.scrollTo({ left: snapshot.scrollX, top: snapshot.scrollY, behavior: 'instant' });
  } catch {
    window.scrollTo(snapshot.scrollX, snapshot.scrollY);
  }
  restoreStyle(root, { 'scroll-behavior': snapshot.rootStyle['scroll-behavior'] });
  restoreStyle(body, { 'scroll-behavior': snapshot.bodyStyle['scroll-behavior'] });
}

function expand(section) {
  const expanded = !section.classList.contains('tool-embed--expanded');
  if (!expanded) {
    const fullscreenElement = document.fullscreenElement;
    const ownsFullscreen = fullscreenElement && (fullscreenElement === section || section.contains(fullscreenElement));
    section.classList.remove('tool-embed--expanded'); unlockExpandedViewport(section); section.removeAttribute('role'); section.removeAttribute('aria-modal'); restoreLabel(section); releaseInert(section);
    document.dispatchEvent(new CustomEvent('pixieed:tool-embed-expanded', { detail: { section, expanded: false } }));
    const button = section.querySelector('[data-embed-expand]'); button.textContent = '大きく使う'; button.setAttribute('aria-label', 'エディターを大きく表示する'); button.setAttribute('aria-expanded', 'false'); button.focus({ preventScroll: true }); sendExpandedState(section, false);
    if (ownsFullscreen) void Promise.resolve(document.exitFullscreen?.()).catch(() => {});
    return;
  }
  lockExpandedViewport(section);
  section.classList.add('tool-embed--expanded'); section.setAttribute('role', 'dialog'); section.setAttribute('aria-modal', 'true');
  if (!originalLabels.has(section)) originalLabels.set(section, section.getAttribute('aria-labelledby'));
  section.setAttribute('aria-labelledby', section.querySelector('.tool-embed__title').id);
  acquireInert(section);
  section.querySelector('[data-embed-expand]').textContent = '拡大表示を終了';
  section.querySelector('[data-embed-expand]').setAttribute('aria-label', '拡大表示を終了');
  section.querySelector('[data-embed-expand]').setAttribute('aria-expanded', 'true');
  section.querySelector('[data-embed-expand]').focus({ preventScroll: true });
  sendExpandedState(section, true);
  document.dispatchEvent(new CustomEvent('pixieed:tool-embed-expanded', { detail: { section, expanded: true } }));
}

function sendExpandedState(section, expanded) {
  const instance = instances.get(section);
  instance?.frame.contentWindow?.postMessage({ kind: PROTOCOL, version: VERSION, channel: instance.channel, type: 'expansion-state', expanded }, location.origin);
}

function exitExpanded(section) {
  if (!section?.classList.contains('tool-embed--expanded')) return;
  expand(section);
}

document.addEventListener('pixieed:tool-embed-reward-modal', event => {
  const active = document.querySelector('.tool-embed--expanded');
  if (!active) return;
  if (event.detail?.expanded === true) releaseInert(active);
  else acquireInert(active);
});

window.addEventListener('message', event => {
  if (event.origin !== location.origin) return;
  const message = event.data;
  if (!message || message.kind !== PROTOCOL || message.version !== VERSION) return;
  const instance = [...instances.values()].find(item => item.frame.contentWindow === event.source);
  if (!instance || message.channel !== instance.channel) return;
  if (message.type === 'analytics-event') {
    instance.analyticsReceiver.receive(event);
    return;
  }
  if (message.type === 'route-change' && instance.section.hasAttribute('data-tool-shell')
      && typeof message.pathname === 'string' && typeof message.search === 'string' && typeof message.hash === 'string') {
    try {
      const inner = new URL(`${message.pathname}${message.search}${message.hash}`, location.origin);
      if (inner.origin !== location.origin) return;
      inner.searchParams.delete('embed'); inner.searchParams.delete('embedRole'); inner.searchParams.delete('channel');
      const publicPath = location.pathname;
      const dedicatedEntry = /\/(?:audio|camera)(?:\/index\.html)?\/?$/.test(publicPath);
      const selectedMode = inner.searchParams.get('mode');
      const selectedPath = selectedMode === 'camera' ? '/camera/' : selectedMode === 'audio' ? '/audio/' : '/draw/';
      const outer = new URL(dedicatedEntry ? selectedPath : publicPath, location.origin);
      outer.search = inner.searchParams.toString();
      outer.hash = inner.hash;
      history.replaceState(history.state, '', `${outer.pathname}${outer.search}${outer.hash}`);
    } catch { /* Ignore malformed same-origin route announcements. */ }
    return;
  }
  if (message.type === 'fullscreen-state' && message.active === false) {
    if (instance.section.classList.contains('tool-embed--expanded')) exitExpanded(instance.section);
    return;
  }
  if (message.type === 'mode-state') {
    acceptShellMode(instance, message.mode);
    return;
  }
  if (message.type === 'tool-start') {
    if (!TOOL_STARTS.has(message.tool) || instance.toolStarts.has(message.tool)) return;
    instance.toolStarts.add(message.tool);
    trackSiteEvent('tool_start', { tool: message.tool });
    return;
  }
  if (message.type === 'close-request') {
    if (instance.section.classList.contains('tool-embed--expanded')) exitExpanded(instance.section);
    else if (!instance.section.hasAttribute('data-embed-auto')) void close(instance.section);
    return;
  }
  if (message.type === 'escape-request') {
    if (instance.section.classList.contains('tool-embed--expanded')) exitExpanded(instance.section);
    else if (!instance.section.hasAttribute('data-embed-auto')) void close(instance.section);
    return;
  }
  if (message.type === 'focus-edge' && instance.section.classList.contains('tool-embed--expanded')) {
    const buttons = [...instance.section.querySelectorAll('.tool-embed__controls button:not([disabled])')]
      .filter(button => button.getClientRects().length && getComputedStyle(button).visibility !== 'hidden' && !button.closest('[hidden]'));
    buttons[message.direction === 'backward' ? buttons.length - 1 : 0]?.focus({ preventScroll: true });
    return;
  }
  if (message.type === 'ready') {
    const returning = instance.ready;
    instance.ready = true;
    acceptShellMode(instance, message.role);
    sendExpandedState(instance.section, instance.section.classList.contains('tool-embed--expanded'));
    instance.readyResolve();
    if (returning && instance.section.classList.contains('tool-embed--active')) void request(instance, 'activate').catch(() => {});
    return;
  }
  if (message.type !== 'reply' || typeof message.requestId !== 'string') return;
  const waiting = pending.get(message.requestId);
  if (!waiting || waiting.instance !== instance) return;
  clearTimeout(waiting.timer); pending.delete(message.requestId);
  message.ok ? waiting.resolve(message.state) : waiting.reject(new Error(message.error || 'ツールの操作に失敗しました。'));
});

document.addEventListener('click', event => {
  const start = event.target.closest('[data-embed-start]');
  if (start) { const section = startSection(start); if (section) { event.preventDefault(); void activate(section); } return; }
  const section = event.target.closest('[data-tool-embed]');
  if (!section) return;
  if (event.target.closest('[data-embed-retry]')) {
    event.preventDefault();
    const instance = instances.get(section);
    // Explicit retry may replace a runtime that never became usable. Expansion
    // and reopening a ready editor always retain its browsing context.
    if (instance && !instance.ready) { instance.frame.remove(); instances.delete(section); }
    void activate(section, { bringIntoView: !section.hasAttribute('data-embed-auto') });
  }
  else if (event.target.closest('[data-embed-expand]')) expand(section);
  else if (event.target.closest('[data-embed-close]')) void close(section);
});
document.addEventListener('keydown', event => {
  if (event.defaultPrevented) return;
  if (document.querySelector('[data-dialog]:not([hidden])')) return;
  if (event.key === 'Escape' && activeSection?.classList.contains('tool-embed--expanded')) { event.preventDefault(); exitExpanded(activeSection); }
  if (event.key !== 'Tab' || !activeSection?.classList.contains('tool-embed--expanded')) return;
  const focusable = [...activeSection.querySelectorAll('button:not([disabled]),iframe')].filter(node => node.getClientRects().length && getComputedStyle(node).visibility !== 'hidden' && !node.closest('[inert]'));
  const active = document.activeElement;
  const first = focusable[0], last = focusable.at(-1);
  if (event.shiftKey && active === first) { event.preventDefault(); last?.focus({ preventScroll: true }); }
  else if (!event.shiftKey && active === last) { event.preventDefault(); first?.focus({ preventScroll: true }); }
});

for (const section of document.querySelectorAll('[data-tool-embed][data-embed-auto]')) {
  void activate(section, { bringIntoView: false, focus: false });
}

document.addEventListener('fullscreenchange', () => {
  const expanded = document.querySelector('.tool-embed--expanded');
  if (expanded && document.fullscreenElement === null) exitExpanded(expanded);
});
