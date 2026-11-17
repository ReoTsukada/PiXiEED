import {
  DRAW_OPERATION_SCHEMA,
  DRAW_STATE_REQUEST_SCHEMA,
  DRAW_STATE_SCHEMA,
  validDrawSessionCommand,
  validProjectBinding
} from './draw-session-relay.mjs';

const LEGACY_TOOL_NAMES = new Set([
  'list_pixieed_tools', 'get_pixel_art_guide', 'get_pixel_art_techniques',
  'prepare_pixel_art', 'review_pixel_art', 'get_pixel_art_case'
]);

const OPERATION_TO_TOOL = new Map([
  ['pixel.set', 'set_draw_pixel'], ['pixels.set', 'set_draw_pixels'],
  ['palette.add', 'add_draw_palette_color'], ['color.adjust', 'adjust_draw_color'],
  ['layer.select', 'select_draw_layer'], ['layer.add', 'add_draw_layer'],
  ['layer.rename', 'rename_draw_layer'], ['layer.visibility', 'set_draw_layer_visibility'],
  ['layer.opacity', 'set_draw_layer_opacity'], ['layer.lock', 'set_draw_layer_lock'],
  ['layer.move', 'move_draw_layer'], ['layer.remove', 'remove_draw_layer'],
  ['frame.select', 'select_draw_frame'], ['frame.add', 'add_draw_frame'],
  ['frame.duration', 'set_draw_frame_duration'], ['frame.move', 'move_draw_frame'],
  ['frame.remove', 'remove_draw_frame'], ['undo', 'undo_draw_edit'], ['redo', 'redo_draw_edit']
]);
const TOOL_TO_OPERATION = new Map([...OPERATION_TO_TOOL].map(([operation, tool]) => [tool, operation]));

const operationDescriptions = {
  'pixel.set': 'Set or clear one pixel in the connected Draw project.',
  'pixels.set': 'Set or clear up to 512 distinct pixels in the connected Draw project.',
  'palette.add': 'Add one color to the connected Draw project palette.',
  'color.adjust': 'Adjust color settings for one cel or the whole connected Draw project.',
  'layer.select': 'Select a layer in the connected Draw project.',
  'layer.add': 'Add a layer to the connected Draw project.',
  'layer.rename': 'Rename a layer in the connected Draw project.',
  'layer.visibility': 'Change a layer’s visibility in the connected Draw project.',
  'layer.opacity': 'Set a layer’s opacity in the connected Draw project.',
  'layer.lock': 'Change a layer’s lock state in the connected Draw project.',
  'layer.move': 'Move a layer in the connected Draw layer order.',
  'layer.remove': 'Remove a layer from the connected Draw project.',
  'frame.select': 'Select a frame in the connected Draw project.',
  'frame.add': 'Add a frame to the connected Draw project.',
  'frame.duration': 'Set a frame duration in the connected Draw project.',
  'frame.move': 'Move a frame in the connected Draw timeline.',
  'frame.remove': 'Remove a frame from the connected Draw project.',
  undo: 'Undo the latest available Draw edit.',
  redo: 'Redo the latest available Draw edit.'
};

const additiveOperations = new Set(['palette.add', 'layer.add', 'frame.add']);
const selectionOperations = new Set(['layer.select', 'frame.select']);

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function clone(value) {
  return structuredClone(value);
}

function operationSchema(type) {
  return DRAW_OPERATION_SCHEMA.oneOf.find((schema) => schema.properties.type.const === type);
}

function operationInputSchema(type) {
  const schema = operationSchema(type);
  const properties = Object.fromEntries(Object.entries(schema.properties).filter(([key]) => key !== 'type'));
  const required = schema.required.filter((key) => key !== 'type');
  const destructive = !additiveOperations.has(type) && !selectionOperations.has(type);
  return {
    type: 'object', additionalProperties: false,
    required: [...required, 'expectedRevision', 'requestId'],
    properties: {
      ...properties,
      expectedRevision: { type: 'integer', minimum: 0 },
      requestId: { type: 'string', minLength: 8, maxLength: 100, pattern: '^[A-Za-z0-9_-]{8,100}$' }
    },
    description: operationDescriptions[type],
    annotations: { readOnlyHint: false, destructiveHint: destructive, openWorldHint: false, idempotentHint: true }
  };
}

function drawTool({ name, title, description, inputSchema, outputSchema, annotations }) {
  return { name, title, description, inputSchema, outputSchema, annotations };
}

function authSchema() {
  return { type: 'object', additionalProperties: false };
}

const drawResultSchema = {
  type: 'object', additionalProperties: false,
  required: ['requestId', 'status', 'revision'],
  properties: {
    requestId: { type: 'string' }, status: { enum: ['applied', 'not_applied', 'unknown', 'pending'] },
    revision: { anyOf: [{ type: 'integer', minimum: 0 }, { type: 'null' }] },
    result: { type: 'object' },
    error: { type: 'object', additionalProperties: false, required: ['code'], properties: { code: { type: 'string' }, message: { type: 'string' } } }
  }
};
const stateResultSchema = { anyOf: [DRAW_STATE_SCHEMA, drawResultSchema] };

function liveToolDefinitions() {
  const tools = [...OPERATION_TO_TOOL].map(([type, name]) => {
    const schema = operationInputSchema(type);
    const { description, annotations, ...inputSchema } = schema;
    return drawTool({
      name, title: name.replaceAll('_', ' '), description: `${description} Requires the current editor revision and a unique requestId. A pending or unknown result is not a rejection; check its status before deciding whether to retry.`,
      inputSchema, outputSchema: drawResultSchema, annotations
    });
  });
  tools.push(drawTool({
    name: 'save_draw', title: 'Save the active Draw project',
    description: 'Save the paired project revision in browser-local Draw storage. Requires the current editor revision and a unique requestId. Reports whether later edits remain unsaved; it does not publish or cloud-sync the project.',
    inputSchema: {
      type: 'object', additionalProperties: false, required: ['expectedRevision', 'requestId'],
      properties: {
        expectedRevision: { type: 'integer', minimum: 0 },
        requestId: { type: 'string', minLength: 8, maxLength: 100, pattern: '^[A-Za-z0-9_-]{8,100}$' }
      }
    }, outputSchema: drawResultSchema,
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false, idempotentHint: true }
  }));
  tools.push(drawTool({
    name: 'get_draw_state', title: 'Read the active Draw state',
    description: 'Read the connected Draw project state, active frame and layer, palette, and requested cel pixels. Does not change or save the project.',
    inputSchema: clone(DRAW_STATE_REQUEST_SCHEMA), outputSchema: clone(stateResultSchema),
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false, idempotentHint: true }
  }));
  tools.push(drawTool({
    name: 'get_draw_operation_status', title: 'Check a Draw operation result',
    description: 'Check the recorded result of one previously submitted Draw requestId. This only reads status; it never resends or repeats the operation.',
    inputSchema: {
      type: 'object', additionalProperties: false, required: ['requestId'],
      properties: { requestId: { type: 'string', minLength: 8, maxLength: 100, pattern: '^[A-Za-z0-9_-]{8,100}$' } }
    }, outputSchema: drawResultSchema,
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false, idempotentHint: true }
  }));
  tools.push(drawTool({
    name: 'disconnect_draw', title: 'Disconnect Draw',
    description: 'Revoke this connected Draw session and cancel queued operations that have not yet reached the browser. An operation already delivered may have applied and is not rolled back.',
    inputSchema: authSchema(),
    outputSchema: { type: 'object', additionalProperties: false, required: ['disconnected'], properties: { disconnected: { const: true } } },
    annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false, idempotentHint: true }
  }));
  return tools;
}

export function storeToolDefinitions({ legacyTools = [] } = {}) {
  if (!Array.isArray(legacyTools)) throw new TypeError('legacyTools must be an array.');
  const byName = new Map(legacyTools.filter((tool) => LEGACY_TOOL_NAMES.has(tool?.name)).map((tool) => [tool.name, tool]));
  const stateless = [...LEGACY_TOOL_NAMES].flatMap((name) => byName.has(name) ? [clone(byName.get(name))] : []);
  return [...stateless, ...liveToolDefinitions()];
}

function exactInput(args, allowed, required = []) {
  return isRecord(args) && Object.keys(args).every((key) => allowed.includes(key)) && required.every((key) => Object.hasOwn(args, key));
}

function validAuthProps(authProps) {
  return isRecord(authProps) && exactInput(authProps, ['connectionId', 'accessToken', 'projectBinding', 'expiresAt', 'scope'], ['connectionId', 'accessToken', 'projectBinding', 'expiresAt', 'scope']) &&
    /^[0-9a-f-]{36}$/i.test(authProps.connectionId) && /^[A-Za-z0-9_-]{43}$/.test(authProps.accessToken) &&
    validProjectBinding(authProps.projectBinding) && Number.isFinite(authProps.expiresAt) && authProps.expiresAt > Date.now() &&
    Array.isArray(authProps.scope) && authProps.scope.every((scope) => ['draw:read', 'draw:write'].includes(scope));
}

function hasScope(authProps, required) {
  return validAuthProps(authProps) && authProps.scope.includes(required);
}

function withAuth(authProps, args) {
  return { connectionId: authProps.connectionId, accessToken: authProps.accessToken, ...args };
}

function mapEdit(name, args, authProps) {
  const type = TOOL_TO_OPERATION.get(name);
  const schema = operationSchema(type);
  const inputFields = Object.keys(schema.properties).filter((key) => key !== 'type');
  const requiredFields = schema.required.filter((key) => key !== 'type');
  const allowed = [...inputFields, 'expectedRevision', 'requestId'];
  if (!exactInput(args, allowed, [...requiredFields, 'expectedRevision', 'requestId'])) throw new TypeError(`Invalid input for ${name}.`);
  const operation = { type };
  for (const key of inputFields) if (Object.hasOwn(args, key)) operation[key] = args[key];
  const command = { kind: 'operation', projectBinding: authProps.projectBinding, expectedRevision: args.expectedRevision, operation };
  if (!validDrawSessionCommand(command)) throw new TypeError(`Invalid operation payload for ${name}.`);
  return { kind: 'legacy', name: 'edit_draw', arguments: withAuth(authProps, { expectedRevision: args.expectedRevision, requestId: args.requestId, operation }) };
}

export function mapStoreToolCall(name, args, authProps) {
  if (!isRecord(args)) throw new TypeError('Tool arguments must be an object.');
  if (LEGACY_TOOL_NAMES.has(name)) {
    if (Object.keys(args).some((key) => ['connectionId', 'accessToken', 'projectBinding', 'claimBinding', 'pairingCode', 'secret'].includes(key))) throw new TypeError('Connection credentials are not valid tool arguments.');
    return { kind: 'legacy', name, arguments: clone(args) };
  }
  if (name === 'get_draw_state') {
    if (!hasScope(authProps, 'draw:read') || !exactInput(args, ['frameId', 'layerId'])) throw new TypeError('Invalid Draw state request or connection.');
    if (!validDrawSessionCommand({ kind: 'state.get', projectBinding: authProps.projectBinding, stateRequest: args })) throw new TypeError('Invalid Draw state request.');
    return { kind: 'legacy', name, arguments: withAuth(authProps, args) };
  }
  if (name === 'save_draw') {
    if (!hasScope(authProps, 'draw:write') || !exactInput(args, ['expectedRevision', 'requestId'], ['expectedRevision', 'requestId']) || !validDrawSessionCommand({ kind: 'operation', projectBinding: authProps.projectBinding, expectedRevision: args.expectedRevision, operation: { type: 'save' } }) || !/^[A-Za-z0-9_-]{8,100}$/.test(args.requestId)) throw new TypeError('Invalid Draw save request or connection.');
    return { kind: 'legacy', name, arguments: withAuth(authProps, args) };
  }
  if (name === 'disconnect_draw') {
    if (!validAuthProps(authProps) || !authProps.scope.some((scope) => ['draw:read', 'draw:write'].includes(scope)) || Object.keys(args).length) throw new TypeError('Invalid Draw disconnect request or connection.');
    return { kind: 'relay', method: 'POST', path: '/_relay/revoke', connectionId: authProps.connectionId, accessToken: authProps.accessToken, body: {} };
  }
  if (name === 'get_draw_operation_status') {
    if (!hasScope(authProps, 'draw:read') || !exactInput(args, ['requestId'], ['requestId']) || !/^[A-Za-z0-9_-]{8,100}$/.test(args.requestId)) throw new TypeError('Invalid Draw status request or connection.');
    return { kind: 'relay', method: 'GET', path: `/_relay/command/${encodeURIComponent(args.requestId)}`, connectionId: authProps.connectionId, accessToken: authProps.accessToken };
  }
  if (TOOL_TO_OPERATION.has(name)) {
    if (!hasScope(authProps, 'draw:write')) throw new TypeError('Invalid Draw connection.');
    return mapEdit(name, args, authProps);
  }
  throw new TypeError(`Unknown Store tool: ${name}.`);
}

function unwrapStoreResult(value) {
  if (!isRecord(value)) throw new TypeError('Store tool result must be an object.');
  if (value.isError === true) return value;
  if (isRecord(value.result)) {
    if (value.result.isError === true) return value.result;
    if (Object.hasOwn(value.result, 'structuredContent')) return value.result.structuredContent;
    if (!Object.hasOwn(value, 'status') && Object.hasOwn(value.result, 'commandId') && Object.hasOwn(value.result, 'requestId') && Object.hasOwn(value.result, 'status')) return value.result;
  }
  if (Object.hasOwn(value, 'structuredContent')) return value.structuredContent;
  return value;
}

function normalizedReceipt(value, fallbackRequestId) {
  if (!isRecord(value)) throw new TypeError('Draw receipt must be an object.');
  const requestId = typeof value.requestId === 'string' ? value.requestId : fallbackRequestId;
  const status = value.status;
  if (typeof requestId !== 'string' || !['applied', 'not_applied', 'unknown', 'pending'].includes(status)) throw new TypeError('Draw receipt status is invalid.');
  const revision = Number.isInteger(value.revision) && value.revision >= 0 ? value.revision : null;
  const normalized = { requestId, status, revision };
  if (isRecord(value.result)) normalized.result = clone(value.result);
  if (value.error !== undefined) {
    if (!isRecord(value.error) || typeof value.error.code !== 'string') throw new TypeError('Draw receipt error is invalid.');
    normalized.error = { code: value.error.code, ...(typeof value.error.message === 'string' ? { message: value.error.message } : {}) };
  }
  return normalized;
}

export function normalizeStoreToolResult(name, legacyResultOrStatus) {
  const value = unwrapStoreResult(legacyResultOrStatus);
  if (isRecord(value) && value.isError === true) return value;
  if (name === 'disconnect_draw') {
    if (!isRecord(value) || (value.disconnected !== true && value.revoked !== true)) throw new TypeError('Draw disconnect result is invalid.');
    return { disconnected: true };
  }
  if (name === 'get_draw_state' && isRecord(value) && isRecord(value.cel) && Array.isArray(value.palette) && Number.isInteger(value.revision)) return clone(value);
  if (!['get_draw_state', 'get_draw_operation_status', 'save_draw', ...TOOL_TO_OPERATION.keys()].includes(name)) throw new TypeError(`Unknown Store result tool: ${name}.`);

  // The DO status route wraps the browser receipt in command metadata. Queued and
  // delivered are still pending; the adapter must never turn them into success.
  if (isRecord(value) && Object.hasOwn(value, 'commandId') && typeof value.status === 'string') {
    if (typeof value.requestId !== 'string') throw new TypeError('Draw status response is missing requestId.');
    if (['queued', 'delivered'].includes(value.status) && value.result === null) return { requestId: value.requestId, status: 'pending', revision: null };
    if (!['applied', 'not_applied', 'unknown'].includes(value.status)) throw new TypeError('Draw status response is invalid.');
    if (isRecord(value.result) && (Object.hasOwn(value.result, 'status') || Object.hasOwn(value.result, 'requestId'))) {
      if (value.result.status !== value.status || value.result.requestId !== value.requestId) throw new TypeError('Draw status receipt does not match its envelope.');
      return normalizedReceipt(value.result, value.requestId);
    }
    if (['queued', 'delivered'].includes(value.status)) throw new TypeError('Draw pending response contains an invalid receipt.');
  }
  return normalizedReceipt(value);
}
