import { strict as assert } from "node:assert";
import {
  auditSafeWork420Result,
  createWork420CompositionRoot,
} from "../../src/platform/work-420/composition.ts";
import type {
  Work420CurrentHeads,
  Work420Result,
  Work420TransitionResult,
} from "../../src/platform/work-420/contracts.ts";
import {
  commandFor,
  contextForFixture,
  createWork420Fixture,
  type Work420Fixture,
} from "./fixture.ts";

let operationSequence = 0;

function rootFor(fixture: Work420Fixture) {
  return createWork420CompositionRoot(fixture.registry, {
    flags: { "work-420-composition": true },
  });
}

async function execute(
  fixture: Work420Fixture,
  operation: Parameters<typeof commandFor>[0],
  principalId: string,
  prefix: string,
  claims?: Record<string, unknown>,
  root = rootFor(fixture),
): Promise<Work420Result<Work420TransitionResult>> {
  const context = await contextForFixture(fixture, principalId);
  const command = commandFor(
    operation,
    `${prefix}:${operation}:${++operationSequence}`,
    claims,
  );
  return await root.execute(command, context);
}

function ok(
  result: Work420Result<Work420TransitionResult>,
  message: string,
): Work420TransitionResult {
  assert.equal(result.ok, true, message);
  if (!result.ok) throw new Error(message);
  return result.value;
}

function failure(
  result: Work420Result<Work420TransitionResult>,
  code: string,
  message: string,
): void {
  assert.equal(result.ok, false, message);
  if (result.ok) return;
  assert.ok(
    result.diagnostics.some((diagnostic) => diagnostic.code === code),
    `${message}: expected ${code}, got ${
      result.diagnostics.map((item) => item.code).join(",")
    }`,
  );
}

async function driveAccepted(
  fixture: Work420Fixture,
  prefix: string,
): Promise<Work420TransitionResult> {
  const root = rootFor(fixture);
  ok(
    await execute(
      fixture,
      "SUBMIT_REQUEST",
      fixture.requesterId,
      prefix,
      undefined,
      root,
    ),
    "Request must submit",
  );
  ok(
    await execute(
      fixture,
      "ISSUE_QUOTE",
      fixture.creatorId,
      prefix,
      undefined,
      root,
    ),
    "Creator must issue Quote",
  );
  ok(
    await execute(
      fixture,
      "ACCEPT_QUOTE",
      fixture.requesterId,
      prefix,
      undefined,
      root,
    ),
    "Requester must accept Quote",
  );
  ok(
    await execute(
      fixture,
      "CREATE_AGREEMENT",
      fixture.requesterId,
      prefix,
      undefined,
      root,
    ),
    "Agreement must be created",
  );
  ok(
    await execute(
      fixture,
      "SIGN_AGREEMENT_REQUESTER",
      fixture.requesterId,
      prefix,
      undefined,
      root,
    ),
    "Requester must sign Agreement",
  );
  ok(
    await execute(
      fixture,
      "SIGN_AGREEMENT_CREATOR",
      fixture.creatorId,
      prefix,
      undefined,
      root,
    ),
    "Creator must sign Agreement",
  );
  ok(
    await execute(
      fixture,
      "CREATE_MILESTONE",
      fixture.creatorId,
      prefix,
      undefined,
      root,
    ),
    "Milestone must be created",
  );
  ok(
    await execute(
      fixture,
      "START_MILESTONE",
      fixture.creatorId,
      prefix,
      undefined,
      root,
    ),
    "Milestone must start",
  );
  ok(
    await execute(
      fixture,
      "SUBMIT_DELIVERY",
      fixture.creatorId,
      prefix,
      undefined,
      root,
    ),
    "Delivery must be submitted",
  );
  ok(
    await execute(
      fixture,
      "MARK_DELIVERY_PENDING",
      fixture.requesterId,
      prefix,
      undefined,
      root,
    ),
    "Delivery must enter acceptance pending",
  );
  ok(
    await execute(
      fixture,
      "DECIDE_ACCEPTANCE",
      fixture.requesterId,
      prefix,
      undefined,
      root,
    ),
    "Acceptance must be recorded",
  );
  ok(
    await execute(
      fixture,
      "DECIDE_RIGHTS",
      fixture.requesterId,
      prefix,
      undefined,
      root,
    ),
    "Rights must be explicit",
  );
  ok(
    await execute(
      fixture,
      "CREATE_PAYMENT",
      fixture.requesterId,
      prefix,
      undefined,
      root,
    ),
    "Payment must be created",
  );
  ok(
    await execute(
      fixture,
      "APPLY_PAYMENT_EVENT",
      fixture.requesterId,
      prefix,
      undefined,
      root,
    ),
    "Authorization Payment Event must apply",
  );
  ok(
    await execute(
      fixture,
      "APPLY_PAYMENT_EVENT",
      fixture.requesterId,
      prefix,
      undefined,
      root,
    ),
    "Paid Payment Event must apply",
  );
  return ok(
    await execute(
      fixture,
      "MATERIALIZE_LEDGER",
      fixture.requesterId,
      prefix,
      undefined,
      root,
    ),
    "Ledger must materialize",
  );
}

type FixtureStep = readonly [Parameters<typeof commandFor>[0], string];

async function runSteps(
  fixture: Work420Fixture,
  prefix: string,
  steps: readonly FixtureStep[],
  root = rootFor(fixture),
): Promise<void> {
  for (const [operation, principalId] of steps) {
    ok(
      await execute(fixture, operation, principalId, prefix, undefined, root),
      `${operation} must succeed during fixture setup`,
    );
  }
}

function agreementSteps(fixture: Work420Fixture): readonly FixtureStep[] {
  return [
    ["SUBMIT_REQUEST", fixture.requesterId],
    ["ISSUE_QUOTE", fixture.creatorId],
    ["ACCEPT_QUOTE", fixture.requesterId],
    ["CREATE_AGREEMENT", fixture.requesterId],
    ["SIGN_AGREEMENT_REQUESTER", fixture.requesterId],
    ["SIGN_AGREEMENT_CREATOR", fixture.creatorId],
  ];
}

function milestoneSteps(fixture: Work420Fixture): readonly FixtureStep[] {
  return [
    ...agreementSteps(fixture),
    ["CREATE_MILESTONE", fixture.creatorId],
  ];
}

function startedMilestoneSteps(
  fixture: Work420Fixture,
): readonly FixtureStep[] {
  return [
    ...milestoneSteps(fixture),
    ["START_MILESTONE", fixture.creatorId],
  ];
}

function deliverySteps(fixture: Work420Fixture): readonly FixtureStep[] {
  return [
    ...startedMilestoneSteps(fixture),
    ["SUBMIT_DELIVERY", fixture.creatorId],
  ];
}

function acceptanceSteps(fixture: Work420Fixture): readonly FixtureStep[] {
  return [
    ...deliverySteps(fixture),
    ["MARK_DELIVERY_PENDING", fixture.requesterId],
    ["DECIDE_ACCEPTANCE", fixture.requesterId],
  ];
}

function rightsSteps(fixture: Work420Fixture): readonly FixtureStep[] {
  return [
    ...acceptanceSteps(fixture),
    ["DECIDE_RIGHTS", fixture.requesterId],
  ];
}

function paymentSteps(fixture: Work420Fixture): readonly FixtureStep[] {
  return [
    ...rightsSteps(fixture),
    ["CREATE_PAYMENT", fixture.requesterId],
  ];
}

function tamperCurrentHead(
  fixture: Work420Fixture,
  head: keyof Work420CurrentHeads,
): void {
  const current = fixture.registry.current;
  fixture.registry.setCurrent({
    ...current,
    currentHeads: {
      ...current.currentHeads,
      [head]: `${String(head).replace(/Revision$/, "")}:v999`,
    },
  });
}

Deno.test("WORK-420 feature flag and kill switch are fail-closed", async () => {
  const fixture = await createWork420Fixture();
  const context = await contextForFixture(fixture);
  const command = commandFor("SUBMIT_REQUEST", "work420:flag:test");
  const disabled = await createWork420CompositionRoot(fixture.registry).execute(
    command,
    context,
  );
  failure(
    disabled,
    "FEATURE_DISABLED",
    "Composition must be disabled by default",
  );

  const killRoot = createWork420CompositionRoot(fixture.registry, {
    flags: { "work-420-composition": true },
    killSwitch: true,
  });
  const killed = await killRoot.execute(
    command,
    await contextForFixture(fixture),
  );
  failure(
    killed,
    "KILL_SWITCH_ACTIVE",
    "Kill switch must win over the enabled flag",
  );
});

Deno.test("WORK-420 composes the complete Direct Work Billing aggregate", async () => {
  const fixture = await createWork420Fixture();
  const final = await driveAccepted(fixture, "work420:happy");
  assert.equal(final.aggregate.request.record.status, "SUBMITTED");
  assert.equal(
    final.aggregate.quote?.record.acceptedTermsHash,
    fixture.registry.termsHash,
  );
  assert.equal(
    final.aggregate.agreement?.record.termsHash,
    fixture.registry.termsHash,
  );
  assert.equal(final.aggregate.rights?.record.createsMarketEntitlement, false);
  assert.equal(final.aggregate.payment?.record.createsMarketPurchase, false);
  assert.equal(final.aggregate.payment?.record.createsEntitlement, false);
  assert.equal(final.aggregate.payment?.record.status, "PAID");
  assert.equal(
    final.aggregate.ledger?.record.sourceEventId,
    final.aggregate.sourceEvent?.eventId,
  );
  assert.equal(final.aggregate.aggregateVersion, 17);
  const safe = auditSafeWork420Result({
    ok: true,
    value: final,
    diagnostics: [],
  });
  assert.equal(safe.hasSensitiveFields, false);
  assert.equal(safe.publicProjectionAllowed, false);
  assert.equal(safe.externalMutation, false);
  assert.equal(JSON.stringify(safe).includes("paymentDetail"), false);
});

Deno.test("WORK-420 rejects cross-record, parent-only, terms, Money, and authority claims", async () => {
  const fixture = await createWork420Fixture();
  const root = rootFor(fixture);
  failure(
    await execute(fixture, "ISSUE_QUOTE", fixture.creatorId, "work420:claims", {
      parentId: "work420:wrong-parent",
    }, root),
    "PARENT_ID_MISMATCH",
    "A caller parent ID cannot replace the Request root",
  );
  failure(
    await execute(
      fixture,
      "SUBMIT_REQUEST",
      fixture.requesterId,
      "work420:claims",
      { termsHash: "a".repeat(64) },
      root,
    ),
    "TERMS_HASH_MISMATCH",
    "Caller Terms hash cannot replace server Terms",
  );
  failure(
    await execute(
      fixture,
      "SUBMIT_REQUEST",
      fixture.requesterId,
      "work420:claims",
      { amountMinor: 1 },
      root,
    ),
    "MONEY_MISMATCH",
    "Caller amount cannot replace server Money",
  );
  failure(
    await execute(
      fixture,
      "SUBMIT_REQUEST",
      fixture.requesterId,
      "work420:claims",
      { currency: "USD" },
      root,
    ),
    "MONEY_MISMATCH",
    "Caller currency cannot replace server Money",
  );
  failure(
    await execute(
      fixture,
      "SUBMIT_REQUEST",
      fixture.requesterId,
      "work420:claims",
      { recipientAccountId: "attacker" },
      root,
    ),
    "CALLER_AUTHORITY_REJECTED",
    "Caller recipient cannot become payout authority",
  );
  failure(
    await execute(
      fixture,
      "SUBMIT_REQUEST",
      fixture.requesterId,
      "work420:claims",
      { royaltyRateBps: 10_000 },
      root,
    ),
    "CALLER_AUTHORITY_REJECTED",
    "Caller royalty cannot become financial authority",
  );
  failure(
    await execute(
      fixture,
      "SUBMIT_REQUEST",
      fixture.requesterId,
      "work420:claims",
      { licenseSnapshotHash: "a".repeat(64) },
      root,
    ),
    "CALLER_AUTHORITY_REJECTED",
    "Caller License cannot become Rights authority",
  );
  failure(
    await execute(
      fixture,
      "SUBMIT_REQUEST",
      fixture.requesterId,
      "work420:claims",
      { aggregateId: "work420:other-root" },
      root,
    ),
    "CALLER_CLAIM_MISMATCH",
    "Caller aggregate ID cannot select another root",
  );
});

Deno.test("WORK-420 rejects private command fields and fake or cloned Server Context", async () => {
  const fixture = await createWork420Fixture();
  const root = rootFor(fixture);
  const privateResult = await root.execute({
    operation: "SUBMIT_REQUEST",
    idempotencyKey: "work420:private",
    claims: { body: "private request body", contact: "private-contact" },
  }, await contextForFixture(fixture));
  failure(
    privateResult,
    "PRIVATE_DATA_REJECTED",
    "Private request data must not cross the boundary",
  );

  const fakeContext = {
    schemaVersion: "SERVER_AUTHORITY_REQUEST_CONTEXT_V1",
    source: "SERVER_COMPOSITION_ROOT",
    tenantContext: {
      schemaVersion: "SERVER_TENANT_CONTEXT_V1",
      tenantId: "tenant:work420",
      principalId: fixture.requesterId,
      source: "SERVER_REGISTRY",
    },
    principalId: fixture.requesterId,
    membershipId: `membership:${fixture.requesterId}:tenant:work420`,
    membershipRevision: "membership:fake:v1",
    authSessionId: "fake-session",
    requestId: "fake-request",
    resourceType: "DIRECT_WORK_REQUEST",
    resourceId: fixture.requestId,
    correlationId: "fake-correlation",
    issuedAt: new Date(Date.now() - 1_000).toISOString(),
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
  };
  failure(
    await root.execute(
      commandFor("SUBMIT_REQUEST", "work420:fake-context"),
      fakeContext,
    ),
    "SERVER_CONTEXT_INVALID",
    "Caller-shaped Context must be rejected",
  );

  const validContext = await contextForFixture(fixture);
  const clonedContext = structuredClone(validContext);
  failure(
    await root.execute(
      commandFor("SUBMIT_REQUEST", "work420:cloned-context"),
      clonedContext,
    ),
    "SERVER_CONTEXT_INVALID",
    "Cloned Context must lose authority",
  );
});

Deno.test("WORK-420 re-resolves Current Record and rejects a stale envelope and cross-root child", async () => {
  const fixture = await createWork420Fixture();
  const root = rootFor(fixture);
  const original = fixture.registry.current;
  fixture.registry.setCurrent({
    ...original,
    request: {
      ...original.request,
      ref: { ...original.request.ref, canonicalHash: "9".repeat(64) as never },
    },
  });
  failure(
    await execute(
      fixture,
      "SUBMIT_REQUEST",
      fixture.requesterId,
      "work420:stale-envelope",
      undefined,
      root,
    ),
    "CANONICAL_RECORD_HASH_MISMATCH",
    "Stale Current Record hash must fail closed",
  );
  fixture.registry.setCurrent(original);

  const other = await createWork420Fixture();
  ok(
    await execute(
      fixture,
      "SUBMIT_REQUEST",
      fixture.requesterId,
      "work420:cross-a",
      undefined,
      root,
    ),
    "First root must submit",
  );
  ok(
    await execute(
      fixture,
      "ISSUE_QUOTE",
      fixture.creatorId,
      "work420:cross-a",
      undefined,
      root,
    ),
    "First root must issue Quote",
  );
  const otherRoot = rootFor(other);
  ok(
    await execute(
      other,
      "SUBMIT_REQUEST",
      other.requesterId,
      "work420:cross-b",
      undefined,
      otherRoot,
    ),
    "Second root must submit",
  );
  ok(
    await execute(
      other,
      "ISSUE_QUOTE",
      other.creatorId,
      "work420:cross-b",
      undefined,
      otherRoot,
    ),
    "Second root must issue Quote",
  );
  const current = fixture.registry.current;
  const otherQuote = other.registry.current.quote;
  assert.ok(otherQuote);
  fixture.registry.setCurrent({
    ...current,
    quote: otherQuote,
    currentHeads: {
      ...current.currentHeads,
      quoteRevision: otherQuote.ref.revision,
    },
  });
  failure(
    await execute(
      fixture,
      "ACCEPT_QUOTE",
      fixture.requesterId,
      "work420:cross-injection",
      undefined,
      root,
    ),
    "CROSS_RECORD_MISMATCH",
    "A Quote from another Request root must be rejected",
  );
  fixture.registry.setCurrent(current);
});

Deno.test("WORK-420 preserves rejected history and creates a new recovery Delivery revision", async () => {
  const fixture = await createWork420Fixture({
    acceptanceDecision: "REJECTED",
  });
  const root = rootFor(fixture);
  const prefix = "work420:recovery";
  for (
    const [operation, principal] of [
      ["SUBMIT_REQUEST", fixture.requesterId],
      ["ISSUE_QUOTE", fixture.creatorId],
      ["ACCEPT_QUOTE", fixture.requesterId],
      ["CREATE_AGREEMENT", fixture.requesterId],
      ["SIGN_AGREEMENT_REQUESTER", fixture.requesterId],
      ["SIGN_AGREEMENT_CREATOR", fixture.creatorId],
      ["CREATE_MILESTONE", fixture.creatorId],
      ["START_MILESTONE", fixture.creatorId],
      ["SUBMIT_DELIVERY", fixture.creatorId],
      ["MARK_DELIVERY_PENDING", fixture.requesterId],
      ["DECIDE_ACCEPTANCE", fixture.requesterId],
    ] as const
  ) {
    ok(
      await execute(fixture, operation, principal, prefix, undefined, root),
      `${operation} must succeed`,
    );
  }
  assert.equal(
    fixture.registry.current.acceptance?.record.decision,
    "REJECTED",
  );
  assert.equal(fixture.registry.current.delivery?.record.status, "REJECTED");

  ok(
    await execute(
      fixture,
      "CREATE_RECOVERY_DELIVERY",
      fixture.creatorId,
      prefix,
      undefined,
      root,
    ),
    "Recovery Delivery must succeed",
  );
  assert.equal(fixture.registry.current.delivery?.record.attempt, 2);
  assert.equal(fixture.registry.current.deliveryHistory.length, 1);
  assert.equal(fixture.registry.current.acceptance, undefined);
  assert.equal(fixture.registry.current.acceptanceHistory.length, 1);
  ok(
    await execute(
      fixture,
      "START_MILESTONE",
      fixture.creatorId,
      prefix,
      undefined,
      root,
    ),
    "Recovery Milestone must start",
  );
  ok(
    await execute(
      fixture,
      "MARK_DELIVERY_PENDING",
      fixture.requesterId,
      prefix,
      undefined,
      root,
    ),
    "Recovery Delivery must re-enter acceptance pending",
  );
  assert.equal(
    fixture.registry.current.milestone?.record.status,
    "DELIVERY_PENDING",
  );
});

Deno.test("WORK-420 revalidates membership, rejects malformed authority/result, and enforces ordering", async () => {
  const fixture = await createWork420Fixture();
  const root = rootFor(fixture);
  failure(
    await execute(
      fixture,
      "ISSUE_QUOTE",
      fixture.creatorId,
      "work420:order",
      undefined,
      root,
    ),
    "INVALID_STATE_TRANSITION",
    "Quote before Request submission must fail",
  );
  failure(
    await execute(
      fixture,
      "DECIDE_ACCEPTANCE",
      fixture.requesterId,
      "work420:order",
      undefined,
      root,
    ),
    "DELIVERY_REQUIRED",
    "Acceptance without Delivery must fail",
  );
  const authorityFixture = await createWork420Fixture();
  authorityFixture.registry.malformedAuthority = true;
  failure(
    await execute(
      authorityFixture,
      "SUBMIT_REQUEST",
      authorityFixture.requesterId,
      "work420:malformed-authority",
      undefined,
      rootFor(authorityFixture),
    ),
    "REGISTRY_INVALID_RESPONSE",
    "Malformed server authority must fail closed",
  );

  const commitFixture = await createWork420Fixture();
  commitFixture.registry.malformedCommit = true;
  failure(
    await execute(
      commitFixture,
      "SUBMIT_REQUEST",
      commitFixture.requesterId,
      "work420:malformed-commit",
    ),
    "REGISTRY_INVALID_RESPONSE",
    "Malformed commit result must fail closed",
  );

  const revoked = await createWork420Fixture();
  const revokedContext = await contextForFixture(revoked);
  revoked.registry.membershipRegistry.revoke(revoked.requesterId);
  failure(
    await rootFor(revoked).execute(
      commandFor("SUBMIT_REQUEST", "work420:revoked"),
      revokedContext,
    ),
    "SERVER_CONTEXT_INVALID",
    "Revoked membership must fail closed",
  );
});

Deno.test("WORK-420 binds every operation to its canonical participant", async () => {
  const fixture = await createWork420Fixture();
  const root = rootFor(fixture);
  const unrelated = "account:work420:unrelated";
  failure(
    await execute(
      fixture,
      "SUBMIT_REQUEST",
      unrelated,
      "work420:unrelated-submit",
      undefined,
      root,
    ),
    "PERMISSION_DENIED",
    "An unrelated active tenant member cannot submit the Request",
  );
  assert.equal(fixture.registry.current.request.record.status, "DRAFT");

  await runSteps(fixture, "work420:participant", agreementSteps(fixture), root);
  failure(
    await execute(
      fixture,
      "CREATE_MILESTONE",
      unrelated,
      "work420:unrelated-milestone",
      undefined,
      root,
    ),
    "PERMISSION_DENIED",
    "An unrelated active tenant member cannot create a Milestone",
  );
  ok(
    await execute(
      fixture,
      "CREATE_MILESTONE",
      fixture.creatorId,
      "work420:participant",
      undefined,
      root,
    ),
    "Creator must create the Milestone",
  );
  failure(
    await execute(
      fixture,
      "START_MILESTONE",
      unrelated,
      "work420:unrelated-start",
      undefined,
      root,
    ),
    "PERMISSION_DENIED",
    "An unrelated active tenant member cannot start a Milestone",
  );
  ok(
    await execute(
      fixture,
      "START_MILESTONE",
      fixture.creatorId,
      "work420:participant",
      undefined,
      root,
    ),
    "Creator must start the Milestone",
  );
  ok(
    await execute(
      fixture,
      "SUBMIT_DELIVERY",
      fixture.creatorId,
      "work420:participant",
      undefined,
      root,
    ),
    "Creator must submit the Delivery",
  );
  failure(
    await execute(
      fixture,
      "MARK_DELIVERY_PENDING",
      unrelated,
      "work420:unrelated-pending",
      undefined,
      root,
    ),
    "PERMISSION_DENIED",
    "An unrelated active tenant member cannot mark Delivery pending",
  );
  ok(
    await execute(
      fixture,
      "MARK_DELIVERY_PENDING",
      fixture.requesterId,
      "work420:participant",
      undefined,
      root,
    ),
    "Requester must mark the Delivery pending",
  );
});

Deno.test("WORK-420 revalidates membership after authority resolution before commit", async () => {
  const fixture = await createWork420Fixture();
  const root = rootFor(fixture);
  const before = fixture.registry.current;
  fixture.registry.revokeOnResolveAuthorityPrincipal = fixture.requesterId;
  const result = await root.execute(
    commandFor("SUBMIT_REQUEST", "work420:membership-toctou"),
    await contextForFixture(fixture),
  );
  failure(
    result,
    "SERVER_CONTEXT_INVALID",
    "Membership revoked after authority resolution must fail before commit",
  );
  assert.equal(fixture.registry.current, before);
  assert.equal(fixture.registry.current.request.record.status, "DRAFT");
  assert.equal(fixture.registry.commitCount, 0);
  assert.equal(auditSafeWork420Result(result).externalMutation, false);
});

Deno.test("WORK-420 rejects every downstream operation when its current head is stale", async () => {
  const cases: readonly {
    readonly name: string;
    readonly operation: Parameters<typeof commandFor>[0];
    readonly principalId: (fixture: Work420Fixture) => string;
    readonly head: keyof Work420CurrentHeads;
    readonly fixture: () => Promise<Work420Fixture>;
    readonly setup: (fixture: Work420Fixture, prefix: string) => Promise<void>;
  }[] = [
    {
      name: "CREATE_MILESTONE/agreement",
      operation: "CREATE_MILESTONE",
      principalId: (fixture) => fixture.creatorId,
      head: "agreementRevision",
      fixture: createWork420Fixture,
      setup: async (fixture, prefix) => {
        await runSteps(fixture, prefix, agreementSteps(fixture));
      },
    },
    {
      name: "START_MILESTONE/milestone",
      operation: "START_MILESTONE",
      principalId: (fixture) => fixture.creatorId,
      head: "milestoneRevision",
      fixture: createWork420Fixture,
      setup: async (fixture, prefix) => {
        await runSteps(fixture, prefix, milestoneSteps(fixture));
      },
    },
    {
      name: "SUBMIT_DELIVERY/milestone",
      operation: "SUBMIT_DELIVERY",
      principalId: (fixture) => fixture.creatorId,
      head: "milestoneRevision",
      fixture: createWork420Fixture,
      setup: async (fixture, prefix) => {
        await runSteps(fixture, prefix, startedMilestoneSteps(fixture));
      },
    },
    {
      name: "MARK_DELIVERY_PENDING/delivery",
      operation: "MARK_DELIVERY_PENDING",
      principalId: (fixture) => fixture.requesterId,
      head: "deliveryRevision",
      fixture: createWork420Fixture,
      setup: async (fixture, prefix) => {
        await runSteps(fixture, prefix, deliverySteps(fixture));
      },
    },
    {
      name: "DECIDE_ACCEPTANCE/delivery",
      operation: "DECIDE_ACCEPTANCE",
      principalId: (fixture) => fixture.requesterId,
      head: "deliveryRevision",
      fixture: createWork420Fixture,
      setup: async (fixture, prefix) => {
        await runSteps(fixture, prefix, [
          ...deliverySteps(fixture),
          ["MARK_DELIVERY_PENDING", fixture.requesterId],
        ]);
      },
    },
    {
      name: "CREATE_RECOVERY_DELIVERY/delivery",
      operation: "CREATE_RECOVERY_DELIVERY",
      principalId: (fixture) => fixture.creatorId,
      head: "deliveryRevision",
      fixture: () => createWork420Fixture({ acceptanceDecision: "REJECTED" }),
      setup: async (fixture, prefix) => {
        await runSteps(fixture, prefix, acceptanceSteps(fixture));
      },
    },
    {
      name: "DECIDE_RIGHTS/acceptance",
      operation: "DECIDE_RIGHTS",
      principalId: (fixture) => fixture.requesterId,
      head: "acceptanceRevision",
      fixture: createWork420Fixture,
      setup: async (fixture, prefix) => {
        await runSteps(fixture, prefix, acceptanceSteps(fixture));
      },
    },
    {
      name: "CREATE_PAYMENT/rights",
      operation: "CREATE_PAYMENT",
      principalId: (fixture) => fixture.requesterId,
      head: "rightsRevision",
      fixture: createWork420Fixture,
      setup: async (fixture, prefix) => {
        await runSteps(fixture, prefix, rightsSteps(fixture));
      },
    },
    {
      name: "APPLY_PAYMENT_EVENT/payment",
      operation: "APPLY_PAYMENT_EVENT",
      principalId: (fixture) => fixture.requesterId,
      head: "paymentRevision",
      fixture: createWork420Fixture,
      setup: async (fixture, prefix) => {
        await runSteps(fixture, prefix, paymentSteps(fixture));
      },
    },
    {
      name: "MATERIALIZE_LEDGER/payment",
      operation: "MATERIALIZE_LEDGER",
      principalId: (fixture) => fixture.requesterId,
      head: "paymentRevision",
      fixture: createWork420Fixture,
      setup: async (fixture, prefix) => {
        await runSteps(fixture, prefix, [
          ...paymentSteps(fixture),
          ["APPLY_PAYMENT_EVENT", fixture.requesterId],
          ["APPLY_PAYMENT_EVENT", fixture.requesterId],
        ]);
      },
    },
  ];

  for (const [index, testCase] of cases.entries()) {
    const fixture = await testCase.fixture();
    const prefix = `work420:stale-head:${index}`;
    await testCase.setup(fixture, prefix);
    tamperCurrentHead(fixture, testCase.head);
    const beforeVersion = fixture.registry.current.aggregateVersion;
    const beforeCommitCount = fixture.registry.commitCount;
    failure(
      await execute(
        fixture,
        testCase.operation,
        testCase.principalId(fixture),
        prefix,
        undefined,
      ),
      "STALE_CURRENT_RECORD",
      `${testCase.name} must reject a stale current head`,
    );
    assert.equal(fixture.registry.current.aggregateVersion, beforeVersion);
    assert.equal(fixture.registry.commitCount, beforeCommitCount);
  }
});

Deno.test("WORK-420 uses server-side idempotency and rejects key reuse with another command", async () => {
  const fixture = await createWork420Fixture();
  const root = rootFor(fixture);
  const key = "work420:idempotency:key";
  const first = await root.execute(
    commandFor("SUBMIT_REQUEST", key),
    await contextForFixture(fixture),
  );
  ok(first, "First command must apply");
  const duplicate = await root.execute(
    commandFor("SUBMIT_REQUEST", key),
    await contextForFixture(fixture),
  );
  assert.equal(duplicate.ok, true);
  if (duplicate.ok) assert.equal(duplicate.value.status, "IDEMPOTENT_NOOP");
  const conflict = await root.execute(
    commandFor("SUBMIT_REQUEST", key, { requestId: fixture.requestId }),
    await contextForFixture(fixture),
  );
  failure(
    conflict,
    "IDEMPOTENCY_CONFLICT",
    "Same key with a different canonical command must conflict",
  );
});
