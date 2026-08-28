import { strict as assert } from "node:assert";
import {
  createGoldenProject,
  type GoldenAssetInput,
} from "../../src/studio/golden-project.ts";
import {
  createPixyncDraft,
  type PixyncAggregate,
  type PixyncAggregateAdapter,
} from "../../src/pixync/index.ts";
import {
  LocalProjectSessionBroker,
  ProjectSessionClient,
} from "../../src/pixync/project-session.ts";

const PROJECT_ID = "studio:golden-session";
const DRAW_HASH = "a".repeat(64);
const AUDIO_HASH = "b".repeat(64);
const AGGREGATES = ["draw", "audio", "game"] as const;

function asset(kind: GoldenAssetInput["kind"]): GoldenAssetInput {
  return {
    projectId: PROJECT_ID,
    ownerId: "owner:local",
    kind,
    assetId: kind === "DRAW" ? "draw:hero" : "audio:theme",
    revisionId: kind === "DRAW" ? "draw:hero:r1" : "audio:theme:r1",
    contentHash: kind === "DRAW" ? DRAW_HASH : AUDIO_HASH,
    licenseId: kind === "DRAW" ? "license:draw" : "license:audio",
    permission: "READ",
    reviewStatus: "APPROVED",
    label: kind === "DRAW" ? "Hero" : "Theme",
  };
}

function adapters(applied: string[]): readonly PixyncAggregateAdapter[] {
  return AGGREGATES.map((aggregate) => ({
    aggregate,
    apply: (operation) => {
      applied.push(`${aggregate}:${operation.operationId}`);
    },
  }));
}

function client(
  broker: LocalProjectSessionBroker,
  actorId: string,
  clientId: string,
  applied: string[],
): ProjectSessionClient {
  return new ProjectSessionClient({
    broker,
    projectId: PROJECT_ID,
    actorId,
    clientId,
    displayName: clientId,
    adapters: adapters(applied),
  });
}

Deno.test("Golden Project replays two-person Draw/Audio edits into one Game revision", async () => {
  const golden = await createGoldenProject({
    projectId: PROJECT_ID,
    ownerId: "owner:local",
    name: "Golden Session",
    draw: asset("DRAW"),
    audio: asset("AUDIO"),
  }, "LIVE");
  assert.equal(golden.ok, true);
  if (!golden.ok) return;

  const ownerApplied: string[] = [];
  const editorApplied: string[] = [];
  const broker = new LocalProjectSessionBroker({
    projectId: PROJECT_ID,
    adapters: adapters([]),
  });
  const owner = client(broker, "actor-owner", "client-owner", ownerApplied);
  const editor = client(
    broker,
    "actor-editor",
    "client-editor",
    editorApplied,
  );
  await Promise.all([owner.connect(), editor.connect()]);

  const draw = await createPixyncDraft({
    operationId: "op-golden-draw",
    projectId: PROJECT_ID,
    aggregate: "draw",
    actorId: "actor-editor",
    clientId: "client-editor",
    clientSequence: 1,
    baseProjectRevision: 0,
    aggregateRevision: 0,
    payload: {
      command: "sprite.bind",
      assetId: "draw:hero",
      revisionId: "draw:hero:r1",
      contentHash: DRAW_HASH,
    },
  });
  const drawResult = await editor.submit(draw);

  const audio = await createPixyncDraft({
    operationId: "op-golden-audio",
    projectId: PROJECT_ID,
    aggregate: "audio",
    actorId: "actor-owner",
    clientId: "client-owner",
    clientSequence: 1,
    baseProjectRevision: 1,
    aggregateRevision: 0,
    payload: {
      command: "audio.bind",
      assetId: "audio:theme",
      revisionId: "audio:theme:r1",
      contentHash: AUDIO_HASH,
    },
  });
  const audioResult = await owner.submit(audio);

  const game = await createPixyncDraft({
    operationId: "op-golden-game",
    projectId: PROJECT_ID,
    aggregate: "game",
    actorId: "actor-owner",
    clientId: "client-owner",
    clientSequence: 2,
    baseProjectRevision: 2,
    aggregateRevision: 0,
    payload: {
      command: "scene.bind-assets",
      sceneId: "golden:scene:main",
      sprite: {
        assetId: "draw:hero",
        revisionRef: {
          operationId: drawResult.operation.operationId,
          aggregate: "draw",
          projectRevision: drawResult.operation.projectRevision,
          aggregateRevision: drawResult.operation.aggregateRevision,
        },
      },
      audio: {
        assetId: "audio:theme",
        revisionRef: {
          operationId: audioResult.operation.operationId,
          aggregate: "audio",
          projectRevision: audioResult.operation.projectRevision,
          aggregateRevision: audioResult.operation.aggregateRevision,
        },
      },
    },
  });
  await owner.submit(game);

  assert.equal(broker.snapshot().projectRevision, 3);
  assert.deepEqual(broker.snapshot().aggregateRevisions, {
    draw: 1,
    audio: 1,
    game: 1,
  });
  assert.equal(owner.state().projectRevision, 3);
  assert.equal(editor.state().projectRevision, 3);
  assert.equal(owner.state().status, "CONFIRMED");
  assert.equal(editor.state().status, "CONFIRMED");
  assert.deepEqual(ownerApplied, [
    "draw:op-golden-draw",
    "audio:op-golden-audio",
    "game:op-golden-game",
  ]);
  assert.deepEqual(editorApplied, ownerApplied);

  const checkpoint = await editor.createCheckpoint({
    checkpointId: "checkpoint-golden-session",
    label: "Golden Session ready for Play",
    kind: "MANUAL",
  });
  assert.equal(checkpoint.projectRevision, 3);
  assert.equal(checkpoint.operationCount, 3);
  assert.deepEqual(
    owner.state().checkpoints.map((item) => item.checkpointId),
    ["checkpoint-golden-session"],
  );
  const serialized = JSON.stringify({ golden, checkpoint });
  assert.equal(serialized.includes("bytes") || serialized.includes("pixels"), false);
});
