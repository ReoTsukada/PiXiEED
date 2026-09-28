import test from 'node:test';
import assert from 'node:assert/strict';
import { createPuzzleHintController } from '../../js/creation/puzzle-hint.mjs';

function memoryStorage() {
  const values = new Map();
  return { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)), values };
}

test('the first visible hint is free, persists for the problem, then asks the common pass', async () => {
  const storage = memoryStorage(); let passRequests = 0; const shown = [];
  const hints = createPuzzleHintController({ perk: 'pixfind.hint', storage, requestPass: async ({ perk }) => { assert.equal(perk, 'pixfind.hint'); passRequests += 1; return true; } });
  hints.setProblem('pixfind:problem-1');
  assert.equal(await hints.request(async () => { shown.push(1); return true; }), true);
  assert.equal(hints.getState().freeUsed, true);
  assert.equal(await hints.request(async () => { shown.push(2); return true; }), true);
  assert.equal(passRequests, 1);
  assert.deepEqual(shown, [1, 2]);
  const afterReload = createPuzzleHintController({ perk: 'pixfind.hint', storage, requestPass: async () => false });
  afterReload.setProblem('pixfind:problem-1');
  assert.equal(afterReload.getState().freeUsed, true);
});

test('a failed or canceled hint does not consume the free allowance', async () => {
  const storage = memoryStorage(); const hints = createPuzzleHintController({ storage, requestPass: async () => false });
  hints.setProblem('jigsaw:game-1');
  assert.equal(await hints.request(async () => false), false);
  assert.equal(hints.getState().freeUsed, false);
  hints.setProblem('jigsaw:game-2');
  assert.equal(await hints.request(async () => true), true);
  assert.equal(hints.getState().freeUsed, true);
});

test('concurrent taps share one request and switching problems discards stale results', async () => {
  const storage = memoryStorage(); let unblock; let calls = 0;
  const hints = createPuzzleHintController({ storage, requestPass: async () => true });
  hints.setProblem('pixfind:old');
  const first = hints.request(() => new Promise((resolve) => { calls += 1; unblock = resolve; }));
  assert.equal(await hints.request(async () => { calls += 1; return true; }), false);
  hints.setProblem('pixfind:new');
  unblock(true);
  assert.equal(await first, false);
  assert.equal(hints.getState().freeUsed, false);
  assert.equal(calls, 1);
  assert.equal(await hints.request(async () => true), true);
  assert.equal(hints.getState().freeUsed, true);
});

test('a declined pass never displays a repeated hint', async () => {
  const storage = memoryStorage(); let displayed = 0;
  const hints = createPuzzleHintController({ storage, requestPass: async () => false });
  hints.setProblem('jigsaw:game');
  assert.equal(await hints.request(async () => true), true);
  assert.equal(await hints.request(async () => { displayed += 1; return true; }), false);
  assert.equal(displayed, 0);
});

test('the in-memory allowance still blocks repeat freebies when sessionStorage is unavailable', async () => {
  let passRequests = 0; let displayed = 0;
  const storage = { getItem() { throw new Error('storage blocked'); }, setItem() { throw new Error('storage blocked'); } };
  const hints = createPuzzleHintController({ storage, requestPass: async () => { passRequests += 1; return false; } });
  hints.setProblem('pixfind:local:problem:revision');
  assert.equal(await hints.request(async () => true), true);
  assert.equal(await hints.request(async () => { displayed += 1; return true; }), false);
  assert.equal(passRequests, 1);
  assert.equal(displayed, 0);
  assert.equal(hints.getState().freeUsed, true);
});

test('a revised local draft receives a separate free hint identity', async () => {
  const storage = memoryStorage(); const hints = createPuzzleHintController({ storage, requestPass: async () => false });
  hints.setProblem('pixfind:local:spot:draft-a:revision-1');
  assert.equal(await hints.request(async () => true), true);
  hints.setProblem('pixfind:local:spot:draft-a:revision-2');
  assert.equal(hints.getState().freeUsed, false);
  assert.equal(await hints.request(async () => true), true);
  hints.setProblem('pixfind:local:spot:draft-a:revision-1');
  assert.equal(hints.getState().freeUsed, true);
});
