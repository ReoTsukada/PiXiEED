import { strict as assert } from "node:assert";
import { sha256Hex } from "../../src/wp160-contracts.ts";
import {
  PixyncRemoteCheckpointError,
  readPixyncActiveCheckpoint,
} from "../../src/pixync/remote-checkpoint.ts";
import type { PixyncSupabaseSdkClient } from "../../src/pixync/supabase-sdk-port.ts";

const ROOM = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const CHECKPOINT = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const USER = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const BYTES = new TextEncoder().encode("remote PXD checkpoint");

async function clientFixture(options: {
  readonly authenticated?: boolean;
  readonly row?: Record<string, unknown>;
  readonly body?: Blob | ArrayBuffer | Uint8Array | null;
  readonly downloadError?: unknown | null;
  readonly rpcError?: unknown | null;
} = {}): Promise<{
  readonly client: PixyncSupabaseSdkClient;
  readonly calls: Array<{ readonly name: string; readonly args: Readonly<Record<string, unknown>> }>;
  readonly downloaded: string[];
}> {
  const packageHash = await sha256Hex(BYTES);
  const path = `rooms/${ROOM}/checkpoints/0/${CHECKPOINT}.pxd`;
  const calls: Array<{ readonly name: string; readonly args: Readonly<Record<string, unknown>> }> = [];
  const downloaded: string[] = [];
  const row = options.row ?? {
    room_id: ROOM,
    status: "active",
    role: "owner",
    can_edit: true,
    head_revision: 0,
    structure_epoch: 0,
    session_generation: 1,
    checkpoint_id: CHECKPOINT,
    checkpoint_revision: 0,
    storage_path: path,
    state_sha256_hex: packageHash,
    encoded_bytes: BYTES.byteLength,
    codec_version: 1,
  };
  const client = {
    auth: {
      getUser: async () => ({
        data: { user: options.authenticated === false ? null : { id: USER } },
        error: null,
      }),
    },
    rpc: async (name: string, args: Readonly<Record<string, unknown>>) => {
      calls.push({ name, args });
      return {
        data: options.rpcError === undefined || options.rpcError === null
          ? [row]
          : null,
        error: options.rpcError ?? null,
      };
    },
    storage: {
      from: (bucket: string) => {
        assert.equal(bucket, "pixisync-checkpoints");
        return {
          download: async (downloadPath: string) => {
            downloaded.push(downloadPath);
            return {
              data: options.body === undefined ? new Blob([BYTES]) : options.body,
              error: options.downloadError ?? null,
            };
          },
          upload: async () => ({ data: {}, error: null }),
          remove: async () => ({ data: [], error: null }),
        };
      },
    },
    channel: () => {
      throw new Error("Realtime is not used by checkpoint reading.");
    },
  } satisfies PixyncSupabaseSdkClient;
  return { client, calls, downloaded };
}

Deno.test("PIXYNC-DRAW2-380 reads and verifies the active checkpoint", async () => {
  const fixture = await clientFixture();
  const result = await readPixyncActiveCheckpoint(fixture.client, ROOM);

  assert.equal(result.roomId, ROOM);
  assert.equal(result.checkpointId, CHECKPOINT);
  assert.equal(result.storagePath, `rooms/${ROOM}/checkpoints/0/${CHECKPOINT}.pxd`);
  assert.equal(result.packageHash, result.stateSha256Hex);
  assert.deepEqual([...result.bytes], [...BYTES]);
  assert.deepEqual(fixture.calls, [{
    name: "pixisync_open_session",
    args: { p_room_id: ROOM },
  }]);
  assert.deepEqual(fixture.downloaded, [result.storagePath]);
});

Deno.test("PIXYNC-DRAW2-380 rejects unauthenticated checkpoint restore", async () => {
  const fixture = await clientFixture({ authenticated: false });
  await assert.rejects(
    () => readPixyncActiveCheckpoint(fixture.client, ROOM),
    (error: unknown) =>
      error instanceof PixyncRemoteCheckpointError &&
      error.code === "AUTHENTICATION_REQUIRED",
  );
  assert.equal(fixture.calls.length, 0);
  assert.equal(fixture.downloaded.length, 0);
});

Deno.test("PIXYNC-DRAW2-380 rejects an unexpected server path before download", async () => {
  const fixture = await clientFixture({
    row: {
      room_id: ROOM,
      status: "active",
      role: "owner",
      can_edit: true,
      head_revision: 0,
      structure_epoch: 0,
      session_generation: 1,
      checkpoint_id: CHECKPOINT,
      checkpoint_revision: 7,
      storage_path: `rooms/${ROOM}/checkpoints/7/${CHECKPOINT}.pxd`,
      state_sha256_hex: await sha256Hex(BYTES),
      encoded_bytes: BYTES.byteLength,
      codec_version: 1,
    },
  });
  await assert.rejects(
    () => readPixyncActiveCheckpoint(fixture.client, ROOM),
    (error: unknown) =>
      error instanceof PixyncRemoteCheckpointError &&
      error.code === "SERVER_PATH_MISMATCH",
  );
  assert.equal(fixture.downloaded.length, 0);
});

Deno.test("PIXYNC-DRAW2-380 rejects a truncated checkpoint", async () => {
  const fixture = await clientFixture({ body: new Blob([BYTES.subarray(0, 3)]) });
  await assert.rejects(
    () => readPixyncActiveCheckpoint(fixture.client, ROOM),
    (error: unknown) =>
      error instanceof PixyncRemoteCheckpointError &&
      error.code === "CHECKPOINT_SIZE_MISMATCH",
  );
});

Deno.test("PIXYNC-DRAW2-380 rejects a hash-mismatched checkpoint", async () => {
  const mismatched = new Uint8Array(BYTES.length);
  mismatched.fill(7);
  const fixture = await clientFixture({ body: new Blob([mismatched]) });
  await assert.rejects(
    () => readPixyncActiveCheckpoint(fixture.client, ROOM),
    (error: unknown) =>
      error instanceof PixyncRemoteCheckpointError &&
      error.code === "CHECKPOINT_HASH_MISMATCH",
  );
});
