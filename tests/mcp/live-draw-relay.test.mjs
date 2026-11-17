import { LocalDrawAdmission } from '../../scripts/mcp/draw-session-admission.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../../scripts/mcp/worker.mjs';
import { DrawSessionRoom, LocalDrawSessionRelay, validDrawSessionCommand } from '../../scripts/mcp/draw-session-relay.mjs';

const siteOrigin = 'http://127.0.0.1:4198';
const apiOrigin = 'http://127.0.0.1:4199';
const env = { ALLOW_LOCAL_ORIGIN: '1', SITE_ORIGIN: siteOrigin, LOCAL_DRAW_RELAY: new LocalDrawSessionRelay(), LOCAL_DRAW_ADMISSION: new LocalDrawAdmission(), DRAW_ADMISSION_SECRET: 'test-admission-secret-only-not-for-production', LOCAL_DRAW_IP: '127.0.0.1' };
const binding = { projectId: 'project-local-1', openEpoch: 'open-epoch-1' };
const authHeaders = { accept: 'application/json, text/event-stream', 'content-type': 'application/json' };
const rpc = (name, args) => ({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } });

test('relay command schemas allow bounded fast Draw operations and reject unsafe batches', () => {
  const base = { kind: 'operation', projectBinding: binding, expectedRevision: 3 };
  const command = operation => ({ ...base, operation });
  const activeStroke = { type: 'stroke', frameId: '$active', layerId: '$active', points: [{ x: 0, y: 1 }, { x: 2, y: 3 }], colorIndex: null, brushSize: 4 };
  assert.equal(validDrawSessionCommand(command(activeStroke)), true);
  assert.equal(validDrawSessionCommand(command({ ...activeStroke, points: [{ x: -4096, y: 4096.5 }] })), false);
  assert.equal(validDrawSessionCommand(command({ ...activeStroke, points: [{ x: -0.5, y: 1.25 }] })), true);
  assert.equal(validDrawSessionCommand(command({ ...activeStroke, points: [{ x: -4096, y: 4096 }] })), true);
  assert.equal(validDrawSessionCommand({ ...command(activeStroke), responseMode: 'summary' }), true);
  assert.equal(validDrawSessionCommand({ ...command(activeStroke), responseMode: 'compact' }), false);
  assert.equal(validDrawSessionCommand(command({ ...activeStroke, unknown: true })), false);
  assert.equal(validDrawSessionCommand(command({ type: 'batch', operations: [activeStroke, { type: 'fill', frameId: '$active', layerId: '$active', x: 1, y: 1, colorIndex: 2 }], save: true })), true);
  assert.equal(validDrawSessionCommand(command({ type: 'batch', operations: [{ type: 'spray', frameId: '$active', layerId: '$active', x: 1027, y: 0, colorIndex: null, radius: 16, passes: 32, seed: 4294967295 }] })), true);
  assert.equal(validDrawSessionCommand(command({ type: 'spray', frameId: '$active', layerId: '$active', x: 1028, y: 0, colorIndex: 0 })), false);
  assert.equal(validDrawSessionCommand(command({ type: 'spray', frameId: '$active', layerId: '$active', x: 1, y: 0, colorIndex: 0, seed: 4294967296 })), false);
  assert.equal(validDrawSessionCommand(command({ type: 'batch', operations: Array(33).fill(activeStroke) })), false);
  for (const child of [{ type: 'batch', operations: [activeStroke] }, { type: 'undo' }, { type: 'redo' }, { type: 'save' }, { type: 'normal.configure', settings: { ambient: 0.4 } }, { type: 'view.configure', zoom: 2 }]) {
    assert.equal(validDrawSessionCommand(command({ type: 'batch', operations: [child] })), false, child.type);
  }
  assert.equal(validDrawSessionCommand(command({ type: 'selection.transform', frameId: '$active', layerId: '$active', bounds: { x: 0, y: 0, width: 3, height: 4 }, x: -1, y: 2, turns: 3 })), true);
  assert.equal(validDrawSessionCommand(command({ type: 'selection.transform', frameId: '$active', layerId: '$active', bounds: { x: 0, y: 0, width: 3, height: 4 }, x: 0, y: 0, angle: 22.5, polygon: [{ x: -1.5, y: 0 }, { x: 0, y: 2 }, { x: 2, y: 0 }] })), true);
  assert.equal(validDrawSessionCommand(command({ type: 'selection.transform', frameId: '$active', layerId: '$active', bounds: { x: 0, y: 0, width: 3, height: 4 }, x: 0, y: 0, angle: 22, turns: 1 })), false);
  assert.equal(validDrawSessionCommand(command({ type: 'selection.transform', frameId: '$active', layerId: '$active', bounds: { x: 0, y: 0, width: 3, height: 4 }, x: -4097, y: 2 })), false);
  assert.equal(validDrawSessionCommand(command({ type: 'text.draw', frameId: '$active', layerId: '$active', text: '', x: 1, y: 2, colorIndex: 0 })), false);
  assert.equal(validDrawSessionCommand(command({ type: 'normal.configure', settings: { roughness: 0.04 } })), false);
  assert.equal(validDrawSessionCommand(command({ type: 'text.draw', frameId: '$active', layerId: '$active', text: 'abc', x: 1, y: 2, colorIndex: 0, font: 'unknown' })), false);
});

test('state relay commands support metadata-only and bounded regional pixel reads', () => {
  const projectBinding = binding;
  const state = stateRequest => validDrawSessionCommand({ kind: 'state.get', projectBinding, stateRequest });
  assert.equal(state({ includePixels: false }), true);
  assert.equal(state({ frameId: 'frame-1', layerId: '$active', region: { x: 1000, y: 1000, width: 28, height: 28 } }), false);
  assert.equal(state({ frameId: 'frame-1', layerId: 'layer-1', region: { x: 1000, y: 1000, width: 28, height: 28 } }), true);
  assert.equal(state({ frameId: 'frame-1', layerId: 'layer-1', region: { x: 0, y: 0, width: 257, height: 257 } }), false);
  assert.equal(state({ includePixels: false, region: { x: 0, y: 0, width: 1, height: 1 } }), false);
  assert.equal(state({ includePixels: false, extra: true }), false);
});

async function mcp(name, args) {
  const response = await worker.fetch(new Request('https://mcp.test/mcp', {
    method: 'POST', headers: authHeaders, body: JSON.stringify(rpc(name, args))
  }), env);
  return { response, body: await response.json() };
}

let nextLocalIp = 1;
async function createSession(extraHeaders = {}) {
  env.LOCAL_DRAW_IP = `127.0.0.${nextLocalIp++}`;
  return worker.fetch(new Request(`${apiOrigin}/draw-sessions`, {
    method: 'POST', headers: { origin: siteOrigin, 'content-type': 'application/json', ...extraHeaders },
    body: JSON.stringify({ projectBinding: binding })
  }), env);
}

async function poll(session, token, origin = siteOrigin) {
  return worker.fetch(new Request(`${apiOrigin}/draw-sessions/${session.sessionId}/commands`, {
    headers: { origin, authorization: `Bearer ${token}` }
  }), env);
}

async function waitForCommand(session, browserToken) {
  const until = Date.now() + 1500;
  while (Date.now() < until) {
    const response = await poll(session, browserToken);
    assert.equal(response.status, 200);
    const result = await response.json();
    if (result.commands.length) return result.commands[0];
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  assert.fail('Draw browser did not receive a queued command.');
}

async function acknowledge(session, browserToken, command, value) {
  return worker.fetch(new Request(`${apiOrigin}/draw-sessions/${session.sessionId}/commands/${command.commandId}/result`, {
    method: 'POST',
    headers: { origin: siteOrigin, authorization: `Bearer ${browserToken}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      commandId: command.commandId, requestId: command.requestId, status: 'applied', projectBinding: binding,
      revision: value.revision, result: value
    })
  }), env);
}

test('browser session creation enforces exact Origin and returns independent one-use credentials', async () => {
  assert.equal((await createSession({ origin: 'https://attacker.test' })).status, 403);
  assert.equal((await worker.fetch(new Request(`${apiOrigin}/draw-sessions`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ projectBinding: binding })
  }), env)).status, 403);

  const created = await createSession();
  assert.equal(created.status, 200);
  assert.equal(created.headers.get('cache-control'), 'no-store');
  assert.equal(created.headers.get('access-control-allow-origin'), siteOrigin);
  const session = await created.json();
  assert.match(session.pairingCode, /^[0-9a-f-]{36}\.[A-Za-z0-9_-]{43}$/);
  assert.equal(session.pairingCode.startsWith(session.browserToken), false);
  assert.notEqual(session.pairingCode.split('.')[1], session.browserToken);
  assert.deepEqual(session.projectBinding, binding);

  const connected = await mcp('connect_draw', { pairingCode: session.pairingCode });
  assert.equal(connected.body.result.isError, undefined);
  const credentials = connected.body.result.structuredContent;
  assert.equal(credentials.connectionId, session.sessionId);
  assert.notEqual(credentials.accessToken, session.browserToken);
  assert.deepEqual(credentials.projectBinding, binding);
  const secondExchange = await mcp('connect_draw', { pairingCode: session.pairingCode });
  assert.equal(secondExchange.body.result.isError, true);
  assert.match(secondExchange.body.result.content[0].text, /used/);

  const agentCannotPoll = await poll(session, credentials.accessToken);
  assert.equal(agentCannotPoll.status, 401);
  const browserCannotIssue = await env.LOCAL_DRAW_RELAY.fetch(session.sessionId, new Request('https://draw-relay.internal/_relay/command', {
    method: 'POST', headers: { authorization: `Bearer ${session.browserToken}`, 'content-type': 'application/json' },
    body: JSON.stringify({ requestId: 'role_test_1', command: { kind: 'state.get' } })
  }));
  assert.equal(browserCannotIssue.status, 401);
});

test('OAuth Draw sessions require a private claim then one-use activation, while legacy pairing remains isolated', async () => {
  let now = 1_800_000_000_000;
  const room = new DrawSessionRoom(undefined, { now: () => now });
  const roomFetch = (path, { method = 'GET', token, body } = {}) => room.route(new Request(`https://room.test${path}`, {
    method,
    headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(body !== undefined ? { 'content-type': 'application/json' } : {}) },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {})
  }));
  const sessionId = '00000000-0000-4000-8000-000000000091';
  const created = await roomFetch('/_relay/create', { method: 'POST', body: { sessionId, projectBinding: binding, mode: 'oauth', projectName: '星空のドット絵' } });
  assert.equal(created.status, 200);
  const session = await created.json();
  assert.match(session.pairingCode, /^[0-9a-f-]{36}\.[A-Za-z0-9_-]{43}$/);
  assert.equal(session.projectName, undefined, 'project metadata is not disclosed to the browser create response');

  const secret = session.pairingCode.split('.')[1];
  const legacyExchange = await roomFetch('/_relay/connect', { method: 'POST', body: { secret } });
  assert.equal(legacyExchange.status, 403, 'the legacy endpoint cannot activate an OAuth session');
  const claimBinding = 'C'.repeat(43);
  const authFingerprint = 'a'.repeat(64);
  const claimedResponse = await roomFetch('/_relay/store-claim', { method: 'POST', body: { secret, claimBinding, authFingerprint } });
  assert.equal(claimedResponse.status, 200);
  const claim = await claimedResponse.json();
  assert.deepEqual(claim, { projectBinding: binding, projectName: '星空のドット絵', claimExpiresAt: now + 2 * 60_000, expiresAt: now + 5 * 60_000 });
  assert.equal(Object.hasOwn(claim, 'accessToken'), false);
  const claimedState = await room.load();
  assert.equal(claimedState.authFingerprint, authFingerprint);
  assert.notEqual(claimedState.claimBindingHash, claimBinding);
  assert.equal((await roomFetch('/_relay/store-claim', { method: 'POST', body: { secret, claimBinding: 'D'.repeat(43), authFingerprint } })).status, 403, 'pairing code is one use');
  assert.equal((await roomFetch('/_relay/store-activate', { method: 'POST', body: { claimBinding: 'D'.repeat(43), authFingerprint } })).status, 403, 'a different claim binding cannot activate');
  assert.equal((await roomFetch('/_relay/store-activate', { method: 'POST', body: { claimBinding, authFingerprint: 'b'.repeat(64) } })).status, 403, 'a different OAuth request fingerprint cannot activate');

  const activatedResponse = await roomFetch('/_relay/store-activate', { method: 'POST', body: { claimBinding, authFingerprint } });
  assert.equal(activatedResponse.status, 200);
  const agent = await activatedResponse.json();
  assert.equal(agent.connectionId, sessionId);
  assert.deepEqual(agent.projectBinding, binding);
  assert.equal(agent.expiresAt, claim.expiresAt);
  assert.match(agent.accessToken, /^[A-Za-z0-9_-]{43}$/);
  assert.equal((await roomFetch('/_relay/store-activate', { method: 'POST', body: { claimBinding, authFingerprint } })).status, 403, 'claim activation is one use');
  assert.equal((await room.load()).authFingerprint, null, 'successful activation consumes the stored OAuth fingerprint');

  const statusResponse = await roomFetch('/_relay/status', { token: agent.accessToken });
  assert.equal(statusResponse.status, 200);
  const status = await statusResponse.json();
  assert.deepEqual(status, { connectionId: sessionId, projectBinding: binding, expiresAt: agent.expiresAt, active: true });
  assert.equal(Object.hasOwn(status, 'accessToken'), false);
  assert.equal((await roomFetch('/_relay/status', { token: session.browserToken })).status, 401);
  const revoked = await roomFetch('/_relay/revoke', { method: 'POST', token: agent.accessToken, body: {} });
  assert.equal(revoked.status, 200);
  assert.equal((await roomFetch('/_relay/status', { token: agent.accessToken })).status, 401);

  const legacyId = '00000000-0000-4000-8000-000000000092';
  const legacyRoom = new DrawSessionRoom(undefined, { now: () => now });
  const legacyFetch = (path, { method = 'GET', body } = {}) => legacyRoom.route(new Request(`https://legacy-room.test${path}`, {
    method, ...(body !== undefined ? { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : {})
  }));
  assert.equal((await legacyFetch('/_relay/create', { method: 'POST', body: { sessionId: legacyId, projectBinding: binding, projectName: 'must reject' } })).status, 400);
  const legacy = await legacyFetch('/_relay/create', { method: 'POST', body: { sessionId: legacyId, projectBinding: binding } });
  const legacySession = await legacy.json();
  assert.equal((await legacyFetch('/_relay/store-claim', { method: 'POST', body: { secret: legacySession.pairingCode.split('.')[1], claimBinding, authFingerprint } })).status, 403);
  assert.equal((await legacyFetch('/_relay/connect', { method: 'POST', body: { secret: legacySession.pairingCode.split('.')[1] } })).status, 200);
  assert.notEqual((await worker.fetch(new Request(`${apiOrigin}/draw-sessions/${sessionId}/store-claim`, { method: 'POST' }), env)).status, 200, 'internal Store claim route is not exposed through the public worker routes');
});

test('OAuth claim expires within two minutes and requires a valid request fingerprint', async () => {
  let now = 1_800_000_100_000;
  const room = new DrawSessionRoom(undefined, { now: () => now });
  const roomFetch = (path, body) => room.route(new Request(`https://room-expiry.test${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    ...(body === undefined ? {} : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  }));
  const created = await roomFetch('/_relay/create', { sessionId: '00000000-0000-4000-8000-000000000093', projectBinding: binding, mode: 'oauth' });
  const session = await created.json();
  const [ , secret ] = session.pairingCode.split('.');
  assert.equal((await roomFetch('/_relay/store-claim', { secret, claimBinding: 'E'.repeat(43), authFingerprint: 'invalid' })).status, 400);
  const claimBinding = 'F'.repeat(43), authFingerprint = 'c'.repeat(64);
  assert.equal((await roomFetch('/_relay/store-claim', { secret, claimBinding, authFingerprint })).status, 200);
  now += 2 * 60_000;
  assert.equal((await roomFetch('/_relay/store-activate', { claimBinding, authFingerprint })).status, 403);
});

test('live state, edit, and save relay once, use the project binding, and replay only cached acknowledgements', async () => {
  const created = await createSession();
  const session = await created.json();
  const connection = (await mcp('connect_draw', { pairingCode: session.pairingCode })).body.result.structuredContent;

  const statePromise = mcp('get_draw_state', { connectionId: connection.connectionId, accessToken: connection.accessToken });
  const stateCommand = await waitForCommand(session, session.browserToken);
  assert.equal(stateCommand.kind, 'state.get');
  assert.deepEqual(stateCommand.projectBinding, binding);
  assert.ok(Number.isFinite(stateCommand.deadlineAt));
  const state = {
    revision: 4, projectBinding: binding, projectPersisted: true, savedRevisionId: 'revision-local-4', dirty: false,
    capabilities: { fastEdits: true, maxBatchOperations: 32, maxPixelBatch: 512, maxStrokePoints: 1024, maxReadPixels: 65536, maxCommandBytes: 32768 },
    width: 256, height: 256, palette: ['#E75445'], active: { frameId: 'frame-1', layerId: 'layer-1' },
    frames: [{ id: 'frame-1', durationMs: 100 }], layers: [{ id: 'layer-1', name: 'Art', visible: true, locked: false, opacity: 1, role: 'art' }],
    cel: { frameId: 'frame-1', layerId: 'layer-1', pixels: Array(256 * 256).fill(-1) },
    canUndo: true, canRedo: false, busy: false, saved: true
  };
  const stateAck = await acknowledge(session, session.browserToken, stateCommand, state);
  assert.equal(stateAck.status, 200);
  const stateReply = await statePromise;
  assert.equal(stateReply.body.result.structuredContent.width, 256);
  assert.equal(stateReply.body.result.structuredContent.cel.pixels.length, 256 * 256);

  const metadataPromise = mcp('get_draw_state', { connectionId: connection.connectionId, accessToken: connection.accessToken, includePixels: false });
  const metadataCommand = await waitForCommand(session, session.browserToken);
  assert.deepEqual(metadataCommand.stateRequest, { includePixels: false });
  const metadataState = { ...state, cel: { frameId: 'frame-1', layerId: 'layer-1' } };
  assert.equal((await acknowledge(session, session.browserToken, metadataCommand, metadataState)).status, 200);
  const metadataReply = await metadataPromise;
  assert.equal(metadataReply.body.result.structuredContent.cel.pixels, undefined);

  const operation = { type: 'pixels.set', frameId: 'frame-1', layerId: 'layer-1', pixels: [{ x: 255, y: 255, colorIndex: 0 }] };
  const input = { connectionId: connection.connectionId, accessToken: connection.accessToken, expectedRevision: 4, requestId: 'pixel_edit_test_1', operation, responseMode: 'summary' };
  const editPromise = mcp('edit_draw', input);
  const editCommand = await waitForCommand(session, session.browserToken);
  assert.deepEqual(editCommand.operation, operation);
  assert.equal(editCommand.responseMode, 'summary');
  assert.equal(editCommand.expectedRevision, 4);
  assert.deepEqual(editCommand.projectBinding, binding);
  const editResult = { changed: true, revision: 5, projectBinding: binding, state: { ...state, revision: 5, dirty: true, saved: false } };
  assert.equal((await acknowledge(session, session.browserToken, editCommand, editResult)).status, 200);
  const editReply = await editPromise;
  assert.equal(editReply.body.result.structuredContent.status, 'applied');
  assert.equal(editReply.body.result.structuredContent.result.revision, 5);

  const duplicate = await mcp('edit_draw', input);
  assert.equal(duplicate.body.result.structuredContent.status, 'applied');
  assert.equal((await poll(session, session.browserToken)).status, 200);
  const noReplay = await poll(session, session.browserToken);
  assert.deepEqual((await noReplay.json()).commands, []);

  const conflict = await mcp('edit_draw', { ...input, operation: { type: 'undo' } });
  assert.equal(conflict.body.result.isError, true);
  assert.match(conflict.body.result.content[0].text, /different command/);

  const saveInput = { connectionId: connection.connectionId, accessToken: connection.accessToken, expectedRevision: 5, requestId: 'save_test_001', responseMode: 'summary' };
  const savePromise = mcp('save_draw', saveInput);
  const saveCommand = await waitForCommand(session, session.browserToken);
  assert.deepEqual(saveCommand.operation, { type: 'save' });
  assert.equal(saveCommand.responseMode, 'summary');
  const saveResult = { changed: false, revision: 5, projectBinding: binding, state: { ...state, revision: 5 }, savedRevisionId: 'revision-local-5', savedEditorRevision: 5, dirtyAfter: false, storage: 'browser_local' };
  assert.equal((await acknowledge(session, session.browserToken, saveCommand, saveResult)).status, 200);
  const saveReply = await savePromise;
  assert.equal(saveReply.body.result.structuredContent.status, 'applied');
  assert.equal(saveReply.body.result.structuredContent.result.storage, 'browser_local');
  assert.deepEqual((await mcp('save_draw', saveInput)).body.result.structuredContent, saveReply.body.result.structuredContent);
});

test('browser command polling reports connected state and refuses foreign-origin poll or bad acknowledgement', async () => {
  const session = await (await createSession()).json();
  const beforeConnect = await poll(session, session.browserToken);
  assert.deepEqual((await beforeConnect.json()).commands, []);
  assert.equal((await poll(session, session.browserToken, 'https://attacker.test')).status, 403);
  const connected = await mcp('connect_draw', { pairingCode: session.pairingCode });
  assert.equal(connected.body.result.isError, undefined);
  const pollReply = await poll(session, session.browserToken);
  assert.equal((await pollReply.json()).connected, true);
  const wrongAck = await worker.fetch(new Request(`${apiOrigin}/draw-sessions/${session.sessionId}/commands/00000000-0000-4000-8000-000000000000/result`, {
    method: 'POST', headers: { origin: siteOrigin, authorization: `Bearer ${session.browserToken}`, 'content-type': 'application/json' },
    body: JSON.stringify({ commandId: '00000000-0000-4000-8000-000000000000', requestId: 'unknown_1', status: 'applied', projectBinding: binding, revision: 0, result: {} })
  }), env);
  assert.equal(wrongAck.status, 404);
});

test('an expired delivered command becomes unknown, unblocks later work, and accepts its late acknowledgement without replay', async () => {
  let now = 1_800_000_000_000;
  const room = new DrawSessionRoom(undefined, { now: () => now });
  const roomFetch = (path, { method = 'GET', token, body } = {}) => room.route(new Request(`https://room.test${path}`, {
    method,
    headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(body !== undefined ? { 'content-type': 'application/json' } : {}) },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {})
  }));
  const sessionId = '00000000-0000-4000-8000-000000000001';
  const created = await roomFetch('/_relay/create', { method: 'POST', body: { sessionId, projectBinding: binding } });
  const browser = await created.json();
  const paired = await roomFetch('/_relay/connect', { method: 'POST', body: { secret: browser.pairingCode.split('.')[1] } });
  const agent = await paired.json();
  const first = { requestId: 'timeout_test_1', command: { kind: 'state.get' } };
  const second = { requestId: 'timeout_test_2', command: { kind: 'state.get' } };
  assert.equal((await roomFetch('/_relay/command', { method: 'POST', token: agent.accessToken, body: first })).status, 202);
  assert.equal((await roomFetch('/_relay/command', { method: 'POST', token: agent.accessToken, body: second })).status, 202);
  const delivered = await (await roomFetch('/commands', { token: browser.browserToken })).json();
  assert.equal(delivered.commands[0].requestId, first.requestId);
  now += 60_001;
  const afterTimeout = await (await roomFetch('/commands', { token: browser.browserToken })).json();
  assert.deepEqual(afterTimeout.commands, []);
  const firstStatus = await (await roomFetch(`/_relay/command/${first.requestId}`, { token: agent.accessToken })).json();
  assert.equal(firstStatus.status, 'unknown');
  const secondStatus = await (await roomFetch(`/_relay/command/${second.requestId}`, { token: agent.accessToken })).json();
  assert.equal(secondStatus.status, 'not_applied');
  const third = { requestId: 'timeout_test_3', command: { kind: 'state.get' } };
  assert.equal((await roomFetch('/_relay/command', { method: 'POST', token: agent.accessToken, body: third })).status, 202);
  const afterUnblock = await (await roomFetch('/commands', { token: browser.browserToken })).json();
  assert.equal(afterUnblock.commands[0].requestId, third.requestId);
  const lateAck = await roomFetch(`/commands/${delivered.commands[0].commandId}/result`, {
    method: 'POST', token: browser.browserToken,
    body: { commandId: delivered.commands[0].commandId, requestId: first.requestId, status: 'applied', projectBinding: binding, revision: 1, result: { revision: 1 } }
  });
  assert.equal(lateAck.status, 200);
  const resolved = await (await roomFetch(`/_relay/command/${first.requestId}`, { token: agent.accessToken })).json();
  assert.equal(resolved.status, 'applied');
  assert.deepEqual(resolved.result.result, { revision: 1 });
});

test('public create quota rejects before constructing a session room, preserves CORS, and blocks random session routing', async () => {
  const localRelay = new LocalDrawSessionRelay();
  let relayCalls = 0;
  const originalFetch = localRelay.fetch.bind(localRelay);
  localRelay.fetch = (...args) => { relayCalls++; return originalFetch(...args); };
  const limitedEnv = { ALLOW_LOCAL_ORIGIN: '1', SITE_ORIGIN: siteOrigin, LOCAL_DRAW_RELAY: localRelay,
    LOCAL_DRAW_ADMISSION: new LocalDrawAdmission(), DRAW_ADMISSION_SECRET: 'test-admission-secret-only-not-for-production', LOCAL_DRAW_IP: '127.0.0.91' };
  const make = projectBinding => worker.fetch(new Request(apiOrigin + '/draw-sessions', {
    method: 'POST', headers: { origin: siteOrigin, 'content-type': 'application/json' }, body: JSON.stringify({ projectBinding })
  }), limitedEnv);
  assert.equal((await make({ projectId: 'bad spaces', openEpoch: 'epoch' })).status, 400);
  assert.equal(relayCalls, 0);
  for (let index = 0; index < 3; index++) assert.equal((await make(binding)).status, 200);
  const rejected = await make(binding);
  assert.equal(rejected.status, 429);
  assert.equal(rejected.headers.get('access-control-allow-origin'), siteOrigin);
  assert.ok(Number(rejected.headers.get('retry-after')) > 0);
  assert.equal((await rejected.json()).code, 'DRAW_ADMISSION_LIMIT');
  assert.equal(relayCalls, 3);
  const random = await worker.fetch(new Request(apiOrigin + '/draw-sessions/' + crypto.randomUUID() + '/commands', {
    headers: { origin: siteOrigin, authorization: 'Bearer ' + 'a'.repeat(43) }
  }), limitedEnv);
  assert.equal(random.status, 404);
  assert.equal(relayCalls, 3, 'unknown UUID must not invoke or construct a session DO');
});
