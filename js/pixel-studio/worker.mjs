import { createObjectRenderer } from './object-renderer.mjs';
import { createObjectTracker } from './object-tracker.mjs';
import { composeVisibleLabels } from './instance-masks.mjs';

const renderer = createObjectRenderer({ size: 128, colors: 24 });
const tracker = createObjectTracker();
let segmenter = null;
let active = null;
let session = null;
let aiUnavailable = false;
let aiFailureReason = null;

async function processFrame(message, controller) {
  const { requestId, frame } = message;
  if (session !== message.session) {
    renderer.reset(); tracker.reset();
    aiUnavailable = false;
    aiFailureReason = null;
    session = message.session;
  }
  let labels = null;
  let model = null;
  let instanceCount = 0;
  let trackingMatches = 0;
  const started = performance.now();
  if (!aiUnavailable) {
    try {
      if (!segmenter) {
        const { createSegmenter } = await import('./segmenter.mjs');
        segmenter = createSegmenter({ onProgress: () => {
          if (active) self.postMessage({ type: 'progress', requestId: active.requestId });
        } });
      }
      if (controller.signal.aborted) return { requestId, cancelled: true };
      const segmentation = await segmenter.segment(frame, { signal: controller.signal });
      if (controller.signal.aborted) return { requestId, cancelled: true };
      const tracked = tracker.track(segmentation, frame);
      if (tracked.resetReason) renderer.reset();
      instanceCount = tracked.instances.length;
      labels = instanceCount ? composeVisibleLabels(tracked) : null;
      trackingMatches = tracked.matchedCount;
      model = segmentation.model;
    } catch (error) {
      if (controller.signal.aborted || error?.name === 'AbortError') return { requestId, cancelled: true };
      aiUnavailable = true;
      aiFailureReason = error instanceof Error ? error.message : String(error);
      tracker.reset(); renderer.reset();
      try { await segmenter?.dispose(); } catch { /* Keep camera fallback available. */ }
      segmenter = null;
      console.warn('Object segmentation unavailable:', error instanceof Error ? error.message : String(error));
    }
  }
  if (controller.signal.aborted) return { requestId, cancelled: true };
  const result = renderer.render(frame, labels);
  return { requestId, result: {
    ...result,
    aiStatus: labels ? 'ready' : aiUnavailable ? 'unavailable' : 'no-instances',
    model, instanceCount, trackingMatches, aiFailureReason,
    processingMs: performance.now() - started,
    ...(message.diagnostics ? { resourceOrigins: [...new Set(performance.getEntriesByType('resource')
      .map(entry => new URL(entry.name, self.location.href).origin))] } : {})
  } };
}

self.addEventListener('message', (event) => {
  const message = event.data ?? {};
  if (message.type === 'cancel') {
    if (active?.requestId === message.requestId) active.controller.abort();
    return;
  }
  if (active) {
    self.postMessage({ requestId: message.requestId, error: '前の画像を処理しています。' });
    return;
  }
  const controller = new AbortController();
  active = { requestId: message.requestId, controller };
  processFrame(message, controller).then((output) => {
    if (output.result) self.postMessage(output, [output.result.data.buffer, output.result.indices.buffer, output.result.labels.buffer]);
    else self.postMessage(output);
  }).catch((error) => {
    self.postMessage({ requestId: message.requestId, error: error instanceof Error ? error.message : String(error) });
  }).finally(() => { active = null; });
});
