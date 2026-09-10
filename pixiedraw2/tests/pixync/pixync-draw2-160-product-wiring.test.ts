import { strict as assert } from "node:assert";

// Preflight-only invalid-input anchors remain explicit and repository-bound.
// AUTHORITY-ROOT-001 CALLER_INJECTION_REJECTED REJECT
// RESOLVER-IDENTITY-001 CANONICAL_IDENTITY_MISMATCH REJECT
// CALLER-STATE-001 CALLER_STATE_NOT_AUTHORITY REJECT
// EVENT-ID-001 CANONICAL_EVENT_ID_REQUIRED REJECT
// REPLAY-REVOKE-001 LIFECYCLE_TRANSITION_NOT_AUTHORIZED REJECT

const entry = await Deno.readTextFile("src/draw2-entry.ts");
const lifecycle = await Deno.readTextFile("src/pixync/project-lifecycle.ts");
const indexHtml = await Deno.readTextFile("index.html");

function section(
  source: string,
  startMarker: string,
  endMarker: string,
): string {
  const start = source.indexOf(startMarker);
  assert.notEqual(start, -1, `missing source marker: ${startMarker}`);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.notEqual(end, -1, `missing source marker: ${endMarker}`);
  return source.slice(start, end);
}

const lifecycleWiring = section(
  entry,
  "async function startPixyncProjectLifecycle",
  "const PIXYNC_LOCAL_LIFECYCLE_WIRING_END",
);
const metadataWriter = section(
  entry,
  "function projectPixyncState",
  "async function startPixyncProjectLifecycle",
);

Deno.test("PIXYNC-DRAW2-160 uses the common workspace event and canonical startup ID", () => {
  assert.match(entry, /WORKSPACE_PROJECT_CHANGED_EVENT/u);
  assert.match(
    lifecycleWiring,
    /eventName:\s*WORKSPACE_PROJECT_CHANGED_EVENT/u,
  );
  assert.match(lifecycleWiring, /eventTarget:\s*window/u);
  assert.match(lifecycleWiring, /initialProjectId:\s*state\.projectId/u);
  assert.match(entry, /readActiveWorkspaceProjectId\(\)/u);
  assert.match(entry, /announceWorkspaceProjectChanged\(window/u);
});

Deno.test("PIXYNC-DRAW2-160 creates project-bound IndexedDB persistence and opens the durable journal", () => {
  assert.match(
    lifecycleWiring,
    /createPersistence:\s*\(projectId\)\s*=>\s*\n?\s*pixyncPersistenceFor\(projectId\)/u,
  );
  assert.match(
    entry,
    /const inner = createPixyncIndexedDbPersistence\(projectId\)/u,
  );
  assert.match(
    lifecycleWiring,
    /PixyncDurableJournal\.open\(projectId,\s*persistence\)/u,
  );
  assert.match(entry, /from "\.\/pixync\/indexeddb-persistence\.ts"/u);
  assert.match(entry, /from "\.\/pixync\/durability\.ts"/u);
});

Deno.test("PIXYNC-DRAW2-160 keeps page lifecycle boundaries local and bfcache-safe", () => {
  assert.match(
    entry,
    /window\.addEventListener\("pagehide"[\s\S]{0,700}lifecycle\?\.dispose\(\)/u,
  );
  assert.match(entry, /event\.persisted\)\s*return/u);
  assert.match(entry, /document\.addEventListener\("visibilitychange"/u);
  assert.match(entry, /document\.visibilityState\s*===\s*"hidden"/u);
  assert.match(entry, /flushDrawPersistenceOnPageExit\(\)/u);
});

Deno.test("PIXYNC-DRAW2-160 exposes only bounded lifecycle metadata", () => {
  assert.match(metadataWriter, /document\.body\.dataset\.pixyncState/u);
  assert.match(metadataWriter, /document\.body\.dataset\.pixyncProjectId/u);
  assert.match(metadataWriter, /document\.body\.dataset\.pixyncGeneration/u);
  assert.doesNotMatch(
    metadataWriter,
    /(?:textContent|innerHTML|localStorage|sessionStorage|appendChild|setAttribute|payload|raster|history|preferences|audio|game)/iu,
  );
  assert.match(
    metadataWriter,
    /dataset\.pixyncGeneration\s*=\s*String\(generation\)/u,
  );
});

Deno.test("PIXYNC-DRAW2-160 keeps local lifecycle transport-free beside the production root", () => {
  assert.match(entry, /PixyncProductionCompositionRoot/u);
  assert.match(entry, /PixyncSupabaseSdkClient/u);
  assert.doesNotMatch(
    lifecycleWiring,
    /\b(?:supabase|connectRealtime|subscribeRealtime|broadcast|sendOperation|dispatchOperation|enqueueOperation|core\.execute)\b/iu,
  );
  assert.match(
    lifecycleWiring,
    /flushProject:\s*async\s*\(\)\s*=>\s*undefined/u,
  );
});

Deno.test("PIXYNC-DRAW2-160 local lifecycle does not own Draw/Audio/Game payloads or UI preferences", () => {
  assert.doesNotMatch(
    lifecycleWiring,
    /\b(?:payload|audio|game|assets|raster|history|editorPreferences|uiPreferences|selectedColor|mirrorMode|viewport)\b/iu,
  );
  assert.doesNotMatch(
    metadataWriter,
    /\b(?:payload|audio|game|assets|raster|history|editorPreferences|uiPreferences)\b/iu,
  );
  assert.match(lifecycleWiring, /onState:\s*\(\{\s*phase/u);
});

Deno.test("PIXYNC-DRAW2-160 detects the Draw2 cache-buster without changing it", () => {
  const match = indexHtml.match(
    /src="\.\/dist\/draw2-entry\.js(?:\?([^"#]+))?"/u,
  );
  assert.ok(match, "Draw2 entry script must be present in index.html");
  const cacheBuster = match[1] ?? "";
  console.info(
    `[PIXYNC-DRAW2-160] cache-buster=${cacheBuster || "UNTESTED"}`,
  );
  // Observation only: this gate never edits index.html or rewrites the query.
  assert.equal(typeof cacheBuster, "string");
});

Deno.test("PIXYNC-DRAW2-160 keeps the lifecycle coordinator transport-free", () => {
  assert.doesNotMatch(lifecycle, /\b(?:window|document|Supabase|Realtime)\b/iu);
  assert.match(lifecycle, /eventTarget:\s*EventTarget/u);
  assert.match(lifecycle, /createPersistence:\s*\(/u);
  assert.match(lifecycle, /openJournal:\s*\(/u);
});
