import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const sandbox = { module: { exports: {} }, exports: {} };
vm.runInNewContext(
  fs.readFileSync('pixiedraw/assets/js/modules/viewport-gesture-arbiter-utils.js', 'utf8'),
  sandbox,
  { filename: 'viewport-gesture-arbiter-utils.js' }
);
const {
  GestureMode,
  VIEWPORT_GESTURE_CONFIG,
  getTwoPointMetrics,
  classifyTouchGesture,
  calculateTouchPan,
  calculateTouchZoomScale,
} = sandbox.module.exports;

const metrics = (a, b) => getTwoPointMetrics({ x: a[0], y: a[1] }, { x: b[0], y: b[1] });
const movement = (first, second) => {
  const firstDistance = Math.hypot(first[0], first[1]);
  const secondDistance = Math.hypot(second[0], second[1]);
  const dot = (first[0] * second[0]) + (first[1] * second[1]);
  return {
    firstDistance,
    secondDistance,
    normalizedDot: firstDistance && secondDistance ? dot / (firstDistance * secondDistance) : -1,
    balance: Math.min(firstDistance, secondDistance) / Math.max(firstDistance, secondDistance, 1),
  };
};
const start = metrics([100, 100], [200, 100]);

{
  const current = metrics([110, 108], [210, 108]);
  const decision = classifyTouchGesture({ startCentroid: start.centroid, startDistance: start.distance, currentCentroid: current.centroid, currentDistance: current.distance });
  assert.equal(decision.mode, GestureMode.TOUCH_PAN);
  assert.deepEqual({ ...calculateTouchPan({ x: 20, y: 30 }, start.centroid, current.centroid) }, { x: 30, y: 38 });
}

{
  // Same-direction travel is a pan even when uneven finger travel changes
  // their distance enough to otherwise resemble a pinch.
  const current = metrics([112, 108], [235, 110]);
  const decision = classifyTouchGesture({
    startCentroid: start.centroid,
    startDistance: start.distance,
    currentCentroid: current.centroid,
    currentDistance: current.distance,
    movementAnalysis: movement([12, 8], [35, 10]),
  });
  assert.equal(decision.mode, GestureMode.TOUCH_PAN);
  assert.equal(decision.sameDirectionPan, true);
}

{
  const current = metrics([85, 100], [225, 100]);
  const decision = classifyTouchGesture({
    startCentroid: start.centroid,
    startDistance: start.distance,
    currentCentroid: current.centroid,
    currentDistance: current.distance,
    movementAnalysis: movement([-15, 0], [25, 0]),
  });
  assert.equal(decision.mode, GestureMode.TOUCH_ZOOM);
  assert.equal(decision.opposingDirectionZoom, true);
}

{
  // Pinching around a stationary supporting finger must still zoom.
  const current = metrics([100, 100], [225, 100]);
  const decision = classifyTouchGesture({
    startCentroid: start.centroid,
    startDistance: start.distance,
    currentCentroid: current.centroid,
    currentDistance: current.distance,
    movementAnalysis: movement([0, 0], [25, 0]),
  });
  assert.equal(decision.mode, GestureMode.TOUCH_ZOOM);
  assert.equal(decision.singleFingerPinch, true);
}

{
  const current = metrics([75, 100], [225, 100]);
  const decision = classifyTouchGesture({ startCentroid: start.centroid, startDistance: start.distance, currentCentroid: current.centroid, currentDistance: current.distance });
  assert.equal(decision.mode, GestureMode.TOUCH_ZOOM);
  assert.equal(calculateTouchZoomScale(2, start.distance, current.distance), 3);
}

{
  const zoomLocked = GestureMode.TOUCH_ZOOM;
  const shifted = metrics([100, 120], [240, 120]);
  assert.equal(zoomLocked, GestureMode.TOUCH_ZOOM);
  assert.equal(calculateTouchZoomScale(1, start.distance, shifted.distance), 1.4);
}

{
  const panLocked = GestureMode.TOUCH_PAN;
  const changedDistance = metrics([100, 120], [230, 120]);
  assert.equal(panLocked, GestureMode.TOUCH_PAN);
  assert.deepEqual({ ...calculateTouchPan({ x: 0, y: 0 }, start.centroid, changedDistance.centroid) }, { x: 15, y: 20 });
}

{
  const ambiguous = metrics([109.22, 100], [210.78, 100]);
  const early = classifyTouchGesture({ startCentroid: start.centroid, startDistance: start.distance, currentCentroid: ambiguous.centroid, currentDistance: ambiguous.distance, elapsedMs: 50 });
  assert.equal(early.mode, GestureMode.TOUCH_UNDECIDED);
  const timed = classifyTouchGesture({ startCentroid: start.centroid, startDistance: start.distance, currentCentroid: ambiguous.centroid, currentDistance: ambiguous.distance, elapsedMs: VIEWPORT_GESTURE_CONFIG.GESTURE_DECISION_TIMEOUT_MS });
  assert.notEqual(timed.mode, GestureMode.TOUCH_UNDECIDED);
}

for (const count of [5, 20, 100]) {
  let final = null;
  for (let i = 1; i <= count; i += 1) {
    const t = i / count;
    const current = metrics([100 + (10 * t), 100 + (8 * t)], [200 + (10 * t), 100 + (8 * t)]);
    final = calculateTouchPan({ x: 0, y: 0 }, start.centroid, current.centroid);
  }
  assert.ok(Math.abs(final.x - 10) < 1e-9);
  assert.ok(Math.abs(final.y - 8) < 1e-9);
}

console.log('viewport gesture arbiter tests: ok');
