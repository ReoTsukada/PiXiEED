// Not part of `deno.json`'s task list (deliberately — it needs a live hub
// process, unlike the rest of the deterministic pixync test suite). Run
// manually: see the sibling `run-bridge-provider-live-check.sh` driver.
// Kept here (rather than thrown away) so a future CI "live smoke test" gate
// can pick it up the same way `scripts/test-pixiedraw2-stage8-live.mjs` once did.
import { PixyncBridgeProvider } from "../../src/pixync/bridge-provider.ts";
import { createPixyncDraft } from "../../src/pixync/core.ts";

// Zero-dependency assertion helper (this repo avoids remote imports; the
// device this runs on may not even have general network egress).
function assertEquals<T>(actual: T, expected: T, message?: string): void {
  if (actual !== expected) {
    throw new Error(message ?? `Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

const BRIDGE_URL = Deno.env.get("BRIDGE_URL") ?? "ws://127.0.0.1:8792/bridge/ws";
const PROJECT_ID = "project_live_check";

Deno.test("PixyncBridgeProvider round-trips a real operation through a live Bridge hub", async () => {
  const provider = new PixyncBridgeProvider({ url: BRIDGE_URL });
  const statuses: string[] = [];
  const authoritative: unknown[] = [];

  const { binding, connection } = await provider.open({
    projectId: PROJECT_ID,
    clientId: "client_deno_a",
    sessionGeneration: 1,
    onAuthoritativeOperation: (event) => {
      authoritative.push(event);
    },
    onBroadcastHint: () => {},
    onStatus: (status) => statuses.push(status),
  });

  assertEquals(binding.projectId, PROJECT_ID);
  assertEquals(binding.clientId, "client_deno_a");
  assertEquals(statuses.includes("SUBSCRIBED"), true);

  // A second, raw client observes the broadcast independently of the
  // provider under test, so this proves real hub delivery, not a self-mock.
  const observer = new WebSocket(BRIDGE_URL);
  const observerMessages: unknown[] = [];
  await new Promise<void>((resolve, reject) => {
    observer.addEventListener("open", () => {
      observer.send(JSON.stringify({
        schema: "pixieed.realtime/1",
        kind: "hello",
        messageId: `msg_${crypto.randomUUID()}`,
        projectId: PROJECT_ID,
        clientId: "client_deno_observer",
        connectorId: "pixieed.test.observer",
        sentAt: new Date().toISOString(),
        payload: {},
      }));
    });
    observer.addEventListener("message", (event) => {
      const msg = JSON.parse(String(event.data));
      observerMessages.push(msg);
      if (msg.kind === "welcome") resolve();
    });
    observer.addEventListener("error", reject);
  });

  const draft = await createPixyncDraft({
    operationId: `op_live_${crypto.randomUUID()}`,
    projectId: PROJECT_ID,
    aggregate: "draw",
    actorId: "client_deno_a",
    clientId: "client_deno_a",
    clientSequence: 1,
    baseProjectRevision: 0,
    aggregateRevision: 0,
    payload: { kind: "raster", region: { x: 1, y: 1, width: 2, height: 2 } },
  });

  const ack = await connection.submit(draft);
  assertEquals(ack.kind, "COMMITTED");
  assertEquals(ack.operationId, draft.operationId);
  assertEquals(ack.projectRevision >= 1, true);

  // Give the observer's message handler a tick to receive the broadcast.
  await new Promise((resolve) => setTimeout(resolve, 200));
  const broadcast = observerMessages.find(
    (m) =>
      (m as { kind?: string }).kind === "operation" &&
      (m as { payload?: { operationId?: string } }).payload?.operationId === draft.operationId,
  );
  if (broadcast === undefined) {
    throw new Error("The second client never received the broadcast operation from the live hub.");
  }

  const since = await connection.fetchSince(0);
  if (!since.some((op) => op.operationId === draft.operationId)) {
    throw new Error("fetchSince did not include the just-committed operation.");
  }

  observer.close();
  await connection.close("test complete");
});
