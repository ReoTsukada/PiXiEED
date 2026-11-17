import { checkDrawSessionAdmission, DRAW_ADMISSION_SESSION_TTL_MS } from './draw-session-admission.mjs';
const JSON_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff'
};

export const DRAW_SESSION_TTL_MS = DRAW_ADMISSION_SESSION_TTL_MS;
export const DRAW_PAIRING_TTL_MS = 2 * 60 * 1000;
export const DRAW_MAX_REQUESTS = 512;
export const DRAW_MAX_QUEUE = 8;
export const DRAW_MAX_RESULT_BYTES = 512 * 1024;

const idPattern = /^[A-Za-z0-9_-]{1,128}$/;
const requestIdPattern = /^[A-Za-z0-9_-]{8,100}$/;
const hexColorPattern = /^#[0-9A-Fa-f]{6}(?:[0-9A-Fa-f]{2})?$/;

function response(value, status = 200, headers = {}) {
  return new Response(value === null ? null : JSON.stringify(value), {
    status,
    headers: new Headers({ ...JSON_HEADERS, ...headers })
  });
}

function errorResponse(message, status = 400) {
  return response({ error: message }, status);
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function exactKeys(value, allowed, required = []) {
  return isRecord(value) && Object.keys(value).every(key => allowed.includes(key)) && required.every(key => Object.hasOwn(value, key));
}

function validOpaqueId(value) {
  return typeof value === 'string' && value.length <= 128 && idPattern.test(value);
}

export function validProjectBinding(value) {
  return exactKeys(value, ['projectId', 'openEpoch'], ['projectId', 'openEpoch']) &&
    validOpaqueId(value.projectId) && validOpaqueId(value.openEpoch);
}

function validInt(value, min, max) {
  return Number.isInteger(value) && value >= min && value <= max;
}

function validColorAdjustSettings(settings) {
  if (!isRecord(settings) || Object.keys(settings).some(key => !['brightness', 'contrast', 'saturation', 'curve', 'paletteMode'].includes(key))) return false;
  if (Object.hasOwn(settings, 'brightness') && !validInt(settings.brightness, -100, 100)) return false;
  if (Object.hasOwn(settings, 'contrast') && !validInt(settings.contrast, -100, 100)) return false;
  if (Object.hasOwn(settings, 'saturation') && !validInt(settings.saturation, 0, 200)) return false;
  if (Object.hasOwn(settings, 'curve') && (!Array.isArray(settings.curve) || settings.curve.length !== 5 || !settings.curve.every(value => validInt(value, 0, 255)))) return false;
  if (Object.hasOwn(settings, 'paletteMode') && !['exact', 'nearest'].includes(settings.paletteMode)) return false;
  return Object.keys(settings).length > 0;
}

function validOperation(operation) {
  if (!isRecord(operation) || typeof operation.type !== 'string') return false;
  const ids = (...values) => values.every(validOpaqueId);
  switch (operation.type) {
    case 'pixel.set':
      return exactKeys(operation, ['type', 'frameId', 'layerId', 'x', 'y', 'colorIndex'], ['type', 'frameId', 'layerId', 'x', 'y', 'colorIndex']) &&
        ids(operation.frameId, operation.layerId) && validInt(operation.x, 0, 65535) && validInt(operation.y, 0, 65535) &&
        (operation.colorIndex === null || validInt(operation.colorIndex, 0, 127));
    case 'pixels.set': {
      if (!exactKeys(operation, ['type', 'frameId', 'layerId', 'pixels'], ['type', 'frameId', 'layerId', 'pixels']) || !ids(operation.frameId, operation.layerId) || !Array.isArray(operation.pixels) || operation.pixels.length < 1 || operation.pixels.length > 512) return false;
      const coordinates = new Set();
      for (const pixel of operation.pixels) {
        if (!exactKeys(pixel, ['x', 'y', 'colorIndex'], ['x', 'y', 'colorIndex']) || !validInt(pixel.x, 0, 65535) || !validInt(pixel.y, 0, 65535) || (pixel.colorIndex !== null && !validInt(pixel.colorIndex, 0, 127))) return false;
        const key = `${pixel.x},${pixel.y}`;
        if (coordinates.has(key)) return false;
        coordinates.add(key);
      }
      return true;
    }
    case 'palette.add':
      return exactKeys(operation, ['type', 'color'], ['type', 'color']) && typeof operation.color === 'string' && hexColorPattern.test(operation.color);
    case 'color.adjust':
      return exactKeys(operation, ['type', 'scope', 'frameId', 'layerId', 'settings'], ['type', 'scope', 'frameId', 'layerId', 'settings']) &&
        ['cel', 'whole'].includes(operation.scope) && ids(operation.frameId, operation.layerId) && validColorAdjustSettings(operation.settings);
    case 'layer.select': case 'layer.remove':
      return exactKeys(operation, ['type', 'layerId'], ['type', 'layerId']) && ids(operation.layerId);
    case 'layer.add':
      return exactKeys(operation, ['type', 'name', 'visible', 'locked'], ['type']) &&
        (operation.name === undefined || (typeof operation.name === 'string' && operation.name.length <= 80)) &&
        (operation.visible === undefined || typeof operation.visible === 'boolean') &&
        (operation.locked === undefined || typeof operation.locked === 'boolean');
    case 'layer.rename':
      return exactKeys(operation, ['type', 'layerId', 'name'], ['type', 'layerId', 'name']) && ids(operation.layerId) && typeof operation.name === 'string' && operation.name.length <= 80;
    case 'layer.visibility': case 'layer.lock':
      return exactKeys(operation, ['type', 'layerId', operation.type === 'layer.lock' ? 'locked' : 'visible'], ['type', 'layerId', operation.type === 'layer.lock' ? 'locked' : 'visible']) && ids(operation.layerId) && typeof operation[operation.type === 'layer.lock' ? 'locked' : 'visible'] === 'boolean';
    case 'layer.opacity':
      return exactKeys(operation, ['type', 'layerId', 'opacity'], ['type', 'layerId', 'opacity']) && ids(operation.layerId) && typeof operation.opacity === 'number' && Number.isFinite(operation.opacity) && operation.opacity >= 0 && operation.opacity <= 1;
    case 'layer.move':
      return exactKeys(operation, ['type', 'layerId', 'index'], ['type', 'layerId', 'index']) && ids(operation.layerId) && validInt(operation.index, 0, 127);
    case 'frame.select': case 'frame.remove':
      return exactKeys(operation, ['type', 'frameId'], ['type', 'frameId']) && ids(operation.frameId);
    case 'frame.add':
      return exactKeys(operation, ['type', 'sourceFrameId', 'copy'], ['type']) &&
        (operation.sourceFrameId === undefined || ids(operation.sourceFrameId)) && (operation.copy === undefined || typeof operation.copy === 'boolean');
    case 'frame.duration':
      return exactKeys(operation, ['type', 'frameId', 'durationMs'], ['type', 'frameId', 'durationMs']) && ids(operation.frameId) && validInt(operation.durationMs, 1, 60000);
    case 'frame.move':
      return exactKeys(operation, ['type', 'frameId', 'index'], ['type', 'frameId', 'index']) && ids(operation.frameId) && validInt(operation.index, 0, 127);
    case 'undo': case 'redo': case 'save':
      return exactKeys(operation, ['type'], ['type']);
    default: return false;
  }
}

export function validDrawSessionCommand(command) {
  if (!isRecord(command) || typeof command.kind !== 'string' || !validProjectBinding(command.projectBinding)) return false;
  if (command.kind === 'state.get') {
    return exactKeys(command, ['kind', 'projectBinding', 'stateRequest'], ['kind', 'projectBinding']) &&
      (command.stateRequest === undefined || (exactKeys(command.stateRequest, ['frameId', 'layerId']) &&
        (command.stateRequest.frameId === undefined || validOpaqueId(command.stateRequest.frameId)) &&
        (command.stateRequest.layerId === undefined || validOpaqueId(command.stateRequest.layerId))));
  }
  return command.kind === 'operation' &&
    exactKeys(command, ['kind', 'projectBinding', 'expectedRevision', 'operation'], ['kind', 'projectBinding', 'expectedRevision', 'operation']) &&
    validInt(command.expectedRevision, 0, Number.MAX_SAFE_INTEGER) && validOperation(command.operation);
}

function bindCommandToSession(command, projectBinding) {
  if (!isRecord(command) || Object.hasOwn(command, 'projectBinding')) return null;
  const bound = { ...command, projectBinding };
  return validDrawSessionCommand(bound) ? bound : null;
}

function normalizePairingCode(value) {
  if (typeof value !== 'string' || value.length > 180) return null;
  const match = value.match(/^([0-9a-f-]{36})\.([A-Za-z0-9_-]{43})$/i);
  return match ? { sessionId: match[1].toLowerCase(), secret: match[2] } : null;
}

function bytesToBase64Url(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function randomToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return bytesToBase64Url(bytes);
}

async function hashToken(token) {
  const data = new TextEncoder().encode(token);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

function constantTimeEqual(left, right) {
  if (typeof left !== 'string' || typeof right !== 'string') return false;
  let mismatch = left.length ^ right.length;
  const length = Math.max(left.length, right.length);
  for (let i = 0; i < length; i += 1) mismatch |= (left.charCodeAt(i) || 0) ^ (right.charCodeAt(i) || 0);
  return mismatch === 0;
}

async function readJson(request, maxBytes = 32 * 1024) {
  const declared = request.headers.get('content-length');
  if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > maxBytes)) throw Object.assign(new Error('Request body too large.'), { status: 413 });
  const reader = request.body?.getReader();
  if (!reader) throw Object.assign(new Error('Request body required.'), { status: 400 });
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        throw Object.assign(new Error('Request body too large.'), { status: 413 });
      }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
  catch { throw Object.assign(new Error('Invalid JSON.'), { status: 400 }); }
}

function bearerToken(request) {
  const header = request.headers.get('authorization') || '';
  const match = header.match(/^Bearer ([A-Za-z0-9_-]{43})$/);
  return match?.[1] || null;
}

function parseJsonMaybe(value) {
  return JSON.stringify(value);
}

function safeClone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function sameBinding(left, right) {
  return isRecord(left) && isRecord(right) && left.projectId === right.projectId && left.openEpoch === right.openEpoch;
}

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (isRecord(value)) return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}

async function digest(value) {
  const bytes = new TextEncoder().encode(canonical(value));
  const out = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(out)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

class MemoryStorage {
  constructor() { this.values = new Map(); }
  async get(key) { return safeClone(this.values.get(key)); }
  async put(key, value) { this.values.set(key, safeClone(value)); }
  async delete(key) { return this.values.delete(key); }
  async deleteAll() { this.values.clear(); }
}

export class DrawSessionRoom {
  constructor(storage = new MemoryStorage(), { now = () => Date.now() } = {}) {
    this.storage = storage;
    this.now = now;
    this.tail = Promise.resolve();
  }

  async exclusive(task) {
    const previous = this.tail;
    let release;
    this.tail = new Promise(resolve => { release = resolve; });
    await previous;
    try { return await task(); }
    finally { release(); }
  }

  async load() { return await this.storage.get('session') || null; }
  async save(state) { await this.storage.put('session', state); }
  async loadDetail(requestId) { return await this.storage.get(`request:${requestId}`) || { command: null, result: null }; }
  async saveDetail(requestId, detail) { await this.storage.put(`request:${requestId}`, detail); }

  async route(request) {
    const url = new URL(request.url);
    try {
      if (url.pathname === '/_relay/create' && request.method === 'POST') return await this.create(await readJson(request));
      if (url.pathname === '/_relay/connect' && request.method === 'POST') return await this.connect(await readJson(request));
      if (url.pathname === '/_relay/store-claim' && request.method === 'POST') return await this.storeClaim(await readJson(request));
      if (url.pathname === '/_relay/store-activate' && request.method === 'POST') return await this.storeActivate(await readJson(request));
      if (url.pathname === '/_relay/status' && request.method === 'GET') return await this.status(request);
      if (url.pathname === '/_relay/command' && request.method === 'POST') return await this.enqueue(request, await readJson(request));
      if (url.pathname.startsWith('/_relay/command/') && request.method === 'GET') return await this.getRequest(request, decodeURIComponent(url.pathname.slice('/_relay/command/'.length)));
      if (url.pathname === '/_relay/disconnect' && request.method === 'POST') return await this.disconnect(request);
      if (url.pathname === '/_relay/revoke' && request.method === 'POST') return await this.revoke(request);
      if (url.pathname === '/commands' && request.method === 'GET') return await this.poll(request);
      const resultMatch = url.pathname.match(/^\/commands\/([0-9a-f-]{36})\/result$/i);
      if (resultMatch && request.method === 'POST') return await this.ack(request, resultMatch[1], await readJson(request, DRAW_MAX_RESULT_BYTES));
      if (url.pathname === '/revoke' && request.method === 'DELETE') return await this.browserRevoke(request);
      if (request.method === 'GET' && url.pathname === '/alarm-expire') return await this.expire();
      return errorResponse('Not found.', 404);
    } catch (error) {
      return errorResponse(error?.message || 'Invalid relay request.', error?.status || 500);
    }
  }

  async create(body) {
    return this.exclusive(async () => {
      if (!exactKeys(body, ['sessionId', 'projectBinding', 'mode', 'projectName'], ['sessionId', 'projectBinding']) || typeof body.sessionId !== 'string' || !/^[0-9a-f-]{36}$/i.test(body.sessionId) || !validProjectBinding(body.projectBinding) || (body.mode !== undefined && !['legacy', 'oauth'].includes(body.mode)) || (body.mode !== 'oauth' && Object.hasOwn(body, 'projectName')) || (body.projectName !== undefined && (typeof body.projectName !== 'string' || !body.projectName.trim() || body.projectName.trim().length > 120))) return errorResponse('Invalid session request.', 400);
      if (await this.load()) return errorResponse('Session already exists.', 409);
      const now = this.now();
      const browserToken = randomToken();
      const pairingSecret = randomToken();
      const state = {
        sessionId: body.sessionId,
        mode: body.mode || 'legacy',
        ...(body.projectName !== undefined ? { projectName: body.projectName.trim() } : {}),
        projectBinding: body.projectBinding,
        browserTokenHash: await hashToken(browserToken),
        pairingHash: await hashToken(pairingSecret),
        pairExpiresAt: now + DRAW_PAIRING_TTL_MS,
        claimBindingHash: null,
        claimExpiresAt: null,
        authFingerprint: null,
        agentTokenHash: null,
        expiresAt: now + DRAW_SESSION_TTL_MS,
        revoked: false,
        queue: [],
        requests: {},
        requestOrder: []
      };
      await this.save(state);
      return response({ sessionId: state.sessionId, browserToken, pairingCode: `${state.sessionId}.${pairingSecret}`, projectBinding: state.projectBinding, expiresAt: state.expiresAt });
    });
  }

  async connect(body) {
    return this.connectByMode(body, 'legacy');
  }

  async storeClaim(body) {
    return this.exclusive(async () => {
      const state = await this.load();
      if (!state || state.revoked || this.now() >= state.expiresAt) return errorResponse('Session expired or revoked.', 410);
      if ((state.mode || 'legacy') !== 'oauth') return errorResponse('Session mode does not permit this claim flow.', 403);
      if (!exactKeys(body, ['secret', 'claimBinding', 'authFingerprint'], ['secret', 'claimBinding', 'authFingerprint']) || typeof body.secret !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(body.secret) || typeof body.claimBinding !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(body.claimBinding) || typeof body.authFingerprint !== 'string' || !/^[a-f0-9]{64}$/.test(body.authFingerprint)) return errorResponse('Invalid Store claim.', 400);
      if (!state.pairingHash || this.now() >= state.pairExpiresAt || !constantTimeEqual(await hashToken(body.secret), state.pairingHash)) return errorResponse('Pairing code is invalid, expired, or already used.', 403);
      const now = this.now();
      state.pairingHash = null;
      state.claimBindingHash = await hashToken(body.claimBinding);
      state.authFingerprint = body.authFingerprint;
      state.claimExpiresAt = Math.min(now + DRAW_PAIRING_TTL_MS, state.expiresAt);
      await this.save(state);
      return response({ projectBinding: state.projectBinding, projectName: state.projectName || '', claimExpiresAt: state.claimExpiresAt, expiresAt: state.expiresAt });
    });
  }

  async storeActivate(body) {
    return this.exclusive(async () => {
      const state = await this.load();
      if (!state || state.revoked || this.now() >= state.expiresAt) return errorResponse('Session expired or revoked.', 410);
      if ((state.mode || 'legacy') !== 'oauth') return errorResponse('Session mode does not permit this activation flow.', 403);
      if (!exactKeys(body, ['claimBinding', 'authFingerprint'], ['claimBinding', 'authFingerprint']) || typeof body.claimBinding !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(body.claimBinding) || typeof body.authFingerprint !== 'string' || !/^[a-f0-9]{64}$/.test(body.authFingerprint)) return errorResponse('Invalid Store activation.', 400);
      if (!state.claimBindingHash || !Number.isFinite(state.claimExpiresAt) || this.now() >= state.claimExpiresAt || !constantTimeEqual(await hashToken(body.claimBinding), state.claimBindingHash) || !constantTimeEqual(state.authFingerprint, body.authFingerprint) || state.agentTokenHash) return errorResponse('Store claim is invalid, expired, or already used.', 403);
      const accessToken = randomToken();
      state.claimBindingHash = null;
      state.claimExpiresAt = null;
      state.authFingerprint = null;
      state.agentTokenHash = await hashToken(accessToken);
      await this.save(state);
      return response({ connectionId: state.sessionId, accessToken, projectBinding: state.projectBinding, expiresAt: state.expiresAt });
    });
  }

  async connectByMode(body, requiredMode) {
    return this.exclusive(async () => {
      const state = await this.load();
      if (!state || state.revoked || this.now() >= state.expiresAt) return errorResponse('Session expired or revoked.', 410);
      if ((state.mode || 'legacy') !== requiredMode) return errorResponse('Session mode does not permit this connection flow.', 403);
      if (!exactKeys(body, ['secret'], ['secret']) || typeof body.secret !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(body.secret)) return errorResponse('Invalid pairing code.', 400);
      if (!state.pairingHash || this.now() >= state.pairExpiresAt || !constantTimeEqual(await hashToken(body.secret), state.pairingHash)) return errorResponse('Pairing code is invalid, expired, or already used.', 403);
      const accessToken = randomToken();
      state.pairingHash = null;
      state.agentTokenHash = await hashToken(accessToken);
      await this.save(state);
      return response({ connectionId: state.sessionId, accessToken, projectBinding: state.projectBinding, expiresAt: state.expiresAt });
    });
  }

  async status(request) {
    return this.exclusive(async () => {
      const state = await this.load();
      if (!await this.authorized(state, request, 'agent')) return errorResponse('Invalid or expired agent credential.', 401);
      return response({ connectionId: state.sessionId, projectBinding: state.projectBinding, expiresAt: state.expiresAt, active: true });
    });
  }

  async authorized(state, request, role) {
    const token = bearerToken(request);
    if (!state || !token || state.revoked || this.now() >= state.expiresAt) return false;
    const expected = role === 'browser' ? state.browserTokenHash : state.agentTokenHash;
    if (!expected) return false;
    return constantTimeEqual(await hashToken(token), expected);
  }

  async enqueue(request, body) {
    return this.exclusive(async () => {
      const state = await this.load();
      if (!await this.authorized(state, request, 'agent')) return errorResponse('Invalid or expired agent credential.', 401);
      if (!exactKeys(body, ['requestId', 'command'], ['requestId', 'command']) || typeof body.requestId !== 'string' || !requestIdPattern.test(body.requestId)) return errorResponse('Invalid Draw command.', 400);
      const command = bindCommandToSession(body.command, state.projectBinding);
      if (!command) return errorResponse('Invalid Draw command.', 400);
      const commandDigest = await digest(command);
      const existing = state.requests[body.requestId];
      if (existing) {
        if (!constantTimeEqual(existing.digest, commandDigest)) return errorResponse('requestId is already bound to a different command.', 409);
        return response({ commandId: existing.commandId, requestId: body.requestId, status: existing.status, duplicate: true });
      }
      if (state.requestOrder.length >= DRAW_MAX_REQUESTS) return errorResponse('Session command limit reached. Start a new Draw session.', 429);
      if (state.queue.length >= DRAW_MAX_QUEUE) return errorResponse('Draw command queue is full.', 429);
      const commandId = crypto.randomUUID();
      const now = this.now();
      state.requests[body.requestId] = {
        commandId,
        requestId: body.requestId,
        digest: commandDigest,
        status: 'queued',
        createdAt: now,
        deadlineAt: Math.min(now + 60_000, state.expiresAt),
        issuedAt: null,
        ackDigest: null
      };
      state.requestOrder.push(body.requestId);
      state.queue.push(body.requestId);
      await this.saveDetail(body.requestId, { command: safeClone(command), result: null });
      await this.save(state);
      return response({ commandId, requestId: body.requestId, status: 'queued', duplicate: false }, 202);
    });
  }

  async getRequest(request, requestId) {
    return this.exclusive(async () => {
      const state = await this.load();
      if (!await this.authorized(state, request, 'agent')) return errorResponse('Invalid or expired agent credential.', 401);
      if (!requestIdPattern.test(requestId)) return errorResponse('Invalid requestId.', 400);
      const record = state.requests[requestId];
      if (!record) return errorResponse('Draw request not found.', 404);
      const detail = await this.loadDetail(requestId);
      if (record.status === 'queued' && this.now() >= record.deadlineAt) {
        record.status = 'not_applied';
        detail.result = { requestId, status: 'not_applied', projectBinding: state.projectBinding, revision: null, error: { code: 'not_delivered', message: 'The browser did not receive this command before its deadline.' } };
        state.queue = state.queue.filter(id => id !== requestId);
        await this.saveDetail(requestId, detail);
        await this.save(state);
      } else if (record.status === 'delivered' && this.now() >= record.deadlineAt) {
        record.status = 'unknown';
        detail.result = { requestId, status: 'unknown', projectBinding: state.projectBinding, revision: null, error: { code: 'ack_timeout', message: 'The command may have run; check the current Draw state before retrying.' } };
        state.queue = state.queue.filter(id => id !== requestId);
        await this.saveDetail(requestId, detail);
        await this.save(state);
      }
      return response({ commandId: record.commandId, requestId, status: record.status, result: safeClone(detail.result) });
    });
  }

  async poll(request) {
    return this.exclusive(async () => {
      const state = await this.load();
      if (!await this.authorized(state, request, 'browser')) return errorResponse('Invalid or expired browser credential.', 401);
      const now = this.now();
      const commands = [];
      let changed = false;
      while (state.queue.length) {
        const candidate = state.requests[state.queue[0]];
        if (!candidate) { state.queue.shift(); changed = true; continue; }
        if (['queued', 'delivered'].includes(candidate.status) && now >= candidate.deadlineAt) {
          candidate.status = candidate.status === 'queued' ? 'not_applied' : 'unknown';
          const detail = await this.loadDetail(candidate.requestId);
          detail.result = { requestId: candidate.requestId, status: candidate.status, projectBinding: state.projectBinding, revision: null, error: { code: candidate.status === 'unknown' ? 'ack_timeout' : 'not_delivered', message: candidate.status === 'unknown' ? 'The command may have run; check the current Draw state before retrying.' : 'The browser did not receive this command before its deadline.' } };
          await this.saveDetail(candidate.requestId, detail);
          state.queue.shift();
          changed = true;
          continue;
        }
        break;
      }
      const nextId = state.queue[0];
      const record = nextId ? state.requests[nextId] : null;
      const detail = nextId ? await this.loadDetail(nextId) : null;
      if (record && record.status === 'queued' && now < record.deadlineAt && !record.issuedAt && state.agentTokenHash) {
        record.status = 'delivered';
        record.issuedAt = now;
        changed = true;
        commands.push({
          commandId: record.commandId,
          requestId: record.requestId,
          deadlineAt: record.deadlineAt,
          ...safeClone(detail.command)
        });
      }
      if (changed) await this.save(state);
      return response({ commands, connected: !!state.agentTokenHash, expiresAt: state.expiresAt });
    });
  }

  async ack(request, commandId, body) {
    return this.exclusive(async () => {
      const state = await this.load();
      if (!await this.authorized(state, request, 'browser')) return errorResponse('Invalid or expired browser credential.', 401);
      if (!exactKeys(body, ['commandId', 'requestId', 'status', 'projectBinding', 'revision', 'result', 'error'], ['commandId', 'requestId', 'status', 'projectBinding', 'revision']) ||
        body.commandId !== commandId || !requestIdPattern.test(body.requestId) || !['applied', 'not_applied', 'unknown'].includes(body.status) ||
        !validProjectBinding(body.projectBinding) || !(body.revision === null || validInt(body.revision, 0, Number.MAX_SAFE_INTEGER)) ||
        (body.result !== undefined && !isRecord(body.result)) || (body.error !== undefined && (!isRecord(body.error) || typeof body.error.code !== 'string' || body.error.code.length > 80 || (body.error.message !== undefined && (typeof body.error.message !== 'string' || body.error.message.length > 500))))) return errorResponse('Invalid Draw command result.', 400);
      const record = state.requests[body.requestId];
      if (!record || record.commandId !== commandId) return errorResponse('Command not found.', 404);
      const ackDigest = await digest(body);
      if (record.ackDigest) {
        if (!constantTimeEqual(record.ackDigest, ackDigest)) return errorResponse('Command already has a different result.', 409);
        return response({ accepted: true, duplicate: true });
      }
      if (!['delivered', 'unknown'].includes(record.status)) return errorResponse('Command was not delivered or is no longer active.', 409);
      const detail = await this.loadDetail(body.requestId);
      let accepted = { ...body };
      if (!sameBinding(body.projectBinding, detail.command.projectBinding)) {
        accepted = { commandId, requestId: body.requestId, status: 'not_applied', projectBinding: body.projectBinding, revision: body.revision, error: { code: 'project_changed', message: 'The open Draw project changed before the command completed.' } };
      }
      record.ackDigest = ackDigest;
      record.status = accepted.status;
      detail.result = safeClone(accepted);
      await this.saveDetail(body.requestId, detail);
      state.queue = state.queue.filter(id => id !== body.requestId);
      await this.save(state);
      return response({ accepted: true, duplicate: false });
    });
  }

  async disconnect(request) {
    return this.exclusive(async () => {
      const state = await this.load();
      if (!await this.authorized(state, request, 'agent')) return errorResponse('Invalid or expired agent credential.', 401);
      state.agentTokenHash = null;
      for (const requestId of state.queue) {
        const record = state.requests[requestId];
        if (record?.status === 'queued') {
          record.status = 'not_applied';
          await this.saveDetail(requestId, { ...(await this.loadDetail(requestId)), result: { requestId, status: 'not_applied', projectBinding: state.projectBinding, revision: null, error: { code: 'disconnected', message: 'Draw connection ended before delivery.' } } });
        }
      }
      state.queue = state.queue.filter(id => state.requests[id]?.status === 'delivered');
      await this.save(state);
      return response({ disconnected: true });
    });
  }

  async revoke(request) {
    return this.exclusive(async () => {
      const state = await this.load();
      if (!await this.authorized(state, request, 'agent')) return errorResponse('Invalid or expired agent credential.', 401);
      await this.invalidate(state, 'agent_disconnected');
      return response({ revoked: true });
    });
  }

  async browserRevoke(request) {
    return this.exclusive(async () => {
      const state = await this.load();
      if (!await this.authorized(state, request, 'browser')) return errorResponse('Invalid or expired browser credential.', 401);
      await this.invalidate(state, 'browser_revoked');
      return response({ revoked: true });
    });
  }

  async invalidate(state, code) {
    state.revoked = true;
    state.agentTokenHash = null;
    state.pairingHash = null;
    state.claimBindingHash = null;
    state.claimExpiresAt = null;
    state.authFingerprint = null;
    for (const requestId of state.queue) {
      const record = state.requests[requestId];
      if (record?.status === 'queued') {
        record.status = 'not_applied';
        await this.saveDetail(requestId, { ...(await this.loadDetail(requestId)), result: { requestId, status: 'not_applied', projectBinding: state.projectBinding, revision: null, error: { code, message: 'The Draw session was closed before delivery.' } } });
      } else if (record?.status === 'delivered') {
        record.status = 'unknown';
        await this.saveDetail(requestId, { ...(await this.loadDetail(requestId)), result: { requestId, status: 'unknown', projectBinding: state.projectBinding, revision: null, error: { code, message: 'The session closed while the command may have been running.' } } });
      }
    }
    state.queue = [];
    await this.save(state);
  }

  async expire() {
    return this.exclusive(async () => {
      if (typeof this.storage.deleteAll === 'function') await this.storage.deleteAll();
      else {
        const state = await this.load();
        if (state) for (const requestId of state.requestOrder || []) await this.storage.delete(`request:${requestId}`);
        await this.storage.delete('session');
      }
      return response({ expired: true });
    });
  }
}

export class DrawSessionDO {
  constructor(state) {
    this.state = state;
    this.room = new DrawSessionRoom(state.storage);
  }
  async fetch(request) {
    if (new URL(request.url).pathname === '/_relay/create') {
      try { await this.state.storage.setAlarm(Date.now() + DRAW_SESSION_TTL_MS); }
      catch { return errorResponse('Could not schedule Draw session cleanup.', 503); }
    }
    const result = await this.room.route(request);
    return result;
  }
  async alarm() { await this.room.expire(); }
}

export class LocalDrawSessionRelay {
  constructor() { this.rooms = new Map(); this.timers = new Map(); }
  async fetch(sessionId, request) {
    let room = this.rooms.get(sessionId);
    if (!room) { room = new DrawSessionRoom(); this.rooms.set(sessionId, room); }
    const responseValue = await room.route(request);
    if (new URL(request.url).pathname === '/_relay/create' && responseValue.status === 200 && !this.timers.has(sessionId)) {
      const timer = setTimeout(() => { void room.expire().then(() => this.rooms.delete(sessionId)); this.timers.delete(sessionId); }, DRAW_SESSION_TTL_MS);
      timer.unref?.();
      this.timers.set(sessionId, timer);
    }
    if (responseValue.status === 410) {
      const timer = this.timers.get(sessionId);
      if (timer) clearTimeout(timer);
      this.timers.delete(sessionId);
      this.rooms.delete(sessionId);
    }
    return responseValue;
  }
}

export function createSessionId() { return crypto.randomUUID(); }

export async function relayFetch(env, sessionId, path, init = {}) {
  const admitted = await checkDrawSessionAdmission(env, sessionId);
  if (!admitted.ok) return admitted;
  const request = init instanceof Request ? init : new Request(`https://draw-relay.internal${path}`, init);
  if (env?.DRAW_SESSIONS) {
    const id = env.DRAW_SESSIONS.idFromName(sessionId);
    return env.DRAW_SESSIONS.get(id).fetch(request);
  }
  if (env?.LOCAL_DRAW_RELAY) return env.LOCAL_DRAW_RELAY.fetch(sessionId, request);
  throw new Error('Draw relay is not configured.');
}

export function relayJsonRequest(path, value, token) {
  return new Request(`https://draw-relay.internal${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(value)
  });
}

export function parseDrawPairingCode(value) { return normalizePairingCode(value); }

export const DRAW_PROJECT_BINDING_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['projectId', 'openEpoch'],
  properties: { projectId: { type: 'string', minLength: 1, maxLength: 128 }, openEpoch: { type: 'string', minLength: 1, maxLength: 128 } }
};

const idSchema = { type: 'string', minLength: 1, maxLength: 128 };
const colorIndexSchema = { anyOf: [{ type: 'integer', minimum: 0, maximum: 127 }, { type: 'null' }] };
const simpleOperation = (type, properties = {}, required = []) => ({
  type: 'object', additionalProperties: false, required: ['type', ...required],
  properties: { type: { const: type }, ...properties }
});

export const DRAW_OPERATION_SCHEMA = { oneOf: [
  simpleOperation('pixel.set', { frameId: idSchema, layerId: idSchema, x: { type: 'integer', minimum: 0, maximum: 65535 }, y: { type: 'integer', minimum: 0, maximum: 65535 }, colorIndex: colorIndexSchema }, ['frameId', 'layerId', 'x', 'y', 'colorIndex']),
  simpleOperation('pixels.set', { frameId: idSchema, layerId: idSchema, pixels: { type: 'array', minItems: 1, maxItems: 512, items: { type: 'object', additionalProperties: false, required: ['x', 'y', 'colorIndex'], properties: { x: { type: 'integer', minimum: 0, maximum: 65535 }, y: { type: 'integer', minimum: 0, maximum: 65535 }, colorIndex: colorIndexSchema } } } }, ['frameId', 'layerId', 'pixels']),
  simpleOperation('palette.add', { color: { type: 'string', pattern: '^#[0-9A-Fa-f]{6}([0-9A-Fa-f]{2})?$' } }, ['color']),
  simpleOperation('color.adjust', { scope: { enum: ['cel', 'whole'] }, frameId: idSchema, layerId: idSchema, settings: { type: 'object', additionalProperties: false, minProperties: 1, properties: { brightness: { type: 'integer', minimum: -100, maximum: 100 }, contrast: { type: 'integer', minimum: -100, maximum: 100 }, saturation: { type: 'integer', minimum: 0, maximum: 200 }, curve: { type: 'array', minItems: 5, maxItems: 5, items: { type: 'integer', minimum: 0, maximum: 255 } }, paletteMode: { enum: ['exact', 'nearest'] } } } }, ['scope', 'frameId', 'layerId', 'settings']),
  simpleOperation('layer.select', { layerId: idSchema }, ['layerId']),
  simpleOperation('layer.add', { name: { type: 'string', maxLength: 80 }, visible: { type: 'boolean' }, locked: { type: 'boolean' } }),
  simpleOperation('layer.rename', { layerId: idSchema, name: { type: 'string', maxLength: 80 } }, ['layerId', 'name']),
  simpleOperation('layer.visibility', { layerId: idSchema, visible: { type: 'boolean' } }, ['layerId', 'visible']),
  simpleOperation('layer.opacity', { layerId: idSchema, opacity: { type: 'number', minimum: 0, maximum: 1 } }, ['layerId', 'opacity']),
  simpleOperation('layer.lock', { layerId: idSchema, locked: { type: 'boolean' } }, ['layerId', 'locked']),
  simpleOperation('layer.move', { layerId: idSchema, index: { type: 'integer', minimum: 0, maximum: 127 } }, ['layerId', 'index']),
  simpleOperation('layer.remove', { layerId: idSchema }, ['layerId']),
  simpleOperation('frame.select', { frameId: idSchema }, ['frameId']),
  simpleOperation('frame.add', { sourceFrameId: idSchema, copy: { type: 'boolean' } }),
  simpleOperation('frame.duration', { frameId: idSchema, durationMs: { type: 'integer', minimum: 1, maximum: 60000 } }, ['frameId', 'durationMs']),
  simpleOperation('frame.move', { frameId: idSchema, index: { type: 'integer', minimum: 0, maximum: 127 } }, ['frameId', 'index']),
  simpleOperation('frame.remove', { frameId: idSchema }, ['frameId']),
  simpleOperation('undo'), simpleOperation('redo'), simpleOperation('save')
] };

export const DRAW_STATE_REQUEST_SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: { frameId: idSchema, layerId: idSchema }
};

export const DRAW_STATE_SCHEMA = {
  type: 'object', additionalProperties: false,
    required: ['revision', 'projectBinding', 'projectPersisted', 'savedRevisionId', 'dirty', 'width', 'height', 'palette', 'active', 'frames', 'layers', 'cel', 'canUndo', 'canRedo', 'busy', 'saved'],
  properties: {
    revision: { type: 'integer', minimum: 0 }, projectBinding: { anyOf: [DRAW_PROJECT_BINDING_SCHEMA, { type: 'null' }] },
    projectPersisted: { type: 'boolean' }, dirty: { type: 'boolean' }, savedRevisionId: { anyOf: [{ type: 'string' }, { type: 'null' }] }, width: { type: 'integer', minimum: 1, maximum: 256 }, height: { type: 'integer', minimum: 1, maximum: 256 },
    palette: { type: 'array', maxItems: 128, items: { type: 'string' } }, active: { type: 'object', required: ['frameId', 'layerId'], properties: { frameId: idSchema, layerId: idSchema } },
    frames: { type: 'array', maxItems: 128, items: { type: 'object', required: ['id', 'durationMs'], properties: { id: idSchema, durationMs: { type: 'integer' } } } },
    layers: { type: 'array', maxItems: 128, items: { type: 'object', required: ['id', 'name', 'visible', 'locked', 'opacity', 'role'], properties: { id: idSchema, name: { type: 'string' }, visible: { type: 'boolean' }, locked: { type: 'boolean' }, opacity: { type: 'number' }, role: { type: 'string' } } } },
    cel: { type: 'object', required: ['frameId', 'layerId', 'pixels'], properties: { frameId: idSchema, layerId: idSchema, pixels: { type: 'array', maxItems: 65536, items: { type: 'integer', minimum: -1, maximum: 127 } } } },
    canUndo: { type: 'boolean' }, canRedo: { type: 'boolean' }, busy: { type: 'boolean' }, saved: { type: 'boolean' }
  }
};

export const DRAW_CONNECTION_INPUT_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['pairingCode'],
  properties: { pairingCode: { type: 'string', minLength: 80, maxLength: 80, pattern: '^[0-9a-f-]{36}\\.[A-Za-z0-9_-]{43}$' } }
};

export const DRAW_AGENT_AUTH_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['connectionId', 'accessToken'],
  properties: { connectionId: { type: 'string', format: 'uuid' }, accessToken: { type: 'string', minLength: 43, maxLength: 43, pattern: '^[A-Za-z0-9_-]{43}$' } }
};
