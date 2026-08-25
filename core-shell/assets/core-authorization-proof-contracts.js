/*
 * FP-001 Authorization and Identity Proof Contract.
 *
 * This module is framework-free and has no browser, storage, network, Supabase, or production
 * route dependency. `normalizeAuthorizationProof` is a structural validator only. A real
 * authorization boundary must call `resolveAuthorizationProof` with an injected server-owned
 * evaluator; a caller-supplied object can never grant access by itself.
 */

export const AUTHORIZATION_PROOF_SCHEMA_VERSION = 1;
export const AUTHORIZATION_PROOF_TYPE = 'AUTHORIZATION_PROOF';
export const AUTHORIZATION_PROOF_SOURCE = 'server';
export const AUTHORIZATION_PROOF_POLICY_VERSION = 'authorization-policy-v1';

export const AUTHORIZATION_DECISIONS = Object.freeze(['allow', 'deny', 'unknown']);

export const AUTHORIZATION_PROOF_LIMITS = Object.freeze({
  id: 128,
  authorityId: 128,
  resourceType: 64,
  action: 128,
  capability: 128,
  tenantId: 128,
  policyVersion: 64,
  timestamp: 64,
});

const PROOF_KEYS = new Set([
  'schemaVersion', 'proofType', 'source', 'decision', 'authorityId', 'proofId', 'principalId',
  'resourceType', 'resourceId', 'action', 'capability', 'tenantId', 'correlationId', 'policyVersion',
  'grantId', 'issuedAt', 'expiresAt',
]);

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function clone(value) {
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

function fail(code, message, field = null) {
  throw Object.assign(new Error(message), { code, field });
}

function text(value, field, maxLength) {
  if (typeof value !== 'string' || value.trim().length < 1 || value.length > maxLength) {
    fail('AUTHZ_PROOF_FIELD_INVALID', `${field} must be a non-empty string of at most ${maxLength} characters.`, field);
  }
  return value.trim();
}

function nullableText(value, field, maxLength) {
  if (value === null || value === undefined) return null;
  return text(value, field, maxLength);
}

function timestamp(value, field) {
  const normalized = text(value, field, AUTHORIZATION_PROOF_LIMITS.timestamp);
  if (!Number.isFinite(Date.parse(normalized))) fail('AUTHZ_PROOF_TIMESTAMP_INVALID', `${field} must be an ISO timestamp.`, field);
  return normalized;
}

function sameField(expected, actual, field) {
  if (expected !== undefined && expected !== actual) fail('AUTHZ_PROOF_BINDING_MISMATCH', `${field} is not bound to the requested authorization scope.`, field);
}

/**
 * Validate and normalize a Proof. This does not establish that the Proof came from a server.
 * Use resolveAuthorizationProof at a trusted server boundary for that purpose.
 */
export function normalizeAuthorizationProof(value, expected = {}) {
  try {
    if (!isObject(value)) fail('AUTHZ_PROOF_INVALID', 'Authorization Proof must be an object.');
    for (const key of Object.keys(value)) if (!PROOF_KEYS.has(key)) fail('AUTHZ_PROOF_UNKNOWN_FIELD', `Unknown Authorization Proof field: ${key}.`, key);
    if (value.schemaVersion !== AUTHORIZATION_PROOF_SCHEMA_VERSION) fail('AUTHZ_PROOF_SCHEMA_UNSUPPORTED', 'Unsupported Authorization Proof schema version.', 'schemaVersion');
    if (value.proofType !== AUTHORIZATION_PROOF_TYPE) fail('AUTHZ_PROOF_TYPE_INVALID', 'Authorization Proof type is invalid.', 'proofType');
    if (value.source !== AUTHORIZATION_PROOF_SOURCE) fail('AUTHZ_PROOF_SOURCE_INVALID', 'Authorization Proof source must be server.', 'source');
    if (!AUTHORIZATION_DECISIONS.includes(value.decision)) fail('AUTHZ_PROOF_DECISION_INVALID', 'Authorization Proof decision is invalid.', 'decision');

    const normalized = {
      schemaVersion: AUTHORIZATION_PROOF_SCHEMA_VERSION,
      proofType: AUTHORIZATION_PROOF_TYPE,
      source: AUTHORIZATION_PROOF_SOURCE,
      decision: value.decision,
      authorityId: text(value.authorityId, 'authorityId', AUTHORIZATION_PROOF_LIMITS.authorityId),
      proofId: text(value.proofId, 'proofId', AUTHORIZATION_PROOF_LIMITS.id),
      principalId: nullableText(value.principalId, 'principalId', AUTHORIZATION_PROOF_LIMITS.id),
      resourceType: text(value.resourceType, 'resourceType', AUTHORIZATION_PROOF_LIMITS.resourceType),
      resourceId: text(value.resourceId, 'resourceId', AUTHORIZATION_PROOF_LIMITS.id),
      action: text(value.action, 'action', AUTHORIZATION_PROOF_LIMITS.action),
      capability: text(value.capability, 'capability', AUTHORIZATION_PROOF_LIMITS.capability),
      tenantId: nullableText(value.tenantId, 'tenantId', AUTHORIZATION_PROOF_LIMITS.tenantId),
      correlationId: nullableText(value.correlationId, 'correlationId', AUTHORIZATION_PROOF_LIMITS.id),
      policyVersion: text(value.policyVersion, 'policyVersion', AUTHORIZATION_PROOF_LIMITS.policyVersion),
      grantId: nullableText(value.grantId, 'grantId', AUTHORIZATION_PROOF_LIMITS.id),
      issuedAt: timestamp(value.issuedAt, 'issuedAt'),
      expiresAt: timestamp(value.expiresAt, 'expiresAt'),
    };
    if (Date.parse(normalized.expiresAt) <= Date.parse(normalized.issuedAt)) fail('AUTHZ_PROOF_EXPIRY_INVALID', 'expiresAt must be later than issuedAt.', 'expiresAt');
    sameField(expected.principalId, normalized.principalId, 'principalId');
    sameField(expected.resourceType, normalized.resourceType, 'resourceType');
    sameField(expected.resourceId, normalized.resourceId, 'resourceId');
    sameField(expected.action, normalized.action, 'action');
    sameField(expected.capability, normalized.capability, 'capability');
    sameField(expected.tenantId, normalized.tenantId, 'tenantId');
    sameField(expected.correlationId, normalized.correlationId, 'correlationId');
    sameField(expected.policyVersion, normalized.policyVersion, 'policyVersion');
    return Object.freeze(normalized);
  } catch (error) {
    throw error.code ? error : Object.assign(new Error(error.message), { code: 'AUTHZ_PROOF_INVALID' });
  }
}

export function requireAllowAuthorizationProof(value, expected = {}) {
  const proof = normalizeAuthorizationProof(value, expected);
  if (proof.decision !== 'allow') fail('AUTHZ_PERMISSION_DENIED', 'Authorization Proof did not grant the requested capability.', 'decision');
  if (Date.parse(proof.expiresAt) <= Date.now()) fail('AUTHZ_PROOF_EXPIRED', 'Authorization Proof has expired.', 'expiresAt');
  return proof;
}

/**
 * Resolve authority from an injected server evaluator. The optional callerProof is checked for
 * shape and scope, but it is never used as the source of permission. The evaluator result is the
 * only authority returned to a consuming Core.
 */
export async function resolveAuthorizationProof({ expected, callerProof = null, authorizationEvaluator } = {}) {
  if (typeof authorizationEvaluator !== 'function') fail('AUTHZ_SERVER_EVALUATOR_REQUIRED', 'A server-owned authorization evaluator is required.');
  const authorityResult = await authorizationEvaluator({ ...clone(expected), source: AUTHORIZATION_PROOF_SOURCE });
  const authorityProof = authorityResult?.proof || authorityResult;
  const resolved = normalizeAuthorizationProof(authorityProof, expected);
  if (Date.parse(resolved.expiresAt) <= Date.now()) fail('AUTHZ_PROOF_EXPIRED', 'Server AuthorizationProof has expired.', 'expiresAt');
  if (callerProof !== null && callerProof !== undefined) {
    const caller = normalizeAuthorizationProof(callerProof, expected);
    if (Date.parse(caller.expiresAt) <= Date.now()) fail('AUTHZ_PROOF_EXPIRED', 'Caller AuthorizationProof has expired.', 'expiresAt');
  }
  return resolved;
}

export function resolveAuthorizationProofSync({ expected, callerProof = null, authorizationEvaluator } = {}) {
  if (typeof authorizationEvaluator !== 'function') fail('AUTHZ_SERVER_EVALUATOR_REQUIRED', 'A server-owned authorization evaluator is required.');
  const authorityResult = authorizationEvaluator({ ...clone(expected), source: AUTHORIZATION_PROOF_SOURCE });
  if (authorityResult && typeof authorityResult.then === 'function') fail('AUTHZ_SYNC_EVALUATOR_ASYNC', 'A synchronous Core boundary cannot use an asynchronous Authorization evaluator.');
  const authorityProof = authorityResult?.proof || authorityResult;
  const resolved = normalizeAuthorizationProof(authorityProof, expected);
  if (Date.parse(resolved.expiresAt) <= Date.now()) fail('AUTHZ_PROOF_EXPIRED', 'Server AuthorizationProof has expired.', 'expiresAt');
  if (callerProof !== null && callerProof !== undefined) {
    const caller = normalizeAuthorizationProof(callerProof, expected);
    if (Date.parse(caller.expiresAt) <= Date.now()) fail('AUTHZ_PROOF_EXPIRED', 'Caller AuthorizationProof has expired.', 'expiresAt');
  }
  return resolved;
}

/**
 * Server-side adapter helper. Keep this factory out of client bundles. It exists so isolated
 * fixtures and the future server adapter produce the same typed Proof without exposing account
 * rows, JWTs, or private content to Core contracts.
 */
export function createServerAuthorizationProofIssuer({ authorityId, policyVersion, clock, idGenerator, evaluator } = {}) {
  const normalizedAuthorityId = text(authorityId, 'authorityId', AUTHORIZATION_PROOF_LIMITS.authorityId);
  const normalizedPolicyVersion = text(policyVersion, 'policyVersion', AUTHORIZATION_PROOF_LIMITS.policyVersion);
  if (typeof clock !== 'function') fail('AUTHZ_CLOCK_ADAPTER_REQUIRED', 'A clock adapter is required for Proof issuance.');
  if (typeof idGenerator !== 'function') fail('AUTHZ_ID_ADAPTER_REQUIRED', 'An ID adapter is required for Proof issuance.');
  if (typeof evaluator !== 'function') fail('AUTHZ_EVALUATOR_REQUIRED', 'A server evaluator is required for Proof issuance.');
  return async function issue(input = {}) {
    const expected = { ...clone(input), source: AUTHORIZATION_PROOF_SOURCE };
    const decision = await evaluator(expected);
    if (!decision || typeof decision !== 'object') fail('AUTHZ_EVALUATOR_RESULT_INVALID', 'The server evaluator returned no decision.');
    const issuedAt = timestamp(clock(), 'issuedAt');
    const expiresAt = timestamp(decision.expiresAt || new Date(Date.parse(issuedAt) + 300000).toISOString(), 'expiresAt');
    return normalizeAuthorizationProof({
      schemaVersion: AUTHORIZATION_PROOF_SCHEMA_VERSION,
      proofType: AUTHORIZATION_PROOF_TYPE,
      source: AUTHORIZATION_PROOF_SOURCE,
      decision: decision.decision,
      authorityId: normalizedAuthorityId,
      proofId: idGenerator('authorization-proof'),
      principalId: expected.principalId ?? null,
      resourceType: expected.resourceType,
      resourceId: expected.resourceId,
      action: expected.action,
      capability: expected.capability,
      tenantId: expected.tenantId ?? null,
      correlationId: expected.correlationId ?? null,
      policyVersion: normalizedPolicyVersion,
      grantId: decision.grantId ?? null,
      issuedAt,
      expiresAt,
    }, expected);
  };
}
