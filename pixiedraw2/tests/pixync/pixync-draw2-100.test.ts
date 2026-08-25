import { strict as assert } from "node:assert";
import {
  createPixyncDraft,
  type PixyncAggregate,
  type PixyncAggregateAdapter,
  type PixyncCommittedOperation,
  PixyncError,
  PixyncInMemorySequencer,
  PixyncInMemoryTransport,
  type PixyncJsonObject,
  PixyncOrderKeeper,
  validatePixyncDraft,
} from "../../src/pixync/index.ts";

const PROJECT_ID = "pixync-draw2-fixture";
type ApplyRecord = {
  readonly operationId: string;
  readonly projectRevision: number;
  readonly source: string;
  readonly payload: PixyncJsonObject;
};

function adapter(
  aggregate: PixyncAggregate,
  applied: ApplyRecord[],
  fail = false,
): PixyncAggregateAdapter {
  return {
    aggregate,
    apply: (operation, context) => {
      if (fail) throw new Error("synthetic adapter failure");
      applied.push({
        operationId: operation.operationId,
        projectRevision: operation.projectRevision,
        source: context.source,
        payload: operation.payload,
      });
    },
  };
}

function adapters(
  applied: ApplyRecord[],
  failAggregate?: PixyncAggregate,
): readonly PixyncAggregateAdapter[] {
  return (["draw", "audio", "game"] as const).map((aggregate) =>
    adapter(aggregate, applied, aggregate === failAggregate)
  );
}

async function draft(
  operationId: string,
  aggregate: PixyncAggregate,
  payload: PixyncJsonObject,
  clientSequence = 1,
  baseProjectRevision = 0,
  aggregateRevision = 0,
) {
  return createPixyncDraft({
    operationId,
    projectId: PROJECT_ID,
    aggregate,
    actorId: "actor-fixture",
    clientId: `client-${aggregate}`,
    clientSequence,
    baseProjectRevision,
    aggregateRevision,
    payload,
  });
}

async function expectCode(
  action: () => Promise<unknown>,
  code: string,
): Promise<void> {
  let caught: unknown;
  try {
    await action();
  } catch (error) {
    caught = error;
  }
  assert.ok(caught instanceof PixyncError);
  assert.equal(caught.code, code);
}

Deno.test("PIXYNC-DRAW2-100-ENVELOPE rejects hash mutation and forbidden command payloads", async () => {
  const valid = await draft("op-envelope", "draw", {
    command: "stroke",
    cells: [1, 2, 3],
  });
  await expectCode(
    () => validatePixyncDraft({ ...valid, payload: { command: "mutated" } }),
    "PAYLOAD_HASH_MISMATCH",
  );
  await expectCode(
    () => draft("op-preview", "draw", { uiPreview: { x: 1 } }),
    "PAYLOAD_FORBIDDEN",
  );
  await expectCode(
    () => draft("op-snapshot", "game", { snapshot: { entities: [] } }),
    "PAYLOAD_FORBIDDEN",
  );
  await expectCode(
    () => draft("op-audio-blob", "audio", { rawAudioBlob: "not-a-command" }),
    "PAYLOAD_FORBIDDEN",
  );
});

Deno.test("PIXYNC-DRAW2-100-SEQUENCE converges two clients with one project revision authority", async () => {
  const serverApplied: Array<
    {
      readonly operationId: string;
      readonly projectRevision: number;
      readonly source: string;
      readonly payload: PixyncJsonObject;
    }
  > = [];
  const transport = new PixyncInMemoryTransport();
  const sequencer = new PixyncInMemorySequencer({
    projectId: PROJECT_ID,
    adapters: adapters(serverApplied),
    transport,
  });
  const op1 = await draft("op-draw-1", "draw", { command: "stroke", cell: 1 });
  const op2 = await draft(
    "op-audio-1",
    "audio",
    { command: "note", note: 60 },
    1,
    1,
  );
  const committed1 = await sequencer.commit(op1);
  const committed2 = await sequencer.commit(op2);
  assert.equal(committed1.operation.projectRevision, 1);
  assert.equal(committed2.operation.projectRevision, 2);
  assert.deepEqual(sequencer.snapshot().aggregateRevisions, {
    draw: 1,
    audio: 1,
    game: 0,
  });

  const clientAApplied: typeof serverApplied = [];
  const clientBApplied: typeof serverApplied = [];
  const clientA = new PixyncOrderKeeper({
    projectId: PROJECT_ID,
    adapters: adapters(clientAApplied),
  });
  const clientB = new PixyncOrderKeeper({
    projectId: PROJECT_ID,
    adapters: adapters(clientBApplied),
  });
  transport.connect(
    "client-a",
    (operation) => clientA.receive(operation).then(() => undefined),
  );
  transport.connect(
    "client-b",
    (operation) => clientB.receive(operation).then(() => undefined),
  );

  assert.equal(await clientA.receive(committed2.operation), "gap-held");
  assert.equal(await clientA.receive(committed1.operation), "applied");
  assert.equal(await clientA.receive(committed2.operation), "duplicate");
  await transport.reconnectCatchUp("client-b", 0);
  assert.deepEqual(clientAApplied.map((item) => item.operationId), [
    "op-draw-1",
    "op-audio-1",
  ]);
  assert.deepEqual(clientBApplied.map((item) => item.operationId), [
    "op-draw-1",
    "op-audio-1",
  ]);
  assert.deepEqual(clientA.snapshot(), clientB.snapshot());
});

Deno.test("PIXYNC-DRAW2-100-ORDER rejects payload conflict and preserves exact idempotency", async () => {
  const applied: ApplyRecord[] = [];
  const sequencer = new PixyncInMemorySequencer({
    projectId: PROJECT_ID,
    adapters: adapters(applied),
  });
  const original = await draft("op-conflict", "draw", {
    command: "stroke",
    cell: 4,
  });
  const same = await sequencer.commit(original);
  const duplicate = await sequencer.commit(original);
  assert.equal(same.duplicate, false);
  assert.equal(duplicate.duplicate, true);
  const conflicting = await draft("op-conflict", "draw", {
    command: "stroke",
    cell: 5,
  });
  await expectCode(() => sequencer.commit(conflicting), "IDEMPOTENCY_CONFLICT");
  await expectCode(
    () => sequencer.commit({ ...original, actorId: "substituted-actor" }),
    "IDEMPOTENCY_CONFLICT",
  );
  await expectCode(
    () => sequencer.commit({ ...original, clientSequence: 99 }),
    "IDEMPOTENCY_CONFLICT",
  );
  assert.equal(sequencer.snapshot().projectRevision, 1);
});

Deno.test("PIXYNC-DRAW2-100-ORDER rejects a committed operation ID moved to another server revision", async () => {
  const applied: ApplyRecord[] = [];
  const sequencer = new PixyncInMemorySequencer({
    projectId: PROJECT_ID,
    adapters: adapters(applied),
  });
  const committed = await sequencer.commit(
    await draft("op-server-revision", "draw", { command: "stroke", cell: 6 }),
  );
  const client = new PixyncOrderKeeper({
    projectId: PROJECT_ID,
    adapters: adapters([]),
  });
  await client.receive(committed.operation);
  await expectCode(
    () => client.receive({ ...committed.operation, projectRevision: 2 }),
    "IDEMPOTENCY_CONFLICT",
  );
});

Deno.test("PIXYNC-DRAW2-100-COMPENSATE requires a current guard and emits a new operation", async () => {
  const applied: ApplyRecord[] = [];
  const sequencer = new PixyncInMemorySequencer({
    projectId: PROJECT_ID,
    adapters: adapters(applied),
  });
  const target = await draft("op-undo-target", "draw", {
    command: "stroke",
    cell: 7,
  });
  await sequencer.commit(target);
  const stale = await draft(
    "op-undo-stale",
    "draw",
    { command: "compensate", cell: 7 },
    2,
    1,
  );
  const staleWithGuard = {
    ...stale,
    compensation: {
      targetOperationId: target.operationId,
      expectedAggregateRevision: 0,
    },
  };
  await expectCode(
    () => sequencer.commit(staleWithGuard),
    "COMPENSATION_GUARD_STALE",
  );
  const valid = await draft(
    "op-undo-valid",
    "draw",
    { command: "compensate", cell: 7 },
    3,
    1,
  );
  const committed = await sequencer.commit({
    ...valid,
    compensation: {
      targetOperationId: target.operationId,
      expectedAggregateRevision: 1,
    },
  });
  assert.equal(committed.operation.projectRevision, 2);
  assert.equal(sequencer.snapshot().projectRevision, 2);
});

Deno.test("PIXYNC-DRAW2-100-CROSS-DOMAIN accepts locked Draw and Audio references in Game", async () => {
  const applied: ApplyRecord[] = [];
  const sequencer = new PixyncInMemorySequencer({
    projectId: PROJECT_ID,
    adapters: adapters(applied),
  });
  const draw = await sequencer.commit(
    await draft("op-draw-ref", "draw", { command: "asset-revision", value: 1 }),
  );
  const audio = await sequencer.commit(
    await draft(
      "op-audio-ref",
      "audio",
      { command: "asset-revision", value: 2 },
      1,
      1,
    ),
  );
  const gamePayload = {
    command: "bind-assets",
    draw: {
      revisionRef: {
        operationId: draw.operation.operationId,
        aggregate: "draw",
        projectRevision: 1,
        aggregateRevision: 1,
      },
    },
    audio: {
      revisionRef: {
        operationId: audio.operation.operationId,
        aggregate: "audio",
        projectRevision: 2,
        aggregateRevision: 1,
      },
    },
  } as const;
  const game = await sequencer.commit(
    await draft("op-game-ref", "game", gamePayload, 1, 2),
  );
  assert.equal(game.operation.projectRevision, 3);
  assert.deepEqual(sequencer.snapshot().aggregateRevisions, {
    draw: 1,
    audio: 1,
    game: 1,
  });
  await expectCode(
    async () =>
      sequencer.commit(
        await draft(
          "op-game-missing-ref",
          "game",
          {
            command: "bind-assets",
            revisionRef: {
              operationId: "missing",
              aggregate: "draw",
              projectRevision: 1,
              aggregateRevision: 1,
            },
          },
          2,
          3,
        ),
      ),
    "INVALID_ENVELOPE",
  );
});

Deno.test("PIXYNC-DRAW2-100-ATOMIC-FAILURE does not advance revision when adapter apply fails", async () => {
  const applied: ApplyRecord[] = [];
  const sequencer = new PixyncInMemorySequencer({
    projectId: PROJECT_ID,
    adapters: adapters(applied, "draw"),
  });
  await expectCode(
    async () =>
      sequencer.commit(
        await draft("op-failing-draw", "draw", { command: "stroke", cell: 9 }),
      ),
    "AGGREGATE_APPLY_FAILED",
  );
  assert.deepEqual(sequencer.snapshot(), {
    projectId: PROJECT_ID,
    projectRevision: 0,
    aggregateRevisions: { draw: 0, audio: 0, game: 0 },
    operationIds: [],
  });
  assert.equal(sequencer.log().length, 0);
});

Deno.test("PIXYNC-DRAW2-100-REMOTE remote apply uses adapter only and does not provide an undo surface", async () => {
  const serverApplied: ApplyRecord[] = [];
  const clientApplied: ApplyRecord[] = [];
  const sequencer = new PixyncInMemorySequencer({
    projectId: PROJECT_ID,
    adapters: adapters(serverApplied),
  });
  const committed = await sequencer.commit(
    await draft("op-remote", "game", { command: "scene-edit" }),
  );
  const client = new PixyncOrderKeeper({
    projectId: PROJECT_ID,
    adapters: adapters(clientApplied),
  });
  await client.receive(committed.operation);
  assert.equal(clientApplied[0]?.source, "remote");
  assert.equal(Object.hasOwn(client, "undoStack"), false);
});

// Keep the committed type imported in the test's public contract check.
const _committedTypeCheck: PixyncCommittedOperation | undefined = undefined;
void _committedTypeCheck;
