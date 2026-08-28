import { strict as assert } from "node:assert";

const html = await Deno.readTextFile("index.html");
const entry = await Deno.readTextFile("src/draw2-entry.ts");
const bootstrap = await Deno.readTextFile(
  "../scripts/pixieed-account-supabase-client.js",
);
const liveHarness = await Deno.readTextFile(
  "../scripts/test-pixiedraw2-stage8-live.mjs",
);

Deno.test("PIXYNC-DRAW2-360 supplies the shared authenticated client before Draw2 starts", () => {
  const clientScript = html.indexOf("pixieed-account-supabase-client.js");
  const drawEntry = html.indexOf("dist/draw2-entry.js");
  assert.ok(clientScript >= 0);
  assert.ok(drawEntry > clientScript);
  assert.match(
    html,
    /pixieed-account-supabase-client\.js\?v=20260828-staging-config-v1/u,
  );
  assert.match(bootstrap, /@supabase\/supabase-js@2\.46\.1\?bundle/u);
  assert.match(bootstrap, /persistSession:\s*true/u);
  assert.match(
    bootstrap,
    /storageKey:\s*'sb-kyyiuakrqomzlikfaire-auth-token'/u,
  );
  const defaultConfig = bootstrap.slice(
    bootstrap.indexOf("const DEFAULT_CONFIG"),
    bootstrap.indexOf("function readConfig"),
  );
  assert.doesNotMatch(defaultConfig, /service[_-]?role|sb_secret/iu);
});

Deno.test("PIXYNC-DRAW2-360 accepts explicit staging config without production fallback", () => {
  assert.match(bootstrap, /__PIXIEED_SUPABASE_CONFIG__/u);
  assert.match(bootstrap, /Supabase URL must use HTTPS/u);
  assert.match(bootstrap, /publishable or anon key/u);
  assert.match(bootstrap, /delete host\.__PIXIEED_ACCOUNT_SUPABASE_CLIENT_PROMISE__/u);
  assert.match(bootstrap, /config\.url/u);
  assert.match(bootstrap, /config\.publishableKey/u);
  assert.match(bootstrap, /config\.storageKey/u);
});

Deno.test("STAGE8 live harness requires two authenticated staging users and redacts evidence", () => {
  for (const name of [
    "PIXIEED_STAGE8_BASE_URL",
    "PIXIEED_STAGE8_PROJECT_ID",
    "PIXIEED_STAGE8_STORAGE_STATE_A",
    "PIXIEED_STAGE8_STORAGE_STATE_B",
    "PIXIEED_STAGE8_SUPABASE_URL",
    "PIXIEED_STAGE8_SUPABASE_PUBLISHABLE_KEY",
  ]) assert.match(liveHarness, new RegExp(name, "u"));
  assert.match(liveHarness, /must be different authenticated users/u);
  assert.match(liveHarness, /getUser/u);
  assert.match(liveHarness, /must be different users/u);
  assert.match(liveHarness, /presenceMembers/u);
  assert.match(liveHarness, /waitForCanvasChange/u);
  assert.match(liveHarness, /canvasDigest/u);
  assert.match(liveHarness, /captureDrawPerformance/u);
  assert.match(liveHarness, /PerformanceObserver/u);
  assert.match(liveHarness, /steadyFrameMs/u);
  assert.match(liveHarness, /performanceObservation/u);
  assert.match(liveHarness, /readinessEligible: false/u);
  assert.match(liveHarness, /asset and decoded byte ownership/u);
  assert.match(liveHarness, /same full Canvas raster/u);
  assert.match(liveHarness, /must not emit console errors/u);
  assert.match(liveHarness, /waitForUnavailable/u);
  assert.match(liveHarness, /setOffline\(true\)/u);
  assert.match(liveHarness, /setOffline\(false\)/u);
  assert.match(liveHarness, /STAGING/u);
  assert.match(liveHarness, /production host/u);
  assert.match(liveHarness, /projectIdSha256/u);
  assert.match(liveHarness, /PIXIEED_STAGE8_PACKAGE_HASH/u);
  assert.match(liveHarness, /COLLABORATION_2_TO_3/u);
  assert.match(liveHarness, /RECONNECT_RECOVERY/u);
  assert.match(liveHarness, /evidenceHash/u);
  assert.match(liveHarness, /sb_\[redacted\]/u);
});

Deno.test("PIXYNC-DRAW2-360 starts and stops the production root with account state", () => {
  assert.match(bootstrap, /pixieed:supabase-client-ready/u);
  assert.match(bootstrap, /pixieed:account-auth-state/u);
  assert.match(entry, /addEventListener\("pixieed:supabase-client-ready"/u);
  assert.match(entry, /queuePixyncProductionStart\(client\)/u);
  assert.match(entry, /pixyncProductionRoot\?\.close\("signed-out"\)/u);
  assert.match(entry, /dataset\.pixyncComposition = "awaiting-auth"/u);
});

Deno.test("PIXYNC-DRAW2-360 promotes the shared sync UI only after production connect", () => {
  assert.match(entry, /function publishPixyncProductionStatus/u);
  assert.match(entry, /draw2:pixync-status/u);
  assert.match(entry, /Keep the local lifecycle alive until the authenticated root has fully[\s\S]{0,80}connected/u);
  assert.match(entry, /await stopLocalProjectSession\(\)/u);
  assert.match(entry, /dataset\.pixyncComposition = "production"[\s\S]{0,180}publishPixyncProductionStatus\("SUBSCRIBED"/u);
  assert.match(entry, /presence:\s*\{[\s\S]*displayName:\s*"This tab"/u);
  assert.match(entry, /onPresence:\s*\(event\) => applyPixyncProductionPresence/u);
  assert.match(entry, /production\.publishPresence\(/u);
});

Deno.test("PIXYNC-DRAW2-360 restores only a verified remote PXD checkpoint", () => {
  assert.match(entry, /readPixyncActiveCheckpoint\(client, projectId\)/u);
  assert.match(entry, /expectedPackageHash:\s*checkpoint\.packageHash/u);
  assert.match(entry, /source:\s*"REMOTE_CHECKPOINT"/u);
  assert.match(entry, /announceProjectChange:\s*false/u);
  assert.match(entry, /inspection\.source\.identity !== "NEW_DRAW2_PXD_V2"/u);
  assert.match(entry, /currentDrawStateHasLocalWork\(\)/u);
});

Deno.test("PIXYNC-DRAW2-360 publishes a production checkpoint through the verified boundary", () => {
  assert.match(entry, /async function publishProductionCheckpoint\(\)/u);
  assert.match(entry, /await flushDrawPersistence\(\)/u);
  assert.match(entry, /publishPixyncCheckpoint\(client,\s*\{/u);
  assert.match(entry, /checkpointStatus\.textContent = result\.active/u);
  assert.match(entry, /候補として保存しました/u);
  assert.match(entry, /dataset\.pixyncComposition === "production"/u);
  assert.match(entry, /pixiedraw2:pixync-attestation-client-id:v1/u);
});
