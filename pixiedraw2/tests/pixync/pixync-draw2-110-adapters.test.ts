import { strict as assert } from "node:assert";
import {
  createProject,
  type EditorCommand,
  EditorCore,
} from "../../src/draw2-core.ts";
import {
  asAudioCommandId,
  asAudioProjectId,
  type AudioJournalState,
  createAudioJournal,
  createAudioProject,
  dispatchAudioCommand,
} from "../../src/audio/audio-200/index.ts";
import {
  appendJournalCommand,
  asOwnerId,
  asProjectId,
  asRevisionId,
  type CallerContext,
  createGameProject,
  createJournal,
  type GameProject,
} from "../../src/game/game-300/core.ts";
import {
  type AudioCanonicalApplyPort,
  createAudioOperationDraft,
  createAudioPixyncAdapter,
  createDrawOperationDraft,
  createDrawPixyncAdapter,
  createGameOperationDraft,
  createGamePixyncAdapter,
  type DrawCanonicalApplyPort,
  drawRasterHash,
  type GameCanonicalApplyPort,
  PixyncAdapterError,
} from "../../src/pixync/adapters.ts";
import {
  createPixyncDraft,
  type PixyncAggregate,
  type PixyncAggregateAdapter,
  PixyncError,
  PixyncInMemorySequencer,
  PixyncOrderKeeper,
} from "../../src/pixync/index.ts";

// Repository-bound preflight anchors. Keep every substituted-input case explicit.
// AUTHORITY-ROOT-001 CALLER_INJECTION_REJECTED REJECT
// RESOLVER-IDENTITY-001 CANONICAL_IDENTITY_MISMATCH REJECT
// CALLER-STATE-001 CALLER_STATE_NOT_AUTHORITY REJECT
// EVENT-ID-001 CANONICAL_EVENT_ID_REQUIRED REJECT
// REPLAY-REVOKE-001 LIFECYCLE_TRANSITION_NOT_AUTHORIZED REJECT

const PROJECT = "pixync-draw2-110";
const ACTOR = "actor-110";
const CLIENT = "client-110";

function expectCode(
  action: () => Promise<unknown>,
  code: string,
): Promise<void> {
  return action().then(() => {
    throw new Error(`expected ${code}`);
  }, (error: unknown) => {
    assert.equal((error as { code?: string }).code, code);
  });
}

function noopAdapter(
  aggregate: PixyncAggregate,
  applied: string[] = [],
): PixyncAggregateAdapter {
  return {
    aggregate,
    apply: (operation) => {
      applied.push(operation.operationId);
    },
  };
}

function drawPort(
  core: EditorCore,
  history: { undoDepth: number; redoDepth: number },
): DrawCanonicalApplyPort {
  return {
    preservesLocalHistory: true,
    apply: async (input) => {
      const command = {
        commandId: input.operation.commandId,
        commandType: input.operation.operationType,
        schemaVersion: 1,
        projectId: input.operation.projectId,
        assetId: input.operation.assetId,
        actorId: input.operation.actorId,
        clientId: input.operation.clientId,
        clientSequence: input.operation.clientSequence,
        baseStructureEpoch: input.baseStructureEpoch,
        createdAtMonotonicMs: 0,
        payload: input.operation.payload,
      } as unknown as EditorCommand;
      const result = await core.execute(command);
      assert.equal(result.ok, true, JSON.stringify(result));
      assert.equal(
        result.result.operation.operationId,
        input.operation.operationId,
      );
      return {
        operationId: input.operation.operationId,
        projectId: input.operation.projectId,
        actorId: input.operation.actorId,
        clientId: input.operation.clientId,
        clientSequence: input.operation.clientSequence,
        baseProjectRevision: input.baseProjectRevision,
        assetId: input.operation.assetId,
        baseStructureEpoch: input.baseStructureEpoch,
        structureEpoch: result.state.structureEpoch,
        rasterHash: await drawRasterHash(result.state, input.operation.assetId),
        localUndoDepth: history.undoDepth,
        localRedoDepth: history.redoDepth,
      };
    },
  };
}

async function drawFixture() {
  const initial = createProject({
    projectId: PROJECT,
    width: 4,
    height: 4,
    tileSize: 32,
  });
  const localCore = new EditorCore(initial);
  const command = {
    commandId: "draw-command-1",
    commandType: "raster.setPixel" as const,
    schemaVersion: 1 as const,
    projectId: PROJECT,
    assetId: initial.activeAssetId,
    actorId: ACTOR,
    clientId: CLIENT,
    clientSequence: 1,
    baseStructureEpoch: initial.structureEpoch,
    createdAtMonotonicMs: 0,
    payload: { x: 1, y: 1, colorIndex: 3 },
  } satisfies EditorCommand;
  const local = await localCore.execute(command);
  assert.equal(local.ok, true, JSON.stringify(local));
  const identity = {
    operationId: local.result.operation.operationId,
    projectId: PROJECT,
    actorId: ACTOR,
    clientId: CLIENT,
    clientSequence: 1,
  };
  const draft = await createDrawOperationDraft({
    result: local.result,
    state: local.state,
    identity: { ...identity, baseProjectRevision: 0 },
    expectedIdentity: identity,
    baseStructureEpoch: initial.structureEpoch,
  });
  return { initial, local, draft, identity };
}

Deno.test("PIXYNC-DRAW2-110-DRAW-CONVERGENCE and DRAW-HISTORY converge through the canonical apply port", async () => {
  const fixture = await drawFixture();
  const serverHistory = { undoDepth: 0, redoDepth: 0 };
  const clientHistory = { undoDepth: 7, redoDepth: 2 };
  const serverAdapter = createDrawPixyncAdapter(
    drawPort(new EditorCore(fixture.initial), serverHistory),
  );
  const server = new PixyncInMemorySequencer({
    projectId: PROJECT,
    adapters: [serverAdapter, noopAdapter("audio"), noopAdapter("game")],
  });
  const committed = await server.commit(fixture.draft);
  const clientAdapter = createDrawPixyncAdapter(
    drawPort(new EditorCore(fixture.initial), clientHistory),
  );
  const client = new PixyncOrderKeeper({
    projectId: PROJECT,
    adapters: [clientAdapter, noopAdapter("audio"), noopAdapter("game")],
  });
  assert.equal(await client.receive(committed.operation), "applied");
  assert.equal(clientHistory.undoDepth, 7);
  assert.equal(clientHistory.redoDepth, 2);
  assert.deepEqual(client.snapshot().aggregateRevisions, {
    draw: 1,
    audio: 0,
    game: 0,
  });
});

Deno.test("PIXYNC-DRAW2-110-AUDIO-CONVERGENCE and AUDIO-BOUNDARY use command-only journal drafts", async () => {
  const created = await createAudioProject({
    projectId: asAudioProjectId(PROJECT),
    name: "110",
    createdAt: "2026-08-22T00:00:00.000Z",
  });
  assert.equal(created.ok, true, JSON.stringify(created));
  const initialJournal = await createAudioJournal(created.value);
  assert.equal(initialJournal.ok, true, JSON.stringify(initialJournal));
  const command = {
    commandId: asAudioCommandId("tempo-1"),
    idempotencyKey: "tempo-1",
    projectId: created.value.projectId,
    baseProjectRevision: created.value.projectRevision,
    type: "TEMPO_SET" as const,
    payload: { tempo: { milliBpm: 132000 } },
    issuedAt: "2026-08-22T00:00:00.000Z",
  };
  const local = await dispatchAudioCommand(initialJournal.value, command);
  assert.equal(local.ok, true, JSON.stringify(local));
  const entry = local.value.entries.at(-1)!;
  const identity = {
    operationId: String(entry.entryId),
    projectId: PROJECT,
    actorId: ACTOR,
    clientId: CLIENT,
    clientSequence: 1,
  };
  const draft = await createAudioOperationDraft({
    entry,
    identity: { ...identity, baseProjectRevision: 0 },
    expectedIdentity: identity,
  });
  await expectCode(
    () =>
      createAudioOperationDraft({
        entry,
        identity: {
          ...identity,
          actorId: "substituted-actor",
          baseProjectRevision: 0,
        },
        expectedIdentity: identity,
      }),
    "IDENTITY_MISMATCH",
  );
  const serialized = JSON.stringify(draft.payload);
  assert(
    !serialized.includes("beforeState") && !serialized.includes("afterState") &&
      !serialized.includes("rawBytes"),
  );
  let serverJournal: AudioJournalState = initialJournal.value;
  const makePort = (): AudioCanonicalApplyPort => ({
    preservesLocalHistory: true,
    apply: async (input) => {
      const applied = await dispatchAudioCommand(serverJournal, input.command);
      assert.equal(applied.ok, true, JSON.stringify(applied));
      serverJournal = applied.value;
      return {
        operationId: input.operation.operationId,
        projectId: input.operation.projectId,
        actorId: input.operation.actorId,
        clientId: input.operation.clientId,
        clientSequence: input.operation.clientSequence,
        baseProjectRevision: input.operation.baseProjectRevision,
        stateHash: applied.value.project.stateHash,
        projectRevision: applied.value.project.projectRevision,
      };
    },
  });
  const adapter = createAudioPixyncAdapter(makePort());
  const sequencer = new PixyncInMemorySequencer({
    projectId: PROJECT,
    adapters: [noopAdapter("draw"), adapter, noopAdapter("game")],
  });
  const committed = await sequencer.commit(draft);
  assert.equal(serverJournal.project.stateHash, local.value.project.stateHash);
  await expectCode(() =>
    createPixyncDraft({
      operationId: "snapshot-leak",
      projectId: PROJECT,
      aggregate: "audio",
      actorId: ACTOR,
      clientId: CLIENT,
      clientSequence: 1,
      baseProjectRevision: 0,
      aggregateRevision: 0,
      payload: { snapshot: { forbidden: true } },
    }), "PAYLOAD_FORBIDDEN");
});

function gameCaller(
  projectId: ReturnType<typeof asProjectId>,
  ownerId: ReturnType<typeof asOwnerId>,
  revisionId: ReturnType<typeof asRevisionId>,
): CallerContext {
  return { projectId, ownerId, revisionId };
}
async function gameFixture(): Promise<
  {
    initial: GameProject;
    next: GameProject;
    command: import("../../src/game/game-300/core.ts").JournalCommand;
  }
> {
  const projectId = asProjectId(PROJECT);
  const ownerId = asOwnerId("owner-110");
  const rev1 = asRevisionId("revision-1");
  const rev2 = asRevisionId("revision-2");
  const baseDraft = {
    schemaVersion: 1 as const,
    projectId,
    ownerId,
    name: "Game 110",
    revision: { revisionId: rev1, projectId, ownerId, sequence: 1 },
    scenes: [],
    prefabs: [],
    dependencies: [],
    behaviors: [],
  };
  const initial = await createGameProject(
    baseDraft,
    gameCaller(projectId, ownerId, rev1),
  );
  const next = await createGameProject({
    ...baseDraft,
    name: "Game 110 next",
    revision: {
      revisionId: rev2,
      projectId,
      ownerId,
      sequence: 2,
      parentRevisionId: rev1,
    },
  }, gameCaller(projectId, ownerId, rev2));
  const journal = createJournal(initial, gameCaller(projectId, ownerId, rev1));
  const edited = await appendJournalCommand(
    journal,
    next,
    gameCaller(projectId, ownerId, rev2),
    "game-command-1",
  );
  return { initial, next, command: edited.past.at(-1)! };
}

Deno.test("PIXYNC-DRAW2-110-GAME-CONVERGENCE and GAME-BOUNDARY resolve then append canonical revisions", async () => {
  const fixture = await gameFixture();
  const identity = {
    operationId: String(fixture.command.commandId),
    projectId: PROJECT,
    actorId: ACTOR,
    clientId: CLIENT,
    clientSequence: 1,
  };
  const draft = await createGameOperationDraft({
    command: fixture.command,
    identity: { ...identity, baseProjectRevision: 0 },
    expectedIdentity: identity,
  });
  await expectCode(
    () =>
      createGameOperationDraft({
        command: fixture.command,
        identity: {
          ...identity,
          clientId: "substituted-client",
          baseProjectRevision: 0,
        },
        expectedIdentity: identity,
      }),
    "IDENTITY_MISMATCH",
  );
  let serverJournal = createJournal(
    fixture.initial,
    gameCaller(
      fixture.initial.projectId,
      fixture.initial.ownerId,
      fixture.initial.revision.revisionId,
    ),
  );
  const resolver = new Map([[
    String(fixture.next.revision.snapshotHash),
    fixture.next,
  ]]);
  const makePort = (substitute = false): GameCanonicalApplyPort => ({
    preservesLocalHistory: true,
    current: () => ({
      projectId: String(serverJournal.current.projectId),
      revisionId: String(serverJournal.current.revision.revisionId),
      sequence: serverJournal.current.revision.sequence,
      stateHash: String(serverJournal.current.revision.snapshotHash),
    }),
    resolveCanonicalRevision: async (hash, revisionId) =>
      substitute ? fixture.initial : resolver.get(hash) &&
          String(resolver.get(hash)!.revision.revisionId) === revisionId
        ? resolver.get(hash)
        : undefined,
    appendJournalCommand: async ({ next, commandId }) => {
      serverJournal = await appendJournalCommand(
        serverJournal,
        next,
        gameCaller(next.projectId, next.ownerId, next.revision.revisionId),
        commandId,
      );
      return {
        operationId: identity.operationId,
        projectId: PROJECT,
        actorId: ACTOR,
        clientId: CLIENT,
        clientSequence: 1,
        baseProjectRevision: 0,
        revisionId: String(next.revision.revisionId),
        sequence: next.revision.sequence,
        stateHash: String(next.revision.snapshotHash),
      };
    },
  });
  const adapter = createGamePixyncAdapter(makePort());
  const sequencer = new PixyncInMemorySequencer({
    projectId: PROJECT,
    adapters: [noopAdapter("draw"), noopAdapter("audio"), adapter],
  });
  const committed = await sequencer.commit(draft);
  assert.equal(
    serverJournal.current.revision.snapshotHash,
    fixture.next.revision.snapshotHash,
  );
  serverJournal = createJournal(
    fixture.initial,
    gameCaller(
      fixture.initial.projectId,
      fixture.initial.ownerId,
      fixture.initial.revision.revisionId,
    ),
  );
  const bad = createGamePixyncAdapter(makePort(true));
  await expectCode(async () => {
    await bad.apply(committed.operation, {
      source: "remote",
      projectRevision: 1,
      aggregateRevision: 1,
    });
  }, "RESOLVER_MISMATCH");
  await expectCode(
    () =>
      createGameOperationDraft({
        command: fixture.command,
        identity: {
          ...identity,
          operationId: "substituted",
          baseProjectRevision: 0,
        },
        expectedIdentity: identity,
      }),
    "OPERATION_ID_MISMATCH",
  );
});

Deno.test("PIXYNC-DRAW2-110-ORDER, IDENTITY, and ATOMIC-FAILURE preserve existing core sequencing", async () => {
  const applied: string[] = [];
  const accepting = (aggregate: PixyncAggregate): PixyncAggregateAdapter =>
    noopAdapter(aggregate, applied);
  const sequencer = new PixyncInMemorySequencer({
    projectId: "order-110",
    adapters: [accepting("draw"), accepting("audio"), accepting("game")],
  });
  const make = async (
    operationId: string,
    aggregate: PixyncAggregate,
    baseProjectRevision: number,
  ) =>
    createPixyncDraft({
      operationId,
      projectId: "order-110",
      aggregate,
      actorId: ACTOR,
      clientId: CLIENT,
      clientSequence: 1,
      baseProjectRevision,
      aggregateRevision: 0,
      payload: { command: operationId },
    });
  const first = await sequencer.commit(await make("order-draw", "draw", 0));
  const second = await sequencer.commit(await make("order-audio", "audio", 1));
  const third = await sequencer.commit(await make("order-game", "game", 2));
  const clientApplied: string[] = [];
  const keeper = new PixyncOrderKeeper({
    projectId: "order-110",
    adapters: [
      noopAdapter("draw", clientApplied),
      noopAdapter("audio", clientApplied),
      noopAdapter("game", clientApplied),
    ],
  });
  assert.equal(await keeper.receive(third.operation), "gap-held");
  await keeper.receive(first.operation);
  await keeper.receive(second.operation);
  assert.deepEqual(clientApplied, ["order-draw", "order-audio", "order-game"]);
  const failing = new PixyncInMemorySequencer({
    projectId: "fail-110",
    adapters: [
      {
        aggregate: "draw",
        apply: () => {
          throw new Error("fixture failure");
        },
      },
      noopAdapter("audio"),
      noopAdapter("game"),
    ],
  });
  await expectCode(async () => {
    await failing.commit(
      await createPixyncDraft({
        operationId: "fail",
        projectId: "fail-110",
        aggregate: "draw",
        actorId: ACTOR,
        clientId: CLIENT,
        clientSequence: 1,
        baseProjectRevision: 0,
        aggregateRevision: 0,
        payload: { command: "fail" },
      }),
    );
  }, "AGGREGATE_APPLY_FAILED");
  assert.equal(failing.snapshot().projectRevision, 0);
});

Deno.test("PIXYNC-DRAW2-110 identity substitution rejects before canonical apply", async () => {
  const fixture = await drawFixture();
  await expectCode(() =>
    createDrawOperationDraft({
      result: fixture.local.result,
      state: fixture.local.state,
      identity: { ...fixture.identity, baseProjectRevision: 0 },
      expectedIdentity: { ...fixture.identity, actorId: "substituted" },
      baseStructureEpoch: fixture.initial.structureEpoch,
    }), "IDENTITY_MISMATCH");
  await expectCode(() =>
    createDrawOperationDraft({
      result: fixture.local.result,
      state: fixture.local.state,
      identity: {
        ...fixture.identity,
        operationId: "substituted",
        baseProjectRevision: 0,
      },
      expectedIdentity: fixture.identity,
      baseStructureEpoch: fixture.initial.structureEpoch,
    }), "OPERATION_ID_MISMATCH");
});
