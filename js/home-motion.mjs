const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export function createHomeMotion({
  orientation = globalThis.DeviceOrientationEvent,
  motion = globalThis.DeviceMotionEvent,
  target = globalThis,
  screen = globalThis.screen,
  document = globalThis.document,
  now = () => Date.now(),
  setTimer = globalThis.setTimeout.bind(globalThis),
  clearTimer = globalThis.clearTimeout.bind(globalThis),
  button,
  status,
  onTilt = () => {},
  onShake = () => {},
  isVisible = () => true,
} = {}) {
  const supported = Boolean(orientation && target?.addEventListener && target?.removeEventListener);
  let enabled = false; let running = false; let permission = { orientation: false, motion: false };
  let baseline = null; let smoothed = 0; let sampleTimer = 0; let sawSample = false; let lastStatus = ''; let pending = false; let disposed = false;
  let previousAcceleration = null; let lastShake = 0;

  const setTilt = (value) => { smoothed = value; onTilt(value); };
  const setStatus = (message) => { if (status && lastStatus !== message) { status.textContent = message; lastStatus = message; } };
  const setBusy = (busy) => button?.setAttribute('aria-busy', String(busy));
  const setPressed = (pressed) => { button?.setAttribute('aria-pressed', String(pressed)); button?.setAttribute('aria-label', pressed ? 'ジャイロをオフ' : 'ジャイロをオン'); };
  const screenAngle = () => {
    const angle = Number(screen?.orientation?.angle ?? screen?.mozOrientationAngle ?? target?.orientation ?? 0);
    return Number.isFinite(angle) ? ((angle % 360) + 360) % 360 : 0;
  };
  function resetBaseline() { baseline = null; smoothed = 0; onTilt(0); }
  function handleOrientation(event) {
    if (typeof event?.beta !== 'number' || typeof event?.gamma !== 'number') return;
    const beta = event.beta; const gamma = event.gamma;
    if (!Number.isFinite(beta) || !Number.isFinite(gamma)) return;
    const angle = screenAngle();
    const radians = angle * Math.PI / 180;
    const axis = gamma * Math.cos(radians) + beta * Math.sin(radians);
    if (!Number.isFinite(axis)) return;
    if (baseline === null) baseline = axis;
    const delta = axis - baseline;
    const dead = Math.abs(delta) < 3 ? 0 : Math.sign(delta) * (Math.abs(delta) - 3);
    const normalized = clamp(dead / 32, -1, 1);
    smoothed += (normalized - smoothed) * 0.22;
    sawSample = true;
    setTilt(smoothed);
    setStatus('傾けて遊ぶ');
    clearTimer(sampleTimer); sampleTimer = 0;
  }
  function handleMotion(event) {
    const a = event?.accelerationIncludingGravity;
    if (!a || typeof a.x !== 'number' || typeof a.y !== 'number' || typeof a.z !== 'number') return;
    const values = [a.x, a.y, a.z];
    if (!values.every(Number.isFinite)) return;
    if (previousAcceleration) {
      const jolt = values.reduce((sum, value, i) => sum + Math.abs(value - previousAcceleration[i]), 0);
      const timestamp = now();
      if (jolt > 28 && timestamp - lastShake > 650) { lastShake = timestamp; onShake(); }
    }
    previousAcceleration = values;
  }
  function stop() {
    if (!running) return;
    target.removeEventListener('deviceorientation', handleOrientation);
    if (permission.motion) target.removeEventListener('devicemotion', handleMotion);
    running = false; previousAcceleration = null; clearTimer(sampleTimer); sampleTimer = 0; resetBaseline();
  }
  function start() {
    if (!enabled || running || !isVisible()) return;
    running = true; sawSample = false; resetBaseline();
    target.addEventListener('deviceorientation', handleOrientation, { passive: true });
    if (permission.motion) target.addEventListener('devicemotion', handleMotion, { passive: true });
    setStatus('傾きを確認中…');
    sampleTimer = setTimer(() => {
      if (!running || sawSample) return;
      sampleTimer = 0;
      setStatus('端末を傾けてください');
    }, 3000);
  }
  function syncVisibility() {
    if (enabled && isVisible()) start();
    else { stop(); if (enabled) setStatus('画面外では一時停止中'); }
  }
  function handleScreenChange() { previousAcceleration = null; resetBaseline(); }

  async function toggle() {
    if (!supported || pending || disposed) return;
    if (enabled) {
      enabled = false; stop();
      setPressed(false); setStatus('');
      return;
    }
    pending = true; setBusy(true); setStatus('傾きを確認中');
    // Both permission requests must be initiated in the same click activation, before awaiting either.
    let orientationResult; let motionResult;
    try { orientationResult = typeof orientation.requestPermission === 'function' ? orientation.requestPermission() : Promise.resolve('granted'); }
    catch (error) { orientationResult = Promise.reject(error); }
    try { motionResult = motion ? (typeof motion.requestPermission === 'function' ? motion.requestPermission() : Promise.resolve('granted')) : Promise.resolve('unavailable'); }
    catch (error) { motionResult = Promise.reject(error); }
    const [o, m] = await Promise.allSettled([orientationResult, motionResult]);
    pending = false;
    permission = { orientation: o.status === 'fulfilled' && o.value === 'granted', motion: m.status === 'fulfilled' && m.value === 'granted' };
    setBusy(false);
    if (disposed) return;
    if (!permission.orientation) { enabled = false; setPressed(false); setStatus('許可が必要です'); return; }
    enabled = true; setPressed(true);
    setStatus(permission.motion ? '傾きを確認中' : '傾けて遊ぶ');
    syncVisibility();
  }

  if (!supported) { if (button) button.hidden = true; }
  else {
    button?.addEventListener('click', toggle);
    document?.addEventListener?.('visibilitychange', syncVisibility);
    screen?.orientation?.addEventListener?.('change', handleScreenChange);
    target.addEventListener('orientationchange', handleScreenChange, { passive: true });
    target.addEventListener('pagehide', stop);
    target.addEventListener('pageshow', syncVisibility);
  }
  return {
    supported,
    setVisible: syncVisibility,
    destroy() { disposed = true; enabled = false; stop(); button?.removeEventListener('click', toggle); document?.removeEventListener?.('visibilitychange', syncVisibility); screen?.orientation?.removeEventListener?.('change', handleScreenChange); target.removeEventListener('orientationchange', handleScreenChange); target.removeEventListener('pagehide', stop); target.removeEventListener('pageshow', syncVisibility); },
    get state() { return { enabled, running, permission: { ...permission }, tilt: smoothed }; },
  };
}
