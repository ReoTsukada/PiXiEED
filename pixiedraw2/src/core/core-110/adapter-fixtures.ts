import {
  bindCanonicalTenantMembership,
  type CanonicalTenantMembershipRegistryV1,
  createServerAuthorityRequestContext,
  createServerAuthPrincipalProvider,
} from "../../server/internal/authenticated-context.ts";
import {
  asFp004RecordId,
  type Fp004CommitRequest,
  fp004Failure,
  type Fp004LeaseToken,
  type Fp004Result,
  fp004Success,
} from "../../fp-004/contracts.ts";
import {
  type Fp004AdapterOptions,
  type Fp004DurableSnapshot,
  Fp004RestartableInMemoryAdapter,
} from "../../fp-004/durable-transaction.ts";
import {
  createFp004ServerProviderIngress,
  type Fp004Delivery,
  type Fp004InboxAcceptance,
  Fp004InboxOutboxLeaseAdapter,
  type Fp004LeasedOutbox,
  type Fp004LeaseSnapshot,
  type Fp004ProviderInboxResolution,
  InMemoryFp004LeasePersistence,
} from "../../fp-004/inbox-outbox-lease.ts";
import type {
  AuthorizationProofV1,
  ContentHash,
} from "../../wp160-contracts.ts";
import {
  CORE100_CONSUMER_IDS,
  type Core100Command,
  type Core100Dependencies,
  type Core100Operation,
  type Core100Result,
} from "../core-100/index.ts";
import { createCore100Root } from "../core-100/composition-root.ts";
import { createCore100ServerContext } from "../core-100/authority-boundary.ts";
import {
  FP005_SCHEMA_VERSION,
  type Fp005StorageLocator,
} from "../../fp-005/contracts.ts";
import { FP005_STORAGE_POLICY } from "../../fp-005/policies.ts";
import { validateStorageLocator } from "../../fp-005/locator-validation.ts";
import {
  computeSchemaDigest,
  type SchemaRecordDraft,
  SchemaRegistry,
} from "../../fp-007/schema-registry.ts";
import { createCore110FailureControls } from "./failure-controls.ts";
import {
  type Core110AdapterClass,
  type Core110FailureInjectionControls,
  type Core110Fixture,
  type Core110FixtureSnapshot,
  type Core110SideEffectSpy,
} from "./contracts.ts";
import { createCore110SideEffectSpy } from "./failure-controls.ts";

const HASH = "a".repeat(64) as ContentHash;
const SCHEMA_DRAFT: SchemaRecordDraft = {
  name: "core-110.command",
  exactVersion: "1",
  owner: "core",
  status: "ACTIVE",
  compatibilityMode: "full",
  migrationOrAdapterId: null,
  fixtureSet: ["core-110-synthetic"],
  fields: {
    operation: {
      type: "string",
      required: true,
      nullable: false,
      hasDefault: false,
    },
  },
  schemaFamily: "CANONICAL",
  legacyOf: null,
};

export async function core110SchemaIdentity() {
  return {
    name: SCHEMA_DRAFT.name,
    exactVersion: SCHEMA_DRAFT.exactVersion,
    digest: await computeSchemaDigest(SCHEMA_DRAFT),
  } as const;
}

function proof(
  action: string,
  capability: string,
  now: number,
): AuthorizationProofV1 {
  return {
    schemaVersion: 1,
    proofType: "AUTHORIZATION_PROOF",
    source: "server",
    decision: "allow",
    authorityId: "core-110-fixture-authority",
    proofId: `core110-proof-${action}`,
    principalId: "core110-user",
    resourceType: "draw",
    resourceId: "core110-asset",
    action,
    capability,
    tenantId: "core110-tenant",
    correlationId: "core110-correlation",
    policyVersion: "authorization-policy-v1",
    grantId: "core110-grant",
    issuedAt: new Date(now - 1_000).toISOString(),
    expiresAt: new Date(now + 60_000).toISOString(),
  };
}

async function createContext(now: number) {
  const principalProof = {
    ...proof(
      "server.authority.context.create",
      "server.authority.context.create",
      now,
    ),
    resourceType: "SERVER_AUTHENTICATED_PRINCIPAL",
    resourceId: "core110-session",
    tenantId: null,
  };
  const provider = createServerAuthPrincipalProvider({
    verify: async () => ({
      principalId: "core110-user",
      authSessionId: "core110-session",
      assurance: "SESSION_VERIFIED" as const,
      tenantMemberships: [{
        membershipId: "core110-membership",
        principalId: "core110-user",
        tenantId: "core110-tenant",
        membershipRevision: "core110-membership-r1",
        status: "ACTIVE" as const,
      }],
      authorizationProof: principalProof,
      issuedAt: new Date(now - 1_000).toISOString(),
      expiresAt: new Date(now + 60_000).toISOString(),
      correlationId: "core110-correlation",
    }),
  });
  const principal = await provider.authenticate({
    requestId: "core110-request",
    resourceType: "draw",
    resourceId: "core110-asset",
    sessionReference: "core110-session",
    correlationId: "core110-correlation",
  });
  if (principal === null) throw new Error("CORE110_FIXTURE_PRINCIPAL_FAILED");
  const candidate = principal.tenantMemberships[0];
  if (candidate === undefined) {
    throw new Error("CORE110_FIXTURE_MEMBERSHIP_FAILED");
  }
  const membership = bindCanonicalTenantMembership({
    principal,
    membership: candidate,
  });
  return createCore100ServerContext({
    authorityContext: createServerAuthorityRequestContext({
      principal,
      membership,
      authorizationProof: proof("draw.commit", "draw.commit", now),
      request: {
        requestId: "core110-request",
        resourceType: "draw",
        resourceId: "core110-asset",
        correlationId: "core110-correlation",
      },
      now,
    }),
    action: "draw.commit",
    capability: "draw.commit",
    now,
  });
}

function createMembershipRegistry(
  controls: Core110FailureInjectionControls,
): CanonicalTenantMembershipRegistryV1 {
  return {
    getCurrent: async ({ principalId, membershipId, tenantId }) =>
      controls.authorizationRevoked
        ? {
          principalId,
          membershipId,
          tenantId,
          membershipRevision: "core110-membership-revoked",
          status: "REVOKED" as const,
        }
        : {
          principalId,
          membershipId,
          tenantId,
          membershipRevision: "core110-membership-r1",
          status: "ACTIVE" as const,
        },
  };
}

function adapterCapabilities(
  controls: Core110FailureInjectionControls,
  all: readonly Core100Operation[],
): readonly Core100Operation[] {
  const unsupported = new Set(controls.unsupportedCapabilities);
  return all.filter((operation) => !unsupported.has(operation));
}

function validProviderResolution(
  request: Fp004ProviderInboxResolution,
): Fp004ProviderInboxResolution {
  return request;
}

function createSchemaAdapter(
  controls: Core110FailureInjectionControls,
  registry: SchemaRegistry,
) {
  return {
    schemaRegistry: registry,
    resolve(
      input: {
        readonly name: string;
        readonly exactVersion: string;
        readonly digest: string;
      },
    ) {
      if (controls.schemaMismatch) return null;
      const resolved = registry.resolve(input);
      return resolved.ok ? resolved.value : null;
    },
  };
}

function createPrivacyAdapter(controls: Core110FailureInjectionControls) {
  return {
    policy: FP005_STORAGE_POLICY,
    validate(command: Core100Command) {
      const aggregate = command.event.aggregate;
      if (controls.privacyMismatch || aggregate.tenantId !== command.tenantId) {
        return {
          ok: false as const,
          diagnostics: [{
            code: "AUTHORITY_DENIED" as const,
            message: "Tenant-scoped storage policy denied the request.",
          }],
        };
      }
      return { ok: true as const, value: undefined, diagnostics: [] };
    },
    validateLocator(
      locator: unknown,
      expected: Pick<
        Fp005StorageLocator,
        "tenantId" | "resourceType" | "resourceId"
      >,
    ) {
      const checked = validateStorageLocator(locator);
      if (!checked.ok) return checked;
      return checked.value.tenantId === expected.tenantId &&
          checked.value.resourceType === expected.resourceType &&
          checked.value.resourceId === expected.resourceId
        ? checked
        : {
          ok: false as const,
          diagnostics: [{
            code: "TENANT_SCOPE_DENIED" as const,
            message: "Tenant-scoped locator denied.",
            recoverable: false,
          }],
        };
    },
  };
}

function createDurableAdapter(
  controls: Core110FailureInjectionControls,
  spies: Core110SideEffectSpy,
  lease: Fp004InboxOutboxLeaseAdapter,
  snapshot: Fp004DurableSnapshot | undefined,
  now: () => Date,
  adapterClass: Core110AdapterClass,
  deliberatelyFailing: boolean,
) {
  const options: Fp004AdapterOptions = {
    clock: now,
    authorizationRevalidator: async () => !controls.authorizationRevoked,
    faultInjector: (point) => {
      controls.trigger(point);
      if (controls.crashPoint === point) {
        throw new Error(`CORE110_CRASH_${point}`);
      }
    },
  };
  const durable = snapshot === undefined
    ? new Fp004RestartableInMemoryAdapter(options)
    : Fp004RestartableInMemoryAdapter.fromSnapshot(snapshot, options);
  return {
    adapter: {
      adapterId: `core110-${adapterClass.toLowerCase()}-durable`,
      capabilities: adapterCapabilities(controls, [
        "COMMIT",
        ...CORE100_CONSUMER_IDS,
      ]),
      async commit(request: Fp004CommitRequest) {
        if (deliberatelyFailing) {
          return fp004Failure(
            "TRANSACTION_ABORTED",
            "Deliberately failing adapter.",
          );
        }
        const result = await durable.commit(request);
        if (result.ok) {
          const queued = lease.enqueueOutbox(result.value.event);
          if (!queued.ok) {
            return fp004Failure(
              "TRANSACTION_ABORTED",
              "Reference outbox enqueue failed after canonical commit.",
            );
          }
          // CORE-100 exposes the scoped ownership label at its boundary;
          // FP-004 keeps the tenant/resource composite internally.
          return {
            ...result,
            value: {
              ...result.value,
              idempotency: {
                ...result.value.idempotency,
                scope: "CORE-100",
              },
            },
          };
        }
        return result;
      },
    },
    durable,
  };
}

function createLeaseAdapter(
  controls: Core110FailureInjectionControls,
  lease: Fp004InboxOutboxLeaseAdapter,
  deliberatelyFailing: boolean,
) {
  const ingress = createFp004ServerProviderIngress({
    principalId: "core110-user",
    tenantId: "core110-tenant",
    resourceType: "draw",
    resourceId: "core110-asset",
    resolve: (raw) =>
      validProviderResolution(raw as Fp004ProviderInboxResolution),
  });
  return {
    adapterId: "core110-inbox-outbox",
    capabilities: adapterCapabilities(controls, [
      "COMMIT",
      "INBOX_ACCEPT",
      "OUTBOX_DISPATCH",
      ...CORE100_CONSUMER_IDS,
    ]),
    async acceptInbox(request: Fp004ProviderInboxResolution) {
      if (deliberatelyFailing) {
        return fp004Failure(
          "TRANSACTION_ABORTED",
          "Deliberately failing adapter.",
        );
      }
      return lease.acceptProviderEvent(ingress, request);
    },
    async leaseOutbox(
      request: { readonly eventId: string; readonly ownerId: string },
    ) {
      if (deliberatelyFailing) {
        return fp004Failure(
          "TRANSACTION_ABORTED",
          "Deliberately failing adapter.",
        );
      }
      if (controls.pauseOutbox) {
        controls.trigger("OUTBOX_BEFORE_SEND");
        return fp004Failure("NOT_FOUND", "Outbox dispatch is paused.", true);
      }
      return lease.leaseOutbox(
        request.ownerId,
        new Date(),
        { outboxId: asFp004RecordId(`outbox:${request.eventId}`) },
      );
    },
    async completeOutbox(request: {
      readonly outboxId: string;
      readonly ownerId: string;
      readonly fencingToken: Fp004LeaseToken;
      readonly delivery: Fp004Delivery;
    }) {
      if (deliberatelyFailing) {
        return fp004Failure(
          "TRANSACTION_ABORTED",
          "Deliberately failing adapter.",
        );
      }
      return lease.completeOutbox(
        request.ownerId,
        request.fencingToken,
        request.delivery,
        new Date(),
        asFp004RecordId(request.outboxId),
      );
    },
  };
}

function createTransport(
  controls: Core110FailureInjectionControls,
  spies: Core110SideEffectSpy,
  deliberatelyFailing: boolean,
) {
  return {
    providerId: "core110-fixture-provider",
    capabilities: adapterCapabilities(controls, ["OUTBOX_DISPATCH"]),
    async send(
      request: { readonly resultHash: ContentHash },
    ): Promise<Fp004Result<Fp004Delivery>> {
      if (deliberatelyFailing) {
        return fp004Failure(
          "TRANSACTION_ABORTED",
          "Deliberately failing adapter.",
        );
      }
      if (controls.pauseOutbox) {
        controls.trigger("OUTBOX_BEFORE_SEND");
        return fp004Failure(
          "CONSUMER_FAILURE",
          "Provider dispatch is paused.",
          true,
        );
      }
      spies.record("provider");
      const response = controls.providerResponse?.kind;
      if (response === "MALFORMED_SUCCESS") {
        return { ok: true, value: {} as Fp004Delivery, diagnostics: [] };
      }
      if (response === "UNKNOWN_STATUS") {
        return {
          ok: true,
          value: { outcome: "UNKNOWN" } as never,
          diagnostics: [],
        };
      }
      if (response === "IDENTITY_HASH_MISMATCH") {
        return fp004Success({
          outcome: "SUCCESS",
          resultHash: "b".repeat(64) as ContentHash,
        });
      }
      if (controls.poisonOutbox) {
        return fp004Success({
          outcome: "POISON",
          diagnostic: {
            code: "CONSUMER_FAILURE",
            message: "poison",
            recoverable: false,
          },
        });
      }
      if (controls.retryableOutboxFailure) {
        return fp004Success({
          outcome: "RETRYABLE_FAILURE",
          diagnostic: {
            code: "CONSUMER_FAILURE",
            message: "retry",
            recoverable: true,
          },
        });
      }
      return fp004Success({
        outcome: "SUCCESS",
        resultHash: request.resultHash,
      });
    },
  };
}

function createConsumer<C extends "FINANCE" | "NOTIFICATION" | "SEARCH">(
  consumerId: C,
  spies: Core110SideEffectSpy,
) {
  const seen = new Map<string, ContentHash>();
  return {
    consumerId,
    async consume(
      request: {
        readonly idempotency: {
          readonly key: string;
          readonly requestHash: ContentHash;
        };
      },
    ) {
      const key =
        `${request.idempotency.key}:${request.idempotency.requestHash}`;
      const prior = seen.get(key);
      if (prior === undefined) {
        spies.record(
          consumerId.toLowerCase() as "finance" | "notification" | "search",
        );
      }
      const hash = prior ?? HASH;
      seen.set(key, hash);
      return fp004Success({
        consumerId,
        projectionRevision: `${consumerId.toLowerCase()}:core110:v1`,
        projectionHash: hash,
        idempotency: {
          scope: `CORE-100:${consumerId}`,
          key: request.idempotency.key,
          requestHash: request.idempotency.requestHash,
        },
      });
    },
  };
}

export interface Core110FixtureOptions {
  readonly adapterClass?: Core110AdapterClass;
  /** A negative adapter that must stay behind the same Core-100 gates. */
  readonly deliberatelyFailing?: boolean;
  readonly controls?: Core110FailureInjectionControls;
  readonly spies?: Core110SideEffectSpy;
  readonly durableSnapshot?: Fp004DurableSnapshot;
  readonly leaseSnapshot?: Fp004LeaseSnapshot;
  readonly now?: number;
}

export async function createCore110Fixture(
  options: Core110FixtureOptions = {},
): Promise<Core110Fixture> {
  const adapterClass = options.adapterClass ?? "IN_MEMORY";
  const deliberatelyFailing = options.deliberatelyFailing === true ||
    adapterClass === "UNTESTED";
  const controls = options.controls ?? createCore110FailureControls();
  const spies = options.spies ?? createCore110SideEffectSpy();
  let nowMs = options.now ?? Date.now();
  const now = () => new Date(nowMs);
  const durableLeasePersistence = new InMemoryFp004LeasePersistence(
    options.leaseSnapshot,
  );
  const lease = new Fp004InboxOutboxLeaseAdapter(durableLeasePersistence, {
    now,
    policy: { maxAttempts: 3, leaseMs: 10 },
  });
  const durableParts = createDurableAdapter(
    controls,
    spies,
    lease,
    options.durableSnapshot,
    now,
    adapterClass,
    deliberatelyFailing,
  );
  const draftWithDigest = {
    ...SCHEMA_DRAFT,
    digest: await computeSchemaDigest(SCHEMA_DRAFT),
  };
  const registryResult = await SchemaRegistry.create([draftWithDigest]);
  if (!registryResult.ok) throw new Error("CORE110_FIXTURE_SCHEMA_FAILED");
  const membershipRegistry = createMembershipRegistry(controls);
  const inboxOutbox = createLeaseAdapter(controls, lease, deliberatelyFailing);
  const transport = createTransport(controls, spies, deliberatelyFailing);
  const privacyStorage = createPrivacyAdapter(controls);
  const dependencies: Core100Dependencies = {
    durable: durableParts.adapter,
    inboxOutbox,
    membershipRegistry,
    privacyStorage,
    schemaBuild: createSchemaAdapter(controls, registryResult.value),
    transport,
    finance: createConsumer("FINANCE", spies),
    notification: createConsumer("NOTIFICATION", spies),
    search: createConsumer("SEARCH", spies),
  };
  const root = createCore100Root(dependencies, { "core-100": true });
  const context = await createContext(nowMs);
  const fixture: Core110Fixture = {
    adapterId: `core110-${adapterClass.toLowerCase()}`,
    adapterClass,
    deliberatelyFailing,
    productionEquivalentShape: adapterClass === "PRODUCTION_EQUIVALENT",
    schemaVersion: "FP007_SCHEMA_CONTRACT_V1",
    policyVersion: FP005_SCHEMA_VERSION,
    controls,
    spies,
    root,
    context,
    durable: durableParts.durable,
    lease,
    dependencies,
    snapshot: (): Core110FixtureSnapshot => ({
      durable: durableParts.durable.snapshot(),
      lease: lease.snapshot(),
    }),
    restart: async () => {
      nowMs += 1;
      return await createCore110Fixture({
        adapterClass,
        deliberatelyFailing,
        controls,
        spies,
        durableSnapshot: durableParts.durable.snapshot(),
        leaseSnapshot: lease.snapshot(),
        now: nowMs,
      });
    },
    execute: (command: Core100Command) => root.execute(context, command),
  };
  return fixture;
}

export function createCore110LocatorFixture(
  tenantId = "core110-tenant",
): Fp005StorageLocator {
  return {
    placement: "OBJECT_STORAGE",
    path: "asset/private.bin",
    contentHash: HASH,
    byteLength: 10,
    mimeType: "application/octet-stream",
    tenantId,
    resourceType: "draw",
    resourceId: "core110-asset",
  };
}

export function createCore110PrivatePayloadLeakFixture(): Record<
  string,
  unknown
> {
  return {
    ...createCore110LocatorFixture(),
    path: "private/core110-secret.bin",
    payload: "CORE110_PRIVATE_PAYLOAD",
  };
}
