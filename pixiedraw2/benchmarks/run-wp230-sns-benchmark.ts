import { createSnsPost } from "../src/wp230-sns-community-core.ts";
import { AUTHORIZATION_PROOF_POLICY_VERSION, asSha256, type AuthorizationProofV1 } from "../src/wp160-contracts.ts";

const iterations = 10000;
const hash = asSha256("a".repeat(64));
const issuedAt = new Date(Date.now() - 60_000).toISOString();
const expiresAt = new Date(Date.now() + 60_000).toISOString();
function proof(resourceId: string): AuthorizationProofV1 {
  return { schemaVersion: 1, proofType: "AUTHORIZATION_PROOF", source: "server", decision: "allow", authorityId: "wp230-benchmark", proofId: `proof:${resourceId}`, principalId: "creator-benchmark", resourceType: "SNS_POST", resourceId, action: "sns.post.create", capability: "sns.post.create", tenantId: "tenant-wp230-benchmark", correlationId: "wp230-benchmark", policyVersion: AUTHORIZATION_PROOF_POLICY_VERSION, grantId: "grant:wp230-benchmark", issuedAt, expiresAt };
}
const started = performance.now();
let successful = 0;
for (let index = 0; index < iterations; index += 1) {
  const result = await createSnsPost({
    postId: `post-benchmark-${index}` as never,
    shareCommandId: `share-benchmark-${index}` as never,
    creatorId: "creator-benchmark",
    sourceAccountId: "account-benchmark",
    kind: "ASSET_SHARE",
    visibility: "PUBLIC",
    status: "PUBLISHED",
    caption: "Synthetic shared asset",
    references: [{ kind: "ASSET_REVISION", referenceId: `revision-${index}`, revisionHash: hash }],
    cards: [{
      cardId: `card-${index}` as never,
      cardType: "COMPLETED_WORK",
      resourceId: `asset-${index}`,
      cardVersion: 1,
      publicPresentationReference: `/work/asset-${index}`,
      snapshotPolicy: { price: "OMITTED", availability: "LIVE", creator: "LIVE", preview: "LIVE" },
      visibilityAtShare: "PUBLIC",
      approvedAtShare: true,
      status: "APPROVED",
    }],
    explicitShare: true,
    authorizationProof: proof(`post-benchmark-${index}`),
    authorizationProofResolver: ({ expected }: { readonly expected: { readonly resourceId?: string } }) => proof(expected.resourceId ?? `post-benchmark-${index}`),
  });
  if (result.ok) successful += 1;
}
const elapsedMs = performance.now() - started;
console.log(JSON.stringify({
  schemaVersion: 1,
  benchmarkId: "WP230_SNS_REFERENCE_PROJECTION_SYNTHETIC",
  status: "MEASURED_LOCAL_SYNTHETIC",
  iterations,
  successful,
  elapsedMs: Number(elapsedMs.toFixed(3)),
  operationsPerSecond: Number((successful / Math.max(elapsedMs / 1000, 0.001)).toFixed(2)),
  notes: [
    "Pure Share/Post reference projection; no current route, social API, provider, Database, Storage, Search, Notification, Market, or production data was accessed.",
    "This is not a real SNS, RLS, upload, browser, device, memory, moderation, or production performance PASS.",
  ],
}, null, 2));
