import test from 'node:test';
import assert from 'node:assert/strict';
import { createPuzzleHintController, jigsawPuzzleHintKey } from '../../js/creation/puzzle-hint.mjs';

function memoryStorage(seed = []) {
  const values = new Map(seed);
  return { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)), values };
}

function rewardGate() {
  let active = false; let enabled = true; let requests = 0; const listeners = new Set();
  return {
    isActive: () => active,
    isEnabled: () => enabled,
    require(feature) { assert.equal(feature, 'puzzle.hint'); requests += 1; return active; },
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    set({ isActive = active, isEnabled = enabled } = {}) { active = isActive; enabled = isEnabled; for (const listener of listeners) listener(); },
    get requests() { return requests; }
  };
}

function controller(storage, gate, onState = () => {}) {
  return createPuzzleHintController({
    storage, feature: 'puzzle.hint', requireReward: (feature) => gate.require(feature),
    hasReward: () => gate.isActive(), isRewardPolicyEnabled: () => gate.isEnabled(),
    subscribeReward: (listener) => gate.subscribe(listener), onState
  });
}

test('one free hint is retained per stable puzzle identity across reload and restart', async () => {
  const storage = memoryStorage(); const gate = rewardGate(); let shown = 0;
  const firstRun = controller(storage, gate); firstRun.setProblem('pixfind:public:spot:puzzle-1');
  assert.equal(firstRun.getState().freeRemaining, 1);
  assert.equal(await firstRun.request(async () => { shown += 1; return true; }), true);
  assert.equal(firstRun.getState().freeRemaining, 0);
  assert.equal(await firstRun.request(async () => { shown += 1; return true; }), false);
  assert.equal(shown, 1); assert.equal(gate.requests, 1);
  const afterReload = controller(storage, gate); afterReload.setProblem('pixfind:public:spot:puzzle-1');
  assert.equal(afterReload.getState().freeRemaining, 0);
  assert.equal(await afterReload.request(async () => { shown += 1; return true; }), false);
  assert.equal(shown, 1);
  afterReload.setProblem('pixfind:public:spot:puzzle-2');
  assert.equal(afterReload.getState().freeRemaining, 1);
});

test('reward hints are admitted only while active; expiry and renewal retain puzzle progress and hint count', async () => {
  const storage = memoryStorage(); const gate = rewardGate(); let shown = 0; let gameProgress = 4;
  const hints = controller(storage, gate); hints.setProblem('jigsaw:game-id-7');
  assert.equal(await hints.request(async () => { shown += 1; return true; }), true);
  assert.equal(await hints.request(async () => { shown += 1; return true; }), false);
  gate.set({ isActive: true });
  assert.equal(hints.getState().rewardActive, true);
  assert.equal(await hints.request(async () => { shown += 1; return true; }), true);
  gameProgress = 5;
  gate.set({ isActive: false });
  assert.equal(hints.getState().rewardActive, false);
  assert.equal(hints.getState().usedCount, 2);
  assert.equal(await hints.request(async () => { shown += 1; return true; }), false);
  assert.equal(gameProgress, 5); assert.equal(shown, 2);
  gate.set({ isActive: true });
  assert.equal(await hints.request(async () => { shown += 1; return true; }), true);
  assert.equal(gameProgress, 5); assert.equal(shown, 3);
});

test('disabled reward policy preserves unlimited legacy hints and shows that state', async () => {
  const storage = memoryStorage(); const gate = rewardGate(); let latest;
  gate.set({ isEnabled: false });
  const hints = controller(storage, gate, (state) => { latest = state; }); hints.setProblem('pixfind:local:hidden:draft:r1');
  assert.equal(latest.policyEnabled, false);
  assert.equal(await hints.request(async () => true), true);
  assert.equal(await hints.request(async () => true), true);
  assert.equal(gate.requests, 0);
});

test('failed or canceled hints do not consume allowance and stale async results are discarded', async () => {
  const storage = memoryStorage(); const gate = rewardGate(); const hints = controller(storage, gate);
  hints.setProblem('jigsaw:game-1');
  assert.equal(await hints.request(async () => false), false);
  assert.equal(hints.getState().freeRemaining, 1);
  let unblock;
  const first = hints.request(() => new Promise((resolve) => { unblock = resolve; }));
  assert.equal(await hints.request(async () => true), false);
  hints.setProblem('jigsaw:game-2'); unblock(true);
  assert.equal(await first, false);
  assert.equal(hints.getState().freeRemaining, 1);
  assert.equal(await hints.request(async () => true), true);
  assert.equal(hints.getState().freeRemaining, 0);
});

test('storage failures still enforce the one free hint for the active page session', async () => {
  const storage = { getItem() { throw new Error('storage blocked'); }, setItem() { throw new Error('storage blocked'); } };
  const gate = rewardGate(); const hints = controller(storage, gate); hints.setProblem('pixfind:local:spot:draft-a:r1');
  assert.equal(await hints.request(async () => true), true);
  assert.equal(hints.getState().freeRemaining, 0);
  assert.equal(await hints.request(async () => true), false);
});

test('legacy used marker migrates without granting another free hint', () => {
  const storage = memoryStorage([['pixieed:puzzle-hint:v1:jigsaw:legacy-id', 'used']]);
  const hints = controller(storage, rewardGate()); hints.setProblem('jigsaw:legacy-id');
  assert.equal(hints.getState().freeRemaining, 0);
});

test('jigsaw restarts of the same source and cut retain quota while changed content gets a new identity', () => {
  const base = { gameId: 'game-a', source: { type: 'file', fingerprint: 'sha256:abc' }, layout: { width: 32, height: 32, columns: 4, rows: 4, pieceSize: 8 } };
  assert.equal(jigsawPuzzleHintKey(base), jigsawPuzzleHintKey({ ...base, gameId: 'game-b' }));
  assert.notEqual(jigsawPuzzleHintKey(base), jigsawPuzzleHintKey({ ...base, source: { ...base.source, fingerprint: 'sha256:def' } }));
  assert.notEqual(jigsawPuzzleHintKey(base), jigsawPuzzleHintKey({ ...base, layout: { ...base.layout, columns: 2, rows: 2, pieceSize: 16 } }));
});
