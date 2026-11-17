import test from 'node:test';
import assert from 'node:assert/strict';
import { DRAW_OPERATION_SCHEMA } from '../../scripts/mcp/draw-session-relay.mjs';
import { mapStoreToolCall, normalizeStoreToolResult, storeToolDefinitions } from '../../scripts/mcp/store-tool-catalog.mjs';

const binding = { projectId: 'project-1', openEpoch: 'open-1' };
const fullAuth = {
  connectionId: '00000000-0000-4000-8000-000000000001', accessToken: 'a'.repeat(43),
  projectBinding: binding, expiresAt: Date.now() + 60_000, scope: ['draw:read', 'draw:write']
};
const names = [
  'set_draw_pixel', 'set_draw_pixels', 'add_draw_palette_color', 'adjust_draw_color',
  'select_draw_layer', 'add_draw_layer', 'rename_draw_layer', 'set_draw_layer_visibility',
  'set_draw_layer_opacity', 'set_draw_layer_lock', 'move_draw_layer', 'remove_draw_layer',
  'select_draw_frame', 'add_draw_frame', 'set_draw_frame_duration', 'move_draw_frame',
  'remove_draw_frame', 'undo_draw_edit', 'redo_draw_edit'
];
const legacyTools = [
  'list_pixieed_tools', 'get_pixel_art_guide', 'get_pixel_art_techniques',
  'prepare_pixel_art', 'review_pixel_art', 'get_pixel_art_case'
].map((name) => ({ name, title: name, description: 'Optional reference.', inputSchema: { type: 'object', properties: {}, additionalProperties: false }, annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false, idempotentHint: true } }));

test('public catalog exposes each Draw operation as a separate strict tool and no credential fields', () => {
  const tools = storeToolDefinitions({ legacyTools });
  const byName = Object.fromEntries(tools.map((tool) => [tool.name, tool]));
  assert.equal(tools.length, 6 + 19 + 4);
  assert.ok(names.every((name) => byName[name]));
  assert.ok(['save_draw', 'get_draw_state', 'get_draw_operation_status', 'disconnect_draw'].every((name) => byName[name]));
  assert.equal(byName.edit_draw, undefined);
  assert.equal(byName.connect_draw, undefined);
  for (const name of [...names, 'save_draw', 'get_draw_state', 'get_draw_operation_status', 'disconnect_draw']) {
    const tool = byName[name];
    assert.equal(tool.inputSchema.additionalProperties, false, name);
    assert.equal(tool.annotations.openWorldHint, false, name);
    for (const key of ['connectionId', 'accessToken', 'projectBinding', 'operation']) assert.equal(Object.hasOwn(tool.inputSchema.properties || {}, key), false, `${name} hides ${key}`);
  }
  assert.equal(names.length, DRAW_OPERATION_SCHEMA.oneOf.length - 1);
  assert.ok(byName.get_pixel_art_guide.annotations.readOnlyHint, 'art-method references remain available as optional read-only tools');
  assert.equal(byName.get_draw_state.outputSchema.anyOf.length, 2, 'state reads also admit a pending command receipt');
  assert.deepEqual(byName.get_draw_state.outputSchema.anyOf[1].required, ['requestId', 'status', 'revision']);
});

test('an explicitly named pixel operation maps to the server-held connection and fixed operation type', () => {
  const mapped = mapStoreToolCall('set_draw_pixel', { frameId: 'frame-1', layerId: 'layer-1', x: 4, y: 7, colorIndex: 2, expectedRevision: 9, requestId: 'pixel_edit_01' }, fullAuth);
  assert.deepEqual(mapped, {
    kind: 'legacy', name: 'edit_draw', arguments: {
      connectionId: fullAuth.connectionId, accessToken: fullAuth.accessToken, expectedRevision: 9, requestId: 'pixel_edit_01',
      operation: { type: 'pixel.set', frameId: 'frame-1', layerId: 'layer-1', x: 4, y: 7, colorIndex: 2 }
    }
  });
});

test('public inputs cannot override secrets, binding, or the fixed operation type', () => {
  for (const args of [
    { frameId: 'frame-1', layerId: 'layer-1', x: 1, y: 1, colorIndex: 0, expectedRevision: 0, requestId: 'pixel_edit_02', accessToken: 'x'.repeat(43) },
    { frameId: 'frame-1', layerId: 'layer-1', x: 1, y: 1, colorIndex: 0, expectedRevision: 0, requestId: 'pixel_edit_02', connectionId: 'attacker' },
    { frameId: 'frame-1', layerId: 'layer-1', x: 1, y: 1, colorIndex: 0, expectedRevision: 0, requestId: 'pixel_edit_02', projectBinding: { projectId: 'elsewhere', openEpoch: 'elsewhere' } },
    { frameId: 'frame-1', layerId: 'layer-1', x: 1, y: 1, colorIndex: 0, expectedRevision: 0, requestId: 'pixel_edit_02', type: 'frame.remove' }
  ]) assert.throws(() => mapStoreToolCall('set_draw_pixel', args, fullAuth), /Invalid input/);
  assert.throws(() => mapStoreToolCall('get_pixel_art_guide', { accessToken: 'x'.repeat(43) }), /credentials/);
  assert.throws(() => mapStoreToolCall('set_draw_pixel', { frameId: 'frame-1', layerId: 'layer-1', x: 1, y: 1, colorIndex: 0, expectedRevision: 0, requestId: 'pixel_edit_03' }, { ...fullAuth, accessToken: 'user-supplied' }), /Invalid Draw connection/);
});

test('Draw scopes separate reading from writing and expired connections cannot be mapped', () => {
  const readOnly = { ...fullAuth, scope: ['draw:read'] };
  assert.equal(mapStoreToolCall('get_draw_state', {}, readOnly).name, 'get_draw_state');
  assert.equal(mapStoreToolCall('get_draw_operation_status', { requestId: 'status_0001' }, readOnly).method, 'GET');
  assert.throws(() => mapStoreToolCall('set_draw_pixel', { frameId: 'frame-1', layerId: 'layer-1', x: 0, y: 0, colorIndex: 1, expectedRevision: 1, requestId: 'pixel_edit_04' }, readOnly), /Invalid Draw connection/);
  assert.throws(() => mapStoreToolCall('save_draw', { expectedRevision: 1, requestId: 'save_edit_01' }, readOnly), /Invalid Draw save/);
  assert.equal(mapStoreToolCall('disconnect_draw', {}, readOnly).path, '/_relay/revoke');
  assert.throws(() => mapStoreToolCall('get_draw_state', {}, { ...fullAuth, expiresAt: 1 }), /Invalid Draw state/);
  assert.deepEqual(mapStoreToolCall('get_pixel_art_guide', {}, undefined), { kind: 'legacy', name: 'get_pixel_art_guide', arguments: {} });
});

test('save, disconnect, and operation status map to distinct non-resubmitting actions', () => {
  assert.equal(mapStoreToolCall('save_draw', { expectedRevision: 7, requestId: 'save_edit_02' }, fullAuth).name, 'save_draw');
  const disconnect = mapStoreToolCall('disconnect_draw', {}, fullAuth);
  assert.equal(disconnect.kind, 'relay'); assert.equal(disconnect.path, '/_relay/revoke');
  const status = mapStoreToolCall('get_draw_operation_status', { requestId: 'pixel_edit_05' }, fullAuth);
  assert.equal(status.method, 'GET'); assert.equal(status.path, '/_relay/command/pixel_edit_05');
  assert.equal(Object.hasOwn(status, 'body'), false);
});

test('legacy mutation receipts normalize to public shape without project or command metadata', () => {
  const receipt = normalizeStoreToolResult('save_draw', {
    structuredContent: {
      requestId: 'save_edit_09', status: 'applied', projectBinding: binding, commandId: 'command-private', revision: 12,
      result: { changed: false, revision: 12, projectBinding: binding, savedRevisionId: 'local-r12', dirtyAfter: false, storage: 'browser_local' }
    }
  });
  assert.deepEqual(receipt, {
    requestId: 'save_edit_09', status: 'applied', revision: 12,
    result: { changed: false, revision: 12, projectBinding: binding, savedRevisionId: 'local-r12', dirtyAfter: false, storage: 'browser_local' }
  });
  assert.equal(Object.hasOwn(receipt, 'projectBinding'), false);
  assert.equal(Object.hasOwn(receipt, 'commandId'), false);
});

test('relay queued and delivered envelopes normalize to pending without becoming success', () => {
  for (const status of ['queued', 'delivered']) {
    const result = normalizeStoreToolResult('get_draw_operation_status', {
      result: { commandId: 'command-private', requestId: 'draw_edit_001', status, result: null, duplicate: false }
    });
    assert.deepEqual(result, { requestId: 'draw_edit_001', status: 'pending', revision: null });
  }
});

test('relay terminal envelopes preserve unknown/not_applied outcomes and reject mismatches', () => {
  const unknown = normalizeStoreToolResult('get_draw_operation_status', {
    commandId: 'command-private', requestId: 'draw_edit_002', status: 'unknown',
    result: { requestId: 'draw_edit_002', status: 'unknown', projectBinding: binding, revision: null, error: { code: 'ack_timeout', message: 'May have run.' } }
  });
  assert.deepEqual(unknown, { requestId: 'draw_edit_002', status: 'unknown', revision: null, error: { code: 'ack_timeout', message: 'May have run.' } });
  const notApplied = normalizeStoreToolResult('get_draw_operation_status', {
    commandId: 'command-private', requestId: 'draw_edit_003', status: 'not_applied',
    result: { requestId: 'draw_edit_003', status: 'not_applied', projectBinding: binding, revision: null }
  });
  assert.deepEqual(notApplied, { requestId: 'draw_edit_003', status: 'not_applied', revision: null });
  assert.throws(() => normalizeStoreToolResult('get_draw_operation_status', {
    commandId: 'command-private', requestId: 'draw_edit_004', status: 'unknown',
    result: { requestId: 'draw_edit_004', status: 'applied', revision: 3 }
  }), /does not match/);
});

test('state normalization accepts full states and pending receipts while disconnect maps the relay revocation receipt', () => {
  const state = {
    projectBinding: binding, revision: 3, projectPersisted: true, savedRevisionId: 'local-r2', dirty: true,
    width: 1, height: 1, palette: ['#ffffff'], active: { frameId: 'frame-1', layerId: 'layer-1' },
    frames: [{ id: 'frame-1', durationMs: 100 }],
    layers: [{ id: 'layer-1', name: 'Art', visible: true, locked: false, opacity: 1, role: 'art' }],
    cel: { frameId: 'frame-1', layerId: 'layer-1', pixels: [-1] },
    canUndo: false, canRedo: false, busy: false, saved: false
  };
  assert.deepEqual(normalizeStoreToolResult('get_draw_state', { structuredContent: state }), state);
  assert.deepEqual(normalizeStoreToolResult('get_draw_state', { requestId: 'state_read_01', status: 'pending', projectBinding: null, revision: null, error: { code: 'response_pending' } }), {
    requestId: 'state_read_01', status: 'pending', revision: null, error: { code: 'response_pending' }
  });
  assert.deepEqual(normalizeStoreToolResult('disconnect_draw', { structuredContent: { revoked: true } }), { disconnected: true });
  assert.deepEqual(normalizeStoreToolResult('disconnect_draw', { disconnected: true }), { disconnected: true });
  assert.throws(() => normalizeStoreToolResult('set_draw_pixel', { requestId: 'draw_edit_005', status: 'mystery', revision: 1 }), /invalid/);
});

// A browser acknowledgement contains commandId too. It must not bypass the outer status check.
test('a nested acknowledgement cannot replace a contradictory outer relay status', () => {
  assert.throws(() => normalizeStoreToolResult('get_draw_operation_status', {
    commandId: 'outer-command', requestId: 'draw_edit_099', status: 'unknown',
    result: { commandId: 'outer-command', requestId: 'draw_edit_099', status: 'applied', revision: 4 }
  }), /does not match/);
});
