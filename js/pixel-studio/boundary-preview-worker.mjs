import { createBoundarySampler } from './boundary-sampler.mjs';
import { createFourTonePalette } from './four-tone-palette.mjs';
import { createLensSourcePalette } from './lens-source-palette.mjs';
import { sampleLensFrame } from './lens-direct-sampler.mjs';
import { flattenRecognizedBackground } from './background-flatten.mjs';
import { smoothRecognizedBackground } from './background-smooth.mjs';
import { createMaskCache } from './mask-cache.mjs';

const ALLOWED_SIZES = new Set([16, 32, 64, 96, 128, 160, 256, 512]);

let session = null;
let size = 128;
let paletteEpoch = null;
let sampler = createBoundarySampler({ size });
const tones = createFourTonePalette();
const lensColors = createLensSourcePalette();
const maskCache = createMaskCache({ maxAgeMs: 15000, reuseExactFrame: true });
let segmentationWorker = null;
let permanentWorkerFailure = null;
let sessionFailure = null;
let activeJob = null;
let blockedByJobId = null;
let nextJobId = 0;
let jobsStarted = 0;
let lastOutcome = null;
let hasValidSource = false;
let aiProcessingMs = null;
let resourceOrigins = [];

function isFrame(frame) {
  return Boolean(frame && Number.isInteger(frame.width) && Number.isInteger(frame.height) &&
    frame.width > 0 && frame.height > 0 && frame.width * frame.height <= 16_000_000 &&
    (frame.data instanceof Uint8Array || frame.data instanceof Uint8ClampedArray) &&
    frame.data.length === frame.width * frame.height * 4);
}

function isBlack(frame) {
  for (let p = 0; p < frame.data.length; p += 4) {
    if (frame.data[p] || frame.data[p + 1] || frame.data[p + 2]) return false;
  }
  return true;
}

function origins() {
  try {
    return [...new Set(performance.getEntriesByType('resource')
      .map((entry) => new URL(entry.name, self.location.href).origin))];
  } catch { return []; }
}

function cancelActive() {
  if (!activeJob || !segmentationWorker) return;
  try { segmentationWorker.postMessage({ type: 'cancel', jobId: activeJob.jobId, session: activeJob.session }); } catch { /* worker may already be gone */ }
}

function resetForSession(nextSession) {
  if (session === nextSession) return;
  const previous = session;
  cancelActive();
  session = nextSession;
  activeJob = null;
  blockedByJobId = null;
  jobsStarted = 0;
  lastOutcome = null;
  sessionFailure = null;
  aiProcessingMs = null;
  resourceOrigins = [];
  hasValidSource = false;
  maskCache.reset();
  sampler.reset();
  tones.reset();
  if (previous !== null) {
    try { segmentationWorker?.postMessage({ type: 'cancel', session: previous }); } catch { /* ignore teardown failures */ }
  }
}

function invalidateEpoch(nextEpoch) {
  if (paletteEpoch === nextEpoch) return;
  paletteEpoch = nextEpoch;
  cancelActive();
  activeJob = null;
  blockedByJobId = null;
  lastOutcome = null;
  sessionFailure = null;
  aiProcessingMs = null;
  resourceOrigins = [];
  maskCache.reset();
  sampler.reset();
  tones.reset();
  lensColors.reset();
  if (session !== null) {
    // The session-scoped cancel also resets the model's instance tracker.
    try { segmentationWorker?.postMessage({ type: 'cancel', session }); } catch { /* keep preview usable */ }
  }
}

function markUnavailable(error, permanent = false) {
  activeJob = null;
  blockedByJobId = null;
  const reason = error instanceof Error ? error.message : String(error);
  if (permanent) permanentWorkerFailure = reason;
  else sessionFailure = reason;
  lastOutcome = 'unavailable';
  maskCache.reset();
  sampler.reset();
  try { if (session !== null) segmentationWorker?.postMessage({ type: 'cancel', session }); } catch { /* worker already failed */ }
}

function startSegmentation(requestId, frame, diagnostics) {
  if (!segmentationWorker || permanentWorkerFailure || sessionFailure || activeJob || blockedByJobId !== null) return false;
  const job = { jobId: ++nextJobId, requestId, session, epoch: paletteEpoch, capturedAt: Date.now(), startedAt: performance.now() };
  activeJob = job;
  lastOutcome = null;
  try {
    segmentationWorker.postMessage({ type: 'segment', jobId: job.jobId, session, frame,
      capturedAt: job.capturedAt, diagnostics: Boolean(diagnostics) }, [frame.data.buffer]);
    jobsStarted++;
    return true;
  } catch (error) {
    markUnavailable(error, true);
    return false;
  }
}

function onSegmentationResult(message) {
  const job = activeJob;
  if (!job || message.jobId !== job.jobId || message.session !== job.session ||
      message.session !== session || job.epoch !== paletteEpoch) return;

  if (message.cancelled) {
    activeJob = null;
    if (message.busy && Number.isInteger(message.blockedByJobId)) {
      blockedByJobId = message.blockedByJobId;
      return;
    }
    maskCache.reset();
    sampler.reset();
    return;
  }
  if (message.error) {
    markUnavailable(new Error(message.error));
    return;
  }

  try {
    if (message.labels instanceof Uint32Array && message.labelWidth > 0 && message.labelHeight > 0 && isFrame(message.frame)) {
      maskCache.store({ frame: message.frame, labels: message.labels,
        width: message.labelWidth, height: message.labelHeight, session: message.session,
        jobId: message.jobId, capturedAt: message.capturedAt, model: message.model,
        instanceCount: message.instanceCount, trackingMatches: message.trackingMatches,
        aiProcessingMs: message.aiProcessingMs });
      lastOutcome = 'ready';
    } else if (isFrame(message.frame)) {
      maskCache.storeEmpty({ frame: message.frame, session: message.session,
        jobId: message.jobId, capturedAt: message.capturedAt, model: message.model,
        aiProcessingMs: message.aiProcessingMs });
      lastOutcome = 'no-instances';
    } else {
      maskCache.reset();
      lastOutcome = 'no-instances';
    }
    aiProcessingMs = Number.isFinite(message.aiProcessingMs) ? message.aiProcessingMs : null;
    resourceOrigins = Array.isArray(message.resourceOrigins) ? message.resourceOrigins : [];
    activeJob = null;
  } catch (error) {
    markUnavailable(error);
  }
}

try {
  segmentationWorker = new Worker(new URL('./segmentation-worker.mjs', import.meta.url), { type: 'module' });
  segmentationWorker.addEventListener('message', (event) => {
    const message = event.data ?? {};
    if (message.type === 'segmentation-progress') {
      if (activeJob && message.jobId === activeJob.jobId && message.session === activeJob.session && message.session === session) {
        self.postMessage({ type: 'progress', requestId: activeJob.requestId, session: activeJob.session });
      }
      return;
    }
    if (message.type === 'segmentation-idle') {
      if (message.session === session && message.jobId === blockedByJobId) blockedByJobId = null;
      return;
    }
    if (message.type === 'segmentation-result') onSegmentationResult(message);
  });
  const fail = (event) => markUnavailable(new Error(event.message || 'Segmentation worker failed'), true);
  segmentationWorker.addEventListener('error', fail);
  segmentationWorker.addEventListener('messageerror', () => markUnavailable(new Error('Segmentation worker message could not be read'), true));
} catch (error) {
  permanentWorkerFailure = error instanceof Error ? error.message : String(error);
}

function validateMessage(message) {
  const requestId = message.requestId;
  const nextSize = message.size === undefined ? 128 : message.size;
  if (!Number.isInteger(requestId)) throw new TypeError('requestId must be an integer');
  if (!ALLOWED_SIZES.has(nextSize)) throw new RangeError('size must be a supported pixel-camera preset');
  if (!isFrame(message.frame)) throw new TypeError('frame must contain a bounded RGBA pixel buffer');
  return { requestId, nextSize, frame: message.frame };
}

function processFrame(message) {
  const { requestId, nextSize, frame } = validateMessage(message);
  resetForSession(message.session);
  if (nextSize !== size) {
    size = nextSize;
    sampler = createBoundarySampler({ size });
  }
  invalidateEpoch(message.paletteEpoch ?? message.session);

  // Cameras can briefly provide a zero-filled decoded video frame at startup.
  // Once a real frame has arrived, black scenes are legitimate input.
  if (!hasValidSource && isBlack(frame)) return { requestId, cancelled: true, pending: true };
  hasValidSource = true;

  const started = performance.now();
  const useLens = message.renderMode === 'lens';
  const useAi = !useLens || message.aiEdges === true;
  const cached = useAi ? maskCache.get({ frame, session, now: Date.now() }) : {};
  const sourceSample = useAi ? sampler.render(frame, cached.mask) : sampleLensFrame(frame, nextSize);
  const smoothed = useAi ? smoothRecognizedBackground(sourceSample) : sourceSample;
  const sampled = useLens
    ? lensColors.render(smoothed, message.lensSettings)
    : flattenRecognizedBackground(tones.render(smoothed));
  const wantsDiagnostics = Boolean(message.diagnostics);
  // A valid mask already applies to this unchanged scene until the cache
  // expires or detects a meaningful source change. Keep sampling every frame,
  // but avoid repeatedly asking the model to segment the same region.
  if (useAi && !cached.mask && !cached.exactFrame && !permanentWorkerFailure && !sessionFailure && !activeJob && blockedByJobId === null) {
    startSegmentation(requestId, frame, wantsDiagnostics);
  }
  const aiStatus = !useAi ? 'disabled' : cached.mask ? 'ready'
    : (permanentWorkerFailure || sessionFailure) ? 'unavailable'
      : (!activeJob && lastOutcome === 'no-instances') ? 'no-instances' : 'processing';
  const result = {
    ...sampled,
    aiStatus,
    aiFailureReason: permanentWorkerFailure || sessionFailure,
    aiProcessingMs: cached.aiProcessingMs ?? aiProcessingMs,
    maskAgeMs: cached.ageMs,
    maskCoverage: cached.coverage,
    maskInvalidation: cached.reason,
    model: cached.model ?? null,
    instanceCount: cached.instanceCount ?? 0,
    trackingMatches: cached.trackingMatches ?? 0,
    faceStatus: 'disabled',
    faceCount: 0,
    faceProcessingMs: null,
    faceFailure: null,
    processingMs: performance.now() - started,
    inference: {
      objectJobs: jobsStarted,
      faceJobs: 0,
      objectReused: Boolean(cached.exactFrame),
      faceReused: false,
      waitingForIdle: blockedByJobId !== null
    },
    ...(wantsDiagnostics ? {
      resourceOrigins: [...new Set([...origins(), ...resourceOrigins])],
      sourceSimplified: { width: smoothed.width, height: smoothed.height, data: smoothed.data }
    } : {})
  };

  return { requestId, result };
}

function cancelSession(message) {
  if (message.session !== undefined && message.session !== session) return false;
  const previous = session;
  cancelActive();
  session = null;
  // A framing-only restart changes the render session, not the chosen colours.
  // A new camera opening and a preview tap send a new palette epoch separately.
  activeJob = null;
  blockedByJobId = null;
  jobsStarted = 0;
  lastOutcome = null;
  aiProcessingMs = null;
  resourceOrigins = [];
  hasValidSource = false;
  maskCache.reset();
  sampler.reset();
  tones.reset();
  if (previous !== null) {
    try { segmentationWorker?.postMessage({ type: 'cancel', session: previous }); } catch { /* ignore teardown failures */ }
  }
  return true;
}

self.addEventListener('message', (event) => {
  const message = event.data ?? {};
  if (message.type === 'cancel') {
    if (cancelSession(message) && Number.isInteger(message.requestId)) self.postMessage({ requestId: message.requestId, cancelled: true });
    return;
  }
  try {
    const output = processFrame(message);
    if (output.pending) { self.postMessage(output); return; }
    const transfers = [output.result.data.buffer];
    if (output.result.labels?.buffer instanceof ArrayBuffer) transfers.push(output.result.labels.buffer);
    if (output.result.sourceSimplified?.data?.buffer instanceof ArrayBuffer) transfers.push(output.result.sourceSimplified.data.buffer);
    self.postMessage(output, transfers);
  } catch (error) {
    self.postMessage({ requestId: message.requestId, error: error instanceof Error ? error.message : String(error) });
  }
});
