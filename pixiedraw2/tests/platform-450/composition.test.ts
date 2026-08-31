import { strict as assert } from "node:assert";
import {
  createPlatform450CanonicalFlowState,
  createPlatform450Composition,
  createPlatform450PackageState,
  PLATFORM450_CAPABILITIES,
  PLATFORM450_DEPENDENCY_MANIFEST,
} from "../../src/platform/platform-450/composition.ts";
import type {
  Platform450Command,
  Platform450Flow,
} from "../../src/platform/platform-450/contracts.ts";
import type {
  Platform450Authority,
  Platform450PackageState,
} from "../../src/platform/platform-450/server-contracts.ts";

const assertEquals = (actual: unknown, expected: unknown): void => {
  assert.equal(actual, expected);
};

const FLOWS: readonly Platform450Flow[] = [
  "PUBLIC_WORK_SOCIAL",
  "MARKET_PURCHASE_CHAIN",
  "DIRECT_WORK_CHAIN",
  "TOOL_ASSET_RUNTIME",
  "OPS_PROJECTION",
];

function command(
  flow: Platform450Flow,
  id = `cmd:${flow.toLowerCase()}`,
): Platform450Command {
  return {
    commandId: id,
    flow,
    resourceReference: `resource:${flow.toLowerCase()}`,
    requestedAction: "read",
  };
}

function authorityFor(input: Platform450Command): Platform450Authority {
  return {
    principalId: "principal:fixture",
    tenantId: "tenant:fixture",
    resourceId: input.resourceReference,
    action: input.requestedAction,
    capability: PLATFORM450_CAPABILITIES[input.flow],
    policyVersion: "policy-v1",
    currentRevision: "revision:1",
    providerIdentity: "server",
  };
}

function make(
  overrides: Partial<{
    readonly flags: Readonly<Record<string, "ON" | "OFF" | "UNKNOWN">>;
    readonly killSwitch: boolean;
    readonly authority: Platform450Authority;
    readonly state: Platform450PackageState;
    readonly apply: (input: unknown) => { ok: boolean; sideEffects: number };
  }> = {},
) {
  const base = command("PUBLIC_WORK_SOCIAL");
  const state = overrides.state ?? createPlatform450PackageState(
    "revision:1",
    base.flow,
    base.resourceReference,
  );
  const flags = overrides.flags ?? Object.fromEntries(
    FLOWS.map((flow) => [flow, "ON"]),
  );
  return createPlatform450Composition({
    authorityResolver: (input) => overrides.authority ?? authorityFor(input),
    packageStateResolver: (input) =>
      overrides.state ?? createPlatform450PackageState(
        state.revision,
        input.flow,
        input.resourceReference,
      ),
    consumerAdapter: {
      apply: overrides.apply ?? (() => ({ ok: true, sideEffects: 1 })),
    },
    flags,
    killSwitch: overrides.killSwitch ?? false,
    now: () => 1_725_000_000_000,
  });
}

async function executeOne(
  flow: Platform450Flow,
  id = `cmd:${flow.toLowerCase()}`,
) {
  const input = command(flow, id);
  const composition = make();
  return {
    composition,
    input,
    result: await composition.execute(input),
  };
}

Deno.test("public schema and recursive privacy rejection", async () => {
  const composition = make();
  const valid = await composition.execute(command("PUBLIC_WORK_SOCIAL"));
  assertEquals(valid.status, "APPLIED");
  const extra = await composition.execute({
    ...command("PUBLIC_WORK_SOCIAL", "cmd:extra"),
    nested: { privateProject: "do-not-echo" },
  });
  assertEquals(extra.status, "REJECTED");
  assert(extra.diagnostics.includes("PLATFORM450_COMMAND_SCHEMA_REJECTED"));
  const privateReference = await composition.execute({
    ...command("PUBLIC_WORK_SOCIAL", "cmd:private"),
    resourceReference: "private-project:1",
  });
  assertEquals(privateReference.status, "REJECTED");
  assert(
    !privateReference.diagnostics.some((item) =>
      item.includes("private-project")
    ),
  );
});

Deno.test("authority and dependency stale or mismatch fail closed", async () => {
  const base = command("PUBLIC_WORK_SOCIAL");
  const badAuthority = make({
    authority: { ...authorityFor(base), capability: "wrong.capability" },
  });
  assertEquals((await badAuthority.execute(base)).status, "REJECTED");
  const staleManifest = PLATFORM450_DEPENDENCY_MANIFEST.map((entry, index) =>
    index === 0 ? { ...entry, evidenceSha256: ["0".repeat(64)] } : entry
  );
  const stale = make({
    state: {
      revision: "revision:1",
      dependencyManifest: staleManifest,
      canonicalFlowState: createPlatform450CanonicalFlowState(
        base.flow,
        base.resourceReference,
      ),
    },
  });
  assertEquals((await stale.execute(base)).status, "REJECTED");
});

Deno.test("all five flows return exact invariant state", async () => {
  for (const [index, flow] of FLOWS.entries()) {
    const { result } = await executeOne(flow, `cmd:flow:${index}`);
    assertEquals(result.status, "APPLIED");
    assert(result.flowState);
    assertEquals(result.flowState.flow, flow);
    assertEquals(
      result.flowState.resourceReference,
      command(flow, `cmd:flow:${index}`).resourceReference,
    );
    if (flow === "PUBLIC_WORK_SOCIAL") {
      assert(
        result.flowState.publicOnly && result.flowState.moderationRequired,
      );
      assert(
        result.flowState.boundedSearch && result.flowState.boundedNotification,
      );
    }
    if (flow === "MARKET_PURCHASE_CHAIN") {
      assert(result.flowState.synthetic);
      assert(
        !result.flowState.paymentMutation && !result.flowState.rightsMutation,
      );
    }
    if (flow === "DIRECT_WORK_CHAIN") {
      assert(
        result.flowState.socialSeparated && result.flowState.marketSeparated,
      );
      assert(
        !result.flowState.paymentMutation && !result.flowState.rightsMutation,
      );
    }
    if (flow === "TOOL_ASSET_RUNTIME") {
      assertEquals(
        result.flowState.assetReference,
        result.flowState.resourceReference,
      );
      assert(
        result.flowState.references.every((reference) =>
          !reference.includes("raw")
        ),
      );
    }
    if (flow === "OPS_PROJECTION") {
      assert(!result.flowState.privateAds && !result.flowState.sdkAccess);
      assertEquals(result.flowState.revenueMode, "SHADOW_ONLY");
    }
  }
});

Deno.test("same command ID is idempotent and changed fingerprint conflicts", async () => {
  const composition = make();
  const first = command("PUBLIC_WORK_SOCIAL", "cmd:idempotent");
  const applied = await composition.execute(first);
  const duplicate = await composition.execute(first);
  const conflict = await composition.execute({
    ...first,
    requestedAction: "publish",
  });
  assertEquals(applied.status, "APPLIED");
  assertEquals(duplicate.status, "IDEMPOTENT");
  assertEquals(duplicate.fingerprint, applied.fingerprint);
  assertEquals(conflict.status, "CONFLICT");
  assertEquals(conflict.commit, "NOT_COMMITTED");
  assertEquals(composition.acceptedIdentities().length, 3);
});

Deno.test("consumer ordering, gap, duplicate, stale, and replay are bounded", async () => {
  const composition = make();
  const first = await composition.execute(
    command("PUBLIC_WORK_SOCIAL", "cmd:one"),
  );
  const second = await composition.execute(
    command("PUBLIC_WORK_SOCIAL", "cmd:two"),
  );
  assert(first.eventId && second.eventId);
  const input = (result: typeof first, sequence: number) => ({
    consumerId: "search",
    eventId: result.eventId!,
    aggregateReference: "resource:public_work_social",
    sequence,
    fingerprint: result.fingerprint,
    providerIdentity: "server",
  });
  assertEquals(
    (await composition.consume(input(second, 2))).status,
    "PENDING_GAP",
  );
  assertEquals((await composition.consume(input(first, 1))).status, "APPLIED");
  const replayWithSideEffect = await composition.consume({
    ...input(second, 2),
    replay: true,
  });
  assertEquals(replayWithSideEffect.status, "REJECTED");
  assertEquals(replayWithSideEffect.sideEffects, 0);
  assert(
    replayWithSideEffect.diagnostics.includes(
      "PLATFORM450_REPLAY_SIDE_EFFECT_REJECTED",
    ),
  );
  assertEquals(
    (await composition.consume(input(first, 1))).status,
    "DUPLICATE",
  );
  const replay = await composition.consume({
    ...input(first, 1),
    replay: true,
  });
  assertEquals(replay.status, "DUPLICATE");
  assertEquals(replay.sideEffects, 0);
  assertEquals((await composition.consume(input(second, 2))).status, "APPLIED");
  assertEquals((await composition.consume(input(first, 1))).status, "STALE");
});

Deno.test("replay side effects reject without advancing consumer shadow", async () => {
  const composition = make();
  const first = await composition.execute(
    command("PUBLIC_WORK_SOCIAL", "cmd:replay-first"),
  );
  const second = await composition.execute(
    command("PUBLIC_WORK_SOCIAL", "cmd:replay-second"),
  );
  const input = (result: typeof first, sequence: number) => ({
    consumerId: "replay-check",
    eventId: result.eventId!,
    aggregateReference: "resource:public_work_social",
    sequence,
    fingerprint: result.fingerprint,
    providerIdentity: "server" as const,
  });
  assertEquals((await composition.consume(input(first, 1))).status, "APPLIED");
  const before = composition.acceptedIdentities();
  const rejected = await composition.consume({
    ...input(second, 2),
    replay: true,
  });
  assertEquals(rejected.status, "REJECTED");
  assertEquals(rejected.sideEffects, 0);
  assert.deepEqual(composition.acceptedIdentities(), before);
  assertEquals((await composition.consume(input(second, 2))).status, "APPLIED");
});

Deno.test("consumer retry is limited to three attempts then DLQ", async () => {
  let attempts = 0;
  const composition = make({
    apply: () => {
      attempts += 1;
      return { ok: false, sideEffects: 0 };
    },
  });
  const result = await composition.execute(
    command("PUBLIC_WORK_SOCIAL", "cmd:retry"),
  );
  assertEquals(result.status, "PROJECTION_FAILED");
  const input = {
    consumerId: "analytics",
    eventId: result.eventId!,
    aggregateReference: "resource:public_work_social",
    sequence: 1,
    fingerprint: result.fingerprint,
    providerIdentity: "server" as const,
  };
  assertEquals(
    (await composition.consume({ ...input, retry: 1 })).status,
    "RETRY",
  );
  assertEquals(
    (await composition.consume({ ...input, retry: 2 })).status,
    "RETRY",
  );
  assertEquals(
    (await composition.consume({ ...input, retry: 3 })).status,
    "RETRY",
  );
  assertEquals(
    (await composition.consume({ ...input, retry: 4 })).status,
    "DLQ",
  );
  assertEquals(
    (await composition.consume({ ...input, retry: 5 })).status,
    "DLQ",
  );
  assertEquals(attempts, 4);
});

Deno.test("rollback restores only shadows and preserves accepted identities", async () => {
  const composition = make();
  const first = await composition.execute(
    command("PUBLIC_WORK_SOCIAL", "cmd:snapshot"),
  );
  const before = composition.acceptedIdentities();
  const saved = await composition.snapshot("snapshot:one");
  const second = await composition.execute(
    command("PUBLIC_WORK_SOCIAL", "cmd:after"),
  );
  assert(second.eventId);
  const restored = await composition.rollback(saved);
  assert(restored.restored);
  assertEquals(restored.compensated, false);
  assertEquals(composition.acceptedIdentities().length, before.length + 3);
  assert(composition.acceptedIdentities().includes(first.eventId!));
  const tampered = { ...saved, sourceRevision: "revision:stale" };
  const rejected = await composition.rollback(tampered);
  assertEquals(rejected.restored, false);
  assert(rejected.diagnostics.includes("PLATFORM450_SNAPSHOT_HASH_MISMATCH"));
});

Deno.test("OFF, UNKNOWN, and kill switch states fail closed", async () => {
  const input = command("PUBLIC_WORK_SOCIAL");
  const off = make({ flags: { PUBLIC_WORK_SOCIAL: "OFF" } });
  const unknown = make({ flags: {} });
  const killed = make({ killSwitch: true });
  assertEquals((await off.execute(input)).status, "REJECTED");
  assertEquals((await unknown.execute(input)).status, "REJECTED");
  assertEquals((await killed.execute(input)).status, "REJECTED");
  assertEquals(off.acceptedIdentities().length, 0);
  assertEquals(killed.acceptedIdentities().length, 0);
});

Deno.test("public contract stays authority-free and runtime is non-intrusive", async () => {
  const publicSource = await Deno.readTextFile(
    new URL("../../src/platform/platform-450/contracts.ts", import.meta.url),
  );
  for (
    const forbidden of [
      "Platform450Authority",
      "Platform450Capability",
      "Platform450DependencyManifest",
      "Platform450AuthorityResolver",
      "Platform450PackageStateResolver",
      "Platform450ConsumerAdapter",
      "Platform450CompositionOptions",
      "createPlatform450Composition",
    ]
  ) {
    assert(!publicSource.includes(forbidden));
  }
  const paths = PLATFORM450_DEPENDENCY_MANIFEST.flatMap((entry) => [
    ...entry.contractPaths,
    ...entry.evidencePaths,
  ]);
  assert(paths.every((path) => !/route|chunk|provider-sdk/i.test(path)));
  assertEquals(PLATFORM450_DEPENDENCY_MANIFEST.length, 5);
  assert(
    PLATFORM450_DEPENDENCY_MANIFEST.every((entry) =>
      entry.contractSha256.every((hash) => /^[a-f0-9]{64}$/.test(hash)) &&
      entry.evidenceSha256.every((hash) => /^[a-f0-9]{64}$/.test(hash))
    ),
  );
});

Deno.test("projection failure keeps commit and event evidence distinct", async () => {
  const composition = make({ apply: () => ({ ok: false, sideEffects: 3 }) });
  const result = await composition.execute(
    command("OPS_PROJECTION", "cmd:projection"),
  );
  assertEquals(result.status, "PROJECTION_FAILED");
  assertEquals(result.commit, "COMMITTED");
  assertEquals(result.eventRecorded, true);
  assertEquals(result.outboxReady, true);
  assertEquals(result.inboxApplied, false);
  assertEquals(result.projection, "FAILED");
});
