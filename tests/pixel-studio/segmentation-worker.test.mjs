import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

test('busy session switch reports the blocking job and notifies idle after it settles', async () => {
  let onMessage;
  const posted = [];
  let startSegment;
  let resolveSegment;
  const segmentStarted = new Promise((resolve) => { startSegment = resolve; });
  const segmentResult = new Promise((resolve) => { resolveSegment = resolve; });
  const self = {
    addEventListener(type, listener) { if (type === 'message') onMessage = listener; },
    postMessage(message) { posted.push(message); },
    location: { href: 'http://localhost/segmentation-worker.mjs' }
  };
  const source = (await readFile(new URL('../../js/pixel-studio/segmentation-worker.mjs', import.meta.url), 'utf8'))
    .replace(/^import .*;\s*$/gm, '')
    .replace("await import('./segmenter.mjs')", 'await importSegmenter()');
  const sandbox = {
    self,
    performance,
    URL,
    AbortController,
    createObjectTracker: () => ({ reset() {}, track: () => ({ instances: [], matchedCount: 0 }) }),
    composeVisibleLabels: () => null,
    importSegmenter: async () => ({ createSegmenter: () => ({
      segment: () => { startSegment(); return segmentResult; }
    }) })
  };
  vm.runInNewContext(source, sandbox, { filename: 'segmentation-worker.mjs' });

  onMessage({ data: { type: 'segment', jobId: 41, session: 'old', frame: { data: new Uint8Array(4) } } });
  await segmentStarted;
  onMessage({ data: { type: 'segment', jobId: 42, session: 'new', frame: { data: new Uint8Array(4) } } });

  const busy = posted.find((message) => message.type === 'segmentation-result' && message.jobId === 42);
  assert.deepEqual({ cancelled: busy.cancelled, busy: busy.busy, blockedByJobId: busy.blockedByJobId },
    { cancelled: true, busy: true, blockedByJobId: 41 });
  assert.equal(busy.session, 'new');
  assert.equal(posted.some((message) => message.type === 'segmentation-idle'), false,
    'the old inference must keep the worker busy until its promise settles');

  resolveSegment({ instances: [], model: 'fixture' });
  for (let i = 0; i < 20 && !posted.some((message) => message.type === 'segmentation-idle'); i++) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  const idle = posted.find((message) => message.type === 'segmentation-idle');
  assert.deepEqual({ ...idle }, { type: 'segmentation-idle', session: 'new', jobId: 41, activeSession: 'old' });
});
