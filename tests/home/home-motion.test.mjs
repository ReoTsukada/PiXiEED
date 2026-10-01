import test from 'node:test';
import assert from 'node:assert/strict';
import { createHomeMotion } from '../../js/home-motion.mjs';

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
function harness({ angle = 0, orientationPermission, motionPermission, visible = true } = {}) {
  const target = new FakeTarget(); const doc = new FakeTarget(); const orientation = {}; const motion = {};
  if (orientationPermission) orientation.requestPermission = orientationPermission;
  if (motionPermission) motion.requestPermission = motionPermission;
  const button = new FakeButton(); const status = { textContent: '' }; const calls = { o: 0, m: 0, tilt: [], shakes: 0, timers: [], visible, setVisible(value) { this.visible = value; } };
  const screenOrientation = new FakeTarget(); screenOrientation.angle = angle;
  const controller = createHomeMotion({ orientation, motion, target, document: doc, screen: { orientation: screenOrientation }, button, status,
    now: () => 2000, onTilt: (v) => calls.tilt.push(v), onShake: () => calls.shakes++, isVisible: () => calls.visible,
    setTimer: (fn, delay) => { const timer = { fn, delay, cleared: false }; calls.timers.push(timer); return timer; }, clearTimer: (timer) => { if (timer) timer.cleared = true; } });
  return { target, doc, orientation, motion, button, status, calls, screenOrientation, controller };
}

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

test('tilt calibrates the first valid sample, smooths, applies screen angle, and ignores invalid values', async () => {
  const h = harness({ angle: 90 }); h.button.click(); await waitTurn();
  h.target.emit('deviceorientation', { beta: null, gamma: 0 });
  assert.equal(h.calls.tilt.at(-1), 0, 'null cannot become a false zero baseline');
  h.target.emit('deviceorientation', { beta: 0, gamma: 0 });
  h.target.emit('deviceorientation', { beta: 20, gamma: 0 });
  assert.ok(h.controller.state.tilt > 0, 'screen 90 degrees projects beta onto the horizontal axis');
  assert.equal(h.status.textContent, '傾けて遊ぶ');
  h.screenOrientation.angle = 270; h.screenOrientation.emit('change');
  assert.equal(h.controller.state.tilt, 0, 'rotation clears tilt baseline');
  h.target.emit('deviceorientation', { beta: 0, gamma: 0 });
  h.target.emit('deviceorientation', { beta: 20, gamma: 0 });
  assert.ok(h.controller.state.tilt < 0, 'screen 270 degrees reverses the projected beta axis');
  h.controller.destroy();
});

test('visibility and page lifecycle stop sensors, neutralize tilt, and resume without permission prompts', async () => {
  const h = harness(); h.button.click(); await waitTurn();
  h.target.emit('deviceorientation', { beta: 0, gamma: 0 }); h.target.emit('deviceorientation', { beta: 0, gamma: 22 });
  assert.ok(h.controller.state.tilt > 0);
  h.target.emit('pagehide');
  assert.equal(h.target.count('deviceorientation'), 0); assert.equal(h.controller.state.tilt, 0);
  h.target.emit('pageshow'); assert.equal(h.target.count('deviceorientation'), 1);
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
