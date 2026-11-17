/** Global admission and issued-session registry. Never persists raw IP addresses. */
export const DRAW_ADMISSION_DAILY_LIMIT = 20;
export const DRAW_ADMISSION_IP_LIMIT = 3;
export const DRAW_ADMISSION_IP_WINDOW_MS = 10 * 60 * 1000;
export const DRAW_ADMISSION_SESSION_TTL_MS = 15 * 60 * 1000;
const DAY_MS = 86400000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const HASH = /^[0-9a-f]{64}$/;
const HEADERS = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
const json = (value, status = 200, headers = {}) => new Response(JSON.stringify(value), { status, headers: { ...HEADERS, ...headers } });
const unavailable = () => json({ error: 'Draw admission is unavailable. Existing local artwork is unchanged.' }, 503);
const exact = (value, key) => value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === 1 && Object.hasOwn(value, key);

class MemoryStorage {
  constructor() { this.values = new Map(); }
  async get(key) { return structuredClone(this.values.get(key)); }
  async put(key, value) { this.values.set(key, structuredClone(value)); }
  async deleteAll() { this.values.clear(); }
}

export class DrawAdmissionRoom {
  constructor(storage = new MemoryStorage(), { now = () => Date.now() } = {}) {
    this.storage = storage; this.now = now; this.tail = Promise.resolve();
  }
  async exclusive(work) {
    const previous = this.tail; let release;
    this.tail = new Promise(resolve => { release = resolve; });
    await previous;
    try { return await work(); } finally { release(); }
  }
  async admit(clientKey) {
    if (typeof clientKey !== 'string' || !HASH.test(clientKey)) return json({ error: 'Invalid admission identity.' }, 400);
    return this.exclusive(async () => {
      const now = this.now(), day = Math.floor(now / DAY_MS);
      const state = await this.storage.get('admission') || { day, count: 0, clients: {}, sessions: {} };
      if (state.day !== day) { state.day = day; state.count = 0; }
      for (const [key, times] of Object.entries(state.clients)) {
        state.clients[key] = times.filter(time => time > now - DRAW_ADMISSION_IP_WINDOW_MS);
        if (!state.clients[key].length) delete state.clients[key];
      }
      for (const [id, expiry] of Object.entries(state.sessions)) if (expiry <= now) delete state.sessions[id];
      const attempts = state.clients[clientKey] || [];
      if (state.count >= DRAW_ADMISSION_DAILY_LIMIT || attempts.length >= DRAW_ADMISSION_IP_LIMIT) {
        const resetAt = state.count >= DRAW_ADMISSION_DAILY_LIMIT ? (day + 1) * DAY_MS : attempts[0] + DRAW_ADMISSION_IP_WINDOW_MS;
        const retryAfterSeconds = Math.max(1, Math.ceil((resetAt - now) / 1000));
        return json({ error: state.count >= DRAW_ADMISSION_DAILY_LIMIT ? 'Today’s Draw connection limit has been reached.' : 'Too many Draw connections from this network. Try again later.', code: 'DRAW_ADMISSION_LIMIT', retryAfterSeconds }, 429, { 'Retry-After': String(retryAfterSeconds) });
      }
      const sessionId = crypto.randomUUID(), expiresAt = now + DRAW_ADMISSION_SESSION_TTL_MS;
      state.count += 1; state.clients[clientKey] = [...attempts, now]; state.sessions[sessionId] = expiresAt;
      // Schedule before persisting: failed scheduling never leaves an uncollectable reservation.
      await this.storage.setAlarm?.(Math.max((day + 1) * DAY_MS, expiresAt));
      await this.storage.put('admission', state);
      return json({ sessionId, expiresAt });
    });
  }
  async usage() {
    return this.exclusive(async () => {
      const serverNow = this.now(), day = Math.floor(serverNow / DAY_MS);
      const state = await this.storage.get('admission');
      // A previous day's record is treated as zero for display. Do not persist the
      // rollover here: admission itself remains the only operation that reserves quota.
      const dailyUsed = state?.day === day && Number.isInteger(state.count) && state.count >= 0
        ? Math.min(state.count, DRAW_ADMISSION_DAILY_LIMIT) : 0;
      return json({
        dailyLimit: DRAW_ADMISSION_DAILY_LIMIT,
        dailyUsed,
        dailyRemaining: DRAW_ADMISSION_DAILY_LIMIT - dailyUsed,
        resetsAt: (day + 1) * DAY_MS,
        serverNow,
        sessionDurationMs: DRAW_ADMISSION_SESSION_TTL_MS
      });
    });
  }
  async exists(sessionId) {
    if (typeof sessionId !== 'string' || !UUID.test(sessionId)) return json({ error: 'Draw session not found.' }, 404);
    return this.exclusive(async () => {
      const state = await this.storage.get('admission');
      return state?.sessions?.[sessionId] > this.now()
        ? json({ allowed: true, expiresAt: state.sessions[sessionId] }) : json({ error: 'Draw session not found or expired.' }, 404);
    });
  }
  async expire() {
    return this.exclusive(async () => {
      const state = await this.storage.get('admission');
      const until = state ? Math.max((state.day + 1) * DAY_MS, ...Object.values(state.sessions)) : 0;
      if (until > this.now()) { await this.storage.setAlarm?.(until); return; }
      await this.storage.deleteAll();
    });
  }
  async fetch(request) {
    try {
      if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);
      const text = await request.text();
      if (new TextEncoder().encode(text).byteLength > 512) return json({ error: 'Admission request too large.' }, 413);
      const body = JSON.parse(text), path = new URL(request.url).pathname;
      if (path === '/admit' && exact(body, 'clientKey')) return await this.admit(body.clientKey);
      if (path === '/exists' && exact(body, 'sessionId')) return await this.exists(body.sessionId);
      if (path === '/usage' && isEmptyRecord(body)) return await this.usage();
      return json({ error: 'Invalid admission request.' }, 400);
    } catch { return unavailable(); }
  }
}

function isEmptyRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === 0;
}

export class DrawAdmissionDO {
  constructor(state) { this.room = new DrawAdmissionRoom(state.storage); }
  fetch(request) { return this.room.fetch(request); }
  alarm() { return this.room.expire(); }
}
export class LocalDrawAdmission extends DrawAdmissionRoom {}

async function admissionFetch(env, path, body) {
  const request = new Request('https://draw-admission.internal' + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  try {
    if (env?.DRAW_SESSIONS) {
      if (!env.DRAW_ADMISSION) return unavailable();
      return await env.DRAW_ADMISSION.get(env.DRAW_ADMISSION.idFromName('draw-admission-v1')).fetch(request);
    }
    if (env?.ALLOW_LOCAL_ORIGIN === '1' && env?.LOCAL_DRAW_RELAY && env?.LOCAL_DRAW_ADMISSION) return await env.LOCAL_DRAW_ADMISSION.fetch(request);
  } catch { return unavailable(); }
  return unavailable();
}

export async function reserveDrawSession(request, env) {
  // This secret is server-only. Fail closed for live sessions without changing stateless MCP tools.
  if (typeof env?.DRAW_ADMISSION_SECRET !== 'string' || env.DRAW_ADMISSION_SECRET.length < 32) return unavailable();
  const address = env.DRAW_SESSIONS ? request.headers.get('cf-connecting-ip') : env.LOCAL_DRAW_IP;
  if (typeof address !== 'string' || !address || address.length > 64 || !/^[0-9a-fA-F:.]+$/.test(address)) return unavailable();
  try {
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(env.DRAW_ADMISSION_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(address));
    const clientKey = [...new Uint8Array(signature)].map(byte => byte.toString(16).padStart(2, '0')).join('');
    return await admissionFetch(env, '/admit', { clientKey });
  } catch { return unavailable(); }
}

export async function readDrawUsage(env) {
  // Keep public usage fail-closed when the same server-side admission configuration
  // needed to enforce the quota is unavailable.
  if (typeof env?.DRAW_ADMISSION_SECRET !== 'string' || env.DRAW_ADMISSION_SECRET.length < 32) return unavailable();
  const result = await admissionFetch(env, '/usage', {});
  if (!result.ok) return unavailable();
  try {
    const value = await result.clone().json();
    const fields = ['dailyLimit', 'dailyUsed', 'dailyRemaining', 'resetsAt', 'serverNow', 'sessionDurationMs'];
    if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length !== fields.length || fields.some(field => !Object.hasOwn(value, field)) ||
      value.dailyLimit !== DRAW_ADMISSION_DAILY_LIMIT || !Number.isInteger(value.dailyUsed) || value.dailyUsed < 0 || value.dailyUsed > value.dailyLimit ||
      value.dailyRemaining !== value.dailyLimit - value.dailyUsed || !Number.isFinite(value.resetsAt) || !Number.isFinite(value.serverNow) ||
      value.sessionDurationMs !== DRAW_ADMISSION_SESSION_TTL_MS) return unavailable();
    return json(value);
  } catch { return unavailable(); }
}

// Positive registry entries are immutable until expiry. This is not an authorization
// cache: browser/agent token, revoke, and operation checks always run in the session DO.
const admittedSessions = new WeakMap();
export async function checkDrawSessionAdmission(env, sessionId) {
  if (typeof env?.DRAW_ADMISSION_SECRET !== 'string' || env.DRAW_ADMISSION_SECRET.length < 32) return unavailable();
  const binding = env.DRAW_SESSIONS ? env.DRAW_ADMISSION : env.ALLOW_LOCAL_ORIGIN === '1' ? env.LOCAL_DRAW_ADMISSION : null;
  if (!binding || !['object', 'function'].includes(typeof binding)) return unavailable();
  const now = Date.now();
  let cache = admittedSessions.get(binding);
  if (!cache) { cache = new Map(); admittedSessions.set(binding, cache); }
  for (const [id, expiry] of cache) if (expiry <= now) cache.delete(id);
  if (cache.get(sessionId) > now) return json({ allowed: true, expiresAt: cache.get(sessionId) });
  const result = await admissionFetch(env, '/exists', { sessionId });
  if (result.ok) {
    try {
      const value = await result.clone().json();
      if (value.allowed !== true || !Number.isFinite(value.expiresAt) || value.expiresAt <= Date.now()) return unavailable();
      if (cache.size >= 40) cache.delete(cache.keys().next().value);
      cache.set(sessionId, value.expiresAt);
    } catch { return unavailable(); }
  }
  return result;
}
