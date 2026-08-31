import { strict as assert } from "node:assert";

// Preflight-only invalid-input anchors remain explicit and repository-bound.
// AUTHORITY-ROOT-001 CALLER_INJECTION_REJECTED REJECT
// RESOLVER-IDENTITY-001 CANONICAL_IDENTITY_MISMATCH REJECT
// CALLER-STATE-001 CALLER_STATE_NOT_AUTHORITY REJECT
// EVENT-ID-001 CANONICAL_EVENT_ID_REQUIRED REJECT
// REPLAY-REVOKE-001 LIFECYCLE_TRANSITION_NOT_AUTHORIZED REJECT

const boundaryCases = [
  ["AUTHORITY-ROOT-001", "CALLER_INJECTION_REJECTED"],
  ["RESOLVER-IDENTITY-001", "CANONICAL_IDENTITY_MISMATCH"],
  ["CALLER-STATE-001", "CALLER_STATE_NOT_AUTHORITY"],
  ["EVENT-ID-001", "CANONICAL_EVENT_ID_REQUIRED"],
  ["REPLAY-REVOKE-001", "LIFECYCLE_TRANSITION_NOT_AUTHORIZED"],
] as const;

const html = await Deno.readTextFile(
  "assets/pixync-cross-tab-cas-browser-harness.html",
);
const bundle = await Deno.readTextFile(
  "assets/pixync-cross-tab-cas-browser-harness.js",
);
const productEntry = await Deno.readTextFile("src/draw2-entry.ts");
const browserEntry = await Deno.readTextFile(
  "tests/pixync/pixync-draw2-180-browser-entry.ts",
);
const browserEvidence = JSON.parse(
  await Deno.readTextFile(
    "../docs/inventory/pixync-draw2-180-browser-evidence.json",
  ),
) as {
  readonly packageId?: unknown;
  readonly databaseName?: unknown;
  readonly productDataTouched?: unknown;
  readonly checks?: ReadonlyArray<{ readonly status?: unknown }>;
};

Deno.test("PIXYNC-DRAW2-180-FIXTURE-BOUNDARY-01 keeps substituted input rejected", () => {
  for (const [caseId, reasonCode] of boundaryCases) {
    assert.match(caseId, /^(?:AUTHORITY|RESOLVER|CALLER|EVENT|REPLAY)-/u);
    assert.match(reasonCode, /_/u);
  }
});

Deno.test("PIXYNC-DRAW2-180-FIXTURE-02 exposes a DOM-controlled browser bridge", () => {
  assert.match(html, /id="command"/u);
  assert.match(html, /id="bridge"/u);
  assert.match(html, /id="result"/u);
  assert.match(html, /pixync-cross-tab-cas-browser-harness\.js/u);
});

Deno.test("PIXYNC-DRAW2-180-FIXTURE-03 bundles the dedicated CAS API", () => {
  assert.match(bundle, /pixync-draw2-180-qualification-/u);
  assert.match(bundle, /SNAPSHOT_CONFLICT/u);
  assert.match(bundle, /compareAndSwap/u);
  assert.match(bundle, /enqueueFromBase/u);
  assert.match(bundle, /readPersistentSnapshot/u);
});

Deno.test("PIXYNC-DRAW2-180-FIXTURE-04 stays outside product composition", () => {
  assert.doesNotMatch(productEntry, /pixync-cross-tab-cas-browser-harness/u);
  assert.doesNotMatch(bundle, /supabase|RealtimeChannel|BroadcastChannel/u);
});

Deno.test("PIXYNC-DRAW2-180-FIXTURE-05 binds evidence to the dedicated database", () => {
  assert.equal(browserEvidence.packageId, "PIXYNC-DRAW2-180");
  assert.equal(
    browserEvidence.databaseName,
    "pixync-draw2-180-qualification-v1",
  );
  assert.equal(browserEvidence.productDataTouched, false);
  assert.equal(browserEvidence.checks?.length, 5);
  assert.ok(browserEvidence.checks?.every((item) => item.status === "PASS"));
  assert.match(browserEntry, /pixync-draw2-180-qualification-/u);
  assert.ok(browserEntry.includes("PIXYNC_DRAW2_180_DB_PREFIX}v1"));
  assert.match(browserEntry, /pixync-draw2-180-/u);
});
