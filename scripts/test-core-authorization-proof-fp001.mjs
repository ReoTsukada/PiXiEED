import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  AUTHORIZATION_PROOF_SCHEMA_VERSION,
  createServerAuthorizationProofIssuer,
  normalizeAuthorizationProof,
  requireAllowAuthorizationProof,
  resolveAuthorizationProof,
} from '../core-shell/assets/core-authorization-proof-contracts.js';

const fixture = JSON.parse(readFileSync(new URL('../core-shell/fixtures/authorization-proof-v1.valid.json', import.meta.url), 'utf8'));
assert.equal(fixture.schemaVersion, AUTHORIZATION_PROOF_SCHEMA_VERSION);
assert.equal(normalizeAuthorizationProof(fixture, {
  principalId: 'principal-1', resourceType: 'PROJECT', resourceId: 'project-1', action: 'read', capability: 'project.read',
}).proofId, 'authz-proof-1');

assert.throws(() => normalizeAuthorizationProof({ ...fixture, source: 'client' }), /server/);
assert.throws(() => normalizeAuthorizationProof({ ...fixture, resourceId: 'project-2' }, { resourceId: 'project-1' }), /bound/);
assert.throws(() => normalizeAuthorizationProof({ ...fixture, expiresAt: fixture.issuedAt }), /later/);
assert.throws(() => requireAllowAuthorizationProof({ ...fixture, decision: 'deny' }), /did not grant/);
await assert.rejects(() => resolveAuthorizationProof({ expected: { principalId: 'principal-1', resourceType: 'PROJECT', resourceId: 'project-1', action: 'read', capability: 'project.read' }, callerProof: fixture }), /evaluator/);

let sequence = 0;
const issue = createServerAuthorizationProofIssuer({
  authorityId: 'test-server',
  policyVersion: 'fp001-test-v1',
  clock: () => '2099-08-09T00:00:00.000Z',
  idGenerator: (kind) => `${kind}-${++sequence}`,
  evaluator: async ({ principalId, resourceType, resourceId, action, capability }) => ({
    decision: principalId === 'principal-1' && resourceType === 'PROJECT' && resourceId === 'project-1' && action === 'read' && capability === 'project.read' ? 'allow' : 'deny',
    grantId: 'grant-1',
  }),
});
const issued = await issue({ principalId: 'principal-1', resourceType: 'PROJECT', resourceId: 'project-1', action: 'read', capability: 'project.read', tenantId: 'tenant-1', correlationId: 'correlation-1' });
assert.equal(requireAllowAuthorizationProof(issued, { principalId: 'principal-1', resourceType: 'PROJECT', resourceId: 'project-1', action: 'read', capability: 'project.read' }).source, 'server');
const resolved = await resolveAuthorizationProof({
  expected: { principalId: 'principal-1', resourceType: 'PROJECT', resourceId: 'project-1', action: 'read', capability: 'project.read' },
  callerProof: { ...issued, resourceId: 'project-1' },
  authorizationEvaluator: async () => issued,
});
assert.equal(resolved.proofId, issued.proofId);

await assert.rejects(() => resolveAuthorizationProof({
  expected: { principalId: 'principal-2', resourceType: 'PROJECT', resourceId: 'project-1', action: 'read', capability: 'project.read' },
  callerProof: issued,
  authorizationEvaluator: async () => issued,
}), /bound/);

console.log('FP-001 AuthorizationProofV1: 8/8 checks passed');
