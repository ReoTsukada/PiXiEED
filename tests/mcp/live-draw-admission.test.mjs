import test from 'node:test';
import assert from 'node:assert/strict';
import { DrawAdmissionRoom, DrawAdmissionDO, reserveDrawSession, DRAW_ADMISSION_DAILY_LIMIT, DRAW_ADMISSION_IP_WINDOW_MS } from '../../scripts/mcp/draw-session-admission.mjs';
import { relayFetch } from '../../scripts/mcp/draw-session-relay.mjs';
const secret = 'test-admission-secret-only-not-for-production';
const client = value => value.toString(16).padStart(64, '0');
const storage = () => {
  const values = new Map(); const alarms = [];
  return { values, alarms, async get(key) { return structuredClone(values.get(key)); }, async put(key, value) { values.set(key, structuredClone(value)); }, async deleteAll() { values.clear(); }, async setAlarm(time) { alarms.push(time); } };
};
function production(room) {
  let sessionCalls = 0;
  const keys = [];
  return {
    env: { DRAW_ADMISSION_SECRET: secret,
      DRAW_ADMISSION: { idFromName(name) { keys.push(name); return name; }, get() { return room; } },
      DRAW_SESSIONS: { idFromName(name) { sessionCalls++; return name; }, get() { return { fetch: async () => Response.json({ reached: true }) }; } } },
    get sessionCalls() { return sessionCalls; }, keys
  };
}
const incoming = (ip = '192.0.2.17') => new Request('https://worker.test/draw-sessions', { method: 'POST', headers: { 'cf-connecting-ip': ip } });

test('concurrent admissions enforce rolling IP limit and preserve it after reconstruction', async () => {
  let now = Date.UTC(2026, 10, 17, 12); const store = storage(); const room = new DrawAdmissionRoom(store, { now: () => now });
  const outcomes = await Promise.all(Array.from({ length: 12 }, () => room.admit(client(1))));
  assert.equal(outcomes.filter(r => r.status === 200).length, 3);
  assert.equal(outcomes.filter(r => r.status === 429).length, 9);
  assert.equal(outcomes.find(r => r.status === 429).headers.get('retry-after'), '600');
  const reopened = new DrawAdmissionRoom(store, { now: () => now });
  now += DRAW_ADMISSION_IP_WINDOW_MS - 1;
  assert.equal((await reopened.admit(client(1))).status, 429);
  now++;
  assert.equal((await reopened.admit(client(1))).status, 200);
  assert.equal((await store.get('admission')).count, 4);
});

test('global UTC daily admission is strict across concurrent clients; midnight does not reset rolling IP limit', async () => {
  let now = Date.UTC(2026, 10, 17, 23, 59); const store = storage(); const room = new DrawAdmissionRoom(store, { now: () => now });
  const results = await Promise.all(Array.from({ length: 50 }, (_, i) => room.admit(client(i + 1))));
  assert.equal(results.filter(r => r.status === 200).length, DRAW_ADMISSION_DAILY_LIMIT);
  const first = await results[0].json();
  assert.equal((await room.admit(client(99))).status, 429);
  now = Date.UTC(2026, 10, 18);
  assert.equal((await room.exists(first.sessionId)).status, 200);
  assert.equal((await room.admit(client(1))).status, 200);
  assert.equal((await room.admit(client(1))).status, 200);
  assert.equal((await room.admit(client(1))).status, 429);
  assert.equal((await store.get('admission')).count, 2);
});

test('usage is a read-only UTC quota snapshot for empty, active, exhausted, and rolled-over days', async () => {
  let now = Date.UTC(2026, 10, 17, 12); const store = storage(); const room = new DrawAdmissionRoom(store, { now: () => now });
  const before = await room.fetch(new Request('https://admission.test/usage', { method: 'POST', body: '{}' }));
  assert.deepEqual(await before.json(), { dailyLimit: 40, dailyUsed: 0, dailyRemaining: 40, resetsAt: Date.UTC(2026, 10, 18), serverNow: now, sessionDurationMs: 300000 });
  assert.equal(store.values.size, 0, 'reading usage does not initialize or persist counters');
  for (let i = 0; i < DRAW_ADMISSION_DAILY_LIMIT; i++) await room.admit(client(i + 1));
  const exhausted = await room.usage();
  assert.deepEqual(await exhausted.json(), { dailyLimit: 40, dailyUsed: 40, dailyRemaining: 0, resetsAt: Date.UTC(2026, 10, 18), serverNow: now, sessionDurationMs: 300000 });
  const persistedBeforeReads = structuredClone(await store.get('admission'));
  for (let i = 0; i < 3; i++) await room.usage();
  assert.deepEqual(await store.get('admission'), persistedBeforeReads, 'repeated usage reads do not reserve or alter session state');
  now = Date.UTC(2026, 10, 18);
  const rolled = await room.usage();
  assert.deepEqual(await rolled.json(), { dailyLimit: 40, dailyUsed: 0, dailyRemaining: 40, resetsAt: Date.UTC(2026, 10, 19), serverNow: now, sessionDurationMs: 300000 });
  assert.deepEqual(await store.get('admission'), persistedBeforeReads, 'displaying rollover does not write or touch TTLs');
});

test('plain IP is HMACed before admission transport and never appears in persisted state', async () => {
  const store = storage(); const room = new DrawAdmissionRoom(store); const prod = production(room);
  const sent = [];
  const fetch = room.fetch.bind(room); room.fetch = request => { sent.push(request.clone()); return fetch(request); };
  const response = await reserveDrawSession(incoming(), prod.env);
  assert.equal(response.status, 200);
  const wire = await sent[0].text();
  assert.match(JSON.parse(wire).clientKey, /^[a-f0-9]{64}$/);
  assert.equal(wire.includes('192.0.2.17'), false);
  assert.equal(JSON.stringify([...store.values]).includes('192.0.2.17'), false);
  assert.deepEqual(new Set(prod.keys), new Set(['draw-admission-v1']));
});

test('unknown random sessions never instantiate a session DO; only issued unexpired sessions pass', async t => {
  let now = Date.now(); t.mock.method(Date, 'now', () => now); const room = new DrawAdmissionRoom(storage(), { now: () => now }); const prod = production(room);
  const unknown = await Promise.all(Array.from({ length: 20 }, () => relayFetch(prod.env, crypto.randomUUID(), '/commands')));
  assert.ok(unknown.every(r => r.status === 404)); assert.equal(prod.sessionCalls, 0);
  const created = await (await room.admit(client(1))).json();
  assert.equal((await relayFetch(prod.env, created.sessionId, '/commands')).status, 200);
  assert.equal(prod.sessionCalls, 1);
  const checksAfterFirst = prod.keys.length;
  assert.equal((await relayFetch(prod.env, created.sessionId, '/commands')).status, 200);
  assert.equal(prod.keys.length, checksAfterFirst, 'positive registry cache avoids a second admission DO request');
  assert.equal(prod.sessionCalls, 2, 'real session authorization is never bypassed');
  now = created.expiresAt;
  assert.equal((await relayFetch(prod.env, created.sessionId, '/commands')).status, 404);
  assert.equal(prod.sessionCalls, 2);
});

test('missing configuration, missing client IP, admission errors, and failed cleanup scheduling fail closed before session creation', async () => {
  const room = new DrawAdmissionRoom(); const prod = production(room);
  for (const override of [{ DRAW_ADMISSION_SECRET: undefined }, { DRAW_ADMISSION_SECRET: 'short' }, { DRAW_ADMISSION: undefined }]) {
    const env = { ...prod.env, ...override };
    assert.equal((await reserveDrawSession(incoming(), env)).status, 503);
    assert.equal((await relayFetch(env, crypto.randomUUID(), '/commands')).status, 503);
  }
  assert.equal((await reserveDrawSession(new Request('https://worker.test'), prod.env)).status, 503);
  const failure = { ...prod.env, DRAW_ADMISSION: { idFromName: () => 'fixed', get: () => ({ fetch: async () => { throw Error('unavailable'); } }) } };
  assert.equal((await reserveDrawSession(incoming(), failure)).status, 503);
  const store = storage(); store.setAlarm = async () => { throw Error('alarm unavailable'); };
  const failed = new DrawAdmissionDO({ storage: store });
  const result = await failed.fetch(new Request('https://admission.test/admit', { method: 'POST', body: JSON.stringify({ clientKey: client(1) }) }));
  assert.equal(result.status, 503); assert.equal(store.values.size, 0);
  assert.equal(prod.sessionCalls, 0);
});

test('expiry cleanup retains daily counters until UTC reset and removes all keys including orphans afterwards', async () => {
  let now = Date.UTC(2026, 10, 17, 12); const store = storage(); const room = new DrawAdmissionRoom(store, { now: () => now });
  await room.admit(client(1)); await store.put('orphan', { value: 'leftover' });
  now += 16 * 60 * 1000; await room.expire(); assert.ok(store.values.size > 0);
  now = Date.UTC(2026, 10, 18); await room.expire(); assert.equal(store.values.size, 0);
});
