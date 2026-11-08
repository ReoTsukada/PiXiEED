import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../../js/creation/draw-page.mjs', import.meta.url), 'utf8');

function functionSource(name) {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `missing ${name}`);
  const opening = source.indexOf(') {', start) + 2;
  assert.ok(opening >= 2, `missing body for ${name}`);
  let depth = 0;
  for (let index = opening; index < source.length; index++) {
    if (source[index] === '{') depth++;
    if (source[index] === '}' && --depth === 0) return source.slice(start, index + 1);
  }
  throw new Error(`unclosed function ${name}`);
}

function viewportHarness() {
  const fixture = {
    updates: 0,
    board: {
      dataset: {},
      getBoundingClientRect() { return { left: 50, top: 20, width: 300, height: 260 }; }
    },
    zoomLabel: { textContent: '', classList: { toggle() {} } },
    canvas: {
      style: { transform: '' },
      getBoundingClientRect() {
        const match = this.style.transform.match(/translate\(([^,]+)px,\s*([^)]+)px\)\s*scale\(([^)]+)\)/);
        const panX = match ? Number(match[1]) : 0, panY = match ? Number(match[2]) : 0, scale = match ? Number(match[3]) : 1;
        const width = 319.5 * scale, height = 279.25 * scale;
        return { left: 200 + panX - width / 2, top: 150 + panY - height / 2, width, height };
      }
    }
  };
  const start = source.indexOf('function layoutCenter()');
  const end = source.indexOf('function placeOverlays()', start);
  assert.ok(start >= 0 && end > start, 'viewport function region is present');
  const actualFunctions = source.slice(start, end);
  const view = vm.runInNewContext(`(() => {
    let zoom = 1, panX = 0, panY = 0;
    let renderedZoom = 1, renderedPanX = 0, renderedPanY = 0;
    const ZOOM_MAX = 8, canvas = fixture.canvas;
    function $(selector) { return selector === '.draw-board' ? fixture.board : fixture.zoomLabel; }
    function placeOverlays() { fixture.updates++; }
    ${actualFunctions}
    return { zoomAt, resetView, state: () => ({ zoom, panX, panY, renderedZoom, renderedPanX, renderedPanY }) };
  })()`, { fixture });
  return { ...view, fixture, get updates() { return fixture.updates; } };
}

function near(actual, expected, label) {
  assert.ok(Math.abs(actual - expected) < 1e-7, `${label}: expected ${expected}, got ${actual}`);
}

test('pinch combines zoom and midpoint translation into one canvas-view update', () => {
  const zoomAt = functionSource('zoomAt');
  assert.match(zoomAt, /panDelta\s*=\s*null/);
  assert.equal((zoomAt.match(/updateCanvasView\(\)/g) || []).length, 1,
    'the anchored zoom routine performs exactly one final view update');
  assert.match(zoomAt, /if \(panDelta\) \{ panX \+= panDelta\.x; panY \+= panDelta\.y; \}/);
  assert.ok(zoomAt.indexOf('if (zoom === 1)') < zoomAt.indexOf('if (panDelta)'),
    'equal-scale pinch keeps the legacy midpoint pan after resetting anchored zoom pan');

  const nativePinch = source.slice(source.indexOf('if (pinchStart && activePointers.size >= 2)'), source.indexOf('if (pendingTap && event.pointerId === pendingTapPointerId'));
  assert.match(nativePinch, /zoomAt\(target, pinchStart\.centerX, pinchStart\.centerY, pinchStart,\s*\{ x: centerX - pinchStart\.centerX, y: centerY - pinchStart\.centerY \}\); return;/);
  assert.doesNotMatch(nativePinch, /zoomAt\([^\n]+\);\s*pan[XY]\s*\+=/,
    'native pinch has no intermediate zoom render followed by a second pan render');

  const virtualGesture = source.slice(source.indexOf('onViewportGestureMove: gesture =>'), source.indexOf('onViewportGestureEnd:'));
  assert.match(virtualGesture, /zoomAt\([^\n]+\n\s*\{ x: gesture\.centerX - base\.centerX, y: gesture\.centerY - base\.centerY \}\);/);
  assert.doesNotMatch(virtualGesture, /pan[XY]\s*\+=|clampPan\(\)|updateCanvasView\(\)/,
    'virtual pinch also uses one combined view update');
});

test('viewport clamp uses the exact last rendered transform for fractional geometry', () => {
  assert.match(source, /let renderedZoom = 1, renderedPanX = 0, renderedPanY = 0;/);
  assert.match(functionSource('layoutCenter'), /r\.width \/ renderedZoom/);
  assert.match(functionSource('layoutCenter'), /r\.height \/ renderedZoom/);
  assert.match(functionSource('layoutCenter'), /r\.left \+ r\.width \/ 2 - renderedPanX/);
  assert.match(functionSource('layoutCenter'), /r\.top \+ r\.height \/ 2 - renderedPanY/);
  assert.match(functionSource('updateCanvasView'), /renderedZoom = zoom; renderedPanX = panX; renderedPanY = panY;/,
    'geometry state advances only after the final CSS transform is applied');
});

test('actual viewport functions preserve fractional anchors and clamp without stale geometry', () => {
  const fixture = viewportHarness(), view = fixture.state();
  const base = { zoom: view.zoom, panX: view.panX, panY: view.panY };
  const focus = { x: 252.3, y: 173.1 }, imagePoint = {
    x: (focus.x - 200 - base.panX) / base.zoom,
    y: (focus.y - 150 - base.panY) / base.zoom
  };
  fixture.zoomAt(2.5, focus.x, focus.y, base);
  let after = fixture.state();
  near(200 + after.panX + imagePoint.x * after.zoom, focus.x, 'fractional horizontal focus stays anchored');
  near(150 + after.panY + imagePoint.y * after.zoom, focus.y, 'fractional vertical focus stays anchored');
  assert.equal(fixture.updates, 1, 'one zoom input performs one final view update');
  near(after.renderedZoom, after.zoom, 'rendered scale is in sync after update');

  const pinchBase = { zoom: after.zoom, panX: after.panX, panY: after.panY };
  const start = { x: 238.25, y: 142.75 }, delta = { x: 21.5, y: -11.25 };
  const pinchPoint = {
    x: (start.x - 200 - pinchBase.panX) / pinchBase.zoom,
    y: (start.y - 150 - pinchBase.panY) / pinchBase.zoom
  };
  fixture.zoomAt(3.25, start.x, start.y, pinchBase, delta);
  after = fixture.state();
  near(200 + after.panX + pinchPoint.x * after.zoom, start.x + delta.x, 'pinch point follows fractional moving midpoint x');
  near(150 + after.panY + pinchPoint.y * after.zoom, start.y + delta.y, 'pinch point follows fractional moving midpoint y');
  assert.equal(fixture.updates, 2, 'combined zoom and pan still update only once');

  fixture.resetView();
  const resetUpdates = fixture.updates;
  fixture.zoomAt(1, 230, 130, { zoom: 1, panX: 0, panY: 0 }, { x: 30, y: 20 });
  after = fixture.state();
  assert.deepEqual({ zoom: after.zoom, panX: after.panX, panY: after.panY }, { zoom: 1, panX: 30, panY: 20 },
    'equal-scale two-finger movement retains midpoint panning');
  assert.equal(fixture.updates, resetUpdates + 1);
});

test('actual viewport functions preserve repeated zoom anchors and enforce minimum, maximum, and pan clamps', () => {
  const fixture = viewportHarness();
  for (let index = 0; index < 12; index++) {
    const before = fixture.state(), base = { zoom: before.zoom, panX: before.panX, panY: before.panY };
    const focus = { x: 212.5 + index % 3, y: 148.25 - index % 2 };
    const imagePoint = { x: (focus.x - 200 - base.panX) / base.zoom, y: (focus.y - 150 - base.panY) / base.zoom };
    fixture.zoomAt(base.zoom * 1.05, focus.x, focus.y, base);
    const after = fixture.state();
    near(200 + after.panX + imagePoint.x * after.zoom, focus.x, `repeated wheel anchor ${index} x`);
    near(150 + after.panY + imagePoint.y * after.zoom, focus.y, `repeated wheel anchor ${index} y`);
  }
  assert.equal(fixture.updates, 12, 'each repeated wheel input has one final update');

  let state = fixture.state();
  fixture.zoomAt(100, 200, 150, { zoom: state.zoom, panX: state.panX, panY: state.panY });
  assert.equal(fixture.state().zoom, 8, 'zoom remains capped at 8x');
  state = fixture.state();
  fixture.zoomAt(0.001, 200, 150, { zoom: state.zoom, panX: state.panX, panY: state.panY });
  assert.deepEqual({ zoom: fixture.state().zoom, panX: fixture.state().panX, panY: fixture.state().panY }, { zoom: 1, panX: 0, panY: 0 },
    'zoom floor resets pan');

  fixture.zoomAt(100, 1_000_000, -1_000_000, { zoom: 1, panX: 0, panY: 0 });
  state = fixture.state();
  const limitX = (319.5 * 8) / 2 + 300 / 2 - 48;
  const limitY = (279.25 * 8) / 2 + 260 / 2 - 48;
  near(state.panX, -limitX, 'horizontal clamp uses current target zoom and fractional layout width');
  near(state.panY, limitY, 'vertical clamp uses current target zoom and fractional layout height');
  near(state.renderedZoom, state.zoom, 'rendered transform remains current after boundary clamp');
});
