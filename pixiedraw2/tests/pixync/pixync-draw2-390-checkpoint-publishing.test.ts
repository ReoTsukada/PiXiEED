import { strict as assert } from "node:assert";
import { sha256Hex } from "../../src/wp160-contracts.ts";
import {
  PixyncCheckpointPublishError,
  publishPixyncCheckpoint,
} from "../../src/pixync/checkpoint-publishing.ts";
import type { PixyncSupabaseSdkClient } from "../../src/pixync/supabase-sdk-port.ts";

const ROOM = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const CHECKPOINT = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const USER = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const ATTESTATION_CLIENT = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const BYTES = new TextEncoder().encode("publishable PXD checkpoint");

async function fixture(options: {
  readonly register?: Record<string, unknown>;
  readonly attest?: Record<string, unknown>;
  readonly activate?: Record<string, unknown>;
  readonly uploadError?: unknown | null;
} = {}): Promise<{
  readonly client: PixyncSupabaseSdkClient;
  readonly calls: Array<{ readonly name: string; readonly args: Readonly<Record<string, unknown>> }>;
  readonly uploads: Array<{ readonly path: string; readonly body: Blob; readonly options: unknown }>;
}> {
  const packageHash = await sha256Hex(BYTES);
  const calls: Array<{ readonly name: string; readonly args: Readonly<Record<string, unknown>> }> = [];
  const uploads: Array<{ readonly path: string; readonly body: Blob; readonly options: unknown }> = [];
  const client = {
    auth: {
      getUser: async () => ({ data: { user: { id: USER } }, error: null }),
    },
    rpc: async (name: string, args: Readonly<Record<string, unknown>>) => {
      calls.push({ name, args });
      if (name === "pixisync_prepare_checkpoint") {
        const preparedCheckpointId = String(args.p_checkpoint_id);
        return {
          data: [{
            checkpoint_id: preparedCheckpointId,
            revision: 3,
            storage_path: `rooms/${ROOM}/checkpoints/3/${preparedCheckpointId}.pxd`,
          }],
          error: null,
        };
      }
      if (name === "pixisync_register_checkpoint") {
        return {
          data: [options.register ?? {
            checkpoint_id: CHECKPOINT,
            revision: 3,
            status: "candidate",
          }],
          error: null,
        };
      }
      if (name === "pixisync_attest_checkpoint") {
        return {
          data: [options.attest ?? {
            checkpoint_id: CHECKPOINT,
            status: "verified",
            attested_user_count: 1,
            required_user_count: 1,
          }],
          error: null,
        };
      }
      if (name === "pixisync_activate_verified_checkpoint") {
        return {
          data: [options.activate ?? {
            checkpoint_id: CHECKPOINT,
            checkpoint_revision: 3,
            head_revision: 3,
            structure_epoch: 4,
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
          upload: async (uploadPath: string, body: Blob, uploadOptions?: unknown) => {
            uploads.push({ path: uploadPath, body, options: uploadOptions });
            return { data: { path: uploadPath }, error: options.uploadError ?? null };
          },
          remove: async () => ({ data: [], error: null }),
        };
      },
    },
    channel: () => {
      throw new Error("Realtime is not used by checkpoint publishing.");
    },
  } satisfies PixyncSupabaseSdkClient;
  return { client, calls, uploads };
}

Deno.test("PIXYNC-DRAW2-390 publishes and activates a verified head checkpoint", async () => {
  const test = await fixture();
  const result = await publishPixyncCheckpoint(test.client, {
    projectId: ROOM,
    checkpointBytes: BYTES,
    attestationClientId: ATTESTATION_CLIENT,
  });

  assert.equal(result.checkpointId, CHECKPOINT);
  assert.equal(result.revision, 3);
  assert.equal(result.status, "verified");
  assert.equal(result.active, true);
  assert.equal(result.headRevision, 3);
  assert.equal(result.structureEpoch, 4);
  assert.deepEqual(test.calls.map((call) => call.name), [
    "pixisync_prepare_checkpoint",
    "pixisync_register_checkpoint",
    "pixisync_attest_checkpoint",
    "pixisync_activate_verified_checkpoint",
  ]);
  assert.match(String(test.calls[0]?.args.p_state_sha256), /^\\x[a-f0-9]{64}$/u);
  assert.equal(test.calls[0]?.args.p_room_id, ROOM);
  assert.equal(test.uploads.length, 1);
  assert.equal(test.uploads[0]?.path, result.storagePath);
  assert.equal(test.uploads[0]?.body.type, "application/vnd.pixieed.pxd");
});

Deno.test("PIXYNC-DRAW2-390 keeps a two-user candidate inactive", async () => {
  const test = await fixture({
    attest: {
      checkpoint_id: CHECKPOINT,
      status: "candidate",
      attested_user_count: 1,
      required_user_count: 2,
    },
  });
  const result = await publishPixyncCheckpoint(test.client, {
    projectId: ROOM,
    checkpointBytes: BYTES,
    attestationClientId: ATTESTATION_CLIENT,
  });

  assert.equal(result.status, "candidate");
  assert.equal(result.active, false);
  assert.deepEqual(test.calls.map((call) => call.name), [
    "pixisync_prepare_checkpoint",
    "pixisync_register_checkpoint",
    "pixisync_attest_checkpoint",
  ]);
});

Deno.test("PIXYNC-DRAW2-390 does not register after an upload failure", async () => {
  const test = await fixture({ uploadError: new Error("Storage denied") });
  await assert.rejects(
    () => publishPixyncCheckpoint(test.client, {
      projectId: ROOM,
      checkpointBytes: BYTES,
      attestationClientId: ATTESTATION_CLIENT,
    }),
    (error: unknown) =>
      error instanceof PixyncCheckpointPublishError &&
      error.code === "UPLOAD_FAILED",
  );
  assert.deepEqual(test.calls.map((call) => call.name), [
    "pixisync_prepare_checkpoint",
  ]);
});

Deno.test("PIXYNC-DRAW2-390 rejects a server path substitution before upload", async () => {
  const test = await fixture();
  const originalRpc = test.client.rpc;
  const unsafeClient = {
    ...test.client,
    rpc: async (name: string, args: Readonly<Record<string, unknown>>) => {
      const result = await originalRpc(name, args);
      if (name === "pixisync_prepare_checkpoint") {
        return {
          data: [{
            checkpoint_id: CHECKPOINT,
            revision: 3,
            storage_path: `rooms/${ROOM}/checkpoints/9/${CHECKPOINT}.pxd`,
          }],
          error: null,
        };
      }
      return result;
    },
  } satisfies PixyncSupabaseSdkClient;
  await assert.rejects(
    () => publishPixyncCheckpoint(unsafeClient, {
      projectId: ROOM,
      checkpointBytes: BYTES,
      attestationClientId: ATTESTATION_CLIENT,
    }),
    (error: unknown) =>
      error instanceof PixyncCheckpointPublishError &&
      error.code === "SERVER_PATH_MISMATCH",
  );
  assert.equal(test.uploads.length, 0);
});
