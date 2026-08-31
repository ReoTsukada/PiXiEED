import { strict as assert } from "node:assert";
import {
  detachPixyncProject,
  PixyncProjectDeletionError,
} from "../../src/pixync/project-deletion.ts";
import type { PixyncSupabaseSdkClient } from "../../src/pixync/supabase-sdk-port.ts";

const ROOM = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OTHER_ROOM = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const USER = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

type RpcResult = {
  readonly data: unknown;
  readonly error: unknown | null;
};

function fakeClient(options: {
  readonly user?: unknown | null;
  readonly authError?: unknown | null;
  readonly rpcResult?: RpcResult;
} = {}): {
  readonly client: PixyncSupabaseSdkClient;
  readonly calls: Array<{
    readonly name: string;
    readonly args: Readonly<Record<string, unknown>>;
  }>;
  readonly authCalls: { value: number };
} {
  const calls: Array<{
    readonly name: string;
    readonly args: Readonly<Record<string, unknown>>;
  }> = [];
  const authCalls = { value: 0 };
  const client = {
    auth: {
      getUser: async () => {
        authCalls.value += 1;
        return {
          data: { user: options.user === undefined ? { id: USER } : options.user },
          error: options.authError ?? null,
        };
      },
    },
    rpc: async (name: string, args: Readonly<Record<string, unknown>>) => {
      calls.push({ name, args });
      return options.rpcResult ?? {
        data: [{
          room_id: ROOM,
          action: "participant_left",
          room_status: "active",
          session_generation: 12,
        }],
        error: null,
      };
    },
    channel: () => {
      throw new Error("Realtime is not used by project deletion.");
    },
  } as unknown as PixyncSupabaseSdkClient;
  return { client, calls, authCalls };
}

function isDeletionError(
  code: PixyncProjectDeletionError["code"],
): (error: unknown) => boolean {
  return (error: unknown): boolean =>
    error instanceof PixyncProjectDeletionError && error.code === code;
}

Deno.test("PIXYNC-DRAW2-410 rejects a non-Room project before auth or RPC", async () => {
  const test = fakeClient();
  await assert.rejects(
    () => detachPixyncProject(test.client, "workspace:local-project"),
    isDeletionError("INVALID_INPUT"),
  );
  assert.equal(test.authCalls.value, 0);
  assert.equal(test.calls.length, 0);
});

Deno.test("PIXYNC-DRAW2-410 requires an authenticated user", async () => {
  const test = fakeClient({ user: null });
  await assert.rejects(
    () => detachPixyncProject(test.client, ROOM),
    isDeletionError("AUTHENTICATION_REQUIRED"),
  );
  assert.equal(test.authCalls.value, 1);
  assert.equal(test.calls.length, 0);
});

Deno.test("PIXYNC-DRAW2-410 detaches a participant with the server-owned Room identity", async () => {
  const test = fakeClient();
  const result = await detachPixyncProject(test.client, ` ${ROOM.toUpperCase()} `);
  assert.deepEqual(result, {
    roomId: ROOM,
    action: "participant_left",
    roomStatus: "active",
    sessionGeneration: 12,
  });
  assert.deepEqual(test.calls, [{
    name: "pixisync_detach_deleted_project",
    args: { p_room_id: ROOM },
  }]);
});

Deno.test("PIXYNC-DRAW2-410 accepts a localized owner and an idempotent missing Room", async () => {
  for (const rpcResult of [
    {
      data: [{
        room_id: ROOM,
        action: "owner_localized",
        room_status: "archived",
        session_generation: 13,
      }],
      expected: {
        roomId: ROOM,
        action: "owner_localized",
        roomStatus: "archived",
        sessionGeneration: 13,
      },
    },
    {
      data: [{
        room_id: ROOM,
        action: "already_detached",
        room_status: "missing",
        session_generation: 0,
      }],
      expected: {
        roomId: ROOM,
        action: "already_detached",
        roomStatus: "missing",
        sessionGeneration: 0,
      },
    },
  ]) {
    const test = fakeClient({
      rpcResult: { data: rpcResult.data, error: null },
    });
    assert.deepEqual(await detachPixyncProject(test.client, ROOM), rpcResult.expected);
  }
});

Deno.test("PIXYNC-DRAW2-410 stops an owner delete when localization is required", async () => {
  const test = fakeClient({
    rpcResult: {
      data: null,
      error: { message: "pixisync_localization_required" },
    },
  });
  await assert.rejects(
    () => detachPixyncProject(test.client, ROOM),
    isDeletionError("LOCALIZATION_REQUIRED"),
  );
  assert.equal(test.calls.length, 1);
});

Deno.test("PIXYNC-DRAW2-410 fails closed for a stale owner-archived response", async () => {
  const test = fakeClient({
    rpcResult: {
      data: [{
        room_id: ROOM,
        action: "owner_archived",
        room_status: "archived",
        session_generation: 13,
      }],
      error: null,
    },
  });
  await assert.rejects(
    () => detachPixyncProject(test.client, ROOM),
    isDeletionError("SERVER_RESPONSE_INVALID"),
  );
});

Deno.test("PIXYNC-DRAW2-410 rejects a mismatched server Room response", async () => {
  const test = fakeClient({
    rpcResult: {
      data: [{
        room_id: OTHER_ROOM,
        action: "participant_left",
        room_status: "active",
        session_generation: 12,
      }],
      error: null,
    },
  });
  await assert.rejects(
    () => detachPixyncProject(test.client, ROOM),
    isDeletionError("SERVER_RESPONSE_INVALID"),
  );
});

Deno.test("PIXYNC-DRAW2-410 rejects unknown Room statuses and action/status mismatches", async () => {
  for (const rpcResult of [
    {
      data: [{
        room_id: ROOM,
        action: "participant_left",
        room_status: "deleted-but-unknown",
        session_generation: 12,
      }],
      error: null,
    },
    {
      data: [{
        room_id: ROOM,
        action: "already_detached",
        room_status: "active",
        session_generation: 12,
      }],
      error: null,
    },
  ]) {
    const test = fakeClient({ rpcResult });
    await assert.rejects(
      () => detachPixyncProject(test.client, ROOM),
      isDeletionError("SERVER_RESPONSE_INVALID"),
    );
  }
});
