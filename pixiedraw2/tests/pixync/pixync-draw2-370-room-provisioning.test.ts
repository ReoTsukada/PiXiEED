import { strict as assert } from "node:assert";
import {
  provisionPixyncInitialRoom,
  PixyncRoomProvisioningError,
} from "../../src/pixync/room-provisioning.ts";
import type { PixyncSupabaseSdkClient } from "../../src/pixync/supabase-sdk-port.ts";

const ROOM = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const CHECKPOINT = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const USER = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

function clientFixture(options: {
  readonly begin?: Record<string, unknown>;
  readonly uploadError?: unknown | null;
  readonly activate?: Record<string, unknown>;
  readonly authenticated?: boolean;
} = {}): {
  readonly client: PixyncSupabaseSdkClient;
  readonly calls: Array<{ readonly name: string; readonly args: Readonly<Record<string, unknown>> }>;
  readonly uploads: Array<{ readonly path: string; readonly body: Blob; readonly options: unknown }>;
} {
  const calls: Array<{ readonly name: string; readonly args: Readonly<Record<string, unknown>> }> = [];
  const uploads: Array<{ readonly path: string; readonly body: Blob; readonly options: unknown }> = [];
  const path = `rooms/${ROOM}/checkpoints/0/${CHECKPOINT}.pxd`;
  const client = {
    auth: {
      getUser: async () => ({
        data: { user: options.authenticated === false ? null : { id: USER } },
        error: null,
      }),
    },
    rpc: async (name: string, args: Readonly<Record<string, unknown>>) => {
      calls.push({ name, args });
      if (name === "pixisync_begin_session") {
        return {
          data: [options.begin ?? {
            room_id: ROOM,
            checkpoint_id: CHECKPOINT,
            storage_path: path,
            status: "initializing",
            session_generation: 1,
          }],
          error: null,
        };
      }
      if (name === "pixisync_activate_initial_checkpoint") {
        return {
          data: [options.activate ?? {
            room_id: ROOM,
            status: "active",
            head_revision: 0,
            active_checkpoint_id: CHECKPOINT,
            session_generation: 1,
          }],
          error: null,
        };
      }
      throw new Error(`Unexpected RPC ${name}`);
    },
    storage: {
      from: (bucket: string) => {
        assert.equal(bucket, "pixisync-checkpoints");
        return {
          download: async () => ({ data: null, error: new Error("not used") }),
          upload: async (
            uploadPath: string,
            body: Blob,
            uploadOptions?: unknown,
          ) => {
            uploads.push({ path: uploadPath, body, options: uploadOptions });
            return { data: { path: uploadPath }, error: options.uploadError ?? null };
          },
          remove: async () => ({ data: [], error: null }),
        };
      },
    },
    channel: () => {
      throw new Error("Realtime is not used by room provisioning.");
    },
  } satisfies PixyncSupabaseSdkClient;
  return { client, calls, uploads };
}

Deno.test("PIXYNC-DRAW2-370 provisions an authenticated revision-0 Room", async () => {
  const fixture = clientFixture();
  const bytes = new TextEncoder().encode("canonical PXD checkpoint");
  const result = await provisionPixyncInitialRoom(fixture.client, {
    title: "Golden Project",
    checkpointBytes: bytes,
  });

  assert.equal(result.roomId, ROOM);
  assert.equal(result.checkpointId, CHECKPOINT);
  assert.equal(result.storagePath, `rooms/${ROOM}/checkpoints/0/${CHECKPOINT}.pxd`);
  assert.equal(result.encodedBytes, bytes.byteLength);
  assert.equal(result.sessionGeneration, 1);
  assert.deepEqual(fixture.calls.map((call) => call.name), [
    "pixisync_begin_session",
    "pixisync_activate_initial_checkpoint",
  ]);
  assert.equal(fixture.calls[0]?.args.p_codec_version, 1);
  assert.match(String(fixture.calls[0]?.args.p_state_sha256), /^\\x[a-f0-9]{64}$/u);
  assert.equal(fixture.uploads.length, 1);
  assert.equal(fixture.uploads[0]?.path, result.storagePath);
  assert.equal(fixture.uploads[0]?.body.type, "application/vnd.pixieed.pxd");
  assert.deepEqual(fixture.uploads[0]?.options, {
    contentType: "application/vnd.pixieed.pxd",
    upsert: false,
  });
  assert.equal(
    new Uint8Array(await fixture.uploads[0]!.body.arrayBuffer()).join(","),
    bytes.join(","),
  );
});

Deno.test("PIXYNC-DRAW2-370 rejects unauthenticated provisioning before Room creation", async () => {
  const fixture = clientFixture({ authenticated: false });
  await assert.rejects(
    () => provisionPixyncInitialRoom(fixture.client, {
      title: "No auth",
      checkpointBytes: new Uint8Array([1]),
    }),
    (error: unknown) =>
      error instanceof PixyncRoomProvisioningError &&
      error.code === "AUTHENTICATION_REQUIRED",
  );
  assert.equal(fixture.calls.length, 0);
  assert.equal(fixture.uploads.length, 0);
});

Deno.test("PIXYNC-DRAW2-370 rejects a server-supplied path mismatch before upload", async () => {
  const fixture = clientFixture({
    begin: {
      room_id: ROOM,
      checkpoint_id: CHECKPOINT,
      storage_path: `rooms/${ROOM}/checkpoints/9/${CHECKPOINT}.pxd`,
      status: "initializing",
      session_generation: 1,
    },
  });
  await assert.rejects(
    () => provisionPixyncInitialRoom(fixture.client, {
      title: "Unsafe path",
      checkpointBytes: new Uint8Array([1, 2, 3]),
    }),
    (error: unknown) =>
      error instanceof PixyncRoomProvisioningError &&
      error.code === "SERVER_PATH_MISMATCH",
  );
  assert.equal(fixture.uploads.length, 0);
  assert.deepEqual(fixture.calls.map((call) => call.name), [
    "pixisync_begin_session",
  ]);
});

Deno.test("PIXYNC-DRAW2-370 does not activate after a failed Storage upload", async () => {
  const fixture = clientFixture({ uploadError: new Error("storage denied") });
  await assert.rejects(
    () => provisionPixyncInitialRoom(fixture.client, {
      title: "Upload failure",
      checkpointBytes: new Uint8Array([4, 5, 6]),
    }),
    (error: unknown) =>
      error instanceof PixyncRoomProvisioningError &&
      error.code === "UPLOAD_FAILED",
  );
  assert.deepEqual(fixture.calls.map((call) => call.name), [
    "pixisync_begin_session",
  ]);
  assert.equal(fixture.uploads.length, 1);
});

Deno.test("PIXYNC-DRAW2-370 rejects unexpected activation state", async () => {
  const fixture = clientFixture({
    activate: {
      room_id: ROOM,
      status: "initializing",
      head_revision: 0,
      active_checkpoint_id: CHECKPOINT,
      session_generation: 1,
    },
  });
  await assert.rejects(
    () => provisionPixyncInitialRoom(fixture.client, {
      title: "Activation mismatch",
      checkpointBytes: new Uint8Array([7, 8, 9]),
    }),
    (error: unknown) =>
      error instanceof PixyncRoomProvisioningError &&
      error.code === "ACTIVATION_FAILED",
  );
  assert.deepEqual(fixture.calls.map((call) => call.name), [
    "pixisync_begin_session",
    "pixisync_activate_initial_checkpoint",
  ]);
});
