import { strict as assert } from "node:assert";

// Preflight-only invalid-input anchors remain explicit and repository-bound.
// AUTHORITY-ROOT-001 CALLER_INJECTION_REJECTED REJECT
// RESOLVER-IDENTITY-001 CANONICAL_IDENTITY_MISMATCH REJECT
// CALLER-STATE-001 CALLER_STATE_NOT_AUTHORITY REJECT
// EVENT-ID-001 CANONICAL_EVENT_ID_REQUIRED REJECT
// REPLAY-REVOKE-001 LIFECYCLE_TRANSITION_NOT_AUTHORIZED REJECT

const html = await Deno.readTextFile(
  "assets/pixync-indexeddb-browser-harness.html",
);
const bundle = await Deno.readTextFile(
  "assets/pixync-indexeddb-browser-harness.js",
);

Deno.test("PIXYNC-DRAW2-140-FIXTURE-01 serves a browser-loadable local harness", () => {
  assert.match(html, /fetch\("\.\/pixync-indexeddb-browser-harness\.js"/u);
  assert.match(html, /new Blob\(\[source\], \{ type: "text\/javascript" \}\)/u);
  assert.match(html, /window\.__pixyncDraw2BrowserResult/u);
  assert.match(bundle, /export\s*\{[\s\S]*runPixyncIndexedDbBrowserHarness/u);
  assert.match(bundle, /indexedDB\.open/u);
  assert.match(bundle, /localStorage/u);
});

Deno.test("PIXYNC-DRAW2-140-FIXTURE-02 exposes all required browser result checks", () => {
  for (
    const id of [
      "project-isolation",
      "reload-recovery",
      "save-failure-surface",
      "tamper-rejection",
      "same-instance-ordering",
    ]
  ) {
    assert.match(bundle, new RegExp(`"${id}"`, "u"));
  }
  assert.match(bundle, /PIXYNC-DRAW2-140-BROWSER-HARNESS-V1/u);
  assert.match(bundle, /OPEN_FAILED/u);
  assert.match(bundle, /Tampered snapshot was rejected/u);
});

Deno.test("PIXYNC-DRAW2-140-FIXTURE-03 remains outside product composition", () => {
  assert.doesNotMatch(html, /draw2-entry|supabase|realtime/iu);
  assert.doesNotMatch(bundle, /draw2-entry|supabase|realtime/iu);
});
