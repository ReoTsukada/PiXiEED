import test from 'node:test';
import assert from 'node:assert/strict';
import { createDrawLiveSession } from '../../js/creation/draw-live-session.mjs';
const tick = () => new Promise(resolve => setImmediate(resolve));
const defer = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
function rig(extra = {}) {
  const timers = new Map(); let id = 0, time = 1000, count = 0;
  const binding = { projectId: 'test-project', openEpoch: 1 };
  const calls = [], views = [], queue = [], acknowledgements = [];
  const draw = { workspace: { ready: Promise.resolve(), save: async () => {} }, getAgentState: () => ({ projectBinding: { ...binding }, revision: 1, busy: false }), executeAgentOperation: async () => { count++; return { changed: true }; }, ...extra.draw };
  const fetchImpl = async (url, options) => {
    calls.push({ url, ...options });
    if (extra.fetch) { const value = await extra.fetch(url, options); if (value) return value; }
    if (options.method === 'DELETE') return Response.json({ revoked: true });
    if (url.endsWith('/draw-sessions') || url.endsWith('/draw-store-sessions')) return Response.json({ sessionId: 'session', browserToken: 'browser-secret', pairingCode: 'code', expiresAt: 11000 });
    if (url.endsWith('/result')) { acknowledgements.push(JSON.parse(options.body)); return Response.json({ accepted: true }); }
    return Response.json({ connected: true, commands: queue.splice(0), expiresAt: 11000 });
  };
  const client = createDrawLiveSession({ draw, endpoint: 'http://localhost:4290/mcp', onChange: v => views.push(v), fetchImpl, now: () => time,
    schedule: (fn, ms) => { timers.set(++id, { fn, ms }); return id; }, cancel: id => timers.delete(id) });
  return { client, calls, views, queue, binding, draw, acknowledgements, timers, get count() { return count; }, setTime: value => { time = value; }, async runPoll() { const row = [...timers].find(([,x]) => x.ms === 500); if (row) { timers.delete(row[0]); row[1].fn(); await tick(); } } };
}
const command = binding => ({ commandId: 'cmd', requestId: 'request', deadlineAt: 10000, kind: 'operation', expectedRevision: 1, projectBinding: binding, operation: { type: 'undo' } });
test('explicit stop during workspace readiness cannot later save or create a session', async () => {
  const ready = defer(); let saves = 0;
  const r = rig({ draw: { workspace: { ready: ready.promise, save: async () => { saves++; } } } });
  const started = r.client.start(); await r.client.stop(); ready.resolve(); await started;
  assert.equal(r.client.getState().phase, 'idle'); assert.equal(saves, 0); assert.equal(r.calls.length, 0);
});
test('OAuth mode creates a store session with only the selected project binding and keeps chat instructions code-free', async () => {
  const r = rig({ draw: { getAgentState: () => ({ projectBinding: { projectId: 'test-project', openEpoch: 1 }, revision: 1, busy: false, projectName: 'not an agent-state field' }) } });
  await r.client.start({ mode: 'oauth' });
  await tick();
  const create = r.calls.find(call => call.method === 'POST' && call.url.endsWith('/draw-store-sessions'));
  assert.ok(create, 'OAuth mode should use the store session endpoint');
  assert.deepEqual(JSON.parse(create.body), { projectBinding: { projectId: 'test-project', openEpoch: 1 } });
  const waiting = r.views.find(state => state.phase === 'waiting' && state.mode === 'oauth');
  assert.ok(waiting); assert.equal(waiting.pairingCode, 'code');
  assert.match(waiting.message, /接続許可画面/);
  assert.match(waiting.message, /チャット本文には貼りません/);
  assert.doesNotMatch(waiting.message, /code|secret/i);
  await r.client.stop();
});
test('default start remains the legacy session flow', async () => {
  const r = rig();
  await r.client.start();
  assert.ok(r.calls.some(call => call.method === 'POST' && call.url.endsWith('/draw-sessions')));
  assert.equal(r.calls.some(call => call.url.endsWith('/draw-store-sessions')), false);
  await r.client.stop();
});
test('stop while obsolete revoke hangs does not resurrect a connection', async () => {
  const deletion = defer(); const r = rig({ fetch: (url, opts) => opts.method === 'DELETE' ? deletion.promise : null });
  await r.client.start(); await tick(); const restart = r.client.start(); const stopped = r.client.stop();
  deletion.resolve(Response.json({ revoked: true })); await Promise.all([restart, stopped]); await tick();
  assert.equal(r.client.getState().phase, 'idle');
});
test('lost result acknowledgement is retried without a second edit', async () => {
  let failed = false;
  const r = rig({ fetch: (url) => { if (url.endsWith('/result') && !failed) { failed = true; throw new TypeError('network'); } } });
  r.queue.push(command(r.binding)); await r.client.start(); await tick(); assert.equal(r.count, 1);
  await r.runPoll(); assert.equal(r.count, 1); assert.equal(r.acknowledgements.length, 1);
  await r.client.stop();
});
test('completed operation with unavailable snapshot reports unknown, never not_applied', async () => {
  let applied = false; const r = rig(); const normal = r.draw.getAgentState;
  r.draw.getAgentState = () => { if (applied) throw new Error('snapshot failure'); return normal(); };
  r.draw.executeAgentOperation = async () => { applied = true; return { changed: true }; };
  r.queue.push(command(r.binding)); await r.client.start(); await tick();
  assert.equal(r.acknowledgements[0].status, 'unknown'); await r.client.stop();
});
test('independent deadline clears credentials and connected view while polling hangs', async () => {
  const pending = defer(); const r = rig({ fetch: url => url.endsWith('/commands') ? pending.promise : null });
  await r.client.start(); const expiry = [...r.timers.values()].find(x => x.ms === 10000);
  assert.ok(expiry); r.setTime(11001); expiry.fn(); await tick();
  assert.equal(r.client.getState().phase, 'idle'); assert.equal(r.client.getState().pairingCode, '');
  pending.resolve(Response.json({ connected: true, commands: [] })); await tick(); assert.equal(r.client.getState().phase, 'idle');
});
test('same-project reopen stops before delivered commands execute', async () => {
  const r = rig(); await r.client.start(); await tick(); r.binding.openEpoch = 2;
  r.queue.push(command({ projectId: 'test-project', openEpoch: 1 }));
  await r.runPoll();
  assert.equal(r.client.getState().phase, 'idle'); assert.equal(r.count, 0);
  assert.equal(r.acknowledgements.length, 0);
});

test('expired commands never reach the adapter', async () => {
  const r = rig(); r.queue.push({ ...command(r.binding), deadlineAt: 999 });
  await r.client.start(); await tick(); assert.equal(r.count, 0);
  assert.equal(r.acknowledgements[0].status, 'not_applied'); await r.client.stop();
});
test('admission rate limit is shown clearly and does not retry automatically', async () => {
  let attempts = 0;
  const r = rig({ fetch: (url, opts) => {
    if (url.endsWith('/draw-sessions') && opts.method === 'POST') {
      attempts += 1;
      return Response.json({ code: 'DRAW_ADMISSION_LIMIT', retryAfterSeconds: 600 }, { status: 429 });
    }
    return null;
  }});
  await assert.rejects(r.client.start(), /接続回数の上限/);
  assert.equal(r.client.getState().phase, 'error');
  assert.match(r.client.getState().message, /約600秒後/);
  await tick();
  assert.equal(attempts, 1);
});

test('agent disconnect stops an already connected browser session', async () => {
  let connected = true; const r = rig({ fetch: url => url.endsWith('/commands') ? Response.json({ connected, commands: [] }) : null });
  await r.client.start(); await tick(); assert.equal(r.client.getState().phase, 'connected');
  connected = false; await r.runPoll(); assert.equal(r.client.getState().phase, 'idle');
});
