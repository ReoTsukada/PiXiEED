import test from 'node:test';
import assert from 'node:assert/strict';
import { mountDrawViewportOverlays, shouldShowDrawOnion } from '../../js/creation/draw-viewport-overlays.mjs';

test('onion overlay follows toggle, playback, and read-only lifecycle states', () => {
  assert.equal(shouldShowDrawOnion({ enabled: false }), false);
  assert.equal(shouldShowDrawOnion({ enabled: true }), true);
  assert.equal(shouldShowDrawOnion({ enabled: true, playing: true }), false);
  assert.equal(shouldShowDrawOnion({ enabled: true, readOnly: true }), false);
  assert.equal(shouldShowDrawOnion({ enabled: true, playing: true, readOnly: true }), false);
});

function overlayFixture() {
  const created = [];
  globalThis.document = {
    createElement() {
      const context = { fills: [], fillStyle: '', fillRect(...rect) { this.fills.push(rect); } };
      const node = {
        className: '', hidden: false, style: {}, attributes: {}, parentNode: null,
        setAttribute(name, value) { this.attributes[name] = value; },
        remove() { this.parentNode?.children.splice(this.parentNode.children.indexOf(this), 1); },
        getContext() { return context; },
        set width(value) { this._width = value; context.fills = []; }, get width() { return this._width; },
        set height(value) { this._height = value; context.fills = []; }, get height() { return this._height; },
        context
      };
      created.push(node); return node;
    }
  };
  globalThis.window = {
    devicePixelRatio: 2,
    matchMedia() { return { addEventListener() {}, removeEventListener() {} }; }
  };
  const board = {
    clientWidth: 80, clientHeight: 60, clientLeft: 2, clientTop: 3, children: [],
    append(node) { node.parentNode = this; this.children.push(node); },
    getBoundingClientRect() { return { left: 10, top: 20 }; }
  };
  let canvasRect = { left: 18.25, top: 29.5, width: 24, height: 12 };
  const canvas = { getBoundingClientRect: () => canvasRect, setRect(rect) { canvasRect = rect; } };
  const cleanup = [];
  const scope = {
    add(callback) { cleanup.push(callback); },
    listen(target, event, callback, options) {
      target.addEventListener?.(event, callback, options);
      return () => target.removeEventListener?.(event, callback, options);
    }
  };
  return { board, canvas, created, scope, cleanup };
}

test('grid toggle clears pixel lines and pixel boundaries follow zoom/pan canvas coordinates', () => {
  const originalDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const fixture = overlayFixture();
  try {
    const overlays = mountDrawViewportOverlays(fixture);
    const [, lines] = fixture.created;
    overlays.render({ width: 4, height: 2, grid: true });
    assert.deepEqual(lines.context.fills.map(([x, y, width, height]) => [x, y, width, height]), [
      [13, 13, 1, 24], [25, 13, 1, 24], [37, 13, 1, 24], [49, 13, 1, 24], [61, 13, 1, 24],
      [13, 13, 48, 1], [13, 25, 48, 1], [13, 37, 48, 1]
    ]);

    fixture.canvas.setRect({ left: 21.25, top: 31.5, width: 48, height: 24 });
    overlays.render({ width: 4, height: 2, grid: true });
    assert.deepEqual(lines.context.fills.slice(0, 5).map(([x, y, width, height]) => [x, y, width, height]), [
      [19, 17, 1, 48], [43, 17, 1, 48], [67, 17, 1, 48], [91, 17, 1, 48], [115, 17, 1, 48]
    ], 'zoomed and panned canvas lines use independently rounded device-pixel boundaries');

    const beforeReadOnly = lines.context.fills.length;
    overlays.render({ width: 4, height: 2, grid: true, readOnly: true });
    assert.equal(lines.hidden, true);
    overlays.render({ width: 4, height: 2, grid: true });
    assert.equal(lines.hidden, false, 'leaving read-only mode restores the overlay');
    assert.equal(lines.context.fills.length, beforeReadOnly, 'same geometry remains painted without adding duplicate lines');

    overlays.render({ width: 4, height: 2, grid: false });
    assert.deepEqual(lines.context.fills, [], 'disabling the grid clears its previous line pixels');
    assert.equal(lines.hidden, false, 'checker background remains available while grid lines are off');
    for (const dispose of fixture.cleanup) dispose();
  } finally {
    if (originalDocument) Object.defineProperty(globalThis, 'document', originalDocument); else delete globalThis.document;
    if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow); else delete globalThis.window;
  }
});
