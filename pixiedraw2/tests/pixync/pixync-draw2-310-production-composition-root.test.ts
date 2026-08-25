import { strict as assert } from "node:assert";
import { PixyncProductionCompositionRoot } from "../../src/pixync/composition-root.ts";
import { PixyncInMemorySnapshotPersistence } from "../../src/pixync/durability.ts";
import type { PixyncAggregate, PixyncAggregateAdapter } from "../../src/pixync/contracts.ts";
import type { PixyncSupabaseSdkClient } from "../../src/pixync/supabase-sdk-port.ts";

const PROJECT = "11111111-1111-4111-8111-111111111111";
const USER = "22222222-2222-4222-8222-222222222222";
const CLIENT = "client-310";

Deno.test("PIXYNC-DRAW2-310 production root authenticates, binds events, and closes Realtime", async () => {
  const target = new EventTarget();
  let privateChannel = false;
  let unsubscribed = false;
  let audioHydrations = 0;
  const gameHydrationLevels: string[] = [];
  let audioCommits = 0;
  let bindingDetail: unknown;
  target.addEventListener("draw2:pixync-binding", (event) => {
    bindingDetail = (event as CustomEvent).detail;
  });
  const sdk = {
    auth: {
      getUser: async () => ({ data: { user: { id: USER } }, error: null }),
    },
    rpc: async (name: string) => {
      if (name === "pixync_draw2_open_session_v1") {
        return {
          data: {
            principal_id: USER,
            project_id: PROJECT,
            room_id: PROJECT,
            actor_id: USER,
            membership_id: "33333333-3333-4333-8333-333333333333",
            membership_revision: "membership-1",
            client_id: CLIENT,
            session_generation: 1,
            role: "editor",
          },
          error: null,
        };
      }
      if (name === "pixync_draw2_get_operations_since_v1") {
        return { data: [], error: null };
      }
      throw new Error(`unexpected RPC ${name}`);
    },
    channel: (_name, options) => {
      privateChannel = options.config.private;
      const channel = {
        on: () => channel,
        subscribe: (callback: (status: string) => void) => callback("SUBSCRIBED"),
        unsubscribe: () => {
          unsubscribed = true;
        },
      };
      return channel;
    },
  } satisfies PixyncSupabaseSdkClient;
  const adapters = (["draw", "audio", "game"] as PixyncAggregate[]).map(
    (aggregate): PixyncAggregateAdapter => ({ aggregate, apply: () => {} }),
  );
  const root = await PixyncProductionCompositionRoot.create({
    projectId: PROJECT,
    clientId: CLIENT,
    sessionGeneration: 1,
    workerId: "worker-310",
    supabase: sdk,
    persistence: new PixyncInMemorySnapshotPersistence(),
    eventTarget: target,
    audioHydration: {
      hydrateAudio: async (request) => {
        audioHydrations += 1;
        return {
          projectId: PROJECT,
          audioRevision: request.minimumAudioRevision,
          level: request.level,
        };
      },
    },
    gameHydration: {
      hydrateGame: async (request) => {
        gameHydrationLevels.push(request.level);
        return {
          projectId: PROJECT,
          gameRevision: request.minimumGameRevision,
          level: request.level,
        };
      },
    },
    createProducts: () => ({
      adapters,
      submitAudio: async () => {
        audioCommits += 1;
      },
    }),
  });
  await root.connect();
  assert.equal(privateChannel, true);
  assert.deepEqual(bindingDetail, {
    projectId: PROJECT,
    actorId: USER,
    clientId: CLIENT,
    role: "editor",
  });
  target.dispatchEvent(new Event("draw2:audio-catalog-request"));
  target.dispatchEvent(new CustomEvent("draw2:audio-journal-committed", {
    detail: { entry: {} },
  }));
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(audioHydrations, 1);
  assert.equal(audioCommits, 1);
  target.dispatchEvent(new Event("draw2:game-catalog-request"));
  await new Promise((resolve) => setTimeout(resolve, 0));
  target.dispatchEvent(new CustomEvent("draw2:game-editor-demand", {
    detail: { active: true },
  }));
  await new Promise((resolve) => setTimeout(resolve, 0));
  target.dispatchEvent(new CustomEvent("draw2:game-build-demand", {
    detail: { active: true },
  }));
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(gameHydrationLevels, ["CATALOG", "EDITOR", "BUILD"]);
  await root.close();
  assert.equal(unsubscribed, true);
});
