import { strict as assert } from "node:assert";
import {
  asOwnerId,
  asProjectId,
  asRevisionId,
  createGameProject,
} from "../../src/game/game-300/core.ts";
import { PixyncGameRevisionRemoteStore } from "../../src/pixync/game-revision-remote-store.ts";
import type { PixyncSupabaseSdkClient } from "../../src/pixync/supabase-sdk-port.ts";

Deno.test("PIXYNC-DRAW2-330 stores and verifies Game revisions outside operation hints", async () => {
  const projectId = asProjectId("11111111-1111-4111-8111-111111111111");
  const ownerId = asOwnerId(String(projectId));
  const revisionId = asRevisionId("game-revision-330");
  const project = await createGameProject({
    schemaVersion: 1, projectId, ownerId, name: "Game", scenes: [], prefabs: [],
    dependencies: [], behaviors: [],
    revision: { revisionId, projectId, ownerId, sequence: 1 },
    editorTimeline: { frameCount: 16, tracks: [] },
  }, { projectId, ownerId, revisionId });
  const calls: { name: string; args: Readonly<Record<string, unknown>> }[] = [];
  const client = {
    auth: { getUser: async () => ({ data: { user: {} }, error: null }) },
    channel: () => { throw new Error("unused"); },
    rpc: async (name: string, args: Readonly<Record<string, unknown>>) => {
      calls.push({ name, args });
      return name.includes("get_game_revision")
        ? { data: structuredClone(project), error: null }
        : { data: {}, error: null };
    },
  } as unknown as PixyncSupabaseSdkClient;
  const store = new PixyncGameRevisionRemoteStore(client, () => ({
    projectId: String(projectId), roomId: String(projectId), actorId: String(projectId),
    clientId: "client-330", role: "editor", sessionGeneration: 3,
  }));
  await store.put(project);
  const loaded = await store.get(String(project.revision.snapshotHash), String(revisionId));
  assert.equal(loaded?.revision.snapshotHash, project.revision.snapshotHash);
  assert.deepEqual(calls.map((call) => call.name), [
    "pixync_draw2_put_game_revision_v1",
    "pixync_draw2_get_game_revision_v1",
  ]);
});
