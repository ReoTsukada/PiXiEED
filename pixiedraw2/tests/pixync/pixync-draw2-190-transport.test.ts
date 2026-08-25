import { strict as assert } from "node:assert";
import {
  createPixyncDraft,
  operationFingerprint,
} from "../../src/pixync/index.ts";
import {
  PixyncTransportAdapter,
  PixyncTransportError,
  type PixyncAuthoritativeOperationEvent,
  type PixyncTransportAck,
  type PixyncTransportBinding,
  type PixyncTransportConnectInput,
  type PixyncTransportProvider,
  type PixyncTransportProviderConnection,
  type PixyncTransportProviderOpenInput,
  type PixyncTransportProviderOpenResult,
} from "../../src/pixync/transport.ts";
import type {
  PixyncCommittedOperation,
  PixyncOperationDraft,
} from "../../src/pixync/contracts.ts";
import { committedOperationFingerprint } from "../../src/pixync/core.ts";

// Repository-bound preflight anchors backed by executable regressions below.
// AUTHORITY-ROOT-001 CALLER_INJECTION_REJECTED REJECT
// RESOLVER-IDENTITY-001 CANONICAL_IDENTITY_MISMATCH REJECT
// CALLER-STATE-001 CALLER_STATE_NOT_AUTHORITY REJECT
// EVENT-ID-001 CANONICAL_EVENT_ID_REQUIRED REJECT
// REPLAY-REVOKE-001 LIFECYCLE_TRANSITION_NOT_AUTHORIZED REJECT

const PROJECT = "pixync-draw2-190";
const CLIENT = "client-190";
const ACTOR = "actor-190";

type OpenRecord = {
  readonly input: PixyncTransportProviderOpenInput;
  connection: PixyncTransportProviderConnection;
  closed: boolean;
  closeReason: string | undefined;
};

async function draft(
  operationId: string,
  overrides: Partial<PixyncOperationDraft> = {},
): Promise<PixyncOperationDraft> {
  return createPixyncDraft({
    operationId,
    projectId: PROJECT,
    aggregate: "draw",
    actorId: ACTOR,
    clientId: CLIENT,
    clientSequence: 1,
    baseProjectRevision: 0,
    aggregateRevision: 0,
    payload: { command: "draw.stroke", value: operationId },
    ...overrides,
  });
}

async function ack(
  submitted: PixyncOperationDraft,
  projectRevision: number,
  kind: "COMMITTED" | "DUPLICATE" = "COMMITTED",
): Promise<PixyncTransportAck> {
  const operation: PixyncCommittedOperation = {
    ...submitted,
    projectRevision,
    aggregateRevision: submitted.aggregateRevision || projectRevision,
    committedAt: "2026-08-23T00:00:00.000Z",
  };
  return {
    kind,
    operationId: operation.operationId,
    projectId: operation.projectId,
    projectRevision: operation.projectRevision,
    aggregateRevision: operation.aggregateRevision,
    submissionFingerprint: await operationFingerprint(submitted),
    committedFingerprint: await committedOperationFingerprint(operation),
    operation,
  };
}

class FakeProvider implements PixyncTransportProvider {
  readonly opens: OpenRecord[] = [];
  readonly committed: PixyncCommittedOperation[] = [];
  role: PixyncTransportBinding["role"] = "editor";
  bindingOverride: Partial<PixyncTransportBinding> = {};
  nextAck:
    | ((operation: PixyncOperationDraft) => Promise<PixyncTransportAck>)
    | undefined;
  catchUpOperations: readonly PixyncCommittedOperation[] = [];

  async open(
    input: PixyncTransportProviderOpenInput,
  ): Promise<PixyncTransportProviderOpenResult> {
    const record: OpenRecord = {
      input,
      connection: undefined as unknown as PixyncTransportProviderConnection,
      closed: false,
      closeReason: undefined,
    };
    const connection: PixyncTransportProviderConnection = {
      submit: async (operation) => {
        if (this.nextAck !== undefined) return this.nextAck(operation);
        const existing = this.committed.find((item) =>
          item.operationId === operation.operationId
        );
        if (existing !== undefined) {
          return {
            kind: "DUPLICATE",
            operationId: existing.operationId,
            projectId: existing.projectId,
            projectRevision: existing.projectRevision,
            aggregateRevision: existing.aggregateRevision,
            submissionFingerprint: await operationFingerprint(operation),
            committedFingerprint: await committedOperationFingerprint(existing),
            operation: existing,
          };
        }
        const result = await ack(operation, this.committed.length + 1);
        this.committed.push(result.operation);
        return result;
      },
      fetchSince: async () => this.catchUpOperations,
      close: async (reason) => {
        record.closed = true;
        record.closeReason = reason;
      },
    };
    record.connection = connection;
    this.opens.push(record);
    return {
      binding: {
        projectId: input.projectId,
        roomId: "room-190",
        actorId: ACTOR,
        clientId: input.clientId,
        role: this.role,
        sessionGeneration: input.sessionGeneration,
        ...this.bindingOverride,
      },
      connection,
    };
  }
}

function codeIs(code: string) {
  return (error: unknown): boolean =>
    error instanceof PixyncTransportError && error.code === code;
}

async function openAdapter(
  provider: PixyncTransportProvider,
  options: {
    generation?: number;
    onOperation?: (
      event: PixyncAuthoritativeOperationEvent,
    ) => void | Promise<void>;
    onBroadcastHint?: () => void;
    onStatus?: (status: string) => void;
  } = {},
): Promise<PixyncTransportAdapter> {
  const adapter = new PixyncTransportAdapter(provider);
  const connectInput: PixyncTransportConnectInput = {
    projectId: PROJECT,
    clientId: CLIENT,
    sessionGeneration: options.generation ?? 0,
    onOperation: options.onOperation ?? (() => {}),
    ...(options.onBroadcastHint === undefined
      ? {}
      : { onBroadcastHint: options.onBroadcastHint }),
    ...(options.onStatus === undefined ? {} : { onStatus: options.onStatus }),
  };
  await adapter.connect(connectInput);
  return adapter;
}

Deno.test("PIXYNC-DRAW2-190-CONTRACT authenticates binding and submits", async () => {
  const provider = new FakeProvider();
  const statuses: string[] = [];
  const adapter = await openAdapter(provider, {
    onStatus: (status) => statuses.push(status),
  });
  const result = await adapter.submit(await draft("op-submit"));
  assert.deepEqual(statuses, ["CONNECTING", "SUBSCRIBED"]);
  assert.equal(result.kind, "COMMITTED");
  assert.deepEqual(adapter.binding, {
    projectId: PROJECT,
    roomId: "room-190",
    actorId: ACTOR,
    clientId: CLIENT,
    role: "editor",
    sessionGeneration: 0,
  });
});

Deno.test("AUTHORITY-ROOT-001 caller cannot replace composition-root provider", async () => {
  const compositionProvider = new FakeProvider();
  const callerProvider = new FakeProvider();
  const adapter = new PixyncTransportAdapter(compositionProvider);
  await adapter.connect(
    {
      projectId: PROJECT,
      clientId: CLIENT,
      sessionGeneration: 0,
      onOperation: () => {},
      provider: callerProvider,
      providerFactory: () => callerProvider,
    } as Parameters<PixyncTransportAdapter["connect"]>[0],
  );
  assert.equal(compositionProvider.opens.length, 1);
  assert.equal(callerProvider.opens.length, 0, "CALLER_INJECTION_REJECTED");
});

Deno.test("PIXYNC-DRAW2-190-BINDING rejects missing and mismatched authority", async () => {
  const missing = new FakeProvider();
  missing.bindingOverride = { roomId: "" };
  await assert.rejects(() => openAdapter(missing), codeIs("BINDING_INVALID"));
  assert.equal(missing.opens[0]?.closeReason, "binding-rejected");
  for (
    const bindingOverride of [
      { projectId: "other-project" },
      { clientId: "other-client" },
      { sessionGeneration: 9 },
    ]
  ) {
    const provider = new FakeProvider();
    provider.bindingOverride = bindingOverride;
    await assert.rejects(
      () => openAdapter(provider),
      codeIs("IDENTITY_MISMATCH"),
    );
    assert.equal(provider.opens[0]?.closeReason, "binding-rejected");
  }
});

Deno.test("PIXYNC-DRAW2-190-ROLE rejects viewer submit", async () => {
  const provider = new FakeProvider();
  provider.role = "viewer";
  const adapter = await openAdapter(provider);
  const operation = await draft("op-viewer");
  await assert.rejects(
    () => adapter.submit(operation),
    codeIs("ROLE_FORBIDDEN"),
  );
  assert.equal(provider.committed.length, 0);
});

Deno.test("RESOLVER-IDENTITY-001 rejects actor, client, and project substitution", async () => {
  for (
    const overrides of [
      { actorId: "other-actor" },
      { clientId: "other-client" },
      { projectId: "other-project" },
    ]
  ) {
    const provider = new FakeProvider();
    const adapter = await openAdapter(provider);
    const operation = await draft("op-identity", overrides);
    await assert.rejects(
      () => adapter.submit(operation),
      codeIs("IDENTITY_MISMATCH"),
    );
    assert.equal(provider.committed.length, 0, "CANONICAL_IDENTITY_MISMATCH");
  }
});

Deno.test("EVENT-ID-001 separates authoritative tail from Broadcast hint", async () => {
  const provider = new FakeProvider();
  const delivered: string[] = [];
  let hints = 0;
  await openAdapter(provider, {
    onOperation: (event) => {
      assert.equal(event.origin, "AUTHORITATIVE_TAIL");
      delivered.push(event.operation.operationId);
    },
    onBroadcastHint: () => hints++,
  });
  const committed = (await ack(await draft("op-tail"), 1)).operation;
  await provider.opens[0]!.input.onAuthoritativeOperation({
    origin: "AUTHORITATIVE_TAIL",
    operation: committed,
  });
  provider.opens[0]!.input.onBroadcastHint();
  assert.deepEqual(delivered, ["op-tail"]);
  assert.equal(hints, 1);
  await assert.rejects(
    async () =>
      await provider.opens[0]!.input.onAuthoritativeOperation(
        committed as unknown as PixyncAuthoritativeOperationEvent,
      ),
    codeIs("AUTHORITATIVE_EVENT_INVALID"),
  );
  assert.equal(delivered.length, 1, "CANONICAL_EVENT_ID_REQUIRED");
});

Deno.test("PIXYNC-DRAW2-190-CALLBACK rechecks subscription after validation", async () => {
  const provider = new FakeProvider();
  const delivered: string[] = [];
  await openAdapter(provider, {
    onOperation: (event) => {
      delivered.push(event.operation.operationId);
    },
  });
  const open = provider.opens[0]!;
  const operation = (await ack(await draft("op-validation-race"), 1)).operation;
  const pending = open.input.onAuthoritativeOperation({
    origin: "AUTHORITATIVE_TAIL",
    operation,
  });
  open.input.onStatus("OFFLINE");
  await pending;
  assert.deepEqual(delivered, [], "LIFECYCLE_TRANSITION_NOT_AUTHORIZED");
});

Deno.test("PIXYNC-DRAW2-190-ACK rejects committed-operation fingerprint drift", async () => {
  const provider = new FakeProvider();
  provider.nextAck = async (submitted) => {
    const value = await ack(submitted, 1);
    const operation = { ...value.operation, actorId: "other-actor" };
    return {
      ...value,
      committedFingerprint: await committedOperationFingerprint(operation),
      operation,
    };
  };
  const adapter = await openAdapter(provider);
  const operation = await draft("op-ack-drift");
  await assert.rejects(
    () => adapter.submit(operation),
    codeIs("ACK_INVALID"),
  );
});

Deno.test("PIXYNC-DRAW2-190-ACK rejects aggregate-revision substitution", async () => {
  const provider = new FakeProvider();
  provider.nextAck = async (submitted) => {
    const value = await ack(submitted, 1);
    const operation = {
      ...value.operation,
      aggregateRevision: value.operation.aggregateRevision + 1,
    };
    return {
      ...value,
      aggregateRevision: operation.aggregateRevision,
      committedFingerprint: await committedOperationFingerprint(operation),
      operation,
    };
  };
  const adapter = await openAdapter(provider);
  const operation = await draft("op-ack-aggregate-revision-drift", {
    aggregateRevision: 7,
  });
  await assert.rejects(
    () => adapter.submit(operation),
    codeIs("ACK_INVALID"),
  );
});

Deno.test("PIXYNC-DRAW2-190-ACK folds exact resend as DUPLICATE", async () => {
  const provider = new FakeProvider();
  const adapter = await openAdapter(provider);
  const operation = await draft("op-duplicate");
  assert.equal((await adapter.submit(operation)).kind, "COMMITTED");
  assert.equal((await adapter.submit(operation)).kind, "DUPLICATE");
  assert.equal(provider.committed.length, 1);
});

Deno.test("PIXYNC-DRAW2-190-CATCHUP requires continuity from after plus one", async () => {
  const provider = new FakeProvider();
  const fifth = (await ack(await draft("op-catchup-5"), 5)).operation;
  const sixth = (await ack(await draft("op-catchup-6"), 6)).operation;
  const seventh = (await ack(await draft("op-catchup-7"), 7)).operation;
  const adapter = await openAdapter(provider);
  provider.catchUpOperations = [fifth, seventh];
  await assert.rejects(() => adapter.catchUp(4), codeIs("CATCH_UP_INVALID"));
  provider.catchUpOperations = [fifth, sixth];
  assert.deepEqual(
    (await adapter.catchUp(4)).map((item) => item.projectRevision),
    [5, 6],
  );
});

Deno.test("REPLAY-REVOKE-001 fences stale callbacks, close, and generation reuse", async () => {
  const provider = new FakeProvider();
  const firstDelivered: string[] = [];
  const secondDelivered: string[] = [];
  const adapter = await openAdapter(provider, {
    generation: 3,
    onOperation: (event) => {
      firstDelivered.push(event.operation.operationId);
    },
  });
  const firstOpen = provider.opens[0]!;
  await adapter.connect({
    projectId: PROJECT,
    clientId: CLIENT,
    sessionGeneration: 4,
    onOperation: (event) => {
      secondDelivered.push(event.operation.operationId);
    },
  });
  const operation = (await ack(await draft("op-late"), 1)).operation;
  await firstOpen.input.onAuthoritativeOperation({
    origin: "AUTHORITATIVE_TAIL",
    operation,
  });
  await provider.opens[1]!.input.onAuthoritativeOperation({
    origin: "AUTHORITATIVE_TAIL",
    operation,
  });
  assert.deepEqual(firstDelivered, []);
  assert.deepEqual(secondDelivered, ["op-late"]);
  assert.equal(firstOpen.closeReason, "replaced");
  await adapter.close("test-close");
  const closedOperation = await draft("op-closed");
  await assert.rejects(
    () => adapter.submit(closedOperation),
    codeIs("SESSION_NOT_OPEN"),
  );
  await assert.rejects(
    () =>
      adapter.connect({
        projectId: PROJECT,
        clientId: CLIENT,
        sessionGeneration: 4,
        onOperation: () => {},
      }),
    codeIs("STALE_SESSION"),
  );
});

Deno.test("CALLER-STATE-001 transport request owns no UI or aggregate authority", () => {
  const requestKeys = [
    "projectId",
    "clientId",
    "sessionGeneration",
    "onOperation",
    "onBroadcastHint",
    "onStatus",
  ];
  assert.equal(requestKeys.includes("snapshot"), false);
  assert.equal(requestKeys.includes("uiState"), false);
  assert.equal(
    requestKeys.includes("aggregateState"),
    false,
    "CALLER_STATE_NOT_AUTHORITY",
  );
});

Deno.test("PIXYNC-DRAW2-190-PUBLIC-API keeps transport internal and enables the owned root", async () => {
  const publicIndex = await Deno.readTextFile(
    new URL("../../src/pixync/index.ts", import.meta.url),
  );
  assert.equal(
    publicIndex.includes('from "./transport.ts"'),
    false,
    "TRANSPORT_NOT_IN_PUBLIC_API_GRAPH",
  );
  for (const symbol of [
    "PixyncTransportAdapter",
    "PixyncTransportProvider",
    "PixyncTransportProviderConnection",
    "PixyncTransportProviderOpenInput",
    "PixyncTransportProviderOpenResult",
  ]) {
    assert.equal(
      new RegExp(`\\b${symbol}\\b`, "u").test(publicIndex),
      false,
      `FORBIDDEN_PUBLIC_TRANSPORT_SYMBOL:${symbol}`,
    );
  }
  const compositionRoot = await Deno.readTextFile(
    new URL("../../src/pixync/composition-root.ts", import.meta.url),
  );
  assert.match(
    compositionRoot,
    /PIXYNC_DRAW2_PRODUCTION_COMPOSITION_ROOT_AVAILABLE = true/u,
  );
  assert.match(compositionRoot, /new PixyncSupabaseProvider/u);
  assert.doesNotMatch(
    compositionRoot,
    /readonly provider: PixyncTransportProvider/u,
  );
});
