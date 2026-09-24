import { createObjectTracker } from './object-tracker.mjs';
import { composeVisibleLabels } from './instance-masks.mjs';

const tracker = createObjectTracker();
let segmenter = null;
let active = null;
let session = null;
let lastProgressAt = 0;

function postCancelled(job) {
  if (job.reportedCancelled) return;
  job.reportedCancelled = true;
  self.postMessage({ type: 'segmentation-result', jobId: job.jobId, session: job.session, cancelled: true });
}

function resourceOrigins() {
  return [...new Set(performance.getEntriesByType('resource')
    .map(entry => new URL(entry.name, self.location.href).origin))];
}

async function loadSegmenter() {
  if (segmenter) return segmenter;
  const { createSegmenter } = await import('./segmenter.mjs');
  segmenter = createSegmenter({ onProgress: (value) => {
    if (!active) return;
    const now = performance.now();
    if (now - lastProgressAt < 700) return;
    lastProgressAt = now;
    self.postMessage({ type: 'segmentation-progress', jobId: active.jobId, session: active.session, progress: value });
  } });
  return segmenter;
}

async function run(job) {
  const started = performance.now();
  try {
    const modelRunner = await loadSegmenter();
    if (job.controller.signal.aborted || active !== job) return postCancelled(job);
    const sourceFrame = job.frame;
    const proposal = await modelRunner.segment(sourceFrame, { signal: job.controller.signal });
    if (job.controller.signal.aborted || active !== job || job.session !== session) return postCancelled(job);
    const tracked = tracker.track(proposal, sourceFrame);
    const labels = tracked.instances.length ? composeVisibleLabels(tracked) : null;
    if (job.controller.signal.aborted || active !== job || job.session !== session) return postCancelled(job);

    const output = {
      type: 'segmentation-result', jobId: job.jobId, session: job.session,
      frame: sourceFrame,
      capturedAt: job.capturedAt,
      labels: labels?.labels ?? null,
      labelWidth: labels?.width ?? 0,
      labelHeight: labels?.height ?? 0,
      model: proposal.model ?? null,
      instanceCount: tracked.instances.length,
      trackingMatches: tracked.matchedCount ?? 0,
      aiProcessingMs: performance.now() - started,
      ...(job.diagnostics ? { resourceOrigins: resourceOrigins() } : {})
    };
    const transfer = [sourceFrame.data.buffer];
    if (output.labels) transfer.push(output.labels.buffer);
    self.postMessage(output, transfer);
  } catch (error) {
    if (job.controller.signal.aborted || error?.name === 'AbortError' || active !== job) return postCancelled(job);
    tracker.reset();
    try { await segmenter?.dispose(); } catch { /* The preview worker will keep its normal renderer available. */ }
    segmenter = null;
    self.postMessage({
      type: 'segmentation-result', jobId: job.jobId, session: job.session,
      error: error instanceof Error ? error.message : String(error),
      aiProcessingMs: performance.now() - started
    });
  } finally {
    if (active === job) {
      active = null;
      self.postMessage({ type: 'segmentation-idle', session, jobId: job.jobId, activeSession: job.session });
    }
  }
}

self.addEventListener('message', (event) => {
  const message = event.data ?? {};
  if (message.type === 'cancel') {
    if (active && (message.jobId === undefined || message.jobId === active.jobId) &&
        (message.session === undefined || message.session === active.session)) {
      const cancelled = active;
      cancelled.controller.abort();
      tracker.reset();
      // Let the single active inference settle before accepting another job.
    }
    if (message.session !== undefined && session === message.session) tracker.reset();
    return;
  }
  if (message.type !== 'segment') return;

  if (session !== message.session) {
    if (active) {
      active.controller.abort();
    }
    tracker.reset();
    session = message.session;
  }
  if (active) {
    self.postMessage({ type: 'segmentation-result', jobId: message.jobId, session: message.session,
      cancelled: true, busy: true, blockedByJobId: active.jobId });
    return;
  }
  if (!message.frame || !Number.isInteger(message.jobId)) {
    self.postMessage({ type: 'segmentation-result', jobId: message.jobId, session: message.session, error: '不正な画像要求です' });
    return;
  }
  const job = { jobId: message.jobId, session: message.session, frame: message.frame, capturedAt: message.capturedAt,
    diagnostics: Boolean(message.diagnostics), controller: new AbortController() };
  active = job;
  lastProgressAt = 0;
  void run(job);
});
