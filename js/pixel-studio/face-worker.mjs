import { createFaceLandmarker } from './face-landmarker.mjs';

let detector = null;
let active = null;
let currentSession = null;
let detectorSession = null;

async function run(job) {
  const started = performance.now();
  try {
    if (!detector) detector = await createFaceLandmarker();
    if (job.cancelled) return;
    if (detectorSession !== job.session) { detector.reset(); detectorSession = job.session; }
    const result = await detector.detect(job.frame, { timestamp: job.capturedAt });
    if (job.cancelled || active !== job || currentSession !== job.session) return;
    self.postMessage({ type: 'face-result', jobId: job.jobId, session: job.session,
      capturedAt: job.capturedAt, frame: job.frame, landmarks: result.landmarks,
      processingMs: performance.now() - started,
      ...(job.diagnostics ? { resourceOrigins: [...new Set(performance.getEntriesByType('resource').map(entry => new URL(entry.name, self.location.href).origin))] } : {}) }, [job.frame.data.buffer]);
    job.reported = true;
  } catch (error) {
    if (!job.cancelled) {
      self.postMessage({ type: 'face-result', jobId: job.jobId, session: job.session,
        error: error instanceof Error ? error.message : String(error) });
      job.reported = true;
    }
  } finally {
    if (!job.reported) self.postMessage({ type: 'face-result', jobId: job.jobId, session: job.session, cancelled: true });
    if (active === job) active = null;
  }
}

self.addEventListener('message', (event) => {
  const message = event.data ?? {};
  if (message.type === 'cancel') {
    if (active && (message.session === undefined || active.session === message.session)) active.cancelled = true;
    return;
  }
  if (message.type !== 'detect-face') return;
  currentSession = message.session;
  if (active) {
    if (active.session !== message.session) active.cancelled = true;
    self.postMessage({ type: 'face-result', jobId: message.jobId, session: message.session, cancelled: true });
    return;
  }
  const job = { ...message, cancelled: false, reported: false };
  active = job;
  void run(job);
});
