const PROTOCOL = 'pixieed-tool-embed';
const VERSION = 1;
const pending = new Map();
const instances = new Map();
const sectionGeneration = new WeakMap();
const originalLabels = new WeakMap();
let activeSection = null;

function request(instance, command) {
  const requestId = crypto.randomUUID();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { pending.delete(requestId); reject(new Error('ツールの応答を確認できませんでした。')); }, 10000);
    pending.set(requestId, { instance, resolve, reject, timer });
    instance.frame.contentWindow.postMessage({ kind: PROTOCOL, version: VERSION, channel: instance.channel, requestId, command }, location.origin);
  });
}

function makeFrame(section, mode) {
  if (!['http:', 'https:'].includes(location.protocol)) throw new Error('ツールを起動するにはWebサイトを開いてください。');
  const channel = crypto.randomUUID();
  const frame = document.createElement('iframe');
  frame.className = 'tool-embed__frame';
  frame.title = mode === 'camera' ? 'PiXiEED カメラ' : 'PiXiEEDraw ドット絵エディター';
  frame.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-forms allow-downloads allow-modals');
  frame.setAttribute('allow', "camera 'self'; microphone 'none'; geolocation 'none'");
  frame.src = `/draw/?${new URLSearchParams({ embed: '1', embedRole: mode, mode: mode === 'camera' ? 'camera' : 'draw', channel })}`;
  const instance = { section, mode, channel, frame, ready: false, readyPromise: null, readyResolve: null };
  instance.readyPromise = new Promise(resolve => { instance.readyResolve = resolve; });
  section.querySelector('[data-embed-stage]').append(frame);
  instances.set(section, instance);
  return instance;
}

function getInstance(section) { return instances.get(section) || makeFrame(section, section.dataset.toolMode); }

function setStatus(section, message) {
  const status = section.querySelector('[data-embed-status]');
  if (status) status.textContent = message;
}

function controls(section) {
  let bar = section.querySelector('.tool-embed__controls');
  if (bar) return bar;
  bar = document.createElement('div'); bar.className = 'tool-embed__controls';
  const title = document.createElement('span'); title.className = 'tool-embed__title'; title.textContent = section.dataset.toolMode === 'camera' ? 'PiXiEED カメラ' : 'PiXiEEDraw';
  title.id = `tool-embed-dialog-title-${crypto.randomUUID()}`;
  const expand = document.createElement('button'); expand.type = 'button'; expand.dataset.embedExpand = ''; expand.textContent = '拡大'; expand.setAttribute('aria-expanded', 'false');
  const close = document.createElement('button'); close.type = 'button'; close.dataset.embedClose = ''; close.textContent = '閉じる';
  bar.append(title, expand, close); section.querySelector('[data-embed-stage]').prepend(bar); return bar;
}

async function activate(section) {
  const generation = (sectionGeneration.get(section) || 0) + 1;
  sectionGeneration.set(section, generation);
  const instance = getInstance(section);
  if (activeSection && activeSection !== section) await close(activeSection, { restoreFocus: false });
  activeSection = section;
  section.classList.add('tool-embed--active');
  section.querySelector('[data-embed-stage]').hidden = false;
  section.querySelector('[data-embed-start]').hidden = true;
  controls(section);
  setStatus(section, 'ツールを準備しています…');
  try {
    if (!instance.ready) await Promise.race([instance.readyPromise, new Promise((_, reject) => setTimeout(() => reject(new Error('ツールを起動できませんでした。')), 15000))]);
    if (sectionGeneration.get(section) !== generation) { if (instance.ready) await request(instance, 'suspend').catch(() => {}); return; }
    await request(instance, 'activate');
    if (sectionGeneration.get(section) !== generation) return;
    setStatus(section, '編集を保持しています。閉じても続きから再開できます。');
  } catch (error) { setStatus(section, error.message); }
}

async function close(section, { restoreFocus = true } = {}) {
  sectionGeneration.set(section, (sectionGeneration.get(section) || 0) + 1);
  const instance = instances.get(section);
  if (instance?.ready) { try { await request(instance, 'suspend'); } catch {} }
  section.classList.remove('tool-embed--active', 'tool-embed--expanded');
  section.removeAttribute('role'); section.removeAttribute('aria-modal');
  restoreLabel(section);
  section.querySelector('[data-embed-stage]').hidden = true;
  section.querySelector('[data-embed-start]').hidden = false;
  const expandButton = section.querySelector('[data-embed-expand]');
  if (expandButton) { expandButton.textContent = '拡大'; expandButton.setAttribute('aria-expanded', 'false'); }
  if (activeSection === section) activeSection = null;
  releaseInert(section);
  if (restoreFocus) section.querySelector('[data-embed-start]').focus({ preventScroll: true });
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

function expand(section) {
  const expanded = !section.classList.contains('tool-embed--expanded');
  if (!expanded) { section.classList.remove('tool-embed--expanded'); section.removeAttribute('role'); section.removeAttribute('aria-modal'); restoreLabel(section); releaseInert(section); section.querySelector('[data-embed-expand]').textContent = '拡大'; section.querySelector('[data-embed-expand]').setAttribute('aria-expanded', 'false'); section.querySelector('[data-embed-expand]').focus({ preventScroll: true }); return; }
  section.classList.add('tool-embed--expanded'); section.setAttribute('role', 'dialog'); section.setAttribute('aria-modal', 'true');
  if (!originalLabels.has(section)) originalLabels.set(section, section.getAttribute('aria-labelledby'));
  section.setAttribute('aria-labelledby', section.querySelector('.tool-embed__title').id);
  acquireInert(section);
  section.querySelector('[data-embed-expand]').textContent = '縮小';
  section.querySelector('[data-embed-expand]').setAttribute('aria-expanded', 'true');
  section.querySelector('[data-embed-close]').focus({ preventScroll: true });
}

window.addEventListener('message', event => {
  if (event.origin !== location.origin) return;
  const message = event.data;
  if (!message || message.kind !== PROTOCOL || message.version !== VERSION) return;
  const instance = [...instances.values()].find(item => item.frame.contentWindow === event.source);
  if (!instance || message.channel !== instance.channel) return;
  if (message.type === 'close-request') {
    if (instance.section.classList.contains('tool-embed--expanded')) void close(instance.section);
    return;
  }
  if (message.type === 'focus-edge' && instance.section.classList.contains('tool-embed--expanded')) {
    const buttons = [...instance.section.querySelectorAll('.tool-embed__controls button:not([disabled])')];
    buttons[message.direction === 'backward' ? buttons.length - 1 : 0]?.focus({ preventScroll: true });
    return;
  }
  if (message.type === 'ready') { instance.ready = true; instance.readyResolve(); return; }
  if (message.type !== 'reply' || typeof message.requestId !== 'string') return;
  const waiting = pending.get(message.requestId);
  if (!waiting || waiting.instance !== instance) return;
  clearTimeout(waiting.timer); pending.delete(message.requestId);
  message.ok ? waiting.resolve(message.state) : waiting.reject(new Error(message.error || 'ツールの操作に失敗しました。'));
});

document.addEventListener('click', event => {
  const start = event.target.closest('[data-embed-start]');
  if (start) { void activate(start.closest('[data-tool-embed]')); return; }
  const section = event.target.closest('[data-tool-embed]');
  if (!section) return;
  if (event.target.closest('[data-embed-expand]')) expand(section);
  else if (event.target.closest('[data-embed-close]')) void close(section);
});
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && activeSection?.classList.contains('tool-embed--expanded')) { event.preventDefault(); void close(activeSection); }
  if (event.key !== 'Tab' || !activeSection?.classList.contains('tool-embed--expanded')) return;
  const focusable = [...activeSection.querySelectorAll('button:not([disabled]),iframe')].filter(node => node.getClientRects().length && getComputedStyle(node).visibility !== 'hidden' && !node.closest('[inert]'));
  const active = document.activeElement;
  const first = focusable[0], last = focusable.at(-1);
  if (event.shiftKey && active === first) { event.preventDefault(); last?.focus({ preventScroll: true }); }
  else if (!event.shiftKey && active === last) { event.preventDefault(); first?.focus({ preventScroll: true }); }
});
