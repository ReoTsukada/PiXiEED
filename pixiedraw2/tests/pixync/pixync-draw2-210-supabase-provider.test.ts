import { strict as assert } from "node:assert";
import {
  createPixyncDraft,
  operationFingerprint,
} from "../../src/pixync/index.ts";
import { committedOperationFingerprint } from "../../src/pixync/core.ts";
import type {
  PixyncCommittedOperation,
  PixyncOperationDraft,
} from "../../src/pixync/contracts.ts";
import type {
  PixyncSupabaseLikePort,
  PixyncSupabasePortResult,
  PixyncSupabaseRealtimeChannelPort,
} from "../../src/pixync/supabase-provider.ts";
import {
  PIXYNC_SUPABASE_RPC_NAMES,
  PixyncSupabaseProvider,
  PixyncSupabaseProviderError,
} from "../../src/pixync/supabase-provider.ts";
import type {
  PixyncAuthoritativeOperationEvent,
  PixyncTransportBinding,
  PixyncTransportProviderOpenInput,
  PixyncTransportStatus,
} from "../../src/pixync/transport.ts";

const PROJECT = "project-210";
const CLIENT = "client-210";
const USER_A = "11111111-1111-4111-8111-111111111111";
const USER_B = "22222222-2222-4222-8222-222222222222";
const ROOM = "33333333-3333-4333-8333-333333333333";
const ACTOR = "44444444-4444-4444-8444-444444444444";
const ACTOR_B = "55555555-5555-4555-8555-555555555555";
const MEMBERSHIP = "66666666-6666-4666-8666-666666666666";
const MEMBERSHIP_B = "77777777-7777-4777-8777-777777777777";

type SessionRole = PixyncTransportBinding["role"];

function result<T>(
  data: T | null,
  error: unknown | null = null,
): PixyncSupabasePortResult<T> {
  return { data, error };
}

function sessionRow(
  principalId = USER_A,
  role: SessionRole = "editor",
  overrides: Partial<{
    room_id: string;
    actor_id: string;
    membership_id: string;
    membership_revision: string;
    client_id: string;
    session_generation: number;
  }> = {},
): Record<string, unknown> {
  return {
    principal_id: principalId,
    project_id: PROJECT,
    room_id: ROOM,
    actor_id: ACTOR,
    membership_id: MEMBERSHIP,
    membership_revision: "membership-v1",
    client_id: CLIENT,
    session_generation: 0,
    role,
    ...overrides,
  };
}

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

async function committed(
  operation: PixyncOperationDraft,
  projectRevision: number,
): Promise<PixyncCommittedOperation> {
  return {
    ...operation,
    projectRevision,
    aggregateRevision: operation.aggregateRevision || projectRevision,
    committedAt: "2026-08-23T00:00:00.000Z",
  };
}

async function ackRow(
  operation: PixyncOperationDraft,
  projectRevision: number,
): Promise<Record<string, unknown>> {
  const canonical = await committed(operation, projectRevision);
  return {
    kind: "COMMITTED",
    operation_id: canonical.operationId,
    project_id: canonical.projectId,
    project_revision: canonical.projectRevision,
    aggregate_revision: canonical.aggregateRevision,
    submission_fingerprint: await operationFingerprint(operation),
    committed_fingerprint: await committedOperationFingerprint(canonical),
    operation: canonical,
  };
}

class FakeChannel implements PixyncSupabaseRealtimeChannelPort {
  callback: ((payload: unknown) => void) | undefined;
  subscribed = false;
  unsubscribed = false;
  subscribeError: unknown | null = null;

  on(
    _type: "broadcast",
    _filter: { readonly event: "pixync_hint" },
    callback: (payload: unknown) => void,
  ): PixyncSupabaseRealtimeChannelPort {
    this.callback = callback;
    return this;
  }

  async subscribe(): Promise<PixyncSupabasePortResult<null> | void> {
    if (this.subscribeError !== null) return result(null, this.subscribeError);
    this.subscribed = true;
  }

  unsubscribe(): Promise<PixyncSupabasePortResult<null> | void> {
    this.unsubscribed = true;
    return Promise.resolve();
  }

  emit(payload: unknown): void {
    this.callback?.(payload);
  }
}

class FakeSupabaseLikePort implements PixyncSupabaseLikePort {
  userId: string | null = USER_A;
  authError: unknown | null = null;
  currentSession: Record<string, unknown> | null = sessionRow();
  openSessionError: unknown | null = null;
  commitError: unknown | null = null;
  fetchError: unknown | null = null;
  commitResponse: Record<string, unknown> | null = null;
  fetchResponse: readonly PixyncCommittedOperation[] = [];
  afterCommit: (() => void) | undefined;
  readonly rpcCalls: Array<
    { name: string; args: Readonly<Record<string, unknown>> }
  > = [];
  readonly channels: FakeChannel[] = [];

  readonly auth = {
    getUser: async (): Promise<
      PixyncSupabasePortResult<{ readonly user: unknown | null }>
    > =>
      result(
        this.userId === null ? { user: null } : {
          user: {
            id: this.userId,
            user_metadata: { role: "owner" },
            app_metadata: { role: "owner" },
          },
        },
        this.authError,
      ),
  };

  async rpc(
    functionName: string,
    args: Readonly<Record<string, unknown>>,
  ): Promise<PixyncSupabasePortResult<unknown>> {
    this.rpcCalls.push({ name: functionName, args });
    if (functionName === PIXYNC_SUPABASE_RPC_NAMES.openSession) {
      return result(this.currentSession, this.openSessionError);
    }
    if (functionName === PIXYNC_SUPABASE_RPC_NAMES.commit) {
      this.afterCommit?.();
      return result(this.commitResponse, this.commitError);
    }
    if (functionName === PIXYNC_SUPABASE_RPC_NAMES.fetchSince) {
      return result(this.fetchResponse, this.fetchError);
    }
    throw new Error(`unexpected rpc: ${functionName}`);
  }

  channel(_name: string): PixyncSupabaseRealtimeChannelPort {
    const channel = new FakeChannel();
    this.channels.push(channel);
    return channel;
  }
}

function codeIs(code: string) {
  return (error: unknown): boolean =>
    error instanceof PixyncSupabaseProviderError && error.code === code;
}

async function openProvider(
  port: FakeSupabaseLikePort,
  options: Partial<{
    clientId: string;
    sessionGeneration: number;
    onOperation: (
      event: PixyncAuthoritativeOperationEvent,
    ) => void | Promise<void>;
    onHint: () => void;
    onStatus: (status: PixyncTransportStatus) => void;
  }> = {},
) {
  const statuses: PixyncTransportStatus[] = [];
  const input: PixyncTransportProviderOpenInput = {
    projectId: PROJECT,
    clientId: options.clientId ?? CLIENT,
    sessionGeneration: options.sessionGeneration ?? 0,
    onAuthoritativeOperation: options.onOperation ?? (() => {}),
    onBroadcastHint: options.onHint ?? (() => {}),
    onStatus: options.onStatus ?? ((status) => statuses.push(status)),
  };
  const provider = new PixyncSupabaseProvider({ port });
  const opened = await provider.open(input);
  return { ...opened, input, statuses };
}

Deno.test("PIXYNC-DRAW2-210 auth without a server user fails closed", async () => {
  const port = new FakeSupabaseLikePort();
  port.userId = null;
  await assert.rejects(
    () => openProvider(port),
    codeIs("AUTH_REQUIRED"),
  );
  assert.equal(port.rpcCalls.length, 0);
  assert.equal(port.channels.length, 0);
});

Deno.test("PIXYNC-DRAW2-210 canonical membership is re-read and metadata cannot grant role", async () => {
  const port = new FakeSupabaseLikePort();
  port.currentSession = sessionRow(USER_A, "viewer");
  const opened = await openProvider(port);
  const operation = await draft("metadata-role");
  assert.equal(opened.binding.role, "viewer");
  await assert.rejects(
    () => opened.connection.submit(operation),
    codeIs("ROLE_FORBIDDEN"),
  );
  assert.equal(
    port.rpcCalls.at(-1)?.name,
    PIXYNC_SUPABASE_RPC_NAMES.openSession,
  );
  assert.equal(
    port.rpcCalls.some((call) =>
      call.name === PIXYNC_SUPABASE_RPC_NAMES.commit
    ),
    false,
  );
});

Deno.test("PIXYNC-DRAW2-210 membership replacement and revocation fail closed", async () => {
  const port = new FakeSupabaseLikePort();
  const opened = await openProvider(port);
  port.currentSession = sessionRow(USER_A, "editor", {
    membership_id: MEMBERSHIP_B,
    membership_revision: "membership-v2",
  });
  await assert.rejects(
    () => opened.connection.fetchSince(0),
    codeIs("SESSION_STALE"),
  );
  assert.equal(port.channels[0]?.unsubscribed, true);

  const revoked = new FakeSupabaseLikePort();
  const second = await openProvider(revoked);
  revoked.currentSession = null;
  const revokedOperation = await draft("revoked");
  await assert.rejects(
    () => second.connection.submit(revokedOperation),
    codeIs("SESSION_STALE"),
  );
});

Deno.test("PIXYNC-DRAW2-210 user switching is rejected even when role looks valid", async () => {
  const port = new FakeSupabaseLikePort();
  const opened = await openProvider(port);
  port.userId = USER_B;
  port.currentSession = sessionRow(USER_B, "editor", { actor_id: ACTOR_B });
  await assert.rejects(
    () => opened.connection.fetchSince(0),
    codeIs("SESSION_STALE"),
  );
});

Deno.test("PIXYNC-DRAW2-210 Realtime payload is ignored and stale callbacks are fenced", async () => {
  const port = new FakeSupabaseLikePort();
  let hints = 0;
  let operations = 0;
  const opened = await openProvider(port, {
    onHint: () => hints++,
    onOperation: () => {
      operations++;
    },
  });
  port.channels[0]?.emit({ operation: { forged: true }, projectRevision: 99 });
  assert.equal(hints, 1);
  assert.equal(operations, 0);
  await opened.connection.close("test-close");
  port.channels[0]?.emit({ operation: { forged: true } });
  assert.equal(hints, 1);
  assert.equal(operations, 0);
  assert.equal(port.channels[0]?.unsubscribed, true);
});

Deno.test("PIXYNC-DRAW2-210 RPC errors never become successful operations", async () => {
  const port = new FakeSupabaseLikePort();
  const opened = await openProvider(port);
  port.commitError = new Error("commit unavailable");
  const operation = await draft("rpc-error");
  await assert.rejects(
    () => opened.connection.submit(operation),
    codeIs("RPC_ERROR"),
  );
  const fetchPort = new FakeSupabaseLikePort();
  const fetchOpened = await openProvider(fetchPort);
  fetchPort.fetchError = new Error("fetch unavailable");
  await assert.rejects(
    () => fetchOpened.connection.fetchSince(0),
    codeIs("RPC_ERROR"),
  );
});

Deno.test("PIXYNC-DRAW2-210 revocation during commit rejects the ACK and closes", async () => {
  const port = new FakeSupabaseLikePort();
  const operation = await draft("revoke-during-commit");
  port.commitResponse = await ackRow(operation, 1);
  const opened = await openProvider(port);
  port.afterCommit = () => {
    port.currentSession = null;
  };
  await assert.rejects(
    () => opened.connection.submit(operation),
    codeIs("SESSION_STALE"),
  );
  assert.equal(port.channels[0]?.unsubscribed, true);
  assert.deepEqual(opened.statuses, ["CONNECTING", "SUBSCRIBED", "CLOSED"]);
});

Deno.test("PIXYNC-DRAW2-210 ACK row identity, revisions, and fingerprints are strict", async () => {
  const port = new FakeSupabaseLikePort();
  const opened = await openProvider(port);
  const operation = await draft("bad-ack");
  port.commitResponse = await ackRow(operation, 1);
  (port.commitResponse as Record<string, unknown>).committed_fingerprint = "f"
    .repeat(64);
  await assert.rejects(
    () => opened.connection.submit(operation),
    codeIs("ROW_INVALID"),
  );

  const extra = new FakeSupabaseLikePort();
  const extraOpened = await openProvider(extra);
  const extraOperation = await draft("extra-ack");
  extra.commitResponse = await ackRow(extraOperation, 1);
  extra.commitResponse.extra = true;
  await assert.rejects(
    () => extraOpened.connection.submit(extraOperation),
    codeIs("ROW_INVALID"),
  );
});

Deno.test("PIXYNC-DRAW2-210 submit rechecks fixed client and generation and does not accept caller authority", async () => {
  const port = new FakeSupabaseLikePort();
  port.currentSession = sessionRow(USER_A, "editor", {
    session_generation: 7,
  });
  const opened = await openProvider(port, { sessionGeneration: 7 });
  const operation = await draft("fixed-session");
  port.commitResponse = await ackRow(operation, 1);
  const ack = await opened.connection.submit(operation);
  assert.equal(ack.operationId, operation.operationId);
  const commitCall = port.rpcCalls.find((call) =>
    call.name === PIXYNC_SUPABASE_RPC_NAMES.commit
  );
  assert.deepEqual(commitCall?.args, {
    p_project_id: PROJECT,
    p_client_id: CLIENT,
    p_session_generation: 7,
    p_operation: operation,
  });
  assert.equal("actor_id" in (commitCall?.args ?? {}), false);
  assert.equal("role" in (commitCall?.args ?? {}), false);
  assert.equal("room_id" in (commitCall?.args ?? {}), false);
});

Deno.test("PIXYNC-DRAW2-210 catch-up validates rows and preserves authoritative order", async () => {
  const port = new FakeSupabaseLikePort();
  const first = await draft("catch-up-1");
  const second = await draft("catch-up-2", { clientSequence: 2 });
  port.fetchResponse = [await committed(first, 1), await committed(second, 2)];
  const opened = await openProvider(port);
  const operations = await opened.connection.fetchSince(0);
  assert.deepEqual(operations.map((item) => item.projectRevision), [1, 2]);
  const fetchCall = port.rpcCalls.find((call) =>
    call.name === PIXYNC_SUPABASE_RPC_NAMES.fetchSince
  );
  assert.deepEqual(fetchCall?.args, {
    p_project_id: PROJECT,
    p_after_project_revision: 0,
    p_client_id: CLIENT,
    p_session_generation: 0,
  });
});

Deno.test("PIXYNC-DRAW2-210 rejects fetch gaps and foreign UUID/revision rows", async () => {
  const gapPort = new FakeSupabaseLikePort();
  const operation = await draft("gap");
  gapPort.fetchResponse = [await committed(operation, 2)];
  const gapOpened = await openProvider(gapPort);
  await assert.rejects(
    () => gapOpened.connection.fetchSince(0),
    codeIs("ROW_INVALID"),
  );

  const uuidPort = new FakeSupabaseLikePort();
  uuidPort.currentSession = sessionRow(USER_A, "editor", {
    actor_id: "not-a-uuid",
  });
  await assert.rejects(() => openProvider(uuidPort), codeIs("ROW_INVALID"));
});

Deno.test("PIXYNC-DRAW2-210 close releases Realtime and blocks all later calls", async () => {
  const port = new FakeSupabaseLikePort();
  const opened = await openProvider(port);
  await opened.connection.close("user-closed");
  const operation = await draft("closed");
  await assert.rejects(
    () => opened.connection.fetchSince(0),
    codeIs("SESSION_CLOSED"),
  );
  await assert.rejects(
    () => opened.connection.submit(operation),
    codeIs("SESSION_CLOSED"),
  );
  assert.deepEqual(opened.statuses, ["CONNECTING", "SUBSCRIBED", "CLOSED"]);
});

Deno.test("PIXYNC-DRAW2-210 channel subscription errors fail closed", async () => {
  const port = new FakeSupabaseLikePort();
  const channel = new FakeChannel();
  channel.subscribeError = new Error("channel error");
  port.channels.push(channel);
  port.channel = () => channel;
  await assert.rejects(() => openProvider(port), codeIs("REALTIME_ERROR"));
  assert.equal(channel.unsubscribed, true);
});
