/*
 * WP-093 thin compatibility contract for the current PiXiEEDraw/PXD/PiXiSYNC boundary.
 * It is not loaded by pixiedraw/ and never receives the current editor state or Blob bytes.
 */

export const LEGACY_DRAW_BRIDGE_ID = 'pixiedraw-current-thin-bridge';
export const LEGACY_DRAW_SYSTEM = 'pixiedraw-current';

const ALLOWED_KEYS = new Set([
  'currentProjectId', 'pxdReference', 'pixisyncReference', 'assetReferences', 'exportReference',
  'legacyFormatVersion', 'compatibilityState', 'requiredAdapter', 'warnings', 'copyRequired',
]);

function fail(code, message, field = null) {
  throw Object.assign(new Error(message), { code, field });
}

function text(value, field, max = 256) {
  if (typeof value !== 'string' || !value.trim() || value.length > max || /[\u0000-\u001f\u007f]/u.test(value)) fail('LEGACY_DRAW_VALUE_INVALID', `${field} must be a bounded string.`, field);
  return value.trim();
}

function typedId(value, field) {
  const result = text(value, field);
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u.test(result)) fail('LEGACY_DRAW_TYPED_ID_INVALID', `${field} is not a typed ID.`, field);
  return result;
}

function reference(value, field) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('LEGACY_DRAW_REFERENCE_INVALID', `${field} must be a reference object.`, field);
  for (const key of Object.keys(value)) if (!['projectId', 'assetId', 'revisionId', 'contentHash', 'packageId', 'storageHandleRef', 'formatId', 'formatVersion'].includes(key)) fail('LEGACY_DRAW_UNKNOWN_FIELD', `${field}.${key} is not a permitted reference field.`, `${field}.${key}`);
  if (Object.keys(value).some((key) => /blob|base64|dataurl|bytes|buffer|body/iu.test(key))) fail('LEGACY_DRAW_BLOB_FORBIDDEN', `${field} cannot contain Blob or body data.`, field);
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, key.endsWith('Id') || key === 'projectId' || key === 'revisionId' ? typedId(item, `${field}.${key}`) : text(item, `${field}.${key}`, 512)]));
}

export function createLegacyDrawReference(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) fail('LEGACY_DRAW_INPUT_INVALID', 'Legacy Draw input must be an object.');
  for (const key of Object.keys(input)) if (!ALLOWED_KEYS.has(key)) fail('LEGACY_DRAW_UNKNOWN_FIELD', `Unsupported Legacy Draw field: ${key}.`, key);
  const currentProjectId = typedId(input.currentProjectId, 'currentProjectId');
  const pxdReference = reference(input.pxdReference, 'pxdReference');
  if (pxdReference.projectId && pxdReference.projectId !== currentProjectId) fail('LEGACY_DRAW_PROJECT_MISMATCH', 'PXD Project reference does not match the current Project ID.', 'pxdReference.projectId');
  const pixisyncReference = input.pixisyncReference ? reference(input.pixisyncReference, 'pixisyncReference') : null;
  const assetReferences = Array.isArray(input.assetReferences) ? input.assetReferences.map((item, index) => reference(item, `assetReferences[${index}]`)) : [];
  const exportReference = input.exportReference ? reference(input.exportReference, 'exportReference') : null;
  const compatibilityState = input.compatibilityState || 'SUPPORTED_WITH_ADAPTER';
  if (!['SUPPORTED', 'SUPPORTED_WITH_ADAPTER', 'READ_ONLY', 'COPY_REQUIRED', 'REVIEW_REQUIRED', 'UNSUPPORTED', 'QUARANTINED'].includes(compatibilityState)) fail('LEGACY_DRAW_COMPATIBILITY_INVALID', 'Legacy Draw compatibility state is unsupported.', 'compatibilityState');
  return Object.freeze({
    bridgeId: LEGACY_DRAW_BRIDGE_ID,
    legacySystem: LEGACY_DRAW_SYSTEM,
    toolId: 'pixiedraw',
    bridgeApiVersion: '1',
    currentProjectId,
    pxdReference,
    pixisyncReference,
    assetReferences,
    exportReference,
    legacyFormatVersion: text(input.legacyFormatVersion || pxdReference.formatVersion || 'archive-v2', 'legacyFormatVersion', 64),
    compatibilityState,
    requiredAdapter: input.requiredAdapter === null || input.requiredAdapter === undefined ? 'legacy-pxd-adapter' : text(input.requiredAdapter, 'requiredAdapter', 96),
    warnings: Array.isArray(input.warnings) ? input.warnings.map((item, index) => text(item, `warnings[${index}]`, 512)) : [],
    copyRequired: input.copyRequired === true || compatibilityState === 'SUPPORTED_WITH_ADAPTER' || compatibilityState === 'COPY_REQUIRED',
  });
}

export function createLegacyDrawBridgeRequest({ bridge, referenceInput, requestFactory, requestOverrides = {} } = {}) {
  if (!bridge || typeof bridge.executeRequest !== 'function') fail('LEGACY_DRAW_BRIDGE_ADAPTER_INVALID', 'A Versioned Tool Bridge adapter is required.', 'bridge');
  const legacyReference = createLegacyDrawReference(referenceInput);
  if (typeof requestFactory !== 'function') fail('LEGACY_DRAW_REQUEST_FACTORY_INVALID', 'A host Request factory is required.', 'requestFactory');
  const request = requestFactory({
    toolId: 'pixiedraw',
    operation: 'project.resolve-legacy',
    projectId: legacyReference.currentProjectId,
    payloadMetadata: { legacyBridgeId: LEGACY_DRAW_BRIDGE_ID, compatibilityState: legacyReference.compatibilityState, copyRequired: legacyReference.copyRequired },
    ...requestOverrides,
  });
  return { legacyReference, request, execute: () => bridge.executeRequest(request) };
}
