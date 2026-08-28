import { strict as assert } from "node:assert";
import {
  createPixyncSupabaseSdkPort,
  type PixyncSupabaseSdkChannel,
  type PixyncSupabaseSdkClient,
} from "../../src/pixync/supabase-sdk-port.ts";
import type { PixyncTransportPresence } from "../../src/pixync/transport.ts";

const PRESENCE: PixyncTransportPresence = {
  actorId: "actor-215",
  clientId: "client-215",
  displayName: "This tab",
  mode: "iDRAW",
  selectionLabel: "Canvas",
  updatedAt: "2026-08-28T00:00:00.000Z",
};

Deno.test("PIXYNC-DRAW2-215 adapts private Supabase Presence without widening the SDK boundary", async () => {
  const registrations: Array<{
    type: string;
    event: string;
    callback: (payload: unknown) => void;
  }> = [];
  const tracked: PixyncTransportPresence[] = [];
  let untracked = false;
  let requestedPrivate = false;
  let authPrepared = false;
  let sdkChannel!: PixyncSupabaseSdkChannel;
  sdkChannel = {
    on: (
      type: "broadcast" | "presence",
      filter: { readonly event: string },
      callback: (payload: unknown) => void,
    ) => {
      registrations.push({ type, event: filter.event, callback });
      return sdkChannel;
    },
    presenceState: () => ({ peer: [PRESENCE] }),
    track: async (presence: PixyncTransportPresence) => {
      tracked.push(presence);
      return "ok";
    },
    untrack: async () => {
      untracked = true;
      return "ok";
    },
    subscribe: (callback: (status: string, error?: unknown) => void) =>
      callback("SUBSCRIBED"),
    unsubscribe: () => undefined,
  } as unknown as PixyncSupabaseSdkChannel;
  const client: PixyncSupabaseSdkClient = {
    auth: {
      getUser: async () => ({ data: { user: null }, error: null }),
    },
    realtime: {
      setAuth: () => {
        authPrepared = true;
      },
    },
    rpc: async () => ({ data: null, error: null }),
    channel: (_name, options) => {
      requestedPrivate = options.config.private;
      return sdkChannel;
    },
  };

  const port = createPixyncSupabaseSdkPort(client);
  const channel = port.channel("pixisync:room:215");
  assert.equal(requestedPrivate, true);
  assert.equal(typeof channel.onPresence, "function");
  assert.deepEqual(channel.presenceState?.(), { peer: [PRESENCE] });
  channel.onPresence?.("sync", () => {});
  assert.equal(
    registrations.some((entry) =>
      entry.type === "presence" && entry.event === "sync"
    ),
    true,
  );

  const subscribed = await channel.subscribe();
  assert.deepEqual(subscribed, { data: null, error: null });
  assert.equal(authPrepared, true);
  assert.deepEqual(await channel.track?.(PRESENCE), {
    data: null,
    error: null,
  });
  assert.deepEqual(tracked, [PRESENCE]);
  assert.deepEqual(await channel.untrack?.(), { data: null, error: null });
  assert.equal(untracked, true);
});
