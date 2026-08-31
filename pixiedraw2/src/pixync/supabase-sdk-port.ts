/** Narrow adapter from supabase-js to the authenticated PiXYNC provider port. */
import type {
  PixyncSupabaseLikePort,
  PixyncSupabasePortResult,
  PixyncSupabaseRealtimeChannelPort,
} from "./supabase-provider.ts";
import type { PixyncTransportPresence } from "./transport.ts";

export interface PixyncSupabaseSdkChannel {
  on(
    type: "broadcast",
    filter: { readonly event: "pixync_hint" },
    callback: (payload: unknown) => void,
  ): PixyncSupabaseSdkChannel;
  onPresence?(
    event: "sync" | "join" | "leave",
    callback: (payload: unknown) => void,
  ): PixyncSupabaseSdkChannel;
  presenceState?(): unknown;
  track?(presence: PixyncTransportPresence): Promise<unknown> | unknown;
  untrack?(): Promise<unknown> | unknown;
  subscribe(callback: (status: string, error?: unknown) => void): unknown;
  unsubscribe(): Promise<unknown> | unknown;
}

export type PixyncSupabaseSdkUploadBody =
  | Blob
  | ArrayBuffer
  | Uint8Array;

export interface PixyncSupabaseSdkStorageBucket {
  download(
    path: string,
  ): Promise<
    PixyncSupabasePortResult<Blob | ArrayBuffer | Uint8Array>
  >;
  upload(
    path: string,
    body: PixyncSupabaseSdkUploadBody,
    options?: {
      readonly contentType?: string;
      readonly upsert?: boolean;
    },
  ): Promise<PixyncSupabasePortResult<unknown>>;
  remove(paths: string[]): Promise<PixyncSupabasePortResult<unknown>>;
}

export interface PixyncSupabaseSdkClient {
  readonly auth: {
    getUser(): Promise<
      PixyncSupabasePortResult<{ readonly user: unknown | null }>
    >;
  };
  readonly realtime?: {
    setAuth?(): Promise<unknown> | unknown;
  };
  readonly storage?: {
    from(bucket: string): PixyncSupabaseSdkStorageBucket;
  };
  rpc(
    functionName: string,
    args: Readonly<Record<string, unknown>>,
  ): Promise<PixyncSupabasePortResult<unknown>>;
  channel(
    name: string,
    options: { readonly config: { readonly private: true } },
  ): PixyncSupabaseSdkChannel;
}

function channelPort(
  channel: PixyncSupabaseSdkChannel,
  prepareAuth?: () => Promise<unknown> | unknown,
): PixyncSupabaseRealtimeChannelPort {
  const port: PixyncSupabaseRealtimeChannelPort = {
    on(type, filter, callback) {
      channel.on(type, filter, callback);
      return this;
    },
    subscribe(onStatus) {
      return new Promise<PixyncSupabasePortResult<null>>((resolve) => {
        let settled = false;
        const handleStatus = (status: string, error?: unknown): void => {
          onStatus?.(status, error);
          if (settled) return;
          if (status === "SUBSCRIBED") {
            settled = true;
            resolve({ data: null, error: null });
          } else if (
            status === "CHANNEL_ERROR" || status === "TIMED_OUT" ||
            status === "CLOSED"
          ) {
            settled = true;
            resolve({
              data: null,
              error: error ?? new Error(`Realtime ${status}`),
            });
          }
        };
        void (async () => {
          try {
            await prepareAuth?.();
            await Promise.resolve(channel.subscribe(handleStatus));
          } catch (error) {
            if (settled) return;
            settled = true;
            resolve({ data: null, error });
          }
        })();
      });
    },
    async unsubscribe() {
      try {
        await channel.unsubscribe();
        return { data: null, error: null };
      } catch (error) {
        return { data: null, error };
      }
    },
  };
  const registerPresence = typeof channel.onPresence === "function"
    ? channel.onPresence.bind(channel)
    : (
      event: "sync" | "join" | "leave",
      callback: (payload: unknown) => void,
    ) =>
      (channel.on as unknown as (
        type: "presence",
        filter: { readonly event: "sync" | "join" | "leave" },
        callback: (payload: unknown) => void,
      ) => PixyncSupabaseSdkChannel)(
        "presence",
        { event },
        callback,
      );
  port.onPresence = (event, callback) => {
    registerPresence(event, callback);
    return port;
  };
  if (typeof channel.presenceState === "function") {
    port.presenceState = () => channel.presenceState?.() ?? {};
  }
  if (typeof channel.track === "function") {
    port.track = async (presence) => {
      try {
        const result = await channel.track?.(presence);
        if (result === undefined || result === "ok") {
          return { data: null, error: null };
        }
        if (
          result === "error" || result === "timeout" ||
          result === "timed out"
        ) {
          return {
            data: null,
            error: new Error(`Realtime Presence track ${result}.`),
          };
        }
        if (
          result !== null && typeof result === "object" &&
          "data" in result && "error" in result
        ) {
          return result as PixyncSupabasePortResult<null>;
        }
        return {
          data: null,
          error: new Error(
            "Realtime Presence track returned an invalid result.",
          ),
        };
      } catch (error) {
        return { data: null, error };
      }
    };
  }
  if (typeof channel.untrack === "function") {
    port.untrack = async () => {
      try {
        const result = await channel.untrack?.();
        if (result === undefined || result === "ok") {
          return { data: null, error: null };
        }
        if (
          result === "error" || result === "timeout" ||
          result === "timed out"
        ) {
          return {
            data: null,
            error: new Error(`Realtime Presence untrack ${result}.`),
          };
        }
        if (
          result !== null && typeof result === "object" &&
          "data" in result && "error" in result
        ) {
          return result as PixyncSupabasePortResult<null>;
        }
        return {
          data: null,
          error: new Error(
            "Realtime Presence untrack returned an invalid result.",
          ),
        };
      } catch (error) {
        return { data: null, error };
      }
    };
  }
  return port;
}

export function createPixyncSupabaseSdkPort(
  client: PixyncSupabaseSdkClient,
): PixyncSupabaseLikePort {
  return {
    auth: client.auth,
    rpc: (functionName, args) => client.rpc(functionName, args),
    channel: (name) =>
      channelPort(
        client.channel(name, {
          config: { private: true },
        }),
        () => client.realtime?.setAuth?.(),
      ),
  };
}
