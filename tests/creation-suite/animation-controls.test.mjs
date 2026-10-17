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
    this.dataset = {}; this.attributes = new Map(); this.listeners = new Map(); this.style = { setProperty(name, value) { this[name] = String(value); } }; this.className = ''; this.classNames = new Set();
    this.classList = {
      add: (...names) => names.forEach((name) => this.classNames.add(name)),
      toggle: (name, force) => { const next = force === undefined ? !this.classNames.has(name) : Boolean(force); if (next) this.classNames.add(name); else this.classNames.delete(name); return next; },
      contains: (name) => this.classNames.has(name) || String(this.className).split(/\s+/).includes(name)
    };
  }
  append(...nodes) { for (const node of nodes) { if (node.parentElement) node.parentElement.children = node.parentElement.children.filter((child) => child !== node); node.parentElement = this; this.children.push(node); } }
  insertBefore(node, before) { if (node === before) return node; if (node.parentElement) node.parentElement.children = node.parentElement.children.filter((child) => child !== node); const index = before ? this.children.indexOf(before) : -1; node.parentElement = this; this.children.splice(index < 0 ? this.children.length : index, 0, node); return node; }
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
  constructor() { this.defaultView = { innerWidth: 390, innerHeight: 844 }; this.body = this.createElement('body'); this.listeners = new Map(); }
  createElement(tagName) { return new FakeElement(tagName, this); }
  createElementNS(_namespace, tagName) { return new FakeElement(tagName, this); }
  querySelector() { return null; }
  addEventListener(type, listener) { const list = this.listeners.get(type) || []; list.push(listener); this.listeners.set(type, list); }
  removeEventListener(type, listener) { this.listeners.set(type, (this.listeners.get(type) || []).filter((item) => item !== listener)); }
  fire(type, event = {}) { const payload = { target: this, preventDefault() {}, ...event }; for (const listener of this.listeners.get(type) || []) listener(payload); }
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

  root.querySelector('[data-action="toggle-layers"]').fire('click');
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
  const duration = doc.body.querySelector('[data-duration-input]'); duration.value = String(1000 / 360); duration.fire('change');
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

test('frame timing is shown and edited as FPS without changing source timing on open or invalid input', () => {
  const doc = new FakeDocument(); const host = doc.createElement('div'); const scope = fakeScope();
  const state = { frames: [{ id: 'f1', durationMs: 40 }, { id: 'f2', durationMs: 80 }], layers: [{ id: 'l1', name: 'Layer', visible: true }], frameId: 'f1', layerId: 'l1', playing: false, onion: false, readOnly: false, audioMode: false };
  const actions = [];
  const ui = mountAnimationControls({ host, scope, getState: () => state, onAction(action) {
    actions.push(action);
    if (action.type === 'duration') state.frames.find((frame) => frame.id === action.frameId).durationMs = action.durationMs;
  } });
  const root = host.children[0]; const input = doc.body.querySelector('[data-duration-input]');
  assert.equal(input.value, '25'); assert.equal(input.max, '50', 'the dot editor is bounded by the GIF timeline it exports');
  root.querySelector('[data-action="toggle-duration"]').fire('click');
  assert.equal(input.getAttribute('aria-label'), '選択中コマのFPS');
  input.fire('change'); assert.deepEqual(actions, [], 'opening and committing the displayed value does not rewrite timing');
  input.value = ''; input.fire('change');
  assert.deepEqual(actions, [], 'empty input is rejected'); assert.equal(state.frames[0].durationMs, 40);
  input.value = '50'; input.fire('change');
  assert.deepEqual(actions.at(-1), { type: 'duration', frameId: 'f1', durationMs: 20 });
  const preset = doc.body.querySelector('[data-fps-preset]'); preset.value = '25'; preset.fire('change');
  assert.deepEqual(actions.at(-1), { type: 'duration', frameId: 'f1', durationMs: 40 });
  state.audioMode = true; ui.refresh();
  assert.equal(root.querySelector('[data-action="toggle-duration"]').hidden, true);
  assert.equal(doc.body.querySelector('[data-duration-input]').parentElement.hidden, true, 'audio mode does not expose animation FPS');
  ui.dispose();
});

test('compact opacity popover follows its target layer, reports input, and dismisses safely', async () => {
  const doc = new FakeDocument(); const host = doc.createElement('div'); host.id = 'draw-animation-controls'; const scope = fakeScope();
  const state = {
    frames: [{ id: 'f1', durationMs: 100 }, { id: 'f2', durationMs: 100 }],
    layers: [{ id: 'l1', name: 'Lineart', visible: true, locked: false, opacity: 1 }, { id: 'l2', name: 'Color', visible: true, locked: false, opacity: 0.35 }],
    frameId: 'f1', layerId: 'l1', playing: false, onion: false, readOnly: false, audioMode: false
  };
  const actions = []; let finishOpacity;
  const ui = mountAnimationControls({ host, scope, getState: () => state, onAction(action) {
    actions.push(action);
    if (action.type === 'layer-opacity') return new Promise(resolve => { finishOpacity = () => { state.layers.find(layer => layer.id === action.layerId).opacity = action.opacity; resolve(); }; });
    if (action.type === 'select-frame') state.frameId = action.frameId;
  } });
  host.querySelector('[data-action="toggle-layers"]').fire('click');
  const trigger = doc.body.querySelectorAll('[data-opacity-popover-trigger]').find(item => item.dataset.layerId === 'l2');
  const layerName = doc.body.querySelectorAll('[data-action="select-layer"]').find(item => item.dataset.layerId === 'l2');
  assert.equal(layerName.dataset.layerNumber, '2', 'the compact row keeps a visible layer number and its full accessible name');
  assert.equal(layerName.getAttribute('aria-label'), 'Color');
  const popover = doc.body.querySelector('[data-opacity-popover]');
  assert.equal(trigger.textContent, '35%');
  assert.match(trigger.getAttribute('aria-label'), /35%/);
  trigger.fire('click');
  assert.equal(popover.hidden, false);
  assert.equal(popover.getAttribute('role'), 'dialog');
  assert.equal(popover.getAttribute('aria-label'), 'Colorの不透明度（全コマ共通）');
  const inspector = doc.body.children.find(child => child.querySelector('[data-layer-list]'));
  const queryAll = inspector.querySelectorAll.bind(inspector);
  inspector.querySelectorAll = selector => {
    const found = queryAll(selector);
    return selector === '[data-opacity-popover-trigger]' ? { [Symbol.iterator]: () => found[Symbol.iterator]() } : found;
  };
  const slider = popover.querySelector('[data-opacity-popover-input]');
  assert.ok(popover.querySelector('[data-action="close-opacity-popover"]'), 'the dialog has an explicit keyboard and pointer dismissal control');
  assert.equal(slider.dataset.layerOpacity, 'l2', 'the compact slider is bound to its own layer, even when another layer is selected');
  assert.equal(slider.value, '0.35');
  slider.value = '0.62'; slider.fire('input');
  assert.equal(popover.querySelector('[data-opacity-popover-value]').textContent, '62%');
  doc.fire('keydown', { key: 'Escape' });
  assert.equal(popover.hidden, true);
  assert.equal(trigger.focused, true, 'Escape returns focus to the trigger');

  trigger.fire('click'); doc.fire('pointerdown', { target: doc.body });
  assert.equal(popover.hidden, true, 'a pointer outside both the trigger and popover dismisses it');

  trigger.fire('click');
  state.frameId = 'f2'; ui.refresh();
  assert.equal(popover.hidden, true, 'a frame change closes the layer-scoped popover');
  state.frameId = 'f1'; ui.refresh(); trigger.fire('click');
  trigger.focused = false;
  slider.value = '0.62'; slider.fire('change');
  assert.deepEqual(actions.at(-1), { type: 'layer-opacity', layerId: 'l2', opacity: 0.62 });
  assert.equal(popover.hidden, true, 'a pending opacity write closes the popover');
  assert.equal(trigger.focused, true, 'closing for a pending write restores focus while the trigger remains mounted');
  finishOpacity(); await Promise.resolve();

  state.readOnly = true; ui.refresh();
  trigger.fire('click');
  assert.equal(popover.hidden, true, 'read-only state cannot leave the opacity popover open');
  assert.equal(trigger.disabled, true, 'read-only state disables the compact opacity trigger');
  state.readOnly = false; state.layers[1].locked = false; ui.refresh(); trigger.fire('click');
  state.layers[1].locked = true; ui.refresh();
  assert.equal(popover.hidden, true, 'locking the layer closes its opacity popover');
  assert.equal(trigger.disabled, true, 'a locked layer disables the compact opacity trigger');
  state.layers[1].locked = false; ui.refresh(); trigger.fire('click');
  state.layers.splice(1, 1); ui.refresh();
  assert.equal(popover.hidden, true, 'removing the target layer closes its opacity popover');
  assert.equal(doc.body.querySelectorAll('[data-opacity-popover-trigger]').some(item => item.dataset.layerId === 'l2'), false, 'the inspector removes the deleted layer trigger');
  ui.dispose();
});

test('playback frame highlight survives refresh without changing the editing selection', () => {
  const doc = new FakeDocument(), host = doc.createElement('div'), scope = fakeScope();
  const state = { frames: [{ id: 'f1', durationMs: 100 }, { id: 'f2', durationMs: 100 }], layers: [{ id: 'l1', name: 'Layer', visible: true }], frameId: 'f1', layerId: 'l1', playing: true, playbackFrameId: 'f2' };
  const ui = mountAnimationControls({ host, scope, getState: () => state, onAction() {} });
  const active = () => host.querySelectorAll('[data-frame-id]').filter(n => n.classList.contains('is-playing')).map(n => n.dataset.frameId);
  assert.deepEqual(active(), ['f2']); ui.refresh(); assert.deepEqual(active(), ['f2']);
  assert.equal(host.querySelector('[data-frame-id="f1"]').getAttribute('aria-selected'), 'true');
  state.playing = false; state.playbackFrameId = null; ui.refresh(); assert.deepEqual(active(), []);
  ui.dispose();
});

test('external onion control removes toolbar and frame-menu actions only when opted in', () => {
  const doc = new FakeDocument(); const host = doc.createElement('div'); host.id = 'draw-animation-controls'; const scope = fakeScope();
  const state = {
    frames: [{ id: 'f1', durationMs: 120 }, { id: 'f2', durationMs: 240 }],
    layers: [{ id: 'l1', name: 'Layer', visible: true, locked: false }],
    frameId: 'f1', layerId: 'l1', playing: false, onion: false, readOnly: false, audioMode: false
  };
  const ui = mountAnimationControls({ host, scope, getState: () => state, onionControlExternal: true, onAction() {} });
  const root = host.children[0];
  assert.equal(root.querySelector('[data-action="onion"]'), null);
  root.querySelector('[data-action="toggle-frames"]').fire('click');
  root.querySelectorAll('[data-action="select-frame"]')[0].fire('contextmenu', { preventDefault() {} });
  const menu = doc.body.children.find((child) => child.dataset.frameMenu === 'true');
  assert.equal(menu.querySelector('[data-frame-menu-action="onion"]'), null);
  assert.ok(root.querySelector('[data-action="play"]'), 'other animation actions remain available');
  ui.dispose();
});

test('Draw cel grid exposes add cells, contextual editing, and long-press header reorder', () => {
  const doc = new FakeDocument(); const host = doc.createElement('div'); host.id = 'draw-animation-controls'; const scope = fakeScope();
  const state = {
    frames: [{ id: 'f1', durationMs: 120 }, { id: 'f2', durationMs: 240 }],
    layers: [{ id: 'l1', name: 'Lines', visible: true, locked: false }, { id: 'l2', name: 'Color', visible: false, locked: false }],
    frameId: 'f1', layerId: 'l1', playing: false, onion: false, readOnly: false, audioMode: false
  };
  const actions = [];
  const ui = mountAnimationControls({ host, scope, getState: () => state, getCelHasContent: (frameId, layerId) => frameId === 'f2' && layerId === 'l2', onAction(action) {
    actions.push(action);
    if (action.type === 'move-frame') { const frame = state.frames.splice(state.frames.findIndex((item) => item.id === action.frameId), 1)[0]; state.frames.splice(action.index, 0, frame); }
    if (action.type === 'move-layer') { const layer = state.layers.splice(state.layers.findIndex((item) => item.id === action.layerId), 1)[0]; state.layers.splice(action.index, 0, layer); }
    if (action.type === 'select-frame') { state.frameId = action.frameId; if (action.layerId) state.layerId = action.layerId; }
  } });
  const root = host.children[0]; root.querySelector('[data-action="toggle-frames"]').fire('click');
  const panel = doc.body.children.find((child) => child.getAttribute('role') === 'dialog');
  const grid = panel.children[2];
  assert.equal(panel.children[1].hidden, true, 'Draw hides the row of permanent controls');
  assert.ok(grid.querySelector('[data-action="add-frame"]'));
  assert.ok(grid.querySelector('[data-action="add-layer"]'));
  const addLayer = grid.querySelector('[data-action="add-layer"]');
  assert.equal(addLayer.style.gridRow, '4', 'layer + occupies the row after the two existing layers');
  assert.equal(addLayer.getAttribute('aria-rowindex'), '4');
  assert.equal(grid.children.at(-1), addLayer, 'layer + follows the layer rows in DOM order');
  assert.equal(grid.querySelectorAll('[data-action="select-frame"]')[0].style.gridColumn, '2');
  const layerHeaders = grid.querySelectorAll('[data-action="select-layer"]');
  assert.equal(layerHeaders[0].style.gridColumn, '1');
  assert.deepEqual(layerHeaders.map((header) => header.style.gridRow), ['2', '3']);
  assert.deepEqual(layerHeaders.map((header) => header.getAttribute('aria-rowindex')), ['2', '3']);
  grid.querySelector('[data-action="add-frame"]').fire('click');
  assert.deepEqual(actions.at(-1), { type: 'add-frame', frameId: 'f2', copy: true }, 'frame + uses the final frame as its source');
  grid.querySelector('[data-action="add-layer"]').fire('click');
  assert.deepEqual(actions.at(-1), { type: 'add-layer' });
  assert.equal(grid.querySelector('[data-has-content="true"]')?.dataset.layerId, 'l2');
  grid.querySelector('[data-action="select-cel"]').fire('click');
  assert.deepEqual(actions.at(-1), { type: 'select-frame', frameId: 'f1', layerId: 'l2' });
  grid.querySelectorAll('[data-action="select-frame"]')[1].fire('contextmenu', { preventDefault() {} });
  const menu = doc.body.children.find((child) => child.dataset.frameMenu === 'true');
  assert.equal(menu.hidden, false);
  assert.ok(menu.querySelector('[data-frame-menu-action="duration"]'));
  assert.ok(menu.querySelector('[data-frame-menu-action="onion"]'));
  menu.querySelector('[data-frame-menu-action="duplicate"]').fire('click');
  assert.deepEqual(actions.at(-1), { type: 'add-frame', frameId: 'f2', copy: true });
  let layerHeader = grid.querySelector('[data-action="select-layer"]');
  layerHeader.fire('contextmenu', { preventDefault() {} });
  assert.ok(menu.querySelector('[data-context-rename]'));
  menu.querySelector('[data-context-rename]').value = 'Tone';
  menu.querySelector('[data-frame-menu-action="rename"]').fire('click');
  assert.deepEqual(actions.at(-1), { type: 'rename-layer', layerId: 'l2', name: 'Tone' });
  layerHeader = grid.querySelector('[data-action="select-layer"]'); layerHeader.fire('contextmenu', { preventDefault() {} });
  menu.querySelector('[data-frame-menu-action="visibility"]').fire('click');
  assert.deepEqual(actions.at(-1), { type: 'visibility', layerId: 'l2', visible: true });

  let from = grid.querySelectorAll('[data-action="select-frame"]')[0]; let to = grid.querySelectorAll('[data-action="select-frame"]')[1];
  const layerFrom = grid.querySelectorAll('[data-action="select-layer"]')[1]; const layerTo = grid.querySelectorAll('[data-action="select-layer"]')[0];
  doc.elementFromPoint = () => layerTo;
  layerFrom.fire('pointerdown', { pointerId: 3, clientX: 20, clientY: 64 }); scope.fireTimerDelay(350);
  doc.fire('pointermove', { pointerId: 3, clientX: 20, clientY: 20 }); doc.fire('pointerup', { pointerId: 3, clientX: 20, clientY: 20 });
  assert.deepEqual(actions.at(-1), { type: 'move-layer', layerId: 'l1', index: 1 });
  from = grid.querySelectorAll('[data-action="select-frame"]')[0]; to = grid.querySelectorAll('[data-action="select-frame"]')[1];
  doc.elementFromPoint = () => to;
  from.fire('pointerdown', { pointerId: 4, clientX: 20, clientY: 20 }); scope.fireTimerDelay(350);
  doc.fire('pointermove', { pointerId: 4, clientX: 80, clientY: 20 });
  doc.fire('pointerup', { pointerId: 4, clientX: 80, clientY: 20 });
  assert.deepEqual(actions.at(-1), { type: 'move-frame', frameId: 'f1', index: 1 });
  const actionCount = actions.length;
  const cancelTarget = grid.querySelectorAll('[data-action="select-frame"]')[0];
  doc.elementFromPoint = () => cancelTarget;
  cancelTarget.fire('pointerdown', { pointerId: 8, clientX: 20, clientY: 20 }); scope.fireTimerDelay(350);
  doc.fire('pointercancel', { pointerId: 8 }); doc.fire('pointerup', { pointerId: 8 });
  assert.equal(actions.length, actionCount, 'pointer cancellation never commits a reorder');
  cancelTarget.fire('pointerdown', { pointerId: 9, clientX: 20, clientY: 20 }); scope.fireTimerDelay(350);
  doc.fire('pointerup', { pointerId: 9, clientX: 20, clientY: 20 });
  assert.equal(menu.hidden, false, 'releasing a long-pressed header without moving opens its contextual actions');
  ui.dispose();
});


test('Audio frame-only launcher opens a strip with frame actions and no layer or drawing timing UI', () => {
  const doc = new FakeDocument(); const host = doc.createElement('div'); host.id = 'audio-animation-controls';
  const scope = fakeScope(); const actions = [];
  const state = { frames: [{ id: 'f1', durationMs: 100 }, { id: 'f2', durationMs: 100 }],
    layers: [{ id: 'l1', name: 'Hidden', visible: false, locked: true }, { id: 'l2', name: 'Top', visible: true, locked: false }],
    frameId: 'f1', layerId: 'l2', audioMode: true, readOnly: false, playing: false, onion: false };
  const ui = mountAnimationControls({ host, scope, getState: () => state, frameOnly: true, onAction: action => actions.push(action) });
  const launcher = host.querySelector('[data-action="toggle-frames"]');
  const panel = doc.body.children.find(child => child.getAttribute('role') === 'dialog');
  assert.equal(panel.hidden, true);
  assert.equal(host.querySelectorAll('button').length, 1, 'the closed editor uses one launcher');
  assert.equal(panel.getAttribute('aria-label'), 'フレーム');
  assert.equal(doc.body.querySelector('[data-action="add-layer"]'), null);
  launcher.fire('click');
  assert.equal(panel.hidden, false);
  assert.equal(launcher.getAttribute('aria-expanded'), 'true');
  assert.equal(panel.querySelector('[data-frame-strip]').hidden, false);
  assert.equal(panel.querySelector('[data-action="toggle-layers"]'), null);
  assert.equal(panel.querySelector('[data-action="toggle-duration"]').hidden, true);
  panel.querySelector('[data-action="add-frame"]').fire('click');
  assert.deepEqual(actions.at(-1), { type: 'add-frame', copy: true });
  panel.querySelector('[data-action="select-frame"]').fire('contextmenu');
  const menu = doc.body.querySelector('[data-frame-menu]');
  assert.equal(menu.hidden, false);
  assert.equal(menu.querySelector('[data-frame-menu-action="duration"]'), null);
  assert.equal(menu.querySelector('[data-frame-menu-action="onion"]'), null);
  menu.querySelector('[data-frame-menu-action="right"]').fire('click');
  assert.deepEqual(actions.at(-1), { type: 'move-frame', frameId: 'f1', index: 1 });
  const firstFrame = panel.querySelector('[data-action="select-frame"]');
  firstFrame.fire('pointerdown', { pointerId: 1, clientX: 20, clientY: 100 });
  doc.fire('pointerup', { target: firstFrame, pointerId: 1 });
  scope.fireTimerDelay(520);
  assert.equal(menu.hidden, true, 'a quick tap must not open a delayed context menu');
  panel.querySelector('[data-action="close-animation"]').fire('click');
  assert.equal(panel.hidden, true);
  ui.dispose();
  assert.equal(host.children.length, 0);
  assert.equal(doc.body.children.length, 0);
});

test('Audio frame-only strip previews distant frames and preserves horizontal scroll on selection refresh', () => {
  const doc = new FakeDocument(); const host = doc.createElement('div'); host.id = 'audio-animation-controls';
  const scope = fakeScope(); const actions = []; const previewCalls = [];
  const frameData = Object.freeze(Array.from({ length: 9 }, (_, index) => Object.freeze({ id: `f${index + 1}`, durationMs: 100 })));
  const state = { frames: frameData, layers: Object.freeze([]), frameId: 'f1', layerId: null, audioMode: true, readOnly: false, playing: false, onion: false };
  const ui = mountAnimationControls({ host, scope, frameOnly: true, getState: () => state, onAction: action => actions.push(action),
    getFramePreview(frameId) { const preview = doc.createElement('canvas'); preview.nodeType = 1; previewCalls.push(frameId); return preview; } });
  host.querySelector('[data-action="toggle-frames"]').fire('click');
  const strip = doc.body.querySelector('[data-frame-strip]');
  const assertEveryFrameHasPreview = () => {
    const items = strip.querySelectorAll('[data-action="select-frame"]');
    assert.equal(items.length, frameData.length);
    assert.ok(items.every((item) => item.children.some((child) => child.classList.contains('animation-controls__preview'))));
  };

  assertEveryFrameHasPreview();
  assert.equal(previewCalls.length, frameData.length);
  ui.refresh(); assert.equal(previewCalls.length, frameData.length, 'stable immutable preview data is reused');
  for (const selectedIndex of [4, 8, 0]) {
    strip.scrollLeft = 72 + selectedIndex;
    state.frameId = frameData[selectedIndex].id;
    ui.refresh();
    assertEveryFrameHasPreview();
    assert.equal(previewCalls.length, frameData.length * (selectedIndex === 4 ? 2 : selectedIndex === 8 ? 3 : 4), 'selection changes refresh same-ID previews');
    assert.equal(strip.scrollLeft, 72 + selectedIndex);
  }
  assert.equal(state.frames, frameData, 'refresh preserves the frame collection');
  assert.deepEqual(frameData.map((frame) => frame.id), ['f1', 'f2', 'f3', 'f4', 'f5', 'f6', 'f7', 'f8', 'f9']);
  assert.deepEqual(actions, [], 'preview refreshes do not change project data');
  ui.dispose();
});

test('hidden cel workspace defers its grid, restores latest state on open, and reconciles keyed cells', () => {
  const doc = new FakeDocument(); const host = doc.createElement('div'); const scope = fakeScope();
  const state = { frames: [{ id: 'f1', durationMs: 100 }, { id: 'f2', durationMs: 200 }],
    layers: [{ id: 'l1', name: 'Ink', visible: true }, { id: 'l2', name: 'Tone', visible: true }],
    frameId: 'f1', layerId: 'l2', playing: false, readOnly: false, audioMode: false };
  let contentCalls = 0; let filled = false;
  const ui = mountAnimationControls({ host, scope, getState: () => state,
    getCelHasContent(frameId, layerId) { contentCalls += 1; return filled && frameId === 'f2' && layerId === 'l2'; }, onAction() {} });
  const panel = doc.body.children.find(child => child.getAttribute('role') === 'dialog');
  const grid = panel.children[2];
  assert.equal(grid.children.length, 0, 'the cel matrix is not built while its workspace is hidden');
  ui.refresh(); ui.refresh(); assert.equal(contentCalls, 0);
  filled = true; state.frameId = 'f2';
  host.querySelector('[data-action="toggle-frames"]').fire('click');
  assert.equal(contentCalls, 4, 'opening builds only the latest 2 by 2 matrix');
  for (const item of grid.querySelectorAll('[data-action="select-frame"], [data-action="select-cel"]')) {
    item.children.find = undefined; item.children.some = undefined;
  }
  ui.refresh();
  const cell = grid.querySelectorAll('[data-action="select-cel"]').find(item => item.dataset.frameId === 'f2' && item.dataset.layerId === 'l2');
  assert.equal(cell.dataset.hasContent, 'true'); assert.equal(cell.getAttribute('aria-selected'), 'true');
  const selectedFrameNode = grid.querySelectorAll('[data-action="select-frame"]').find(item => item.dataset.frameId === 'f2');
  const originalCellCount = grid.querySelectorAll('[data-action="select-cel"]').length;
  filled = false; ui.refresh(); assert.equal(cell.dataset.hasContent, 'false', 'mutable state refreshes do not reuse a stale cel-content cache');
  filled = true; ui.refresh(); assert.equal(cell.dataset.hasContent, 'true');
  state.frames.reverse(); state.layers.reverse(); state.layerId = 'l2'; ui.refresh();
  assert.equal(grid.querySelectorAll('[data-action="select-frame"]').find(item => item.dataset.frameId === 'f2'), selectedFrameNode, 'reorder retains keyed header nodes');
  assert.equal(grid.querySelectorAll('[data-action="select-cel"]').find(item => item.dataset.frameId === 'f2' && item.dataset.layerId === 'l2'), cell, 'selection refresh retains keyed cell nodes');
  assert.equal(cell.getAttribute('aria-selected'), 'true');
  state.frames.push({ id: 'f3', durationMs: 100 }); ui.refresh();
  assert.equal(grid.querySelectorAll('[data-action="select-cel"]').length, originalCellCount + 2, 'adding a frame adds one cell per layer');
  state.layers.splice(state.layers.findIndex(layer => layer.id === 'l1'), 1); ui.refresh();
  assert.equal(grid.querySelectorAll('[data-action="select-layer"]').length, 1);
  assert.equal(grid.querySelectorAll('[data-action="select-cel"]').length, 3, 'deleting a layer removes only its cells');
  for (let index = 0; index < 7; index += 1) state.layers.push({ id: `l${index + 3}`, name: `Layer ${index + 3}` });
  ui.refresh();
  assert.equal(grid.querySelector('[data-action="add-layer"]').disabled, true, 'the eight-layer limit disables the grid add control');
  ui.dispose();
});

test('frozen cel selection updates only its old and new headers and cells', () => {
  const doc = new FakeDocument(); const host = doc.createElement('div'); const scope = fakeScope();
  const frames = Object.freeze([{ id: 'f1', durationMs: 100 }, { id: 'f2', durationMs: 100 }].map(Object.freeze));
  const layers = Object.freeze([{ id: 'l1', name: 'Ink' }, { id: 'l2', name: 'Tone' }].map(Object.freeze));
  const state = { frames, layers, frameId: 'f1', layerId: 'l1', playing: false, readOnly: false, audioMode: false };
  let contentCalls = 0;
  const ui = mountAnimationControls({ host, scope, getState: () => state,
    getCelHasContent() { contentCalls += 1; return false; }, onAction() {} });
  const launcher = host.querySelector('[data-action="toggle-frames"]');
  launcher.fire('click');
  const panel = doc.body.children.find(child => child.getAttribute('role') === 'dialog');
  const grid = panel.children.find(child => child.classList.contains('animation-controls__frames'));
  assert.equal(contentCalls, 4);
  const untouched = grid.querySelectorAll('[data-action="select-cel"]').find(cell => cell.dataset.frameId === 'f1' && cell.dataset.layerId === 'l2');
  untouched.setAttribute('data-probe', 'preserved');
  const originalLabel = untouched.getAttribute('aria-label');
  const originalClass = untouched.className;

  state.frameId = 'f2'; state.layerId = 'l2'; ui.refresh();

  assert.equal(contentCalls, 4, 'selection-only refresh does not revisit sparse cel content');
  assert.equal(untouched.getAttribute('data-probe'), 'preserved');
  assert.equal(untouched.getAttribute('aria-label'), originalLabel);
  assert.equal(untouched.className, originalClass);
  assert.equal(untouched.getAttribute('aria-selected'), 'false');
  assert.equal(grid.querySelectorAll('[data-action="select-frame"]').find(item => item.dataset.frameId === 'f1').getAttribute('aria-selected'), 'false');
  assert.equal(grid.querySelectorAll('[data-action="select-frame"]').find(item => item.dataset.frameId === 'f2').getAttribute('aria-selected'), 'true');
  assert.equal(grid.querySelectorAll('[data-action="select-layer"]').find(item => item.dataset.layerId === 'l1').getAttribute('aria-pressed'), 'false');
  assert.equal(grid.querySelectorAll('[data-action="select-layer"]').find(item => item.dataset.layerId === 'l2').getAttribute('aria-pressed'), 'true');
  assert.equal(grid.querySelectorAll('[data-action="select-cel"]').find(item => item.dataset.frameId === 'f2' && item.dataset.layerId === 'l2').getAttribute('aria-selected'), 'true');
  assert.equal(launcher.getAttribute('aria-label'), 'レイヤーとフレームを開く。レイヤー 2、コマ 2');
  assert.equal(launcher.title, 'レイヤー 2、コマ 2');
  ui.dispose();
});

test('closed frame-only launcher refreshes its accessible count after an undo-sized shrink', () => {
  const doc = new FakeDocument(); const host = doc.createElement('div'); const scope = fakeScope();
  const state = { frames: Object.freeze([{ id: 'f1' }, { id: 'f2' }].map(Object.freeze)), layers: Object.freeze([]),
    frameId: 'f2', layerId: null, audioMode: true, readOnly: false, playing: false };
  const ui = mountAnimationControls({ host, scope, frameOnly: true, getState: () => state, onAction() {} });
  const launcher = host.querySelector('[data-action="toggle-frames"]');
  launcher.fire('click'); launcher.fire('click');
  state.frames = Object.freeze([{ id: 'f1' }].map(Object.freeze)); state.frameId = 'f1'; ui.refresh();
  assert.equal(launcher.getAttribute('aria-label'), 'フレームを開く（1 / 1）');
  assert.equal(launcher.title, 'フレーム 1 / 1');
  assert.equal(launcher.children.at(-1).textContent, 'F1');
  ui.dispose();
});

test('refresh bursts coalesce heavy rendering while pending actions disable controls immediately', async () => {
  const doc = new FakeDocument(); const host = doc.createElement('div'); const scope = fakeScope();
  const state = { frames: [{ id: 'f1', durationMs: 100 }, { id: 'f2', durationMs: 100 }],
    layers: [{ id: 'l1', name: 'Ink', visible: true }], frameId: 'f1', layerId: 'l1', playing: false, readOnly: false, audioMode: false };
  let finish; let nextFrame = 1; const rafs = new Map();
  doc.defaultView.requestAnimationFrame = callback => { const id = nextFrame++; rafs.set(id, callback); return id; };
  doc.defaultView.cancelAnimationFrame = id => rafs.delete(id);
  const ui = mountAnimationControls({ host, scope, getState: () => state, onAction(action) { if (action.type === 'play') return new Promise(resolve => { finish = resolve; }); } });
  const root = host.children[0]; root.querySelector('[data-action="play"]').fire('click');
  ui.refresh(); ui.refresh(); ui.refresh();
  assert.equal(rafs.size, 1, 'one browser frame contains the whole refresh burst');
  assert.equal(root.querySelector('[data-action="play"]').disabled, true, 'pending state is applied synchronously');
  state.readOnly = true;
  const callback = rafs.values().next().value; rafs.clear(); callback();
  assert.equal(root.querySelector('[data-action="play"]').disabled, true);
  assert.equal(root.querySelector('[data-action="next-frame"]').disabled, true);
  ui.dispose(); finish(); await Promise.resolve();
  assert.equal(rafs.size, 0);
});

test('playback updates only the previous and current keyed columns and hidden playback restores on open', () => {
  const doc = new FakeDocument(); const host = doc.createElement('div'); const scope = fakeScope();
  const state = { frames: [{ id: 'f1', durationMs: 100 }, { id: 'f2', durationMs: 100 }, { id: 'f3', durationMs: 100 }],
    layers: [{ id: 'l1', name: 'Ink' }], frameId: 'f1', layerId: 'l1', playing: true, playbackFrameId: 'f1', readOnly: false };
  const ui = mountAnimationControls({ host, scope, getState: () => state, onAction() {}, getCelHasContent: () => false });
  const panel = doc.body.children.find(child => child.getAttribute('role') === 'dialog'); const grid = panel.children[2];
  host.querySelector('[data-action="toggle-frames"]').fire('click');
  const cells = grid.querySelectorAll('[data-action="select-cel"]');
  assert.ok(cells.filter(cell => cell.dataset.frameId === 'f1').every(cell => cell.classList.contains('is-playing')));
  assert.ok(cells.filter(cell => cell.dataset.frameId !== 'f1').every(cell => !cell.classList.contains('is-playing')));
  host.querySelector('[data-action="toggle-frames"]').fire('click');
  state.playbackFrameId = 'f3'; ui.refresh();
  assert.ok(cells.filter(cell => cell.dataset.frameId === 'f1').every(cell => cell.classList.contains('is-playing')), 'hidden workspace is left untouched');
  assert.ok(cells.filter(cell => cell.dataset.frameId === 'f3').every(cell => !cell.classList.contains('is-playing')));
  host.querySelector('[data-action="toggle-frames"]').fire('click');
  assert.ok(grid.querySelectorAll('[data-action="select-cel"]').filter(cell => cell.dataset.frameId === 'f3').every(cell => cell.classList.contains('is-playing')));
  ui.dispose();
});

test('refresh preserves locked, boundary, and music-layer inspector restrictions', () => {
  const doc = new FakeDocument(); const host = doc.createElement('div'); const scope = fakeScope();
  const state = { frames: [{ id: 'f1', durationMs: 100 }], layers: [
    { id: 'music', role: 'music', name: 'Music', visible: true, locked: false },
    { id: 'locked', name: 'Locked', visible: true, locked: true },
    { id: 'top', name: 'Top', visible: true, locked: false }
  ], frameId: 'f1', layerId: 'top', playing: false, readOnly: false, audioMode: false };
  const ui = mountAnimationControls({ host, scope, getState: () => state, onAction() {} });
  host.querySelector('[data-action="toggle-layers"]').fire('click'); ui.refresh();
  assert.equal(ui.hasOpenPanels, true, 'the mobile layer inspector remains a dismissible open panel');
  const byLayer = (action, id) => doc.body.querySelectorAll(`[data-action="${action}"]`).find(control => control.dataset.layerId === id);
  const rename = id => doc.body.querySelectorAll('[data-rename-layer]').find(input => input.dataset.renameLayer === id);
  assert.equal(rename('locked').disabled, true); assert.equal(byLayer('visibility', 'locked').disabled, false);
  assert.equal(byLayer('lock', 'locked').disabled, false); assert.equal(byLayer('move-layer-up', 'locked').disabled, true);
  assert.equal(byLayer('move-layer-down', 'locked').disabled, true); assert.equal(byLayer('delete-layer', 'locked').disabled, true);
  assert.equal(byLayer('move-layer-up', 'top').disabled, true, 'the top layer cannot move higher');
  assert.equal(byLayer('move-layer-down', 'top').disabled, false);
  assert.equal(rename('music').disabled, true); assert.equal(byLayer('move-layer-up', 'music').disabled, true);
  assert.equal(byLayer('move-layer-down', 'music').disabled, true); assert.equal(byLayer('delete-layer', 'music').disabled, true);
  ui.dispose();
});

test('desktop layout attaches the shared inspector and lazy keyed frame strip, then restores it', () => {
  const doc = new FakeDocument(); const host = doc.createElement('div'); host.id = 'draw-animation-controls';
  const layerHost = doc.createElement('aside'), frameHost = doc.createElement('footer'), scope = fakeScope();
  const state = { frames: [{ id: 'f1', durationMs: 100 }, { id: 'f2', durationMs: 250 }], layers: [
    { id: 'l1', name: 'Ink', visible: true, locked: false }, { id: 'l2', name: 'Tone', visible: false, locked: true }
  ], frameId: 'f1', layerId: 'l1', playing: true, playbackFrameId: 'f1', readOnly: false, audioMode: false };
  const actions = []; let previewCalls = 0; let contentCalls = 0;
  const ui = mountAnimationControls({ host, scope, getState: () => state,
    getFramePreview() { previewCalls += 1; return doc.createElement('canvas'); },
    getCelHasContent(frameId, layerId) { contentCalls += 1; return frameId === 'f2' && layerId === 'l1'; },
    onAction(action) {
      actions.push(action);
      if (action.type === 'select-frame') state.frameId = action.frameId;
      if (action.type === 'visibility') state.layers.find(layer => layer.id === action.layerId).visible = action.visible;
      if (action.type === 'lock') state.layers.find(layer => layer.id === action.layerId).locked = action.locked;
    }
  });
  const panel = doc.body.children.find(child => child.getAttribute('role') === 'dialog');
  const grid = panel.children[2];
  const layerList = doc.body.querySelector('[data-layer-list]').parentElement;
  assert.equal(grid.children.length, 0, 'the matrix remains lazy while its original launcher is closed');

  ui.setDesktopLayout({ active: true, layerHost, frameHost });
  assert.equal(layerList.parentElement, layerHost, 'the existing inspector node moves into the desktop host');
  assert.equal(layerList.hidden, false, 'global layer visibility controls stay docked');
  assert.equal(ui.hasOpenPanels, false, 'the persistent desktop inspector is not a floating dismissal panel');
  assert.equal(frameHost.children.length, 1);
  assert.equal(previewCalls, 0, 'desktop frame buttons never request bitmap previews');
  assert.equal(grid.children.length, 0, 'desktop setup does not open or duplicate the matrix');
  const framePane = frameHost.children[0], strip = framePane.querySelector('[data-desktop-frame-strip]');
  const frameButtons = strip.querySelectorAll('[data-action="select-frame"]');
  assert.equal(frameButtons.length, 2);
  assert.equal(frameButtons[1].children.find(child => child.classList.contains('animation-controls__frame-duration')).textContent, '250ms');
  assert.ok(frameButtons[1].children.some(child => child.classList.contains('animation-controls__frame-content')), 'sparse cel content is shown as a small indicator');
  assert.ok(frameButtons[0].classList.contains('is-playing'));
  assert.equal(framePane.querySelector('[data-action="desktop-move-frame-left"]').disabled, true);
  assert.equal(framePane.querySelector('[data-action="desktop-move-frame-right"]').disabled, false);

  const originalButton = frameButtons[0];
  frameButtons[0].fire('keydown', { key: 'ArrowRight' });
  assert.deepEqual(actions.at(-1), { type: 'select-frame', frameId: 'f2' });
  assert.equal(frameButtons[1].focused, true, 'keyboard selection moves focus to the next desktop frame');
  assert.equal(framePane.querySelector('[data-action="desktop-move-frame-left"]').disabled, false);
  assert.equal(framePane.querySelector('[data-action="desktop-move-frame-right"]').disabled, true);
  assert.equal(strip.querySelectorAll('[data-action="select-frame"]')[0], originalButton, 'frame buttons retain keyed identity');
  state.playbackFrameId = 'f2'; ui.refresh();
  assert.equal(frameButtons[0].classList.contains('is-playing'), false);
  assert.equal(frameButtons[1].classList.contains('is-playing'), true, 'playback moves between keyed frame buttons');
  const visibility = layerList.querySelectorAll('[data-action="visibility"]').find(button => button.dataset.layerId === 'l2');
  visibility.fire('click');
  assert.deepEqual(actions.at(-1), { type: 'visibility', layerId: 'l2', visible: true });
  const lock = layerList.querySelectorAll('[data-action="lock"]').find(button => button.dataset.layerId === 'l2');
  lock.fire('click'); ui.refresh();
  assert.deepEqual(actions.at(-1), { type: 'lock', layerId: 'l2', locked: false });
  const rename = layerList.querySelector('[data-rename-layer="l2"]');
  assert.equal(rename.disabled, false, 'unlocking the global layer enables its rename control');
  state.readOnly = true; ui.refresh();
  assert.equal(layerList.querySelectorAll('[data-action="visibility"]').find(button => button.dataset.layerId === 'l2').disabled, true);
  assert.equal(framePane.querySelector('[data-action="desktop-add-frame"]').disabled, true);
  assert.equal(framePane.querySelector('[data-action="desktop-delete-frame"]').disabled, true);
  assert.equal(framePane.querySelector('[data-action="desktop-move-frame-left"]').disabled, true);
  assert.equal(framePane.querySelector('[data-action="desktop-move-frame-right"]').disabled, true);

  state.readOnly = false;
  framePane.querySelector('[data-action="desktop-blank-frame"]').fire('click');
  assert.deepEqual(actions.at(-1), { type: 'add-frame', frameId: 'f2', copy: false });
  frameButtons[1].fire('contextmenu', { preventDefault() {} });
  const menu = doc.body.querySelector('[data-frame-menu]');
  assert.ok(menu.querySelector('[data-frame-menu-action="delete"]'));
  assert.ok(menu.querySelector('[data-frame-menu-action="left"]'));
  assert.ok(menu.querySelector('[data-frame-menu-action="right"]'));

  ui.setDesktopFramesFolded(true);
  assert.equal(strip.hidden, true);
  state.playbackFrameId = 'f3';
  const callsBeforeFoldedUpdate = contentCalls;
  state.frames.push({ id: 'f3', durationMs: 80 }); ui.refresh();
  assert.equal(contentCalls, callsBeforeFoldedUpdate, 'folded frame panes skip list and content rendering');
  assert.equal(frameButtons[1].classList.contains('is-playing'), true, 'folded panes keep their existing playback nodes untouched');
  assert.equal(strip.querySelectorAll('[data-action="select-frame"]').length, 2);
  ui.setDesktopFramesFolded(false);
  assert.equal(strip.querySelectorAll('[data-action="select-frame"]').length, 3, 'expanding renders the latest shared state');
  assert.equal(strip.querySelectorAll('[data-action="select-frame"]')[2].classList.contains('is-playing'), true, 'expanding restores the latest playback frame');

  host.querySelector('[data-action="toggle-frames"]').fire('click');
  assert.ok(grid.children.length > 0, 'the original cel matrix opens only through its original launcher');
  assert.equal(ui.hasOpenPanels, true, 'opening the original matrix still exposes a dismissible panel');
  host.querySelector('[data-action="toggle-frames"]').fire('click');
  assert.equal(ui.hasOpenPanels, false, 'closing the matrix clears the open-panel state while layers remain docked');
  ui.setDesktopLayout({ active: false });
  assert.equal(layerList.parentElement, doc.body, 'the inspector returns to its original body portal parent');
  assert.equal(layerList.hidden, true);
  assert.equal(layerHost.dataset.desktopLayout, undefined);
  assert.equal(frameHost.dataset.desktopLayout, undefined);
  assert.equal(frameHost.children.length, 0);
  ui.dispose();
});
