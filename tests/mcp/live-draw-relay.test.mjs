import { LocalDrawAdmission } from '../../scripts/mcp/draw-session-admission.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../../scripts/mcp/worker.mjs';
import { DrawSessionRoom, LocalDrawSessionRelay } from '../../scripts/mcp/draw-session-relay.mjs';

const siteOrigin = 'http://127.0.0.1:4198';
const apiOrigin = 'http://127.0.0.1:4199';
const env = { ALLOW_LOCAL_ORIGIN: '1', SITE_ORIGIN: siteOrigin, LOCAL_DRAW_RELAY: new LocalDrawSessionRelay(), LOCAL_DRAW_ADMISSION: new LocalDrawAdmission(), DRAW_ADMISSION_SECRET: 'test-admission-secret-only-not-for-production', LOCAL_DRAW_IP: '127.0.0.1' };
const binding = { projectId: 'project-local-1', openEpoch: 'open-epoch-1' };
const authHeaders = { accept: 'application/json, text/event-stream', 'content-type': 'application/json' };
const rpc = (name, args) => ({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } });

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

  const operation = { type: 'pixels.set', frameId: 'frame-1', layerId: 'layer-1', pixels: [{ x: 255, y: 255, colorIndex: 0 }] };
  const input = { connectionId: connection.connectionId, accessToken: connection.accessToken, expectedRevision: 4, requestId: 'pixel_edit_test_1', operation };
  const editPromise = mcp('edit_draw', input);
  const editCommand = await waitForCommand(session, session.browserToken);
  assert.deepEqual(editCommand.operation, operation);
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

  const saveInput = { connectionId: connection.connectionId, accessToken: connection.accessToken, expectedRevision: 5, requestId: 'save_test_001' };
  const savePromise = mcp('save_draw', saveInput);
  const saveCommand = await waitForCommand(session, session.browserToken);
  assert.deepEqual(saveCommand.operation, { type: 'save' });
  const saveResult = { changed: false, revision: 5, projectBinding: binding, state: { ...state, revision: 5 }, savedRevisionId: 'revision-local-5', savedEditorRevision: 5, dirtyAfter: false, storage: 'browser_local' };
  assert.equal((await acknowledge(session, session.browserToken, saveCommand, saveResult)).status, 200);
  const saveReply = await savePromise;
  assert.equal(saveReply.body.result.structuredContent.status, 'applied');
  assert.equal(saveReply.body.result.structuredContent.result.storage, 'browser_local');
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
