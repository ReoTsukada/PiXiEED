import test from 'node:test';
import assert from 'node:assert/strict';
import { createMapGeometryLoader } from '../../js/globe/map-geometry-loader.mjs';

const assets = ['prefectures', 'admin1'].map(kind => ({ kind, url: `/${kind}.json`, checksum: `checked-${kind}` }));
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };

test('single flight waits for both files and commits current state exactly once', async () => {
  const files = [deferred(), deferred()], calls = [], states = [];
  let selection = 'A', applied;
  const loader = createMapGeometryLoader({ assets, fetchJson(url, options) { calls.push({ url, options }); return files[calls.length - 1].promise; }, apply(geometry) { applied = { geometry, selection }; }, onState: state => states.push(state) });
  const first = loader.load(); assert.equal(loader.load({ reload: true }), first); assert.equal(calls.length, 2);
  selection = 'B'; files[1].resolve('world'); await Promise.resolve(); assert.equal(applied, undefined);
  selection = 'C'; files[0].resolve('Japan'); await first;
  assert.deepEqual(applied, { geometry: { prefectures: 'Japan', admin1: 'world' }, selection: 'C' });
  assert.deepEqual(states, ['loading', 'ready']);
  assert.equal(calls[0].options.cache, 'force-cache'); assert.match(calls[0].url, /\?v=checked-prefectures$/);
  await loader.load(); assert.equal(calls.length, 2);
});

test('HTTP and validation failures preserve old state and explicit retry bypasses cache', async () => {
  let attempt = 0, commits = 0; const calls = [];
  const loader = createMapGeometryLoader({ assets, fetchJson: async (url, options) => { calls.push({ url, options }); if (!attempt) throw new Error('offline'); return url; }, apply() { if (attempt === 1) throw new Error('mixed cached data'); commits++; } });
  await assert.rejects(loader.load(), /offline/); assert.equal(commits, 0); assert.equal(loader.getState(), 'error');
  attempt = 1; await assert.rejects(loader.load({ reload: true }), /mixed cached data/); assert.equal(commits, 0);
  attempt = 2; await loader.load({ reload: true }); assert.equal(commits, 1); assert.equal(loader.getState(), 'ready');
  assert.equal(calls.length, 6); assert.ok(calls.slice(2).every(call => call.options.cache === 'reload'));
});

test('timeout aborts stalled requests and permits a fresh retry', async () => {
  let attempt = 0, commits = 0, signal;
  const loader = createMapGeometryLoader({ assets, timeoutMs: 5, fetchJson: async (_, options) => { signal = options.signal; return attempt ? 'ok' : new Promise(() => {}); }, apply() { commits++; } });
  await assert.rejects(loader.load(), /timed out/); assert.equal(signal.aborted, true); assert.equal(commits, 0);
  attempt++; await loader.load({ reload: true }); assert.equal(commits, 1);
});

test('closing a page prevents late geometry from changing the live map', async () => {
  const pending = deferred(); let commits = 0;
  const loader = createMapGeometryLoader({ assets, fetchJson: () => pending.promise, apply() { commits++; } });
  const flight = loader.load(); loader.destroy(); pending.resolve('late');
  await assert.rejects(flight, /cancelled/); assert.equal(commits, 0);
  await assert.rejects(loader.load(), /closed/);
});
