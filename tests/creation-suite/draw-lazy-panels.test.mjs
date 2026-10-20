import test from 'node:test';
import assert from 'node:assert/strict';
import { mountLazyDrawFeaturePanels } from '../../js/creation/draw-lazy-panels.mjs';

class FakeNode {
  constructor(ownerDocument, tagName = '#node') {
    this.ownerDocument = ownerDocument;
    this.tagName = tagName;
    this.children = [];
    this.childNodes = [];
    this.attributes = new Map();
    this.listeners = new Map();
    this.parentElement = null;
    this.className = '';
    this.disabled = false;
    this.hidden = false;
    this.textContent = '';
  }
  get isConnected() { return Boolean(this.parentElement?.isConnected || this.connectedRoot); }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  removeAttribute(name) { this.attributes.delete(name); }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  addEventListener(type, callback) { const list = this.listeners.get(type) || []; list.push(callback); this.listeners.set(type, list); }
  removeEventListener(type, callback) { this.listeners.set(type, (this.listeners.get(type) || []).filter(item => item !== callback)); }
  dispatch(type) { for (const callback of this.listeners.get(type) || []) callback({ type, target: this }); }
  append(...nodes) {
    for (const node of nodes) {
      node.parentElement?.removeChild(node);
      node.parentElement = this;
      this.childNodes.push(node);
      if (node.tagName !== '#text') this.children.push(node);
    }
  }
  replaceWith(node) {
    const parent = this.parentElement;
    if (!parent) return;
    const index = parent.children.indexOf(this);
    const childIndex = parent.childNodes.indexOf(this);
    this.parentElement = null;
    node.parentElement?.removeChild(node);
    node.parentElement = parent;
    if (index >= 0) parent.children.splice(index, 1, node);
    if (childIndex >= 0) parent.childNodes.splice(childIndex, 1, node);
  }
  removeChild(node) {
    this.children = this.children.filter(item => item !== node);
    this.childNodes = this.childNodes.filter(item => item !== node);
    node.parentElement = null;
  }
  remove() { this.parentElement?.removeChild(this); }
}

function fixture({ loaders, active = () => true } = {}) {
  const doc = {
    hidden: false,
    createElement(tag) { return new FakeNode(doc, tag); },
    createTextNode(text) { const node = new FakeNode(doc, '#text'); node.textContent = text; return node; }
  };
  const toolbar = doc.createElement('div'); toolbar.connectedRoot = true;
  const host = doc.createElement('main'); host.connectedRoot = true;
  host.querySelector = selector => selector.includes('.draw-fixed-left') ? toolbar : selector.includes('.draw-controls') ? toolbar : null;
  const cleanups = [];
  const scope = {
    disposed: false,
    listen(target, type, callback) { target.addEventListener(type, callback); return () => target.removeEventListener(type, callback); },
    add(cleanup) { cleanups.push(cleanup); },
    dispose() { this.disposed = true; for (const cleanup of cleanups.reverse()) cleanup(); }
  };
  const panels = mountLazyDrawFeaturePanels({ scope, host, doc, isActive: active, callbacks: {}, loaders });
  return { doc, toolbar, host, scope, panels };
}

function panelModule(doc, counters) {
  return {
    mountDrawColorAdjustmentPanel({ scope, host }) { return mount('color', scope, host); },
    mountDrawTextPanel({ scope, host }) { return mount('text', scope, host); }
  };
  function mount(kind, scope, host) {
    counters.mounts[kind] += 1;
    const opener = doc.createElement('button');
    opener.className = kind === 'color' ? 'draw-color-adjustment-open' : 'draw-text-opener';
    const panel = doc.createElement('section');
    host.append(panel);
    const toolbar = host.querySelector('.draw-fixed-left');
    toolbar.append(opener);
    let open = false;
    scope.add(() => { opener.remove(); panel.remove(); });
    return { opener, panel, open() { open = true; counters.opens[kind] += 1; }, close() { open = false; }, get isOpen() { return open; } };
  }
}

test('optional panels do not load until activation and replace the stable opener once', async () => {
  const counters = { loads: { color: 0, text: 0 }, mounts: { color: 0, text: 0 }, opens: { color: 0, text: 0 } };
  const { doc: fakeDoc, toolbar, panels } = fixture({ loaders: {
    color: async () => { counters.loads.color += 1; return panelModule(fakeDoc, counters); },
    text: async () => { counters.loads.text += 1; return panelModule(fakeDoc, counters); }
  } });
  const colorButton = panels.color.opener;
  const textButton = panels.text.opener;
  assert.deepEqual(counters.loads, { color: 0, text: 0 });
  assert.ok(colorButton.isConnected && textButton.isConnected);

  await panels.color.open();
  assert.equal(counters.loads.color, 1);
  assert.equal(counters.loads.text, 0);
  assert.equal(counters.mounts.color, 1);
  assert.equal(counters.opens.color, 1);
  assert.equal(panels.color.opener.className, 'draw-color-adjustment-open');
  assert.equal(toolbar.children.filter(node => node.className === 'draw-color-adjustment-open').length, 1);
  await panels.color.open();
  assert.equal(counters.mounts.color, 1, 'a ready panel is not mounted twice');
  assert.equal(counters.opens.color, 2);
});

test('failed import exposes a live retry state and retries with a new attempt', async () => {
  const attempts = [];
  const counters = { mounts: { color: 0, text: 0 }, opens: { color: 0, text: 0 } };
  let doc;
  const fixtureResult = fixture({ loaders: {
    color: async attempt => { attempts.push(attempt); if (attempt === 0) throw new Error('network'); return panelModule(doc, counters); },
    text: async () => panelModule(doc, counters)
  } });
  doc = fixtureResult.doc;
  const { panels } = fixtureResult;
  const opener = panels.color.opener;
  assert.equal(await panels.color.open(), false);
  assert.equal(opener.disabled, false);
  assert.equal(opener.getAttribute('aria-busy'), null);
  assert.match(opener.childNodes[1].textContent, /再試行/);
  assert.deepEqual(attempts, [0]);

  await panels.color.open();
  assert.deepEqual(attempts, [0, 1]);
  assert.equal(counters.mounts.color, 1);
  assert.equal(counters.opens.color, 1);
});

test('existing action-only text controller adapts its DOM and respects focus moved during loading', async () => {
  let resolveLoad;
  const f = fixture({ loaders: { color: async () => ({}), text: () => new Promise(resolve => { resolveLoad = resolve; }) } });
  const query = f.host.querySelector;
  f.host.querySelectorAll = selector => f.toolbar.children.filter(node => selector === '.' + node.className);
  f.host.querySelector = selector => query(selector) || f.host.children.find(node => selector === '.' + node.className);
  let opens = 0;
  const pending = f.panels.text.open();
  const nextFocus = f.doc.createElement('button'); f.doc.activeElement = nextFocus;
  resolveLoad({ mountDrawTextPanel({ host, scope }) {
    const opener = f.doc.createElement('button'); opener.className = 'draw-text-opener'; f.toolbar.append(opener);
    const panel = f.doc.createElement('section'); panel.className = 'draw-text-panel'; host.append(panel);
    scope.add(() => { opener.remove(); panel.remove(); });
    return { open() { opens++; }, close() {}, get isOpen() { return opens > 0; } };
  } });
  assert.equal(await pending, false);
  assert.equal(f.doc.activeElement, nextFocus);
  assert.equal(f.panels.text.panel, null);
  assert.equal(await f.panels.text.open(), true);
  assert.equal(opens, 1);
  assert.equal(f.panels.text.panel.className, 'draw-text-panel');
  assert.equal(f.toolbar.children.filter(node => node.className === 'draw-text-opener').length, 1);
  assert.equal(f.panels.text.isOpen, true);
  f.scope.dispose();
  assert.equal(f.host.children.length, 0);
});

test('a panel that resolves while hidden or disposed does not mount or open stale UI', async () => {
  let resolveLoad;
  const counters = { mounts: { color: 0, text: 0 }, opens: { color: 0, text: 0 } };
  let currentDoc;
  const hiddenFixture = fixture({ loaders: {
    color: () => new Promise(resolve => { resolveLoad = resolve; }),
    text: async () => panelModule(currentDoc, counters)
  } });
  currentDoc = hiddenFixture.doc;
  const pending = hiddenFixture.panels.color.open();
  hiddenFixture.doc.hidden = true;
  resolveLoad(panelModule(hiddenFixture.doc, counters));
  assert.equal(await pending, false);
  assert.equal(counters.mounts.color, 0);
  hiddenFixture.doc.hidden = false;
  await hiddenFixture.panels.color.open();
  assert.equal(counters.mounts.color, 1);
  assert.equal(counters.opens.color, 1);

  let resolveDisposed;
  const disposedFixture = fixture({ loaders: {
    color: () => new Promise(resolve => { resolveDisposed = resolve; }),
    text: async () => panelModule(disposedFixture.doc, counters)
  } });
  const disposedPending = disposedFixture.panels.color.open();
  disposedFixture.scope.dispose();
  resolveDisposed(panelModule(disposedFixture.doc, counters));
  assert.equal(await disposedPending, false);
  assert.equal(counters.mounts.color, 1, 'disposed load does not mount');
  assert.equal(disposedFixture.panels.color.opener.isConnected, false);
});
