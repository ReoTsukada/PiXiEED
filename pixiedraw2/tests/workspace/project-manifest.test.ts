import {
  asWorkspaceProjectId,
  createMemoryWorkspaceManifestStore,
  createWorkspaceProjectManifest,
  type WorkspaceProjectManifest,
} from "../../src/workspace/project-manifest.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const projectId = asWorkspaceProjectId("project:manifest-test");
const now = "2026-08-18T00:00:00.000Z";

function fixture(): WorkspaceProjectManifest {
  return createWorkspaceProjectManifest(projectId, "Manifest Test", now);
}

Deno.test("WORKSPACE-MANIFEST-1E keeps module pointers and revisions independent", async () => {
  const store = createMemoryWorkspaceManifestStore();
  let manifest = fixture();
  assert(
    manifest.modules.draw.stateRef === "draw:project:manifest-test:state",
    "Draw state pointer is not canonical.",
  );
  assert(
    manifest.modules.audio.journalRef === "audio:project:manifest-test:journal",
    "Audio journal pointer is not canonical.",
  );
  await store.save(manifest);
  manifest = await store.updateModule(projectId, "audio", {
    status: "READY",
    revision: 4,
    stateHash: "a".repeat(64),
    savedAt: now,
  });
  assert(
    manifest.revision === 1 && manifest.modules.audio.revision === 4 &&
      manifest.modules.draw.revision === 0,
    "Module revision was coupled to another module.",
  );
  manifest = await store.updateModule(projectId, "game", {
    status: "MISSING",
    revision: 0,
    stateHash: null,
    savedAt: null,
  });
  assert(
    manifest.modules.game.status === "MISSING" &&
      manifest.modules.audio.status === "READY",
    "Missing Game state changed Audio state.",
  );
  const loaded = await store.load(projectId);
  assert(
    loaded?.modules.audio.stateRef === "audio:project:manifest-test:state",
    "Reload lost module pointer.",
  );
});

Deno.test("WORKSPACE-MANIFEST-1E migration status is stored without deleting module records", async () => {
  const store = createMemoryWorkspaceManifestStore();
  const created = fixture();
  await store.save(created);
  const migrated = await store.updateAudioMigration(projectId, {
    status: "MIGRATED",
    legacyProjectId: "audio:draw2:workspace",
    migratedAt: now,
  });
  assert(
    migrated.migration?.audio?.status === "MIGRATED",
    "Migration status was not persisted.",
  );
  assert(
    migrated.modules.draw.stateRef === created.modules.draw.stateRef,
    "Migration rewrote Draw binding.",
  );
  const verified = await store.updateAudioMigration(projectId, {
    status: "VERIFIED",
    legacyProjectId: "audio:draw2:workspace",
    migratedAt: now,
    verifiedAt: now,
  });
  assert(
    verified.migration?.audio?.status === "VERIFIED",
    "Migration verification was not persisted.",
  );
});

Deno.test("WORKSPACE-MANIFEST-1E legacy manifests receive safe module pointers", async () => {
  const store = createMemoryWorkspaceManifestStore();
  const current = fixture();
  const legacy = {
    ...current,
    modules: Object.fromEntries(
      Object.entries(current.modules).map(([surface, module]) => {
        const copy = { ...module } as Record<string, unknown>;
        delete copy.stateRef;
        delete copy.checkpointRef;
        delete copy.journalRef;
        return [surface, copy];
      }),
    ),
  } as unknown as WorkspaceProjectManifest;
  await store.save(legacy);
  const loaded = await store.load(projectId);
  assert(loaded !== null, "Legacy-compatible Manifest was discarded.");
  assert(
    loaded.modules.draw.stateRef === "draw:project:manifest-test:state",
    "Legacy Draw pointer was not upgraded.",
  );
  assert(
    loaded.modules.game.checkpointRef ===
      "game:project:manifest-test:checkpoint",
    "Legacy Game checkpoint pointer was not upgraded.",
  );
});

Deno.test("WORKSPACE-MANIFEST-1E rejects raw payloads at the manifest boundary", async () => {
  const store = createMemoryWorkspaceManifestStore();
  const current = fixture();
  const unsafe = {
    ...current,
    modules: {
      ...current.modules,
      audio: { ...current.modules.audio, bytes: [1, 2, 3] },
    },
  } as unknown as WorkspaceProjectManifest;
  await store.save(unsafe);
  assert(
    (await store.load(projectId)) === null,
    "Raw bytes crossed the Manifest boundary.",
  );
});
