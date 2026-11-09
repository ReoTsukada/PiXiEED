import test from 'node:test';
import assert from 'node:assert/strict';
import { createLazyGalleryData } from '../../js/creation/project-gallery-data.mjs';
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const tick = () => new Promise(resolve => setImmediate(resolve));

test('hidden galleries do not read, successful tab revisits do not fetch or redraw', async () => {
  let visible = false, reads = 0; const applied = [];
  const data = createLazyGalleryData({ load: async () => ++reads, isVisible: () => visible, onData: value => applied.push(value) });
  await data.ensure(); await data.ensure({ force: true }); assert.equal(reads, 0);
  visible = true; await data.ensure(); assert.deepEqual(applied, [1]);
  visible = false; await data.ensure(); visible = true; await data.ensure();
  assert.equal(reads, 1); assert.deepEqual(applied, [1]);
});

test('repeated selection shares one read and hidden completion waits before rendering', async () => {
  let visible = true, reads = 0; const result = deferred(), applied = [];
  const data = createLazyGalleryData({ load: () => { reads++; return result.promise; }, isVisible: () => visible, onData: value => applied.push(value) });
  const first = data.ensure(); assert.equal(data.ensure(), first); await tick(); assert.equal(reads, 1);
  visible = false; result.resolve('items'); await first; assert.deepEqual(applied, []);
  visible = true; await data.ensure(); assert.equal(reads, 1); assert.deepEqual(applied, ['items']);
});

test('invalidating an in-flight read discards its result and queues one fresh read', async () => {
  const firstResult = deferred(), nextResult = deferred(); let reads = 0; const applied = [];
  const data = createLazyGalleryData({ load: () => (++reads === 1 ? firstResult : nextResult).promise, isVisible: () => true, onData: value => applied.push(value) });
  const pending = data.ensure(); await tick(); data.invalidate(); assert.equal(data.ensure(), pending);
  firstResult.resolve('stale'); await tick(); assert.equal(reads, 2); assert.deepEqual(applied, []);
  nextResult.resolve('fresh'); await pending; assert.deepEqual(applied, ['fresh']);
});

test('close never starts queued hidden work and next visit retries after failure', async () => {
  let visible = true, reads = 0; const result = deferred(), errors = [], applied = [];
  const data = createLazyGalleryData({ load: () => { reads++; return reads === 1 ? result.promise : reads === 2 ? Promise.reject(new Error('offline')) : Promise.resolve('ready'); }, isVisible: () => visible, onData: value => applied.push(value), onError: error => errors.push(error.message) });
  const first = data.ensure(); await tick(); visible = false; data.invalidate(); result.resolve('old'); await first;
  assert.equal(reads, 1); assert.deepEqual(applied, []);
  visible = true; await data.ensure(); assert.deepEqual(errors, ['offline']);
  await data.ensure({ force: true }); assert.deepEqual(applied, ['ready']); assert.equal(reads, 3);
});

test('dispose ignores pending data and cannot load again', async () => {
  const result = deferred(); let reads = 0; const applied = [];
  const data = createLazyGalleryData({ load: () => { reads++; return result.promise; }, isVisible: () => true, onData: value => applied.push(value) });
  const pending = data.ensure(); await tick(); data.dispose(); result.resolve('ignored'); await pending; await data.ensure();
  assert.equal(reads, 1); assert.deepEqual(applied, []);
});

test('workspace does not sample the live current-work preview while another pane is shown', async () => {
  const { readFile } = await import('node:fs/promises');
  const source = await readFile(new URL('../../js/creation/project-workspace.mjs', import.meta.url), 'utf8');
  assert.match(source, /if \(dialog\.open && !currentPane\.hidden\) try \{ previewSize = refreshCurrentPreview\(\)/);
});
