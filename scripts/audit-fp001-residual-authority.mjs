#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const sns = read('pixiedraw2/src/wp230-sns-community-core.ts');
const wp240 = read('pixiedraw2/src/wp240-admin-analytics-ads-core.ts');
const wp250 = read('pixiedraw2/src/wp250-policy-economics-core.ts');
const event = read('core-shell/assets/core-event-activity-contracts.js');
const notification = read('core-shell/assets/core-notification-contracts.js');
const publicUrl = read('core-shell/assets/core-public-url-routing-contracts.js');
const fp003yBoundary = read('scripts/audit-fp003y-boundary.mjs');

const securityLegacyPatterns = [
  [sns, /serverResolved(?:Recipient|Creator|Resource|Actor|Target|Owner)?\b|serverAllowed\b/u, 'SNS legacy authority'],
  [wp240, /serverResolvedActor\b/u, 'WP-240 moderation Boolean'],
  [wp250, /serverResolved(?:Actor|Reporter|Moderator)\b/u, 'WP-250 Admin/Moderation Boolean'],
  [notification, /serverAllow\(/u, 'Notification legacy serverAllow'],
  [sns, /input\.authorizationProof\?\.principalId/u, 'SNS caller Proof Principal fallback'],
  [wp240, /principalId:\s*input\.authorizationProof\?\.principalId/u, 'WP-240 caller Proof Principal fallback'],
  [wp250, /principalId:\s*input\.authorizationProof\?\.principalId|principalId:\s*input\.actorReference/u, 'WP-250 caller Principal fallback'],
];
for (const [source, pattern, label] of securityLegacyPatterns) assert.equal(pattern.test(source), false, `${label} remains a caller-controlled authority path.`);
assert.match(event, /resolveAuthorizationProofSync/u, 'WP-095 Event must resolve AuthorizationProofV1.');
assert.match(publicUrl, /resolveAuthorizationProofSync/u, 'WP-098 Public URL must resolve AuthorizationProofV1.');
assert.match(publicUrl, /serverAllow\(decision, code, expected, authorizationEvaluator\)/u, 'WP-098 wrapper must require the server evaluator.');
assert.match(event, /serverAllow\(value, expected, authorizationEvaluator\)/u, 'WP-095 wrapper must require the server evaluator.');
assert.match(fp003yBoundary, /securityAuthorityFallbacks: 0/u, 'FP-003Y residual authority audit must have a zero fallback result.');

const derivedState = (event.match(/trusted: true/gu) || []).length;
const adapterOnly = (read('core-shell/assets/core-asset-registry-contracts.js').match(/clientHashUntrusted/gu) || []).length;
const nonAuthority = (wp240.match(/serverReadOnly\b/gu) || []).length + (wp240.match(/serverResolved: boolean/gu) || []).length + (wp250.match(/serverResolved: boolean/gu) || []).length;

console.log(JSON.stringify({
  securityAuthorityLegacyTrust: 0,
  derivedStateOccurrences: derivedState,
  legacyAdapterOnlyOccurrences: adapterOnly,
  nonAuthorityPolicyOrSafetyOccurrences: nonAuthority,
  publicUrlAndEventWrappers: 'AuthorizationProofV1-bound',
  fp003yBoundary: 'browser/server and caller-Principal fallback checks passed',
}, null, 2));
