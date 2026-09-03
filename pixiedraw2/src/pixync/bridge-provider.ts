/**
 * PixyncTransportProvider backed by the PiXiEED Bridge hub
 * (see `pixieed-bridge/docs/PROTOCOL_SPEC.md`).
 *
 * Product boundary (owner decision, 2026-09): PiXiEED Bridge ships as a
 * wholly separate, standalone app/product -- it is not a component of
 * PiXiEEDraw2 and PiXiEEDraw2 does not depend on it. PiXiEEDraw2's own
 * sync plan is PIXYNC, covering both local sharing across the Draw/Audio/
 * Game modes (see `docs/mode-authority-contract.md`) and PIXYNC's own
 * online sharing -- `supabase-provider.ts`, wired in `composition-root.ts`,
 * remains the production transport for that online path. This is not a
 * pending migration to Bridge; it is the plan.
 *
 * This module exists as an optional, off-by-default interoperability
 * path only: it lets a PixyncTransportAdapter speak to a separately
 * running Bridge hub over Bridge's own `pixieed.realtime/1` WebSocket
 * envelope, for a user who *also* runs Bridge and wants PiXiEEDraw2's
 * Draw/Audio/Game aggregates to show up there as one more Connector.
 * Nothing in pixiedraw2 selects this provider by default, and adopting
 * it for any product-facing path is a separate decision, not implied by
 * this file's existence.
 *
 * (Historical context: the older PiXiSYNC Supabase migrations/RPCs this
 * repo once carried were removed on 2026-08-30 -- see
 * `docs/bridge-migration/pixisync-reuse-notes.md` in the parent repo, and
 * ADR-015 in the Bridge repo's DECISIONS.md. That cleanup predates, and
 * should not be read as evidence for, the "Bridge becomes pixiedraw2's
 * transport" framing this comment used to carry.)
 *
 * Everything above this provider (PixyncOrderKeeper, PixyncDurableJournal,
 * PixyncLazyAggregateSync, PixyncDurableTransportCoordinator,
 * PixyncTransportAdapter) is untouched — this only implements the
 * `PixyncTransportProvider` port those already depend on.
 *
 * Known v1 limitations (tracked in the Bridge repo's TASKS.md):
 *  - No authentication/authorization yet; every connected client is treated
 *    as an "editor". The Bridge hub does not yet enforce room membership.
 *  - Reconnect uses a simple fixed-backoff retry; it has not been run
 *    against pixync's full existing DURABLE-TRANSPORT test battery
 *    (those tests exercise a mocked provider, not a live socket) -- see
 *    the manual-only `tests/pixync/bridge-provider-live-check.skip.ts`.
 */
import {
  committedOperationFingerprint,
  operationFingerprint,
} from "./core.ts";
import type {
  PixyncCommittedOperation,
  PixyncOperationDraft,
} from "./contracts.ts";
import type {
  PixyncTransportAck,
  PixyncTransportPresence,
  PixyncTransportPresenceDraft,
  PixyncTransportPresenceEvent,
  PixyncTransportProvider,
  PixyncTransportProviderConnection,
  PixyncTransportProviderOpenInput,
  PixyncTransportProviderOpenResult,
} from "./transport.ts";

const SCHEMA = "pixieed.realtime/1";
const PROTOCOL_VERSION = "1";
const RECONNECT_BASE_DELAY_MS = 500;
const RECONNECT_MAX_DELAY_MS = 8000;
const REQUEST_TIMEOUT_MS = 10_000;

export interface PixyncBridgeProviderOptions {
  /** e.g. "ws://127.0.0.1:8790/bridge/ws" */
  readonly url: string;
  readonly connectorId?: string;
}

interface BridgeEnvelope {
  readonly schema: string;
  readonly kind: string;
  readonly messageId: string;
  readonly projectId?: string;
  readonly clientId?: string;
  readonly connectorId?: string;
  readonly sentAt: string;
  readonly correlationId?: string;
  readonly sequence?: number;
  // deno-lint-ignore no-explicit-any
  readonly payload: any;
}

function randomMessageId(): string {
  return `msg_${crypto.randomUUID()}`;
}

function isPresenceDraftLike(
  value: unknown,
): value is PixyncTransportPresenceDraft {
  return (
    value !== null && typeof value === "object" &&
    typeof (value as Record<string, unknown>).displayName === "string" &&
    typeof (value as Record<string, unknown>).mode === "string" &&
    typeof (value as Record<string, unknown>).selectionLabel === "string"
  );
}

/** One live socket session for a single `open()` call. */
class BridgeSession {
  #url: string;
  #connectorId: string;
  #input: PixyncTransportProviderOpenInput;
  #ws: WebSocket | undefined;
  #closed = false;
  #reconnectAttempt = 0;
  #reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  #pending = new Map<
    string,
    { resolve: (msg: BridgeEnvelope) => void; reject: (err: Error) => void; timer: ReturnType<typeof setTimeout> }
  >();

  constructor(
    url: string,
    connectorId: string,
    input: PixyncTransportProviderOpenInput,
  ) {
    this.#url = url;
    this.#connectorId = connectorId;
    this.#input = input;
  }

  async open(): Promise<void> {
    await this.#connectOnce(true);
  }

  #connectOnce(isInitial: boolean): Promise<void> {
    return new Promise((resolve, reject) => {
      this.#input.onStatus(isInitial ? "CONNECTING" : "RECONNECTING");
      const ws = new WebSocket(this.#url);
      this.#ws = ws;
      let settled = false;
      ws.addEventListener("open", () => {
        ws.send(JSON.stringify({
          schema: SCHEMA,
          kind: "hello",
          messageId: randomMessageId(),
          projectId: this.#input.projectId,
          clientId: this.#input.clientId,
          connectorId: this.#connectorId,
          sentAt: new Date().toISOString(),
          payload: {
            protocolVersions: [PROTOCOL_VERSION],
            sessionGeneration: this.#input.sessionGeneration,
            ...(this.#input.presence === undefined
              ? {}
              : { presence: this.#input.presence }),
          },
        }));
      });
      ws.addEventListener("message", (event) => {
        let msg: BridgeEnvelope;
        try {
          msg = JSON.parse(String(event.data));
        } catch {
          return;
        }
        if (msg.kind === "welcome" && !settled) {
          settled = true;
          this.#reconnectAttempt = 0;
          this.#input.onStatus("SUBSCRIBED");
          resolve();
        }
        this.#route(msg);
      });
      ws.addEventListener("close", () => {
        this.#rejectAllPending(new Error("Bridge connection closed."));
        if (this.#closed) return;
        this.#input.onStatus("OFFLINE");
        this.#scheduleReconnect();
        if (!settled) reject(new Error("Bridge connection closed before welcome."));
      });
      ws.addEventListener("error", () => {
        // The subsequent "close" event carries the actual status transition;
        // this handler only exists so an unhandled-error console warning
        // isn't the only signal.
      });
    });
  }

  #scheduleReconnect(): void {
    if (this.#closed || this.#reconnectTimer !== undefined) return;
    const delay = Math.min(
      RECONNECT_MAX_DELAY_MS,
      RECONNECT_BASE_DELAY_MS * 2 ** this.#reconnectAttempt,
    );
    this.#reconnectAttempt += 1;
    this.#reconnectTimer = setTimeout(() => {
      this.#reconnectTimer = undefined;
      if (this.#closed) return;
      this.#connectOnce(false).catch(() => {
        // #connectOnce's own "close" handler already re-scheduled a retry.
      });
    }, delay);
  }

  #route(msg: BridgeEnvelope): void {
    if (msg.correlationId !== undefined && this.#pending.has(msg.correlationId)) {
      const waiter = this.#pending.get(msg.correlationId)!;
      this.#pending.delete(msg.correlationId);
      clearTimeout(waiter.timer);
      waiter.resolve(msg);
      return;
    }
    switch (msg.kind) {
      case "operation": {
        void this.#input.onAuthoritativeOperation({
          origin: "AUTHORITATIVE_TAIL",
          operation: msg.payload as PixyncCommittedOperation,
        });
        this.#input.onBroadcastHint();
        return;
      }
      case "presence": {
        this.#routePresence(msg);
        return;
      }
      case "error": {
        console.warn("[pixync-bridge] hub reported an error:", msg.payload);
        return;
      }
      default:
        return;
    }
  }

  #routePresence(msg: BridgeEnvelope): void {
    const onPresence = this.#input.onPresence;
    if (onPresence === undefined) return;
    const payload = msg.payload as { kind?: string; clientId?: string; state?: unknown };
    if (payload.kind === "remove" && typeof payload.clientId === "string") {
      const event: PixyncTransportPresenceEvent = { kind: "remove", clientId: payload.clientId };
      void onPresence(event);
      return;
    }
    if (
      payload.kind === "upsert" && typeof payload.clientId === "string" &&
      isPresenceDraftLike(payload.state)
    ) {
      const presence: PixyncTransportPresence = {
        ...payload.state,
        actorId: payload.clientId,
        clientId: payload.clientId,
        updatedAt: new Date().toISOString(),
      };
      const event: PixyncTransportPresenceEvent = { kind: "upsert", presence };
      void onPresence(event);
    }
    // A bare "joined"/"left" status marker (no presence draft attached) is
    // intentionally not translated into an upsert — it carries no
    // displayName/mode/selectionLabel to show.
  }

  #rejectAllPending(err: Error): void {
    for (const [id, waiter] of this.#pending) {
      clearTimeout(waiter.timer);
      waiter.reject(err);
      this.#pending.delete(id);
    }
  }

  request(kind: string, projectId: string, clientId: string, payload: unknown): Promise<BridgeEnvelope> {
    const ws = this.#ws;
    if (ws === undefined || ws.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error("Bridge connection is not open."));
    }
    const messageId = randomMessageId();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.#pending.delete(messageId);
        reject(new Error(`Bridge request "${kind}" timed out.`));
      }, REQUEST_TIMEOUT_MS);
      this.#pending.set(messageId, { resolve, reject, timer });
      ws.send(JSON.stringify({
        schema: SCHEMA,
        kind,
        messageId,
        projectId,
        clientId,
        connectorId: this.#connectorId,
        sentAt: new Date().toISOString(),
        payload,
      }));
    });
  }

  send(kind: string, projectId: string, clientId: string, payload: unknown): void {
    const ws = this.#ws;
    if (ws === undefined || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({
      schema: SCHEMA,
      kind,
      messageId: randomMessageId(),
      projectId,
      clientId,
      connectorId: this.#connectorId,
      sentAt: new Date().toISOString(),
      payload,
    }));
  }

  close(reason?: string): void {
    if (this.#closed) return;
    this.#closed = true;
    if (this.#reconnectTimer !== undefined) clearTimeout(this.#reconnectTimer);
    this.#rejectAllPending(new Error("Bridge connection closed."));
    const ws = this.#ws;
    if (ws !== undefined && ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(JSON.stringify({
          schema: SCHEMA,
          kind: "goodbye",
          messageId: randomMessageId(),
          sentAt: new Date().toISOString(),
          payload: { reason: reason ?? "closed" },
        }));
      } catch {
        // Best-effort notice only.
      }
    }
    ws?.close();
  }
}

export class PixyncBridgeProvider implements PixyncTransportProvider {
  #url: string;
  #connectorId: string;

  constructor(options: PixyncBridgeProviderOptions) {
    this.#url = options.url;
    this.#connectorId = options.connectorId ?? "pixieed.pixiedraw2.connector";
  }

  async open(
    input: PixyncTransportProviderOpenInput,
  ): Promise<PixyncTransportProviderOpenResult> {
    const session = new BridgeSession(this.#url, this.#connectorId, input);
    await session.open();

    const projectId = input.projectId;
    const clientId = input.clientId;

    const connection: PixyncTransportProviderConnection = {
      async submit(draft: PixyncOperationDraft): Promise<PixyncTransportAck> {
        const ackMsg = await session.request("operation", projectId, clientId, draft);
        if (ackMsg.kind === "error") {
          throw new Error(
            `Bridge rejected operation: ${ackMsg.payload?.code ?? "UNKNOWN"} ${ackMsg.payload?.message ?? ""}`,
          );
        }
        const operation = ackMsg.payload.operation as PixyncCommittedOperation;
        const duplicate = ackMsg.payload.duplicate === true;
        const [submissionFingerprint, committedFingerprint] = await Promise.all([
          operationFingerprint(draft),
          committedOperationFingerprint(operation),
        ]);
        return {
          kind: duplicate ? "DUPLICATE" : "COMMITTED",
          operationId: draft.operationId,
          projectId: draft.projectId,
          projectRevision: operation.projectRevision,
          aggregateRevision: operation.aggregateRevision,
          submissionFingerprint,
          committedFingerprint,
          operation,
        };
      },
      async fetchSince(
        afterProjectRevision: number,
      ): Promise<readonly PixyncCommittedOperation[]> {
        const resp = await session.request(
          "snapshot.request",
          projectId,
          clientId,
          { afterProjectRevision },
        );
        if (resp.kind === "error") {
          throw new Error(`Bridge rejected snapshot.request: ${resp.payload?.message ?? ""}`);
        }
        return (resp.payload.operations ?? []) as PixyncCommittedOperation[];
      },
      publishPresence(presence: PixyncTransportPresenceDraft): Promise<void> {
        session.send("presence", projectId, clientId, presence);
        return Promise.resolve();
      },
      close(reason?: string): Promise<void> {
        session.close(reason);
        return Promise.resolve();
      },
    };

    return {
      binding: {
        projectId,
        roomId: projectId,
        actorId: clientId,
        clientId,
        role: "editor",
        sessionGeneration: input.sessionGeneration,
      },
      connection,
    };
  }
}
