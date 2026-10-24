import { createModeScope } from './mode-scope.mjs?rev=20261001-independent-editors-1';

const defaultLoaders = Object.freeze({
  color: (attempt) => attempt === 0
    ? import('./draw-color-adjustment-panel.mjs?rev=20261016-color-capability-1')
    : importModule(`/js/creation/draw-color-adjustment-panel.mjs?rev=20261016-color-capability-1&attempt=${attempt}`),
  text: (attempt) => attempt === 0
    ? import('./draw-text-panel.mjs?rev=20261024-context-controls-1')
    : importModule(`/js/creation/draw-text-panel.mjs?rev=20261024-context-controls-1&attempt=${attempt}`)
});

const importModule = (specifier) => import(specifier);

const labels = Object.freeze({
  color: { button: '色調', loading: '色調パネルを読み込み中です。', error: '読み込みに失敗しました。もう一度押して再試行してください。', ready: '準備できました。もう一度押すと開きます。' },
  text: { button: '文字', loading: '文字パネルを読み込み中です。', error: '読み込みに失敗しました。もう一度押して再試行してください。', ready: '準備できました。もう一度押すと開きます。' }
});

/** Create stable toolbar buttons that mount their feature panel only after activation. */
export function mountLazyDrawFeaturePanels({ scope, host, callbacks, isActive = () => true, loaders = defaultLoaders, doc = host?.ownerDocument || globalThis.document } = {}) {
  if (!scope?.listen || !scope?.add || typeof scope.disposed !== 'boolean') throw new TypeError('Lazy draw panels require a lifecycle scope');
  if (!host || !callbacks || !doc) throw new TypeError('Lazy draw panels require a host, callbacks, and document');

  const color = mountLazyPanel({ kind: 'color', scope, host, callbacks, isActive, loader: loaders.color, doc });
  const text = mountLazyPanel({ kind: 'text', scope, host, callbacks, isActive, loader: loaders.text, doc });
  return { color, text };
}

function mountLazyPanel({ kind, scope, host, callbacks, isActive, loader, doc }) {
  if (typeof loader !== 'function') throw new TypeError(`Missing ${kind} panel loader`);
  const spec = labels[kind];
  const opener = doc.createElement('button');
  opener.type = 'button';
  opener.className = kind === 'color' ? 'draw-color-adjustment-open' : 'draw-text-opener';
  opener.setAttribute('aria-label', kind === 'color' ? '色調を調整' : '文字を入力');
  opener.setAttribute('aria-haspopup', 'dialog');
  opener.setAttribute('aria-expanded', 'false');
  opener.title = kind === 'color' ? '色調を調整' : '文字を入力';
  const labelNode = doc.createTextNode(spec.button);
  const status = doc.createElement('span');
  status.className = 'visually-hidden';
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  opener.append(labelNode, status);

  const toolbar = kind === 'color'
    ? host.querySelector?.('.draw-fixed-left, .draw-fixed-toolbar') || host
    : host.querySelector?.('.draw-fixed-left') || host.querySelector?.('.draw-controls');
  if (toolbar) toolbar.append(opener);

  let mounted = null;
  let pending = null;
  let loadedModule = null;
  let disposed = false;
  let activationSequence = 0;
  let retryAttempt = 0;

  const setStatus = (message) => { status.textContent = message; };
  const available = () => {
    const activeOpener = mounted?.opener || opener;
    return !disposed && !scope.disposed && host.isConnected !== false && activeOpener.isConnected !== false && !activeOpener.hidden && isActive();
  };
  const mount = () => {
    if (mounted || !available() || doc.hidden) return false;
    const mountPanel = kind === 'color' ? loadedModule?.mountDrawColorAdjustmentPanel : loadedModule?.mountDrawTextPanel;
    if (typeof mountPanel !== 'function') throw new TypeError(`Loaded ${kind} panel has no mount function`);
    const panelScope = createModeScope(doc.defaultView || globalThis);
    const hostChildren = new Set(host.children || []);
    const toolbarChildren = new Set(opener.parentElement?.children || []);
    try {
      const realPanel = mountPanel({ scope: panelScope, host, ...callbacks });
      // The existing text controller exposes actions, while its DOM stays in
      // the host. Adapt that contract without rewriting the retained panel.
      const realOpener = realPanel?.opener || (kind === 'text' ? [...host.querySelectorAll('.draw-text-opener')].find(node => node !== opener) : null);
      const panel = realPanel?.panel || host.querySelector(kind === 'text' ? '.draw-text-panel' : '.draw-color-adjustment');
      if (!realOpener || typeof realPanel?.open !== 'function') throw new TypeError(`Loaded ${kind} panel returned an invalid controller`);
      realOpener.append(status);
      realOpener.title = realOpener.getAttribute('aria-label') || spec.button;
      opener.replaceWith(realOpener);
      scope.add(() => panelScope.dispose());
      mounted = { opener: realOpener, panel, open: () => realPanel.open(), close: options => realPanel.close?.(options), get isOpen() { return realPanel.isOpen; } };
      return true;
    } catch (error) {
      panelScope.dispose();
      for (const node of host.children || []) if (!hostChildren.has(node)) node.remove?.();
      for (const node of opener.parentElement?.children || []) if (!toolbarChildren.has(node)) node.remove?.();
      throw error;
    }
  };

  async function activate() {
    if (!available()) return false;
    if (mounted) { mounted.open(); return true; }
    if (pending) return pending;
    if (loadedModule) {
      try {
        if (!mount()) { setStatus(spec.ready); return false; }
        mounted.open();
        setStatus('');
        return true;
      } catch {
        setStatus(spec.error);
        labelNode.textContent = '再試行';
        opener.title = spec.error;
        opener.setAttribute('aria-label', kind === 'color' ? '色調を調整（再試行）' : '文字を入力（再試行）');
        return false;
      }
    }

    opener.disabled = true;
    opener.setAttribute('aria-busy', 'true');
    labelNode.textContent = '読込';
    opener.title = spec.loading;
    setStatus(spec.loading);
    const token = ++activationSequence;
    pending = (async () => {
      try {
        if (!loadedModule) loadedModule = await loader(retryAttempt);
        if (disposed || scope.disposed) return false;
        opener.disabled = false;
        opener.removeAttribute('aria-busy');
        labelNode.textContent = spec.button;
        opener.title = opener.getAttribute('aria-label') || spec.button;
        if (!available() || doc.hidden) { setStatus(spec.ready); return false; }
        // A disabled loading button can lose focus to body. Respect any real
        // focus move made while waiting, instead of opening over the next task.
        const focus = doc.activeElement;
        const shouldOpen = !focus || focus === opener || focus === doc.body;
        if (!shouldOpen) { setStatus(spec.ready); return false; }
        if (!mount()) { setStatus(spec.ready); return false; }
        mounted.open();
        setStatus('');
        return true;
      } catch {
        if (!disposed && !scope.disposed && token === activationSequence) {
          opener.disabled = false;
          opener.removeAttribute('aria-busy');
          if (!loadedModule) retryAttempt += 1;
          setStatus(spec.error);
          labelNode.textContent = '再試行';
          opener.title = spec.error;
          opener.setAttribute('aria-label', kind === 'color' ? '色調を調整（再試行）' : '文字を入力（再試行）');
        }
        return false;
      } finally {
        if (token === activationSequence) pending = null;
      }
    })();
    return pending;
  }

  scope.listen(opener, 'click', () => { void activate(); });
  scope.add(() => {
    disposed = true;
    pending = null;
    opener.remove();
    status.remove();
  });

  return {
    get opener() { return mounted?.opener || opener; },
    get panel() { return mounted?.panel || null; },
    get isOpen() { return mounted?.isOpen || false; },
    open: activate,
    close(options) { mounted?.close?.(options); },
    get loaded() { return Boolean(loadedModule); }
  };
}
