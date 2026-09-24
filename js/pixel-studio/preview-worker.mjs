import { createObjectRenderer } from './object-renderer.mjs?v=20260925-specks-1';
import { createGlobalPalette } from './global-palette.mjs?v=20260924-camera-release-1';
import { createMaskCache } from './mask-cache.mjs';
import { createFaceCache } from './face-cache.mjs';
import { rasterizeFaceFeatures, rasterizeFaceGuides } from './face-features.mjs?v=20260924-camera-release-1';

let toneLevels = 8, ditherMode = 'ordered';
let paletteSession = createGlobalPalette({ toneLevels, saturation: 1.25 });
let paletteEpoch = null;
let rendererSize = 128;
let renderer = createObjectRenderer({ size: rendererSize, colors: 24, shading: 'three-tone', paletteSession, dither: 'ordered', simplifySurfaces: true });
const maskCache = createMaskCache({ maxAgeMs: 15000, reuseExactFrame: true });
let segmentationWorker = null;
let startupWorkerError = null;
let activeAi = null;
let aiBlockedByJob = null;
let aiJobsStarted = 0, faceJobsStarted = 0;
let session = null;
let aiUnavailable = false;
let aiFailureReason = null;
let lastAiOutcome = null;
let aiResourceOrigins = [];
let nextJobId = 0;
const faceCache = createFaceCache({ reuseExactFrame: true });
let faceWorker = null;
let activeFace = null;
let faceFailure = null;
let faceStartupFailure = null;
let lastFaceStart = -Infinity;
let nextFaceJob = 0;
let faceProcessingMs = null;
let faceResourceOrigins = [];

function isAllZeroRgbPlaceholder(frame) {
  if (!frame || !Number.isInteger(frame.width) || !Number.isInteger(frame.height) ||
      frame.width < 1 || frame.height < 1 || frame.width * frame.height > 16_000_000 ||
      !(frame.data instanceof Uint8Array || frame.data instanceof Uint8ClampedArray) ||
      frame.data.length !== frame.width * frame.height * 4) return false;
  for (let p = 0; p < frame.data.length; p += 4) {
    if (frame.data[p] !== 0 || frame.data[p + 1] !== 0 || frame.data[p + 2] !== 0) return false;
  }
  return true;
}

function resetFaceSession() {
  if (activeFace) {
    try { faceWorker?.postMessage({ type: 'cancel', session: activeFace.session }); } catch { /* A failed optional detector must not stop the camera. */ }
  }
  activeFace = null;
  faceCache.reset();
  lastFaceStart = -Infinity;
  faceProcessingMs = null;
  faceResourceOrigins = [];
  faceFailure = faceStartupFailure;
}

try {
  faceWorker = new Worker(new URL('./face-worker.mjs', import.meta.url), { type: 'module' });
  faceWorker.addEventListener('message', (event) => {
    const message = event.data ?? {};
    if (!activeFace || message.jobId !== activeFace.jobId || message.session !== session) return;
    activeFace = null;
    if (message.cancelled) return;
    if (message.error) { faceFailure = message.error; faceCache.reset(); return; }
    try {
      faceCache.store({ frame: message.frame, landmarks: message.landmarks, session: message.session, capturedAt: message.capturedAt });
      faceProcessingMs = message.processingMs;
      faceResourceOrigins = Array.isArray(message.resourceOrigins) ? message.resourceOrigins : faceResourceOrigins;
    } catch (error) { faceFailure = String(error); faceCache.reset(); }
  });
  const faceFailed = (event) => { faceStartupFailure = event.message || 'Face worker unavailable'; faceFailure = faceStartupFailure; activeFace = null; faceCache.reset(); };
  faceWorker.addEventListener('error', faceFailed);
  faceWorker.addEventListener('messageerror', faceFailed);
} catch (error) { faceStartupFailure = String(error); faceFailure = faceStartupFailure; }

function scheduleFace(frame, diagnostics = false) {
  const now = performance.now();
  if (!faceWorker || faceFailure || activeFace || now - lastFaceStart < 400) return;
  lastFaceStart = now;
  const copy = { width: frame.width, height: frame.height, data: new Uint8ClampedArray(frame.data) };
  activeFace = { jobId: ++nextFaceJob, session };
  try {
    faceWorker.postMessage({ type: 'detect-face', ...activeFace, capturedAt: Date.now(), diagnostics, frame: copy }, [copy.data.buffer]);
    faceJobsStarted++;
  } catch (error) { faceFailure = String(error); activeFace = null; }
}

try {
  segmentationWorker = new Worker(new URL('./segmentation-worker.mjs', import.meta.url), { type: 'module' });
} catch (error) {
  startupWorkerError = error instanceof Error ? error.message : String(error);
}

function resourceOrigins() {
  return [...new Set(performance.getEntriesByType('resource')
    .map(entry => new URL(entry.name, self.location.href).origin))];
}

function resetSession(nextSession) {
  if (session === nextSession) return;
  const oldSession = session;
  resetFaceSession();
  session = nextSession;
  aiBlockedByJob = null;
  aiJobsStarted = faceJobsStarted = 0;
  if (activeAi) {
    try { segmentationWorker?.postMessage({ type: 'cancel', jobId: activeAi.jobId, session: activeAi.session }); } catch { /* The old worker is already gone. */ }
    activeAi = null;
  } else if (oldSession !== null) {
    try { segmentationWorker?.postMessage({ type: 'cancel', session: oldSession }); } catch { /* The old worker is already gone. */ }
  }
  renderer.reset();
  maskCache.reset();
  aiUnavailable = Boolean(startupWorkerError);
  aiFailureReason = startupWorkerError;
  lastAiOutcome = null;
  aiResourceOrigins = [];
}

function unavailable(error, expectedJob = activeAi) {
  if (!expectedJob || expectedJob.session !== session || (activeAi && activeAi !== expectedJob)) return;
  activeAi = null;
  aiUnavailable = true;
  aiFailureReason = error instanceof Error ? error.message : String(error);
  lastAiOutcome = 'unavailable';
  maskCache.reset();
  renderer.reset();
  try { segmentationWorker?.postMessage({ type: 'cancel', session }); } catch { /* Keep regular preview available. */ }
  console.warn('Object segmentation unavailable for this camera session:', aiFailureReason);
}

function workerFailed(error) {
  aiBlockedByJob = null;
  const failure = error instanceof Error ? error : new Error(String(error));
  startupWorkerError = failure.message || 'AI worker failed';
  if (activeAi) unavailable(failure, activeAi);
  else {
    aiUnavailable = true;
    aiFailureReason = startupWorkerError;
    maskCache.reset();
    renderer.reset();
  }
}

function scheduleAi(requestId, frame, diagnostics = false) {
  if (!segmentationWorker || aiUnavailable || activeAi || aiBlockedByJob !== null) return false;
  const job = { jobId: ++nextJobId, requestId, session, startedAt: performance.now(), capturedAt: Date.now(), diagnostics };
  activeAi = job;
  lastAiOutcome = null;
  try {
    // Renderer work for this frame is already complete; ownership of the source
    // buffer can now move to the AI worker without making another full copy.
    segmentationWorker.postMessage({ type: 'segment', jobId: job.jobId, session, frame, capturedAt: job.capturedAt, diagnostics }, [frame.data.buffer]);
    aiJobsStarted++;
    return true;
  } catch (error) {
    unavailable(error, job);
    return false;
  }
}

function finishSegmentation(message) {
  const job = activeAi;
  if (!job || message.jobId !== job.jobId || message.session !== job.session || message.session !== session) return;
  if (message.cancelled) {
    activeAi = null;
    if (message.busy && Number.isInteger(message.blockedByJobId)) {
      // The old session is still settling. Keep the current preview history,
      // and wait for explicit idle before sending the then-latest frame.
      aiBlockedByJob = message.blockedByJobId;
      return;
    }
    maskCache.reset();
    renderer.reset();
    return;
  }
  if (message.error) {
    unavailable(new Error(message.error), job);
    return;
  }
  if (message.labels instanceof Uint32Array && message.labelWidth > 0 && message.labelHeight > 0 && message.frame) {
    try {
      maskCache.store({
        frame: message.frame,
        labels: message.labels,
        width: message.labelWidth,
        height: message.labelHeight,
        session: message.session,
        jobId: message.jobId,
        now: Date.now(),
        capturedAt: message.capturedAt,
        model: message.model,
        instanceCount: message.instanceCount,
        trackingMatches: message.trackingMatches,
        aiProcessingMs: message.aiProcessingMs
      });
      lastAiOutcome = 'ready';
      activeAi = null;
      aiResourceOrigins = Array.isArray(message.resourceOrigins) ? message.resourceOrigins : [];
    } catch (error) {
      unavailable(error, job);
    }
  } else {
    activeAi = null;
    try {
      if (message.frame) maskCache.storeEmpty({ frame: message.frame, session: message.session,
        jobId: message.jobId, capturedAt: message.capturedAt, model: message.model,
        aiProcessingMs: message.aiProcessingMs });
      else maskCache.reset();
    } catch (error) { unavailable(error, job); return; }
    lastAiOutcome = 'no-instances';
    aiResourceOrigins = Array.isArray(message.resourceOrigins) ? message.resourceOrigins : [];
  }
}

if (segmentationWorker) {
  segmentationWorker.addEventListener('message', (event) => {
    const message = event.data ?? {};
    if (message.type === 'segmentation-idle') {
      if (message.session === session && message.jobId === aiBlockedByJob) aiBlockedByJob = null;
      return;
    }
    if (message.type === 'segmentation-progress') {
      const job = activeAi;
      if (job && message.jobId === job.jobId && message.session === job.session) {
        self.postMessage({ type: 'progress', requestId: job.requestId, session: job.session });
      }
      return;
    }
    if (message.type === 'segmentation-result') finishSegmentation(message);
  });
  segmentationWorker.addEventListener('error', (event) => {
    workerFailed(new Error(event.message || 'AI worker failed'));
  });
  segmentationWorker.addEventListener('messageerror', () => {
    workerFailed(new Error('AI worker message could not be read'));
  });
}

function cancelSession(message) {
  if (message.session !== undefined && message.session !== session) return false;
  const cancelledSession = session;
  resetFaceSession();
  session = null;
  activeAi = null;
  aiBlockedByJob = null;
  aiJobsStarted = faceJobsStarted = 0;
  maskCache.reset();
  renderer.reset();
  aiUnavailable = false;
  aiFailureReason = null;
  lastAiOutcome = null;
  aiResourceOrigins = [];
  if (segmentationWorker && cancelledSession !== null) {
    try { segmentationWorker.postMessage({ type: 'cancel', session: cancelledSession }); } catch { /* Session resources will end with the worker. */ }
  }
  return true;
}

function processFrame(message) {
  const { requestId, frame } = message;
  const size = message.size === undefined ? 128 : message.size;
  if (!Number.isInteger(requestId)) throw new TypeError('requestId must be an integer');
  if (![64, 128, 256, 512].includes(size)) throw new RangeError('size must be one of 64, 128, 256, or 512');
  const nextToneLevels = message.toneLevels ?? 8, nextDitherMode = message.dither ?? 'ordered';
  if (![4, 8].includes(nextToneLevels)) throw new RangeError('toneLevels must be 4 or 8');
  if (!['none', 'ordered'].includes(nextDitherMode)) throw new RangeError('dither must be none or ordered');
  if (!frame || !Number.isInteger(frame.width) || !Number.isInteger(frame.height) ||
      frame.width < 1 || frame.height < 1 || frame.width * frame.height > 16_000_000 ||
      !(frame.data instanceof Uint8Array || frame.data instanceof Uint8ClampedArray) ||
      frame.data.length !== frame.width * frame.height * 4) {
    throw new TypeError('frame must contain a bounded RGBA pixel buffer');
  }
  const toneChanged = nextToneLevels !== toneLevels;
  if (toneChanged) {
    toneLevels = nextToneLevels;
    paletteSession = createGlobalPalette({ toneLevels, saturation: 1.25 });
  }
  if (size !== rendererSize || toneChanged || nextDitherMode !== ditherMode) {
    ditherMode = nextDitherMode;
    renderer = createObjectRenderer({ size, colors: 24, shading: 'three-tone', paletteSession, dither: ditherMode, simplifySurfaces: true });
    rendererSize = size;
  }
  resetSession(message.session);
  const nextPaletteEpoch = message.paletteEpoch ?? message.session;
  if (paletteEpoch !== nextPaletteEpoch) {
    paletteEpoch = nextPaletteEpoch;
    paletteSession.clear();
    renderer.reset();
  }
  // Some browsers expose an all-black decoded frame while a video source is
  // still becoming ready. Do not train/lock a palette or launch AI on it.
  // Exact zero RGB is intentional: legitimate dark scenes remain eligible.
  if (paletteSession.get() === null && isAllZeroRgbPlaceholder(frame)) {
    return { requestId, cancelled: true, pending: true };
  }
  const started = performance.now();
  const cached = maskCache.get({ frame, session, now: Date.now() });
  const validMask = cached.mask;
  const noInstancesVisible = !validMask && !activeAi && (cached.reason === 'no-instances' || lastAiOutcome === 'no-instances');
  const aiStatus = validMask ? 'ready'
    : aiUnavailable ? 'unavailable'
      : noInstancesVisible ? 'no-instances' : 'processing';

  const face = faceCache.get({ frame, session, now: Date.now() });
  const scale = Math.min(1, size / Math.max(frame.width, frame.height));
  const outputWidth = Math.max(1, Math.round(frame.width * scale));
  const outputHeight = Math.max(1, Math.round(frame.height * scale));
  const faceGuides = face.landmarks.length ? rasterizeFaceGuides(face.landmarks, outputWidth, outputHeight) : null;
  const protectedCells = faceGuides?.protectedCells ?? (face.landmarks.length ? rasterizeFaceFeatures(face.landmarks, outputWidth, outputHeight) : null);
  const result = renderer.render(frame, validMask, { protectedCells, faceGuides });
  const processingMs = performance.now() - started;
  const wantsDiagnostics = Boolean(message.diagnostics);
  const output = {
    ...result,
    aiStatus,
    faceStatus: faceFailure ? 'unavailable' : face.landmarks.length ? 'ready' : activeFace ? 'processing' : face.status,
    faceCount: face.landmarks.length,
    faceProcessingMs,
    faceFailure,
    model: cached.model ?? null,
    instanceCount: cached.instanceCount ?? 0,
    trackingMatches: cached.trackingMatches ?? 0,
    aiFailureReason,
    processingMs,
    aiProcessingMs: cached.aiProcessingMs ?? null,
    maskAgeMs: cached.ageMs,
    maskCoverage: cached.coverage,
    maskInvalidation: cached.reason,
    ...(wantsDiagnostics ? { resourceOrigins: [...new Set([...resourceOrigins(), ...aiResourceOrigins, ...faceResourceOrigins])] } : {})
  };

  // Inference starts after rendering. A late result can only populate the
  // cache for a later frame; it never blocks or replaces this result.
  if (!face.exactFrame) scheduleFace(frame, wantsDiagnostics);
  if (!cached.exactFrame && !aiUnavailable && !activeAi && segmentationWorker) scheduleAi(requestId, frame, wantsDiagnostics);
  output.inference = { objectJobs: aiJobsStarted, faceJobs: faceJobsStarted,
    objectReused: Boolean(cached.exactFrame), faceReused: Boolean(face.exactFrame),
    waitingForIdle: aiBlockedByJob !== null };
  return { requestId, result: output };
}

self.addEventListener('message', (event) => {
  const message = event.data ?? {};
  if (message.type === 'cancel') {
    if (message.session === undefined || message.session === session) {
      cancelSession(message);
      if (Number.isInteger(message.requestId)) self.postMessage({ requestId: message.requestId, cancelled: true });
    }
    return;
  }
  try {
    const output = processFrame(message);
    if (output.pending) { self.postMessage(output); return; }
    const result = output.result;
    self.postMessage(output, [result.data.buffer, result.indices.buffer, result.labels.buffer]);
  } catch (error) {
    self.postMessage({ requestId: message.requestId, error: error instanceof Error ? error.message : String(error) });
  }
});
