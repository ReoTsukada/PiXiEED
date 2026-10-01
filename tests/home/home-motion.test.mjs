import test from 'node:test';
import assert from 'node:assert/strict';
import { createHomeMotion, projectScreenGravity } from '../../js/home-motion.mjs';

class FakeTarget extends EventTarget {
  count(type) { return this.listeners?.[type] ?? 0; }
  addEventListener(type, listener, options) { super.addEventListener(type, listener, options); this.listeners ??= {}; this.listeners[type] = (this.listeners[type] ?? 0) + 1; }
  removeEventListener(type, listener, options) { super.removeEventListener(type, listener, options); this.listeners[type] = Math.max(0, (this.listeners[type] ?? 1) - 1); }
  emit(type, values = {}) { const event = new Event(type); Object.assign(event, values); this.dispatchEvent(event); }
}
class FakeButton extends FakeTarget {
  attrs = new Map([['aria-pressed', 'false'], ['aria-busy', 'false']]);
  setAttribute(key, value) { this.attrs.set(key, value); }
  getAttribute(key) { return this.attrs.get(key); }
  click() { this.emit('click'); }
}
const waitTurn = async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); };
function harness({ angle = 0, orientationPermission, motionPermission, visible = true, alwaysOn = false, activationTarget } = {}) {
  const target = new FakeTarget(); const doc = new FakeTarget(); const orientation = {}; const motion = {};
  if (orientationPermission) orientation.requestPermission = orientationPermission;
  if (motionPermission) motion.requestPermission = motionPermission;
  const button = new FakeButton(); const status = { textContent: '' }; const calls = { o: 0, m: 0, tilt: [], gravity: [], shakes: 0, timers: [], visible, setVisible(value) { this.visible = value; } };
  const screenOrientation = new FakeTarget(); screenOrientation.angle = angle;
  const controller = createHomeMotion({ orientation, motion, target, document: doc, screen: { orientation: screenOrientation }, button, status, alwaysOn, activationTarget,
    now: () => 2000, onTilt: (v) => calls.tilt.push(v), onGravity: (v) => calls.gravity.push(v), onShake: () => calls.shakes++, isVisible: () => calls.visible,
    setTimer: (fn, delay) => { const timer = { fn, delay, cleared: false }; calls.timers.push(timer); return timer; }, clearTimer: (timer) => { if (timer) timer.cleared = true; } });
  return { target, doc, orientation, motion, button, status, calls, screenOrientation, controller };
}

test('always-on mode starts automatically when the browser requires no permission gesture', async () => {
  const h = harness({ alwaysOn: true }); await waitTurn();
  assert.equal(h.controller.state.enabled, true);
  assert.equal(h.controller.state.running, true);
  assert.equal(h.button.hidden, true);
  assert.equal(h.button.getAttribute('aria-label'), '端末の動きを許可済み');
  h.controller.destroy();
});

test('always-on mode waits for one gesture when permissions require activation, with explicit button retry after denial', async () => {
  let orientationCalls = 0; let motionCalls = 0;
  const stage = new FakeTarget();
  const h = harness({ alwaysOn: true, activationTarget: stage,
    orientationPermission: () => { orientationCalls++; return Promise.resolve(orientationCalls === 1 ? 'denied' : 'granted'); },
    motionPermission: () => { motionCalls++; return Promise.resolve(motionCalls === 1 ? 'denied' : 'granted'); } });
  await waitTurn();
  assert.equal(orientationCalls, 0); assert.equal(motionCalls, 0);
  assert.equal(h.controller.state.enabled, false);
  assert.equal(h.button.getAttribute('aria-label'), '端末の動きを許可');
  stage.emit('pointerup'); await waitTurn();
  assert.equal(orientationCalls, 1); assert.equal(motionCalls, 1, 'both permission requests start in the same gesture');
  assert.equal(h.controller.state.enabled, false);
  stage.emit('click'); await waitTurn();
  assert.equal(orientationCalls, 1, 'pointerup/click for one page activation does not retry denied permission');
  assert.equal(motionCalls, 1);
  h.button.click(); await waitTurn();
  assert.equal(orientationCalls, 2, 'button offers an explicit retry after denial');
  assert.equal(motionCalls, 2);
  assert.equal(h.controller.state.running, true);
  h.controller.destroy();
  assert.equal(stage.count('pointerup'), 0); assert.equal(stage.count('click'), 0);
});

test('always-on mode auto-starts orientation and waits for a gesture before motion permission', async () => {
  let motionCalls = 0; const stage = new FakeTarget();
  const h = harness({ alwaysOn: true, activationTarget: stage,
    motionPermission: () => { motionCalls++; return Promise.resolve('granted'); } });
  await waitTurn();
  assert.equal(h.controller.state.enabled, true); assert.equal(h.controller.state.running, true);
  assert.equal(h.controller.state.permission.orientation, true);
  assert.equal(h.controller.state.permission.motion, false);
  assert.equal(motionCalls, 0);
  h.controller.activate({ target: h.button });
  assert.equal(motionCalls, 0, 'a button-originated activation is reserved for its own handler');
  stage.emit('pointerup'); await waitTurn();
  assert.equal(motionCalls, 1);
  assert.equal(h.controller.state.permission.motion, true);
  assert.equal(h.target.count('devicemotion'), 1, 'motion permission added while running attaches its listener once');
  h.button.click(); await waitTurn();
  stage.emit('click'); await waitTurn();
  assert.equal(motionCalls, 1, 'the gesture and button do not repeat a granted permission request');
  h.target.emit('devicemotion', { accelerationIncludingGravity: { x: 0, y: 0, z: 0 } });
  h.target.emit('devicemotion', { accelerationIncludingGravity: { x: 20, y: 20, z: 20 } });
  assert.equal(h.calls.shakes, 1, 'the newly attached listener still detects shake');
  h.controller.destroy();
});

test('permission requests begin together from the button click and denial can be retried', async () => {
  let resolveOrientation; let resolveMotion; let attempts = 0; let motionAttempts = 0;
  const h = harness({ orientationPermission: () => { attempts++; return attempts === 1 ? Promise.resolve('denied') : new Promise((r) => { resolveOrientation = r; }); }, motionPermission: () => { motionAttempts++; return attempts === 1 ? Promise.resolve('denied') : new Promise((r) => { resolveMotion = r; }); } });
  h.button.click(); await waitTurn();
  assert.equal(attempts, 1); assert.equal(motionAttempts, 1, 'motion permission is initiated before waiting for orientation');
  assert.equal(h.button.getAttribute('aria-busy'), 'false');
  assert.match(h.status.textContent, /許可が必要です/);
  h.button.click();
  assert.equal(attempts, 2); assert.equal(motionAttempts, 2); assert.equal(h.button.getAttribute('aria-busy'), 'true');
  resolveOrientation('granted'); resolveMotion('denied'); await waitTurn();
  assert.equal(h.controller.state.enabled, true); assert.equal(h.controller.state.permission.motion, false);
  assert.equal(h.button.getAttribute('aria-label'), 'ジャイロをオフ');
  assert.equal(h.target.count('devicemotion'), 0);
  h.controller.destroy();
});

test('gravity projects physical orientation, smooths vectors, applies screen angle, and ignores invalid values', async () => {
  const h = harness({ angle: 90 }); h.button.click(); await waitTurn();
  h.target.emit('deviceorientation', { beta: null, gamma: 0 });
  assert.equal(h.calls.tilt.at(-1), 0, 'null cannot become a false gravity sample');
  h.target.emit('deviceorientation', { beta: 0, gamma: 0 });
  h.target.emit('deviceorientation', { alpha: 0, beta: 20, gamma: 0 });
  assert.ok(h.controller.state.tilt > 0, 'screen 90 degrees projects beta onto the horizontal axis');
  const previous = { ...h.controller.state.gravity };
  const pure = projectScreenGravity(20, 0, 90);
  h.target.emit('deviceorientation', { alpha: 240, beta: 20, gamma: 0 });
  assert.ok(Math.abs(h.controller.state.gravity.x - (previous.x + (pure.x - previous.x) * 0.22)) < 1e-9, 'yaw does not create fake gravity x');
  assert.ok(Math.abs(h.controller.state.gravity.y - (previous.y + (pure.y - previous.y) * 0.22)) < 1e-9, 'yaw does not create fake gravity y');
  assert.equal(h.status.textContent, '傾けて遊ぶ');
  h.screenOrientation.angle = 270; h.screenOrientation.emit('change');
  assert.ok(h.controller.state.tilt < 0, 'rotation immediately reprojects the latest Euler angles');
  h.controller.destroy();
});

test('pure screen gravity covers cardinals, full roll, Euler folds, and screen rotations', () => {
  const close = (actual, expected, message) => { assert.ok(Math.abs(actual - expected) < 1e-9, `${message}: ${actual}`); };
  const cases = [
    [0, 0, 0, 0, 0, 'flat'], [90, 0, 0, 0, 1, 'upright'], [-90, 0, 0, 0, -1, 'upside down'],
    [0, 90, 0, 1, 0, 'right'], [0, -90, 0, -1, 0, 'left'], [0, 90, 90, 0, -1, 'screen 90'],
    [0, 90, 180, -1, 0, 'screen 180'], [0, 90, 270, 0, 1, 'screen 270'],
  ];
  for (const [beta, gamma, angle, x, y, label] of cases) {
    const result = projectScreenGravity(beta, gamma, angle);
    close(result.x, x, `${label} x`); close(result.y, y, `${label} y`);
    assert.ok(Math.hypot(result.x, result.y) <= 1 + 1e-12);
  }
  const circle = [];
  for (let degrees = 0; degrees <= 360; degrees += 5) {
    const radians = degrees * Math.PI / 180;
    const beta = Math.asin(Math.cos(radians)) * 180 / Math.PI;
    const sine = Math.sin(radians);
    const gamma = Math.abs(sine) < 1e-12 ? 0 : Math.sign(sine) * 90;
    const result = projectScreenGravity(beta, gamma);
    circle.push(result);
    close(result.x, sine, `360-degree circle x at ${degrees}`);
    close(result.y, Math.cos(radians), `360-degree circle y at ${degrees}`);
    assert.ok(Math.hypot(result.x, result.y) <= 1 + 1e-12);
    if (circle.length > 1) assert.ok(Math.hypot(result.x - circle.at(-2).x, result.y - circle.at(-2).y) <= 0.09, `continuous circle at ${degrees}`);
  }
  close(circle[0].x, circle.at(-1).x, '360-degree circle closes x');
  close(circle[0].y, circle.at(-1).y, '360-degree circle closes y');
  assert.deepEqual(projectScreenGravity(0, 0), { x: 0, y: 0 }, 'flat orientation has no screen-plane gravity');
  close(projectScreenGravity(0, 90, 90).x, 0, 'screen 90 exact zero');
  close(projectScreenGravity(0, 90, 90).y, -1, 'screen 90 down');
  close(projectScreenGravity(0, 90, 270).x, 0, 'screen 270 exact zero');
  close(projectScreenGravity(0, 90, 270).y, 1, 'screen 270 down');
  const foldA = projectScreenGravity(89, 35); const foldB = projectScreenGravity(91, -35);
  close(foldA.x, foldB.x, 'beta fold x continuity'); close(foldA.y, foldB.y, 'beta fold y continuity');
  const nearZeroA = projectScreenGravity(179.99, 35); const nearZeroB = projectScreenGravity(-179.99, 35);
  assert.ok(Math.hypot(nearZeroA.x - nearZeroB.x, nearZeroA.y - nearZeroB.y) < 0.001, 'beta ±180 wrap stays continuous near zero');
  assert.equal(projectScreenGravity(null, 0), null);
  assert.equal(projectScreenGravity(0, Infinity), null);
});

test('visibility and page lifecycle stop sensors, neutralize tilt, and resume without permission prompts', async () => {
  const h = harness(); h.button.click(); await waitTurn();
  h.target.emit('deviceorientation', { beta: 0, gamma: 0 }); h.target.emit('deviceorientation', { beta: 0, gamma: 22 });
  assert.ok(h.controller.state.tilt > 0);
  h.target.emit('pagehide');
  assert.equal(h.target.count('deviceorientation'), 0); assert.equal(h.controller.state.tilt, 0);
  assert.deepEqual(h.controller.state.gravity, { x: 0, y: 1 });
  h.target.emit('pageshow'); assert.equal(h.target.count('deviceorientation'), 1);
  h.target.emit('deviceorientation', { beta: -90, gamma: 0 });
  assert.deepEqual(h.controller.state.gravity, { x: 0, y: -1 }, 'first post-restart sample directly sets physical up');
  h.calls.setVisible(false); h.doc.emit('visibilitychange'); assert.equal(h.target.count('deviceorientation'), 0);
  h.calls.setVisible(true); h.doc.emit('visibilitychange'); assert.equal(h.target.count('deviceorientation'), 1);
  h.controller.destroy(); assert.equal(h.target.count('deviceorientation'), 0);
});

test('motion shakes only after permission and valid samples; a delayed tilt can still start after the sample timeout', async () => {
  const h = harness(); h.button.click(); await waitTurn();
  h.target.emit('devicemotion', { accelerationIncludingGravity: { x: null, y: 0, z: 0 } });
  h.target.emit('devicemotion', { accelerationIncludingGravity: { x: Number.NaN, y: 0, z: 0 } });
  assert.equal(h.calls.shakes, 0, 'null and non-finite samples are ignored');
  h.target.emit('devicemotion', { accelerationIncludingGravity: { x: 0, y: 0, z: 0 } });
  h.target.emit('devicemotion', { accelerationIncludingGravity: { x: 20, y: 20, z: 20 } });
  assert.equal(h.calls.shakes, 1);
  const noData = harness(); noData.button.click(); await waitTurn();
  noData.calls.timers.at(-1).fn();
  assert.equal(noData.controller.state.enabled, true);
  assert.equal(noData.controller.state.running, true);
  assert.match(noData.status.textContent, /端末を傾けてください/);
  assert.equal(noData.button.getAttribute('aria-label'), 'ジャイロをオフ');
  noData.target.emit('deviceorientation', { beta: 0, gamma: 0 });
  noData.target.emit('deviceorientation', { beta: 0, gamma: 20 });
  assert.match(noData.status.textContent, /傾けて遊ぶ/);
  noData.button.click();
  assert.equal(noData.controller.state.enabled, false, 'the user can turn off after waiting');
  assert.equal(noData.target.count('deviceorientation'), 0);
  noData.controller.destroy(); h.controller.destroy();
});

test('destroy during unresolved permission cannot attach sensors when it resolves', async () => {
  let resolveOrientation;
  const h = harness({ orientationPermission: () => new Promise((resolve) => { resolveOrientation = resolve; }) });
  h.button.click(); h.controller.destroy(); resolveOrientation('granted'); await waitTurn();
  assert.equal(h.target.count('deviceorientation'), 0);
  assert.equal(h.controller.state.enabled, false);
});

test('unsupported devices hide the gyro control', () => {
  const button = new FakeButton(); const controller = createHomeMotion({ orientation: null, button });
  assert.equal(controller.supported, false); assert.equal(button.hidden, true);
});
