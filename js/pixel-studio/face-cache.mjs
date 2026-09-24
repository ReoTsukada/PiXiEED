const MAX_PIXELS = 4_000_000;
const MAX_FACES = 8;
const MAX_POINTS_PER_FACE = 1024;
const ROI_PADDING = 4;

function prepareFrame(frame) {
  if (!frame || !Number.isInteger(frame.width) || !Number.isInteger(frame.height) ||
      frame.width < 1 || frame.height < 1 || frame.width * frame.height > MAX_PIXELS) {
    throw new RangeError(`frame must contain at most ${MAX_PIXELS} pixels`);
  }
  const { width, height, data } = frame;
  if (!(data instanceof Uint8Array || data instanceof Uint8ClampedArray) || data.length !== width * height * 4) {
    throw new TypeError('frame.data must contain RGBA bytes matching its dimensions');
  }
  return { width, height, data };
}

function cloneLandmarks(landmarks) {
  if (!Array.isArray(landmarks) || landmarks.length > MAX_FACES) {
    throw new TypeError(`landmarks must be an array with at most ${MAX_FACES} faces`);
  }
  return landmarks.map((face, faceIndex) => {
    if (!Array.isArray(face) || face.length < 1 || face.length > MAX_POINTS_PER_FACE) {
      throw new TypeError(`face ${faceIndex} must contain between 1 and ${MAX_POINTS_PER_FACE} points`);
    }
    const clonedFace = face.map((point, pointIndex) => {
      if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y) ||
          point.x < -1 || point.x > 2 || point.y < -1 || point.y > 2 ||
          (point.z !== undefined && !Number.isFinite(point.z))) {
        throw new TypeError(`landmark ${faceIndex}:${pointIndex} must have finite coordinates within [-1, 2]`);
      }
      return point.z === undefined ? { x: point.x, y: point.y } : { x: point.x, y: point.y, z: point.z };
    });
    const minX = Math.min(...clonedFace.map((point) => point.x));
    const maxX = Math.max(...clonedFace.map((point) => point.x));
    const minY = Math.min(...clonedFace.map((point) => point.y));
    const maxY = Math.max(...clonedFace.map((point) => point.y));
    return maxX >= 0 && minX <= 1 && maxY >= 0 && minY <= 1 ? clonedFace : null;
  }).filter(Boolean);
}

function boxesFor(landmarks, width, height) {
  return landmarks.map((face) => {
    let minX = 1, minY = 1, maxX = 0, maxY = 0;
    for (const point of face) {
      minX = Math.min(minX, point.x); minY = Math.min(minY, point.y);
      maxX = Math.max(maxX, point.x); maxY = Math.max(maxY, point.y);
    }
    const padX = Math.max(ROI_PADDING, (maxX - minX) * width * 0.08);
    const padY = Math.max(ROI_PADDING, (maxY - minY) * height * 0.08);
    return {
      left: Math.max(0, Math.floor(minX * width - padX)),
      top: Math.max(0, Math.floor(minY * height - padY)),
      right: Math.min(width - 1, Math.ceil(maxX * width + padX)),
      bottom: Math.min(height - 1, Math.ceil(maxY * height + padY))
    };
  });
}

function changedInBoxes(previous, current, width, boxes) {
  let sampled = 0, moderate = 0, large = 0;
  const regions = boxes.length ? boxes : [{ left: 0, top: 0, right: width - 1, bottom: Math.floor(previous.length / 4 / width) - 1 }];
  for (const box of regions) {
    for (let y = box.top; y <= box.bottom; y++) for (let x = box.left; x <= box.right; x++) {
      const offset = (y * width + x) * 4;
      const delta = Math.max(Math.abs(previous[offset] - current[offset]),
        Math.abs(previous[offset + 1] - current[offset + 1]),
        Math.abs(previous[offset + 2] - current[offset + 2]));
      sampled++;
      if (delta > 12) moderate++;
      if (delta > 28) large++;
    }
  }
  return moderate >= Math.max(3, Math.ceil(sampled * 0.005)) ||
    large >= Math.max(2, Math.ceil(sampled * 0.001));
}

function sameFrameRgb(previous, current) {
  for (let p = 0; p < previous.length; p += 4) {
    if (previous[p] !== current[p] || previous[p + 1] !== current[p + 1] || previous[p + 2] !== current[p + 2]) return false;
  }
  return true;
}

function result(landmarks, status, ageMs) {
  return { landmarks, status, ageMs };
}

/**
 * A short-lived face-landmark cache. It only authorizes reuse while the frame
 * geometry/session match and pixels around detected faces remain similar.
 * This is an ROI validity check, not face tracking or identity recognition.
 */
export function createFaceCache({ maxAgeMs = 1200, reuseExactFrame = false } = {}) {
  if (typeof reuseExactFrame !== 'boolean') throw new TypeError('reuseExactFrame must be boolean');
  if (!Number.isFinite(maxAgeMs) || maxAgeMs < 0) throw new RangeError('maxAgeMs must be a non-negative finite number');
  let entry = null;

  return {
    store({ frame, landmarks, session, capturedAt = Date.now() } = {}) {
      const prepared = prepareFrame(frame);
      if (session === undefined || session === null) throw new TypeError('session is required');
      if (!Number.isFinite(capturedAt) || capturedAt < 0) throw new RangeError('capturedAt must be a non-negative timestamp');
      const copy = cloneLandmarks(landmarks);
      entry = {
        width: prepared.width,
        height: prepared.height,
        data: new Uint8Array(prepared.data),
        landmarks: copy,
        boxes: boxesFor(copy, prepared.width, prepared.height),
        session,
        capturedAt
      };
      return { stored: true, faceCount: copy.length };
    },

    get({ frame, session, now = Date.now() } = {}) {
      const prepared = prepareFrame(frame);
      if (!Number.isFinite(now) || now < 0) throw new RangeError('now must be a non-negative timestamp');
      if (!entry) return result([], 'changed', 0);
      const ageMs = Math.max(0, now - entry.capturedAt);
      if (session !== entry.session) {
        entry = null;
        return result([], 'session', ageMs);
      }
      if (prepared.width !== entry.width || prepared.height !== entry.height) {
        entry = null;
        return result([], 'geometry', ageMs);
      }
      // Check the entire image, including outside existing faces, so a new
      // face cannot be hidden by an unchanged old face ROI or a negative result.
      if (reuseExactFrame && sameFrameRgb(entry.data, prepared.data)) {
        return { ...result(entry.landmarks.map(face => face.map(point => ({ ...point }))),
          entry.landmarks.length ? 'ready' : 'empty', ageMs), exactFrame: true };
      }
      if (ageMs > maxAgeMs) {
        entry = null;
        return result([], 'expired', ageMs);
      }
      if (changedInBoxes(entry.data, prepared.data, entry.width, entry.boxes)) {
        entry = null;
        return result([], 'changed', ageMs);
      }
      return result(entry.landmarks.map((face) => face.map((point) => ({ ...point }))),
        entry.landmarks.length ? 'ready' : 'empty', ageMs);
    },

    reset() { entry = null; }
  };
}
