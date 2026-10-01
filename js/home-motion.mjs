// DeviceOrientation Euler angles use intrinsic Z-X'-Y'' order. Only the
// gravity projection onto the screen plane is useful to the home hero.
export function projectScreenGravity(beta, gamma, angle = 0) {
  if (![beta, gamma, angle].every((value) => typeof value === 'number' && Number.isFinite(value))) return null;
  const toRad = Math.PI / 180;
  const b = beta * toRad; const g = gamma * toRad; const a = angle * toRad;
  const x = Math.cos(b) * Math.sin(g);
  const y = Math.sin(b);
  const projected = { x: x * Math.cos(a) + y * Math.sin(a), y: y * Math.cos(a) - x * Math.sin(a) };
  if (![projected.x, projected.y].every(Number.isFinite)) return null;
  const magnitude = Math.hypot(projected.x, projected.y);
  if (magnitude > 1) { projected.x /= magnitude; projected.y /= magnitude; }
  return projected;
}

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
  alwaysOn = false,
  activationTarget = button,
  onTilt = () => {},
  onGravity = () => {},
  onShake = () => {},
  isVisible = () => true,
} = {}) {
  const supported = Boolean(orientation && target?.addEventListener && target?.removeEventListener);
  let enabled = false; let running = false; let permission = { orientation: false, motion: false };
  let smoothed = 0; let gravity = { x: 0, y: 1 }; let smoothedGravity = null; let lastEuler = null; let sampleTimer = 0; let sawSample = false; let lastStatus = ''; let pending = false; let disposed = false;
  let previousAcceleration = null; let lastShake = 0; let motionListening = false;
  let activationConsumed = false;

  const setStatus = (message) => { if (status && lastStatus !== message) { status.textContent = message; lastStatus = message; } };
  const setBusy = (busy) => button?.setAttribute('aria-busy', String(busy));
  const setPressed = (pressed) => {
    button?.setAttribute('aria-pressed', String(pressed));
    button?.setAttribute('aria-label', alwaysOn ? (pressed ? '端末の動きを許可済み' : '端末の動きを許可') : (pressed ? 'ジャイロをオフ' : 'ジャイロをオン'));
    if (alwaysOn && button) button.hidden = Boolean(pressed);
  };
  const screenAngle = () => {
    const angle = Number(screen?.orientation?.angle ?? screen?.mozOrientationAngle ?? target?.orientation ?? 0);
    return Number.isFinite(angle) ? ((angle % 360) + 360) % 360 : 0;
  };
  function resetBaseline() { smoothed = 0; gravity = { x: 0, y: 1 }; smoothedGravity = null; onTilt(0); onGravity({ ...gravity }); }
  function setGravity(value, immediate = false) {
    smoothedGravity = !smoothedGravity || immediate ? { ...value } : {
      x: smoothedGravity.x + (value.x - smoothedGravity.x) * 0.22,
      y: smoothedGravity.y + (value.y - smoothedGravity.y) * 0.22,
    };
    gravity = { ...smoothedGravity };
    smoothed = gravity.x;
    onGravity({ ...gravity });
    onTilt(smoothed);
  }
  function handleOrientation(event) {
    if (typeof event?.beta !== 'number' || typeof event?.gamma !== 'number') return;
    const beta = event.beta; const gamma = event.gamma;
    if (!Number.isFinite(beta) || !Number.isFinite(gamma)) return;
    lastEuler = { beta, gamma };
    const projected = projectScreenGravity(beta, gamma, screenAngle());
    if (!projected) return;
    setGravity(projected, !sawSample);
    sawSample = true;
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
    if (motionListening) target.removeEventListener('devicemotion', handleMotion);
    motionListening = false;
    running = false; previousAcceleration = null; lastEuler = null; clearTimer(sampleTimer); sampleTimer = 0; resetBaseline();
  }
  function start() {
    if (!enabled || running || !isVisible()) return;
    running = true; sawSample = false; resetBaseline();
    target.addEventListener('deviceorientation', handleOrientation, { passive: true });
    if (permission.motion && !motionListening) {
      target.addEventListener('devicemotion', handleMotion, { passive: true });
      motionListening = true;
    }
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
  function handleScreenChange() {
    previousAcceleration = null;
    if (running && lastEuler) {
      const projected = projectScreenGravity(lastEuler.beta, lastEuler.gamma, screenAngle());
      if (projected) setGravity(projected, true);
    }
  }

  async function requestPermissions({ skipMotion = false, isAutomatic = false } = {}) {
    if (!supported || pending || disposed) return;
    pending = true; setBusy(true);
    setStatus(alwaysOn ? '端末の動きを許可してください' : '傾きを確認中');
    // Both permission requests must be initiated in the same click activation, before awaiting either.
    let orientationResult; let motionResult;
    try { orientationResult = permission.orientation ? Promise.resolve('granted') : (typeof orientation.requestPermission === 'function' ? orientation.requestPermission() : Promise.resolve('granted')); }
    catch (error) { orientationResult = Promise.reject(error); }
    if (skipMotion && typeof motion?.requestPermission === 'function') motionResult = Promise.resolve('unavailable');
    else {
      try { motionResult = permission.motion ? Promise.resolve('granted') : (motion ? (typeof motion.requestPermission === 'function' ? motion.requestPermission() : Promise.resolve('granted')) : Promise.resolve('unavailable')); }
      catch (error) { motionResult = Promise.reject(error); }
    }
    const [o, m] = await Promise.allSettled([orientationResult, motionResult]);
    pending = false;
    const hadMotionPermission = permission.motion;
    permission = {
      orientation: permission.orientation || (o.status === 'fulfilled' && o.value === 'granted'),
      motion: permission.motion || (m.status === 'fulfilled' && m.value === 'granted'),
    };
    setBusy(false);
    if (disposed) return;
    if (!hadMotionPermission && permission.motion && running && !motionListening) {
      target.addEventListener('devicemotion', handleMotion, { passive: true });
      motionListening = true;
    }
    if (!permission.orientation) {
      enabled = false; setPressed(false);
      setStatus(alwaysOn ? '端末の動きを許可してください' : '許可が必要です');
      return;
    }
    enabled = true; setPressed(true);
    setStatus(permission.motion ? '傾きを確認中' : (isAutomatic && typeof motion?.requestPermission === 'function' ? '端末の動きを許可してください' : '傾けて遊ぶ'));
    syncVisibility();
  }
  function handleActivation(event) {
    if (activationConsumed || pending || disposed || !supported) return;
    if (event?.target && (event.target === button || button?.contains?.(event.target))) return;
    activationConsumed = true;
    void requestPermissions();
  }
  function handleButton() {
    if (alwaysOn) {
      if (!pending && (!permission.orientation || (motion && typeof motion.requestPermission === 'function' && !permission.motion))) {
        activationConsumed = true;
        void requestPermissions();
      }
      return;
    }
    void toggle();
  }
  async function toggle() {
    if (!supported || pending || disposed) return;
    if (enabled) {
      enabled = false; stop();
      setPressed(false); setStatus('');
      return;
    }
    await requestPermissions();
  }

  if (!supported) { if (button) button.hidden = true; }
  else {
    button?.addEventListener('click', handleButton);
    if (alwaysOn) {
      if (typeof orientation.requestPermission !== 'function') {
        void requestPermissions({ skipMotion: true, isAutomatic: true });
      } else {
        setPressed(false); setStatus('端末の動きを許可してください');
        activationTarget?.addEventListener?.('pointerup', handleActivation, { capture: true, passive: true });
        activationTarget?.addEventListener?.('click', handleActivation, { capture: true });
      }
      // A gesture can grant motion permission even when orientation starts automatically.
      if (typeof orientation.requestPermission !== 'function' && typeof motion?.requestPermission === 'function') {
        activationTarget?.addEventListener?.('pointerup', handleActivation, { capture: true, passive: true });
        activationTarget?.addEventListener?.('click', handleActivation, { capture: true });
      }
    }
    document?.addEventListener?.('visibilitychange', syncVisibility);
    screen?.orientation?.addEventListener?.('change', handleScreenChange);
    target.addEventListener('orientationchange', handleScreenChange, { passive: true });
    target.addEventListener('pagehide', stop);
    target.addEventListener('pageshow', syncVisibility);
  }
  return {
    supported,
    activate: handleActivation,
    setVisible: syncVisibility,
    destroy() { disposed = true; enabled = false; stop(); button?.removeEventListener('click', handleButton); activationTarget?.removeEventListener?.('pointerup', handleActivation, true); activationTarget?.removeEventListener?.('click', handleActivation, true); document?.removeEventListener?.('visibilitychange', syncVisibility); screen?.orientation?.removeEventListener?.('change', handleScreenChange); target.removeEventListener('orientationchange', handleScreenChange); target.removeEventListener('pagehide', stop); target.removeEventListener('pageshow', syncVisibility); },
    get state() { return { enabled, running, permission: { ...permission }, tilt: smoothed, gravity: { ...gravity } }; },
  };
}
