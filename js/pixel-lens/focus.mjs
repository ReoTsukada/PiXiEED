/** Map a point in the displayed, digitally zoomed preview to normalized camera-frame coordinates. */
export function mapPreviewPointToCameraFocus({ clientX, clientY, rect, videoWidth, videoHeight, frameWidth, frameHeight, digitalZoom = 1, facing = 'environment' }) {
  const values = [clientX, clientY, rect?.left, rect?.top, rect?.width, rect?.height, videoWidth, videoHeight, frameWidth, frameHeight, digitalZoom];
  if (values.some((value) => !Number.isFinite(value)) || rect.width <= 0 || rect.height <= 0 || videoWidth <= 0 || videoHeight <= 0 || frameWidth <= 0 || frameHeight <= 0 || digitalZoom <= 0) return null;
  const previewX = (clientX - rect.left) / rect.width;
  const previewY = (clientY - rect.top) / rect.height;
  if (previewX < 0 || previewY < 0 || previewX >= 1 || previewY >= 1) return null;

  const frameAspect = frameWidth / frameHeight;
  const videoAspect = videoWidth / videoHeight;
  let full;
  if (videoAspect > frameAspect) {
    const width = videoHeight * frameAspect;
    full = { sx: (videoWidth - width) / 2, sy: 0, sw: width, sh: videoHeight };
  } else {
    const height = videoWidth / frameAspect;
    full = { sx: 0, sy: (videoHeight - height) / 2, sw: videoWidth, sh: height };
  }
  const zoom = Math.max(1, digitalZoom);
  const sw = full.sw / zoom;
  const sh = full.sh / zoom;
  const crop = { sx: full.sx + (full.sw - sw) / 2, sy: full.sy + (full.sh - sh) / 2, sw, sh };
  const u = facing === 'user' ? 1 - previewX : previewX;
  return { x: Math.min(1, Math.max(0, (crop.sx + u * crop.sw) / videoWidth)), y: Math.min(1, Math.max(0, (crop.sy + previewY * crop.sh) / videoHeight)) };
}

/** Select point autofocus conservatively from the active track's reported capabilities. */
export function pointFocusPlan(track, supported = {}) {
  if (!track || track.readyState === 'ended' || typeof track.applyConstraints !== 'function') return { supported: false, reason: 'unavailable' };
  let capabilities = null;
  let settings = null;
  try { capabilities = track.getCapabilities?.() ?? null; } catch {}
  try { settings = track.getSettings?.() ?? null; } catch {}
  const modes = Array.isArray(capabilities?.focusMode) ? capabilities.focusMode : [];
  const pointSupported = supported.pointsOfInterest === true || Boolean(settings && Object.hasOwn(settings, 'pointsOfInterest'));
  if (!pointSupported || !modes.length) return { supported: false, reason: 'unsupported' };
  const mode = modes.includes('single-shot') ? 'single-shot' : modes.includes('continuous') ? 'continuous' : '';
  return mode ? { supported: true, mode } : { supported: false, reason: 'unsupported' };
}

/** A serialized-by-caller, generation-aware single-shot focus request. */
export function createCameraFocusController() {
  let requestGeneration = 0;
  async function request(track, point, { supportedConstraints = {}, isCurrent = () => true } = {}) {
    const requestId = ++requestGeneration;
    const current = () => requestId === requestGeneration && isCurrent(track);
    if (!current() || track?.readyState === 'ended') return { status: 'stale' };
    if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y) || point.x < 0 || point.x > 1 || point.y < 0 || point.y > 1) return { status: 'failed', reason: 'invalid-point' };
    const plan = pointFocusPlan(track, supportedConstraints);
    if (!plan.supported) return { status: 'unsupported', reason: plan.reason };
    let constraints = {};
    try { constraints = track.getConstraints?.() ?? {}; } catch {}
    const requestConstraints = {
      ...constraints,
      focusMode: plan.mode,
      pointsOfInterest: [{ x: point.x, y: point.y }]
    };
    try {
      await track.applyConstraints(requestConstraints);
    } catch {
      return current() ? { status: 'failed', reason: 'apply-rejected' } : { status: 'stale' };
    }
    return current() ? { status: 'requested', mode: plan.mode, point: { ...point } } : { status: 'stale' };
  }
  function cancel() { requestGeneration++; }
  return { request, cancel };
}
