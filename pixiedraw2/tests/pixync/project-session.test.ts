import { strict as assert } from "node:assert";
import {
  createPixyncDraft,
  type PixyncAggregate,
  type PixyncAggregateAdapter,
  PixyncError,
  type PixyncJsonObject,
} from "../../src/pixync/index.ts";
import {
  LocalProjectSessionBroker,
  ProjectSessionClient,
  type ProjectSessionMode,
  type ProjectSessionRole,
} from "../../src/pixync/project-session.ts";

const PROJECT_ID = "project-session-fixture";
const AGGREGATES = ["draw", "audio", "game"] as const;

type Applied = {
  readonly operationId: string;
  readonly aggregate: PixyncAggregate;
  readonly source: string;
};

function adapters(applied: Applied[]): readonly PixyncAggregateAdapter[] {
  return AGGREGATES.map((aggregate) => ({
    aggregate,
    apply(operation, context) {
      applied.push({
        operationId: operation.operationId,
        aggregate,
        source: context.source,
      });
    },
  }));
}

async function draft(options: {
  readonly operationId: string;
  readonly aggregate: PixyncAggregate;
  readonly actorId: string;
  readonly clientId: string;
  readonly projectId?: string;
  readonly payload?: PixyncJsonObject;
  readonly baseProjectRevision?: number;
}): Promise<Awaited<ReturnType<typeof createPixyncDraft>>> {
  return createPixyncDraft({
    operationId: options.operationId,
    projectId: options.projectId ?? PROJECT_ID,
    aggregate: options.aggregate,
    actorId: options.actorId,
    clientId: options.clientId,
    clientSequence: 1,
    baseProjectRevision: options.baseProjectRevision ?? 0,
    aggregateRevision: 0,
    payload: options.payload ??
      { command: `${options.aggregate}.edit`, value: options.operationId },
  });
}

function client(
  broker: LocalProjectSessionBroker,
  actorId: string,
  clientId: string,
  activeMode: ProjectSessionMode,
  applied: Applied[],
  role?: ProjectSessionRole,
): ProjectSessionClient {
  return new ProjectSessionClient({
    broker,
    projectId: PROJECT_ID,
    actorId,
    clientId,
    displayName: clientId,
    ...(role === undefined ? {} : { role }),
    activeMode,
    adapters: adapters(applied),
  });
}

function codeIs(code: string): (error: unknown) => boolean {
  return (error: unknown): boolean =>
    error instanceof PixyncError && error.code === code;
}

Deno.test("PROJECT-SESSION binds Draw, Audio, and Game without making activeMode canonical", async () => {
  const serverApplied: Applied[] = [];
  const broker = new LocalProjectSessionBroker({
    projectId: PROJECT_ID,
    adapters: adapters(serverApplied),
  });
  const applied = {
    a: [] as Applied[],
    b: [] as Applied[],
    c: [] as Applied[],
  };
  const a = client(broker, "actor-a", "client-a", "iDRAW", applied.a);
  const b = client(broker, "actor-b", "client-b", "iAUDIO", applied.b);
  const c = client(broker, "actor-c", "client-c", "iGAME", applied.c);
  await Promise.all([a.connect(), b.connect(), c.connect()]);

  assert.equal(a.state().activeMode, "iDRAW");
  assert.equal(b.state().activeMode, "iAUDIO");
  assert.equal(c.state().activeMode, "iGAME");

  const [draw, audio, game] = await Promise.all([
    a.submit(
      await draft({
        operationId: "op-draw-1",
        aggregate: "draw",
        actorId: "actor-a",
        clientId: "client-a",
      }),
    ),
    b.submit(
      await draft({
        operationId: "op-audio-1",
        aggregate: "audio",
        actorId: "actor-b",
        clientId: "client-b",
      }),
    ),
    c.submit(
      await draft({
        operationId: "op-game-1",
        aggregate: "game",
        actorId: "actor-c",
        clientId: "client-c",
      }),
    ),
  ]);

  assert.deepEqual(
    [
      draw.operation.aggregate,
      audio.operation.aggregate,
      game.operation.aggregate,
    ].sort(),
    ["audio", "draw", "game"],
  );
  assert.equal(broker.snapshot().projectRevision, 3);
  assert.deepEqual(broker.snapshot().aggregateRevisions, {
    draw: 1,
    audio: 1,
    game: 1,
  });
  assert.equal("activeMode" in broker.snapshot(), false);
  for (const session of [a, b, c]) {
    assert.equal(session.state().projectRevision, 3);
    assert.deepEqual(session.state().aggregateRevisions, {
      draw: 1,
      audio: 1,
      game: 1,
    });
    assert.equal(session.state().status, "CONFIRMED");
  }
  assert.equal(
    serverApplied.filter((item) => item.source === "sequencer").length,
    3,
  );
});

Deno.test("PROJECT-SESSION keeps presence ephemeral and handles mode, disconnect, expiry, and reconnect", async () => {
  let nowMs = Date.parse("2026-01-01T00:00:00.000Z");
  const now = () => new Date(nowMs);
  const broker = new LocalProjectSessionBroker({
    projectId: PROJECT_ID,
    adapters: adapters([]),
    now,
    presenceTtlMs: 1_000,
  });
  const a = client(broker, "actor-a", "client-a", "iDRAW", []);
  const b = client(broker, "actor-b", "client-b", "iAUDIO", []);
  await Promise.all([a.connect(), b.connect()]);
  await Promise.all([
    a.publishPresence("Character"),
    b.publishPresence("BGM"),
  ]);
  assert.equal(a.state().presence.length, 2);

  b.setActiveMode("iGAME");
  await b.publishPresence("Scene");
  assert.equal(
    a.state().presence.find((item) => item.clientId === "client-b")?.mode,
    "iGAME",
  );

  await b.disconnect();
  assert.equal(
    a.state().presence.some((item) => item.clientId === "client-b"),
    false,
  );
  const operation = await a.submit(
    await draft({
      operationId: "op-after-disconnect",
      aggregate: "draw",
      actorId: "actor-a",
      clientId: "client-a",
    }),
  );
  await b.connect();
  assert.equal(b.state().projectRevision, operation.operation.projectRevision);
  assert.equal(b.state().status, "CONFIRMED");

  await a.publishPresence("Canvas");
  nowMs += 1_001;
  assert.deepEqual(await broker.expirePresence(), ["client-a"]);
  assert.equal(
    b.state().presence.some((item) => item.clientId === "client-a"),
    false,
  );
  assert.equal(broker.snapshot().projectRevision, 1);
});

Deno.test("PROJECT-SESSION validates bounded payloads and project identity before durable commit", async () => {
  await assert.rejects(
    () =>
      createPixyncDraft({
        operationId: "op-pointer-sample",
        projectId: PROJECT_ID,
        aggregate: "draw",
        actorId: "actor-a",
        clientId: "client-a",
        clientSequence: 1,
        baseProjectRevision: 0,
        aggregateRevision: 0,
        payload: { pointerSamples: [{ x: 1, y: 2 }] },
      }),
    codeIs("PAYLOAD_FORBIDDEN"),
  );

  const broker = new LocalProjectSessionBroker({
    projectId: PROJECT_ID,
    adapters: adapters([]),
  });
  const a = client(broker, "actor-a", "client-a", "iDRAW", []);
  await a.connect();
  await assert.rejects(
    async () =>
      a.submit(
        await draft({
          operationId: "op-foreign-project",
          aggregate: "draw",
          actorId: "actor-a",
          clientId: "client-a",
          projectId: "another-project",
        }),
      ),
    codeIs("PROJECT_MISMATCH"),
  );
  assert.equal(broker.snapshot().projectRevision, 0);
  assert.equal(a.state().status, "CONFLICT");
});

Deno.test("PROJECT-SESSION enforces roles and broadcasts metadata-only checkpoints", async () => {
  const broker = new LocalProjectSessionBroker({
    projectId: PROJECT_ID,
    adapters: adapters([]),
  });
  const owner = client(
    broker,
    "actor-owner",
    "client-owner",
    "iGAME",
    [],
    "owner",
  );
  const editor = client(
    broker,
    "actor-editor",
    "client-editor",
    "iDRAW",
    [],
    "editor",
  );
  const viewer = client(
    broker,
    "actor-viewer",
    "client-viewer",
    "iAUDIO",
    [],
    "viewer",
  );
  await Promise.all([owner.connect(), editor.connect(), viewer.connect()]);
  assert.equal(owner.state().role, "owner");
  assert.equal(editor.state().role, "editor");
  assert.equal(viewer.state().role, "viewer");

  await assert.rejects(
    async () =>
      viewer.submit(
        await draft({
          operationId: "op-viewer-write",
          aggregate: "game",
          actorId: "actor-viewer",
          clientId: "client-viewer",
        }),
      ),
    codeIs("ROLE_FORBIDDEN"),
  );
  assert.equal(viewer.state().status, "ERROR");
  assert.equal(broker.snapshot().projectRevision, 0);

  const operation = await editor.submit(
    await draft({
      operationId: "op-editor-write",
      aggregate: "draw",
      actorId: "actor-editor",
      clientId: "client-editor",
    }),
  );
  const checkpoint = await owner.createCheckpoint({
    checkpointId: "checkpoint-golden",
    label: "Golden Project V1",
    kind: "MANUAL",
  });
  assert.equal(checkpoint.projectRevision, operation.operation.projectRevision);
  assert.equal(checkpoint.operationCount, 1);
  assert.deepEqual(checkpoint.aggregateRevisions, {
    draw: 1,
    audio: 0,
    game: 0,
  });
  for (const session of [owner, editor, viewer]) {
    assert.deepEqual(
      session.state().checkpoints.map((item) => item.checkpointId),
      ["checkpoint-golden"],
    );
  }

  const retry = await owner.createCheckpoint({
    checkpointId: "checkpoint-golden",
    label: "Golden Project V1",
    kind: "MANUAL",
  });
  assert.deepEqual(retry, checkpoint);
  await assert.rejects(
    () =>
      owner.createCheckpoint({
        checkpointId: "checkpoint-golden",
        label: "Tampered checkpoint",
        kind: "MANUAL",
      }),
    codeIs("IDEMPOTENCY_CONFLICT"),
  );
  await assert.rejects(
    () =>
      viewer.createCheckpoint({
        checkpointId: "checkpoint-viewer",
        label: "Viewer attempt",
        kind: "MANUAL",
      }),
    codeIs("ROLE_FORBIDDEN"),
  );
  assert.equal(
    JSON.stringify(checkpoint).includes("bytes") ||
      JSON.stringify(checkpoint).includes("pixels"),
    false,
  );
});

Deno.test("PROJECT-SESSION handles duplicate, conflict, gap-held delivery, and deterministic catch-up", async () => {
  const broker = new LocalProjectSessionBroker({
    projectId: PROJECT_ID,
    adapters: adapters([]),
  });
  const a = client(broker, "actor-a", "client-a", "iDRAW", []);
  const b = client(broker, "actor-b", "client-b", "iAUDIO", []);
  await Promise.all([a.connect(), b.connect()]);

  const first = await draft({
    operationId: "op-order-1",
    aggregate: "draw",
    actorId: "actor-a",
    clientId: "client-a",
  });
  const second = await draft({
    operationId: "op-order-2",
    aggregate: "audio",
    actorId: "actor-a",
    clientId: "client-a",
  });
  const third = await draft({
    operationId: "op-order-3",
    aggregate: "game",
    actorId: "actor-a",
    clientId: "client-a",
  });
  const firstResult = await a.submit(first);
  const secondResult = await a.submit(second);
  const thirdResult = await a.submit(third);

  const duplicate = await a.submit(first);
  assert.equal(duplicate.duplicate, true);
  await assert.rejects(
    async () =>
      a.submit(
        await draft({
          operationId: "op-order-1",
          aggregate: "draw",
          actorId: "actor-a",
          clientId: "client-a",
          payload: { command: "draw.changed", value: "conflict" },
        }),
      ),
    codeIs("IDEMPOTENCY_CONFLICT"),
  );

  await b.disconnect();
  const disconnectedOp = await a.submit(
    await draft({
      operationId: "op-order-4",
      aggregate: "draw",
      actorId: "actor-a",
      clientId: "client-a",
      baseProjectRevision: 3,
    }),
  );
  await b.connect();
  assert.equal(
    b.state().projectRevision,
    disconnectedOp.operation.projectRevision,
  );
  assert.equal(b.state().status, "CONFIRMED");

  const gapApplied: Applied[] = [];
  const gapClient = client(
    broker,
    "actor-gap",
    "client-gap",
    "iGAME",
    gapApplied,
  );
  await gapClient.connect({ catchUp: false });
  await broker.deliverTo("client-gap", [
    thirdResult.operation,
    firstResult.operation,
    secondResult.operation,
  ]);
  assert.equal(gapClient.state().projectRevision, 3);
  assert.equal(gapClient.state().aggregateRevisions.game, 1);
  assert.equal(gapClient.state().status, "CONFIRMED");
  assert.deepEqual(
    gapApplied.map((item) => item.operationId),
    ["op-order-1", "op-order-2", "op-order-3"],
  );
});
