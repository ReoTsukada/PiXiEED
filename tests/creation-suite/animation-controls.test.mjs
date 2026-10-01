import test from 'node:test';
import assert from 'node:assert/strict';
import {
  beginDrawStroke,
  cancelDrawStroke,
  commitDrawStroke,
  createDrawDocument,
  createDrawHistory,
  floodFill,
  strokePixels,
  trackDrawStrokeChanges
} from '../../js/creation/draw-core.mjs';
import { mountAnimationControls } from '../../js/creation/animation-controls.mjs';

class FakeElement {
  constructor(tagName, ownerDocument) {
    this.tagName = tagName.toUpperCase(); this.ownerDocument = ownerDocument; this.children = []; this.parentElement = null;
    this.dataset = {}; this.attributes = new Map(); this.listeners = new Map(); this.style = {}; this.className = ''; this.classNames = new Set();
    this.classList = {
      add: (...names) => names.forEach((name) => this.classNames.add(name)),
      toggle: (name, force) => { const next = force === undefined ? !this.classNames.has(name) : Boolean(force); if (next) this.classNames.add(name); else this.classNames.delete(name); return next; },
      contains: (name) => this.classNames.has(name)
    };
  }
  append(...nodes) { for (const node of nodes) { if (node.parentElement) node.parentElement.children = node.parentElement.children.filter((child) => child !== node); node.parentElement = this; this.children.push(node); } }
  prepend(node) { node.parentElement = this; this.children.unshift(node); }
  removeChild(node) { this.children = this.children.filter((child) => child !== node); node.parentElement = null; return node; }
  replaceChildren(...nodes) { for (const child of this.children) child.parentElement = null; this.children = []; this.append(...nodes); }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  addEventListener(type, listener) { const list = this.listeners.get(type) || []; list.push(listener); this.listeners.set(type, list); }
  removeEventListener(type, listener) { this.listeners.set(type, (this.listeners.get(type) || []).filter((item) => item !== listener)); }
  matches(selector) {
    if (selector.includes(',')) return selector.split(',').some((part) => this.matches(part.trim()));
    if (selector === 'button') return this.tagName === 'BUTTON';
    if (selector === 'input') return this.tagName === 'INPUT';
    const match = selector.match(/^\[data-([a-z-]+)(?:="([^"]*)")?\]$/);
    if (match) {
      const key = match[1].replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
      return Object.hasOwn(this.dataset, key) && (match[2] === undefined || String(this.dataset[key]) === match[2]);
    }
    return false;
  }
  closest(selector) { for (let node = this; node; node = node.parentElement) if (node.matches(selector)) return node; return null; }
  contains(target) { if (target === this) return true; return this.children.some((child) => child.contains(target)); }
  querySelectorAll(selector) { const found = []; for (const child of this.children) { if (child.matches(selector)) found.push(child); found.push(...child.querySelectorAll(selector)); } return found; }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  focus() { this.focused = true; }
  getBoundingClientRect() { return { left: 12, top: 90, right: 68, bottom: 146, width: 56, height: 56 }; }
  fire(type, event = {}) {
    const payload = { target: this, preventDefault() {}, ...event };
    for (let node = this; node; node = node.parentElement) for (const listener of node.listeners.get(type) || []) listener(payload);
  }
  cloneNode() { return new FakeElement(this.tagName, this.ownerDocument); }
}

class FakeDocument {
  constructor() { this.defaultView = { innerWidth: 390 }; this.body = this.createElement('body'); }
  createElement(tagName) { return new FakeElement(tagName, this); }
  createElementNS(_namespace, tagName) { return new FakeElement(tagName, this); }
}

function fakeScope() {
  const timers = new Map(); let next = 1;
  return {
    disposed: false,
    listen(target, type, listener) { target.addEventListener(type, listener); return () => target.removeEventListener(type, listener); },
    timeout(callback, delay) { const id = next++; timers.set(id, { callback, delay }); return id; },
    clearTimeout(id) { timers.delete(id); },
    add(cleanup) { this.cleanup = cleanup; },
    fireTimer(id) { const task = timers.get(id); timers.delete(id); task?.callback(); },
    fireTimerDelay(delay) { const entry = [...timers].find(([, task]) => task.delay === delay); if (entry) this.fireTimer(entry[0]); },
    dispose() { this.disposed = true; this.cleanup?.(); }
  };
}

test('stroke tracker records sparse before/after edits, commits undo/redo, and cancels without snapshots', () => {
  const document = createDrawDocument(32); const history = createDrawHistory(document);
  const pixelsIdentity = document.pixels;
  const tracker = beginDrawStroke(document, { trusted: true });
  trackDrawStrokeChanges(tracker, document, (active) => {
    strokePixels(document, { x: 1, y: 2 }, { x: 5, y: 2 }, 2, { trusted: true, tracker: active });
    strokePixels(document, { x: 3, y: 2 }, { x: 3, y: 2 }, -1, { trusted: true, tracker: active });
  });
  assert.equal(document.pixels, pixelsIdentity);
  assert.equal(tracker.changes.size, 4);
  assert.equal(commitDrawStroke(document, history, tracker), true);
  assert.equal(history.retainedBytes, 32);
  assert.equal(history.undo(), true); assert.ok(document.pixels.every((pixel) => pixel === -1));
  assert.equal(history.redo(), true); assert.equal(document.pixels[2 * 32 + 3], -1);

  const cancelled = beginDrawStroke(document, { trusted: true });
  trackDrawStrokeChanges(cancelled, document, (active) => floodFill(document, 0, 0, 4, { trusted: true, tracker: active }));
  assert.ok(cancelled.changes.size > 0);
  cancelDrawStroke(document, cancelled);
  assert.equal(document.pixels[0], -1);
  assert.throws(() => commitDrawStroke(document, history, cancelled), /tracker/);
});

test('flood fill can reuse a validated-sized Uint32 queue', () => {
  const document = createDrawDocument(16); const queue = new Uint32Array(16 * 16);
  const changed = floodFill(document, 0, 0, 1, { queue });
  assert.equal(changed.buffer, queue.buffer);
  assert.equal(changed.length, 16 * 16);
  assert.throws(() => floodFill(createDrawDocument(16), 0, 0, 1, { queue: new Uint32Array(1) }), /queue/);
});

test('animation controls emit typed actions, preserve one-frame collapse, and dispose listeners', async () => {
  const doc = new FakeDocument(); const host = doc.createElement('div'); const scope = fakeScope();
  const state = {
    frames: [{ id: 'f1', durationMs: 120 }, { id: 'f2', durationMs: 240 }],
    layers: [{ id: 'l1', name: 'Lines', visible: true, locked: false }, { id: 'l2', name: 'Color', visible: false, locked: true }],
    frameId: 'f1', layerId: 'l1', playing: false, onion: false, readOnly: false, audioMode: false
  };
  const actions = [];
  let finishAsync;
  const ui = mountAnimationControls({
    host, scope, getState: () => state,
    onAction(action) {
      actions.push(action);
      if (action.type === 'select-frame') state.frameId = action.frameId;
      if (action.type === 'visibility') state.layers.find((layer) => layer.id === action.layerId).visible = action.visible;
      if (action.type === 'duration') state.frames.find((frame) => frame.id === action.frameId).durationMs = action.durationMs;
      if (action.type === 'add-frame') { const source = state.frames.find((frame) => frame.id === (action.frameId || state.frameId)); const frame = { ...source, id: `f${state.frames.length + 1}` }; state.frames.push(frame); state.frameId = frame.id; }
      if (action.type === 'play') return new Promise((resolve) => { finishAsync = resolve; });
    }
  });
  const root = host.children[0]; const frames = root.querySelector('[data-frame-strip]');
  assert.equal(frames.hidden, false);
  root.querySelector('[data-action="toggle-frames"]').fire('click'); assert.equal(frames.hidden, true);
  root.querySelector('[data-action="toggle-frames"]').fire('click'); assert.equal(frames.hidden, false);
  const frame2 = frames.querySelectorAll('[data-action="select-frame"]')[1];
  frame2.fire('click'); assert.deepEqual(actions.at(-1), { type: 'select-frame', frameId: 'f2' });

  const visibility = doc.body.querySelectorAll('[data-action="visibility"]').find((button) => button.dataset.layerId === 'l2'); visibility.fire('click');
  assert.deepEqual(actions.at(-1), { type: 'visibility', layerId: 'l2', visible: true });
  const lock = doc.body.querySelectorAll('[data-action="lock"]').find((button) => button.dataset.layerId === 'l2'); lock.fire('click');
  assert.deepEqual(actions.at(-1), { type: 'lock', layerId: 'l2', locked: false });
  const layerButtons = doc.body.querySelectorAll('[data-action="select-layer"]');
  assert.equal(layerButtons[0].dataset.layerId, 'l2', 'topmost layer is listed first');
  assert.ok(lock.children[0].tagName === 'SVG', 'lock state uses an inline vector icon');
  const moveLayer = doc.body.querySelectorAll('[data-action="move-layer-up"]').find((button) => button.dataset.layerId === 'l1'); moveLayer.fire('click');
  assert.deepEqual(actions.at(-1), { type: 'move-layer', layerId: 'l1', index: 1 });
  const rename = doc.body.querySelectorAll('[data-rename-layer]').find((input) => input.dataset.renameLayer === 'l2'); rename.value = 'Color edits'; rename.fire('focusout');
  assert.deepEqual(actions.at(-1), { type: 'rename-layer', layerId: 'l2', name: 'Color edits' });
  const duration = doc.body.querySelector('[data-duration-input]'); duration.value = '360'; duration.fire('change');
  assert.deepEqual(actions.at(-1), { type: 'duration', frameId: 'f2', durationMs: 360 });

  root.querySelector('[data-action="add-frame"]').fire('click');
  assert.deepEqual(actions.at(-1), { type: 'add-frame', copy: true });
  const selected = frames.querySelectorAll('[data-action="select-frame"]').find((button) => button.dataset.frameId === state.frameId);
  selected.fire('keydown', { key: 'ArrowLeft' });
  assert.deepEqual(actions.at(-1), { type: 'select-frame', frameId: 'f2' });

  frames.querySelectorAll('[data-action="select-frame"]')[0].fire('pointerdown'); scope.fireTimerDelay(520);
  assert.equal(doc.body.querySelector('[data-frame-menu]')?.hidden, false);
  doc.body.querySelectorAll('[data-action="frame-menu"]').find((button) => button.dataset.frameMenuAction === 'duplicate').fire('click');
  assert.deepEqual(actions.at(-1), { type: 'add-frame', frameId: 'f1', copy: true });
  frames.querySelectorAll('[data-action="select-frame"]')[0].fire('pointerdown'); scope.fireTimerDelay(520);
  doc.body.querySelectorAll('[data-action="frame-menu"]').find((button) => button.dataset.frameMenuAction === 'blank').fire('click');
  assert.deepEqual(actions.at(-1), { type: 'add-frame', frameId: 'f1', copy: false });
  const dragFrom = frames.querySelectorAll('[data-action="select-frame"]')[0]; const dragTo = frames.querySelectorAll('[data-action="select-frame"]')[1];
  const dataTransfer = { setData() {}, setDragImage() {} };
  dragFrom.fire('dragstart', { dataTransfer }); dragTo.fire('drop', { dataTransfer });
  assert.deepEqual(actions.at(-1), { type: 'move-frame', frameId: dragFrom.dataset.frameId, index: 1 });
  root.querySelector('[data-action="onion"]').fire('click');
  assert.deepEqual(actions.at(-1), { type: 'onion', enabled: true });
  root.querySelector('[data-action="export-gif"]').fire('click');
  assert.deepEqual(actions.at(-1), { type: 'export-gif' });

  root.querySelector('[data-action="play"]').fire('click');
  assert.equal(root.querySelector('[data-action="play"]').disabled, true);
  ui.dispose(); finishAsync(); await Promise.resolve();
  assert.equal(host.children.length, 0);
  assert.equal(doc.body.children.length, 0);
  assert.equal((root.listeners.get('click') || []).length, 0);
});

test('a single frame begins collapsed and GIF export is hidden in audio mode', () => {
  const doc = new FakeDocument(); const host = doc.createElement('div'); const scope = fakeScope();
  const state = { frames: [{ id: 'f1', durationMs: 100 }], layers: [{ id: 'l1', name: 'Layer', visible: true }], frameId: 'f1', layerId: 'l1', playing: false, onion: false, readOnly: false, audioMode: true };
  const ui = mountAnimationControls({ host, scope, getState: () => state, onAction() {} });
  const root = host.children[0];
  assert.equal(root.querySelector('[data-frame-strip]').hidden, true);
  assert.equal(root.querySelector('[data-action="export-gif"]').hidden, true);
  assert.equal(root.querySelector('[data-action="play"]').hidden, true);
  assert.equal(root.querySelector('[data-action="onion"]').hidden, true);
  assert.equal(root.querySelector('[data-action="toggle-duration"]').hidden, true);
  ui.dispose();
});
