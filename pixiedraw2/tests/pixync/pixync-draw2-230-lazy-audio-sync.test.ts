import { strict as assert } from "node:assert";
import {
  type PixyncAudioHydrationRequest,
  type PixyncGameHydrationRequest,
  PixyncLazyAggregateSync,
  PixyncLazyAggregateSyncError,
} from "../../src/pixync/lazy-aggregate-sync.ts";

const PROJECT = "project:lazy-audio";
const GENERATION = 7;

function notice(revision: number, ids = ["audio:bgm"] as readonly string[]) {
  return {
    projectId: PROJECT,
    sessionGeneration: GENERATION,
    aggregate: "audio" as const,
    operationId: `audio-op:${revision}`,
    projectRevision: revision,
    aggregateRevision: revision,
    changedAssetIds: ids,
  };
}

Deno.test("PIXYNC-DRAW2-230 keeps Audio metadata hot without loading Audio data", async () => {
  const requests: PixyncAudioHydrationRequest[] = [];
  const sync = new PixyncLazyAggregateSync(PROJECT, GENERATION, {
    hydrateAudio: async (request) => {
      requests.push(request);
      return {
        projectId: PROJECT,
        audioRevision: request.minimumAudioRevision,
        level: request.level,
      };
    },
  });
  sync.receive(notice(1));
  await sync.settled();
  assert.equal(requests.length, 0);
  assert.deepEqual(sync.audioRevision, {
    known: 1,
    hydrated: 0,
    demanded: false,
    level: undefined,
  });
});

Deno.test("PIXYNC-DRAW2-230 hydrates the latest Audio revision on first Draw demand", async () => {
  const requests: PixyncAudioHydrationRequest[] = [];
  const sync = new PixyncLazyAggregateSync(PROJECT, GENERATION, {
    hydrateAudio: async (request) => {
      requests.push(request);
      return {
        projectId: PROJECT,
        audioRevision: request.minimumAudioRevision,
        level: request.level,
      };
    },
  });
  sync.receive(notice(1, ["audio:bgm"]));
  sync.receive(notice(2, ["audio:se", "audio:bgm"]));
  await sync.demandAudio("DRAW_PLAYBACK");
  assert.equal(requests.length, 1);
  assert.equal(requests[0]?.minimumAudioRevision, 2);
  assert.deepEqual(requests[0]?.changedAssetIds, ["audio:bgm", "audio:se"]);
  assert.deepEqual(sync.audioRevision, {
    known: 2,
    hydrated: 2,
    demanded: true,
    level: "PLAYBACK",
  });
});

Deno.test("PIXYNC-DRAW2-230 coalesces updates received during hydration", async () => {
  const requests: PixyncAudioHydrationRequest[] = [];
  let releaseFirst: (() => void) | undefined;
  const first = new Promise<void>((resolve) => releaseFirst = resolve);
  const sync = new PixyncLazyAggregateSync(PROJECT, GENERATION, {
    hydrateAudio: async (request) => {
      requests.push(request);
      if (requests.length === 1) await first;
      return {
        projectId: PROJECT,
        audioRevision: request.minimumAudioRevision,
        level: request.level,
      };
    },
  });
  sync.receive(notice(1));
  const demand = sync.demandAudio("DRAW_AUDIO_LANE");
  await Promise.resolve();
  sync.receive(notice(2, ["audio:se"]));
  sync.receive(notice(3, ["audio:se"]));
  releaseFirst?.();
  await demand;
  await sync.settled();
  assert.equal(requests.length, 2);
  assert.equal(requests[1]?.minimumAudioRevision, 3);
});

Deno.test("PIXYNC-DRAW2-230 stops future hydration after Draw releases Audio", async () => {
  let calls = 0;
  const sync = new PixyncLazyAggregateSync(PROJECT, GENERATION, {
    hydrateAudio: async (request) => {
      calls += 1;
      return {
        projectId: PROJECT,
        audioRevision: request.minimumAudioRevision,
        level: request.level,
      };
    },
  });
  sync.receive(notice(1));
  await sync.demandAudio("DRAW_EXPORT");
  sync.releaseAudio("DRAW_EXPORT");
  sync.receive(notice(2));
  await sync.settled();
  assert.equal(calls, 1);
  assert.deepEqual(sync.audioRevision, {
    known: 2,
    hydrated: 1,
    demanded: false,
    level: "EXPORT",
  });
});

Deno.test("PIXYNC-DRAW2-230 rejects cross-project and stale hydration results", async () => {
  const sync = new PixyncLazyAggregateSync(PROJECT, GENERATION, {
    hydrateAudio: async (request) => ({
      projectId: PROJECT,
      audioRevision: 0,
      level: request.level,
    }),
  });
  assert.throws(
    () => sync.receive({ ...notice(1), projectId: "project:other" }),
    (error) =>
      error instanceof PixyncLazyAggregateSyncError &&
      error.code === "PROJECT_MISMATCH",
  );
  sync.receive(notice(1));
  await assert.rejects(
    () => sync.demandAudio("DRAW_PLAYBACK"),
    (error) =>
      error instanceof PixyncLazyAggregateSyncError &&
      error.code === "HYDRATION_MISMATCH",
  );
});

Deno.test("PIXYNC-DRAW2-230 rejects an old session generation", () => {
  const sync = new PixyncLazyAggregateSync(PROJECT, GENERATION, {
    hydrateAudio: async (request) => ({
      projectId: PROJECT,
      audioRevision: request.minimumAudioRevision,
      level: request.level,
    }),
  });
  assert.throws(
    () => sync.receive({ ...notice(1), sessionGeneration: GENERATION - 1 }),
    (error) =>
      error instanceof PixyncLazyAggregateSyncError &&
      error.code === "SESSION_MISMATCH",
  );
});

Deno.test("PIXYNC-DRAW2-230 falls back to one full refresh for oversized hints", async () => {
  const requests: PixyncAudioHydrationRequest[] = [];
  const sync = new PixyncLazyAggregateSync(PROJECT, GENERATION, {
    hydrateAudio: async (request) => {
      requests.push(request);
      return {
        projectId: PROJECT,
        audioRevision: request.minimumAudioRevision,
        level: request.level,
      };
    },
  });
  sync.receive(
    notice(1, Array.from({ length: 65 }, (_, index) => `audio:${index}`)),
  );
  await sync.demandAudio("DRAW_AUDIO_LANE");
  assert.equal(requests.length, 1);
  assert.equal(requests[0]?.fullRefresh, true);
  assert.deepEqual(requests[0]?.changedAssetIds, []);
});

Deno.test("PIXYNC-DRAW2-230 upgrades the same revision from catalog to playback and export", async () => {
  const requests: PixyncAudioHydrationRequest[] = [];
  const sync = new PixyncLazyAggregateSync(PROJECT, GENERATION, {
    hydrateAudio: async (request) => {
      requests.push(request);
      return {
        projectId: PROJECT,
        audioRevision: request.minimumAudioRevision,
        level: request.level,
      };
    },
  });
  sync.receive(notice(1));
  await sync.demandAudio("DRAW_AUDIO_LANE");
  await sync.demandAudio("DRAW_PLAYBACK");
  await sync.demandAudio("DRAW_EXPORT");
  assert.deepEqual(requests.map((request) => request.level), [
    "CATALOG",
    "PLAYBACK",
    "EXPORT",
  ]);
});

Deno.test("PIXYNC-DRAW2-230 applies the same lazy levels to Game catalog, editor, and build", async () => {
  const gameRequests: PixyncGameHydrationRequest[] = [];
  const sync = new PixyncLazyAggregateSync(
    PROJECT,
    GENERATION,
    {
      hydrateAudio: async (request) => ({
        projectId: PROJECT,
        audioRevision: request.minimumAudioRevision,
        level: request.level,
      }),
    },
    {
      hydrateGame: async (request) => {
        gameRequests.push(request);
        return {
          projectId: PROJECT,
          gameRevision: request.minimumGameRevision,
          level: request.level,
        };
      },
    },
  );
  sync.receive({
    ...notice(1, ["game:scene:one"]),
    aggregate: "game",
    operationId: "game-op:1",
  });
  await sync.settled();
  assert.equal(gameRequests.length, 0);
  await sync.demandGame("GAME_CATALOG");
  await sync.demandGame("GAME_EDITOR");
  await sync.demandGame("GAME_BUILD");
  assert.deepEqual(gameRequests.map((request) => request.level), [
    "CATALOG",
    "EDITOR",
    "BUILD",
  ]);
  assert.deepEqual(sync.gameRevision, {
    known: 1,
    hydrated: 1,
    demanded: true,
    level: "BUILD",
  });
});
