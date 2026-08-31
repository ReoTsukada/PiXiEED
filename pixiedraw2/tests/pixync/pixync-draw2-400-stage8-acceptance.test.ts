import { strict as assert } from "node:assert";
import {
  createPixyncDraft,
} from "../../src/pixync/core.ts";
import {
  PixyncInMemorySequencer,
  PixyncInMemoryTransport,
  PixyncOrderKeeper,
  type PixyncReceiveOutcome,
} from "../../src/pixync/in-memory.ts";
import type {
  PixyncAggregate,
  PixyncAggregateAdapter,
  PixyncApplyContext,
  PixyncCommittedOperation,
  PixyncOperationDraft,
} from "../../src/pixync/contracts.ts";

// STAGE8-LOCAL-001: three connected clients must converge after concurrent
// writes, reordered delivery, duplicate delivery, and one reconnect catch-up.
// This is intentionally an ISOLATED_FIXTURE and must never become production
// readiness evidence by itself.

const PROJECT = "stage8-local-acceptance";
const AGGREGATES: readonly PixyncAggregate[] = ["draw", "audio", "game"];
const CLIENTS = [
  { clientId: "stage8-client-a", actorId: "stage8-actor-a" },
  { clientId: "stage8-client-b", actorId: "stage8-actor-b" },
  { clientId: "stage8-client-c", actorId: "stage8-actor-c" },
] as const;
const ONLINE_ROUNDS = 40;
const OFFLINE_ROUNDS = 40;
const OPERATIONS_PER_ROUND = CLIENTS.length;

type AppliedRecord = {
  readonly operationId: string;
  readonly aggregate: PixyncAggregate;
  readonly source: PixyncApplyContext["source"];
};

function adapters(
  applied: AppliedRecord[],
): readonly PixyncAggregateAdapter[] {
  return AGGREGATES.map((aggregate) => ({
    aggregate,
    apply: (
      operation: PixyncCommittedOperation,
      context: PixyncApplyContext,
    ) => {
      applied.push({
        operationId: operation.operationId,
        aggregate,
        source: context.source,
      });
    },
  }));
}

type ClientHarness = {
  readonly clientId: string;
  readonly actorId: string;
  readonly keeper: PixyncOrderKeeper;
  readonly applied: AppliedRecord[];
  readonly outcomes: PixyncReceiveOutcome[];
  disconnect(): void;
  reconnect(): void;
};

function createClient(
  transport: PixyncInMemoryTransport,
  client: (typeof CLIENTS)[number],
): ClientHarness {
  const applied: AppliedRecord[] = [];
  const outcomes: PixyncReceiveOutcome[] = [];
  const keeper = new PixyncOrderKeeper({
    projectId: PROJECT,
    adapters: adapters(applied),
  });
  let connected = true;
  let unsubscribe = transport.connect(client.clientId, async (operation) => {
    outcomes.push(await keeper.receive(operation));
  });
  return {
    clientId: client.clientId,
    actorId: client.actorId,
    keeper,
    applied,
    outcomes,
    disconnect: () => {
      if (!connected) return;
      unsubscribe();
      connected = false;
    },
    reconnect: () => {
      if (connected) return;
      unsubscribe = transport.connect(client.clientId, async (operation) => {
        outcomes.push(await keeper.receive(operation));
      });
      connected = true;
    },
  };
}

async function commitRounds(
  sequencer: PixyncInMemorySequencer,
  startRound: number,
  count: number,
): Promise<readonly PixyncOperationDraft[]> {
  const drafts: PixyncOperationDraft[] = [];
  for (let round = startRound; round < startRound + count; round += 1) {
    const baseProjectRevision = sequencer.snapshot().projectRevision;
    const roundDrafts = await Promise.all(
      CLIENTS.map((client, clientIndex) => {
        const aggregate = AGGREGATES[clientIndex]!;
        return createPixyncDraft({
          operationId: `stage8-${client.clientId}-${String(round).padStart(3, "0")}`,
          projectId: PROJECT,
          aggregate,
          actorId: client.actorId,
          clientId: client.clientId,
          clientSequence: round + 1,
          baseProjectRevision,
          aggregateRevision: 0,
          payload: {
            command: "stage8.acceptance.write",
            value: `${client.clientId}:${round}`,
          },
        });
      }),
    );
    await Promise.all(roundDrafts.map((draft) => sequencer.commit(draft)));
    drafts.push(...roundDrafts);
  }
  return drafts;
}

async function deliverReordered(
  transport: PixyncInMemoryTransport,
  client: ClientHarness,
  operations: readonly PixyncCommittedOperation[],
): Promise<void> {
  await transport.deliver(client.clientId, [...operations].reverse());
  await transport.deliver(client.clientId, operations);
}

Deno.test("STAGE8-LOCAL-001 three clients converge through reordered duplicate delivery", async () => {
  const startedAt = performance.now();
  const transport = new PixyncInMemoryTransport();
  const serverApplied: AppliedRecord[] = [];
  const sequencer = new PixyncInMemorySequencer({
    projectId: PROJECT,
    transport,
    adapters: adapters(serverApplied),
  });
  const clients = CLIENTS.map((client) => createClient(transport, client));

  const onlineDrafts = await commitRounds(sequencer, 0, ONLINE_ROUNDS);
  const onlineOperations = sequencer.log();
  assert.equal(
    onlineOperations.length,
    ONLINE_ROUNDS * OPERATIONS_PER_ROUND,
  );
  for (const client of clients) {
    await deliverReordered(transport, client, onlineOperations);
    assert.ok(client.outcomes.includes("gap-held"));
    assert.equal(client.applied.length, onlineOperations.length);
    assert.equal(
      new Set(client.applied.map((record) => record.operationId)).size,
      onlineOperations.length,
    );
    assert.equal(
      client.outcomes.filter((outcome) => outcome === "duplicate").length,
      onlineOperations.length,
    );
  }

  const duplicate = await sequencer.commit(onlineDrafts[0]!);
  assert.equal(duplicate.duplicate, true);
  assert.equal(sequencer.log().length, onlineOperations.length);

  const offlineClient = clients[2]!;
  const offlineRevision = offlineClient.keeper.snapshot().projectRevision;
  offlineClient.disconnect();
  await commitRounds(sequencer, ONLINE_ROUNDS, OFFLINE_ROUNDS);
  const allOperations = sequencer.log();
  const offlineOperations = allOperations.slice(offlineRevision);
  assert.equal(
    offlineOperations.length,
    OFFLINE_ROUNDS * OPERATIONS_PER_ROUND,
  );
  for (const client of clients.slice(0, 2)) {
    await deliverReordered(transport, client, offlineOperations);
  }

  offlineClient.reconnect();
  await transport.reconnectCatchUp(
    offlineClient.clientId,
    offlineRevision,
  );
  await transport.deliver(
    offlineClient.clientId,
    offlineOperations,
  );

  const expected = sequencer.snapshot();
  for (const client of clients) {
    assert.deepEqual(client.keeper.snapshot(), expected);
    assert.equal(
      new Set(client.applied.map((record) => record.operationId)).size,
      allOperations.length,
    );
  }
  assert.equal(serverApplied.length, allOperations.length);
  assert.equal(
    serverApplied.filter((record) => record.source === "sequencer").length,
    allOperations.length,
  );
  assert.ok(clients.every((client) => client.applied.every((record) => record.source === "remote")));

  const elapsedMs = performance.now() - startedAt;
  assert.ok(Number.isFinite(elapsedMs) && elapsedMs >= 0);
  console.log(JSON.stringify({
    evidenceKind: "ISOLATED_FIXTURE",
    clients: CLIENTS.length,
    operations: allOperations.length,
    reorderedDelivery: true,
    duplicateDelivery: true,
    reconnectCatchUp: true,
    converged: true,
    elapsedMs: Math.round(elapsedMs * 100) / 100,
  }));
});

Deno.test("STAGE8-LOCAL-002 client offline state does not receive while disconnected", async () => {
  const transport = new PixyncInMemoryTransport();
  const serverApplied: AppliedRecord[] = [];
  const sequencer = new PixyncInMemorySequencer({
    projectId: PROJECT,
    transport,
    adapters: adapters(serverApplied),
  });
  const client = createClient(transport, CLIENTS[0]!);
  client.disconnect();
  await commitRounds(sequencer, 0, 2);
  assert.equal(client.applied.length, 0);
  assert.equal(client.keeper.snapshot().projectRevision, 0);
  client.reconnect();
  await transport.reconnectCatchUp(
    client.clientId,
    client.keeper.snapshot().projectRevision,
  );
  assert.equal(client.keeper.snapshot().projectRevision, sequencer.snapshot().projectRevision);
});
