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
  const strip = doc.body.querySelector('[data-frame-strip]');
  const assertEveryFrameHasPreview = () => {
    const items = strip.querySelectorAll('[data-action="select-frame"]');
    assert.equal(items.length, frameData.length);
    assert.ok(items.every((item) => item.children.some((child) => child.classList.contains('animation-controls__preview'))));
  };

  assertEveryFrameHasPreview();
  assert.equal(previewCalls.length, frameData.length);
  for (const selectedIndex of [4, 8, 0]) {
    strip.scrollLeft = 72 + selectedIndex;
    state.frameId = frameData[selectedIndex].id;
    ui.refresh();
    assertEveryFrameHasPreview();
    assert.equal(strip.scrollLeft, 72 + selectedIndex);
  }
  assert.equal(state.frames, frameData, 'refresh preserves the frame collection');
  assert.deepEqual(frameData.map((frame) => frame.id), ['f1', 'f2', 'f3', 'f4', 'f5', 'f6', 'f7', 'f8', 'f9']);
  assert.deepEqual(actions, [], 'preview refreshes do not change project data');
  ui.dispose();
});
