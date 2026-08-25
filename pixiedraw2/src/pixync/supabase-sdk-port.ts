/** Narrow adapter from supabase-js to the authenticated PiXYNC provider port. */
import type {
  PixyncSupabaseLikePort,
  PixyncSupabasePortResult,
  PixyncSupabaseRealtimeChannelPort,
} from "./supabase-provider.ts";

export interface PixyncSupabaseSdkChannel {
  on(
    type: "broadcast",
    filter: { readonly event: "pixync_hint" },
    callback: (payload: unknown) => void,
  ): PixyncSupabaseSdkChannel;
  subscribe(callback: (status: string, error?: unknown) => void): unknown;
  unsubscribe(): Promise<unknown> | unknown;
}

export interface PixyncSupabaseSdkClient {
  readonly auth: {
    getUser(): Promise<PixyncSupabasePortResult<{ readonly user: unknown | null }>>;
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

function channelPort(channel: PixyncSupabaseSdkChannel): PixyncSupabaseRealtimeChannelPort {
  return {
    on(type, filter, callback) {
      channel.on(type, filter, callback);
      return this;
    },
    subscribe() {
      return new Promise<PixyncSupabasePortResult<null>>((resolve) => {
        let settled = false;
        channel.subscribe((status, error) => {
          if (settled) return;
          if (status === "SUBSCRIBED") {
            settled = true;
            resolve({ data: null, error: null });
          } else if (
            status === "CHANNEL_ERROR" || status === "TIMED_OUT" ||
            status === "CLOSED"
          ) {
            settled = true;
            resolve({ data: null, error: error ?? new Error(`Realtime ${status}`) });
          }
        });
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
}

export function createPixyncSupabaseSdkPort(
  client: PixyncSupabaseSdkClient,
): PixyncSupabaseLikePort {
  return {
    auth: client.auth,
    rpc: (functionName, args) => client.rpc(functionName, args),
    channel: (name) => channelPort(client.channel(name, {
      config: { private: true },
    })),
  };
}
