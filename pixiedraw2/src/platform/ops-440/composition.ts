/** OPS-440 server-only composition root; never import this from contracts.ts. */
import {
  AUTHORIZATION_PROOF_POLICY_VERSION,
  type AuthorizationProofExpectation,
  type AuthorizationProofV1,
  requireAuthorizationProofV1,
} from "../../wp160-contracts.ts";
import {
  createFp004ServerProviderIngress,
  type Fp004FailureDelivery,
  Fp004InboxOutboxLeaseAdapter,
  type Fp004LeasePersistence,
  type Fp004ProviderInboxResolution,
  InMemoryFp004LeasePersistence,
} from "../../fp-004/inbox-outbox-lease.ts";
import { asFp004EventId, isFp004Hash } from "../../fp-004/contracts.ts";
import {
  type AuthPrincipalProvider,
  consumeServerAuthorityRequestContext,
  deriveServerAuthorityRequestContext,
  type ServerAuthorityRequestContextV1,
  type TenantMembershipResolver,
} from "../../server/internal/authenticated-context.ts";
import {
  createWp240AnalyticsEvent,
  createWp240ModerationReference,
  createWp240RevenueShadowComparison,
  resolveWp240AdminProjection,
  resolveWp240AdPlacement,
} from "../../wp240-admin-analytics-ads-core.ts";
import {
  createWp250AdminAuditReference,
  createWp250ModerationCase,
  createWp250RevenueCostProjection,
  resolveWp250AdEligibility,
  resolveWp250ConsentPolicy,
  type Wp250ConsentState,
  type Wp250CostLine,
  type Wp250PolicyState,
  type Wp250RevenueLine,
  type Wp250Surface,
} from "../../wp250-policy-economics-core.ts";
import {
  OPS440_SCHEMA_VERSION,
  type Ops440AdIntentCommand,
  type Ops440Command,
  type Ops440Diagnostic,
  type Ops440DiagnosticCode,
  type Ops440EventIngestCommand,
  type Ops440EventMetadata,
  type Ops440ModerationReferenceCommand,
  type Ops440Result,
  type Ops440ResultValue,
  type Ops440RevenueShadowCommand,
  type Ops440ScalarMetadata,
  type Ops440Surface,
} from "./contracts.ts";

const ID = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,255}$/;
const NAME = /^[a-z0-9][a-z0-9._:-]{0,95}$/;
const REASON = /^[A-Z0-9][A-Z0-9._:-]{0,63}$/;
const HASH = /^[a-f0-9]{64}$/;
const PRIVATE = new Set<Ops440Surface>([
  "DRAW2_EDITOR",
  "GAME_EDITOR",
  "AUDIO_EDITOR",
  "ACTIVE_STUDIO",
  "STUDIO",
  "CHECKOUT",
  "ENTITLEMENT",
  "COMMISSION",
  "ACCOUNT_PRIVATE",
  "PROJECT_PRIVATE",
  "DIRECT_WORK",
  "PRIVATE_INBOX",
  "ADMIN",
]);
const SURFACES = new Set<Ops440Surface>([
  "DISCOVER",
  "PUBLIC_SOCIAL",
  "COMMUNITY",
  "PUBLIC_CREATOR",
  "PUBLIC_PROJECT",
  "MARKET_BROWSE",
  "PUBLIC_GAME",
  "PUBLIC_LISTENING",
  "PUBLIC_DISCOVERY",
  "PUBLIC_FEED",
  "MARKET_LISTING",
  "PUBLIC_RESOURCE",
  ...PRIVATE,
]);
const FORBIDDEN = new Set([
  "resolver",
  "role",
  "capability",
  "consentAuthority",
  "regionAuthority",
  "ageAuthority",
  "currentState",
  "revenueMutationFlags",
  "authorizationProof",
  "tenantMembershipResolver",
  "eventResolver",
  "resourceResolver",
]);
const PRIVATE_KEYS =
  /email|phone|address|jwt|token|secret|password|authorization|project(body|content)|privatecontent|commission(body|content)|raw(body|media)|pixeldata|audiodata|pxd|pixipackage|payment|purchase|entitlement|license|royalty|payout|ledger|prompt/i;

export type Ops440Operation =
  | "ADMIN_PROJECTION"
  | "ANALYTICS_EVENT"
  | "AD_INTENT"
  | "MODERATION_REFERENCE"
  | "REVENUE_SHADOW"
  | "EVENT_INGEST";
export type Ops440Feature =
  | "admin-read"
  | "analytics-read"
  | "ads-read"
  | "moderation-read"
  | "revenue-shadow-read"
  | "event-inbox";

export interface Ops440ServerResourceResolution {
  readonly tenantId: string;
  readonly resourceType: string;
  readonly resourceId: string;
  readonly revision: string;
  readonly status: "ACTIVE" | "ARCHIVED" | "BLOCKED";
}
export interface Ops440ServerPolicyDecision {
  readonly serverResolved: boolean;
  readonly featureAllowed: boolean;
  readonly decisionRevision: string;
  readonly region: Wp250PolicyState;
  readonly agePolicy: Wp250PolicyState;
  readonly adConsent: Wp250ConsentState;
  readonly analyticsConsent: Wp250ConsentState;
  readonly providerEligibility: Wp250PolicyState;
  readonly viewportProximity: boolean;
  readonly slotReserved: boolean;
  readonly offline: boolean;
  readonly consentRevoked: boolean;
  readonly killSwitch: boolean;
}
export interface Ops440AuthorizationProofResolver {
  (
    input: {
      readonly context: ServerAuthorityRequestContextV1;
      readonly operation: Ops440Operation;
      readonly expected: AuthorizationProofExpectation;
    },
  ): AuthorizationProofV1;
}
export interface Ops440ResourceResolver {
  (
    input: {
      readonly context: ServerAuthorityRequestContextV1;
      readonly operation: Ops440Operation;
      readonly command: Ops440Command;
    },
  ):
    | Promise<Ops440ServerResourceResolution | null>
    | Ops440ServerResourceResolution
    | null;
}
export interface Ops440PolicyResolver {
  (
    input: {
      readonly context: ServerAuthorityRequestContextV1;
      readonly operation: Ops440Operation;
      readonly command: Ops440Command;
      readonly resource: Ops440ServerResourceResolution;
    },
  ): Promise<Ops440ServerPolicyDecision> | Ops440ServerPolicyDecision;
}
export interface Ops440EventResolution extends Fp004ProviderInboxResolution {
  readonly aggregateId: string;
  readonly aggregateVersion: number;
}
export interface Ops440EventResolver {
  (
    input: {
      readonly context: ServerAuthorityRequestContextV1;
      readonly command: Ops440EventIngestCommand;
      readonly resource: Ops440ServerResourceResolution;
    },
  ): Ops440EventResolution;
}
export interface Ops440RevenueResolution {
  readonly currency: string;
  readonly expectedMinorUnits: number;
  readonly observedMinorUnits: number;
  readonly revenueLines: readonly Wp250RevenueLine[];
  readonly costLines: readonly Wp250CostLine[];
}
export interface Ops440RevenueResolver {
  (
    input: {
      readonly context: ServerAuthorityRequestContextV1;
      readonly command: Ops440RevenueShadowCommand;
      readonly resource: Ops440ServerResourceResolution;
    },
  ): Promise<Ops440RevenueResolution | null> | Ops440RevenueResolution | null;
}
export interface Ops440ServerCompositionOptions {
  readonly authProvider: AuthPrincipalProvider;
  readonly tenantResolver: TenantMembershipResolver;
  readonly authorizationProofResolver: Ops440AuthorizationProofResolver;
  readonly resourceResolver: Ops440ResourceResolver;
  readonly policyResolver: Ops440PolicyResolver;
  readonly eventResolver: Ops440EventResolver;
  readonly revenueResolver?: Ops440RevenueResolver;
  readonly flags?: Partial<Readonly<Record<Ops440Feature, boolean>>>;
  readonly killSwitch?: boolean;
  readonly inboxPersistence?: Fp004LeasePersistence;
  readonly now?: () => Date;
}
export interface Ops440ServerComposition {
  execute(input: Ops440Command): Promise<Ops440Result>;
  snapshot(): {
    readonly inboxCount: number;
    readonly deadLetterCount: number;
    readonly processedEventCount: number;
  };
}
type State = {
  readonly context: ServerAuthorityRequestContextV1;
  readonly resource: Ops440ServerResourceResolution;
  readonly policy: Ops440ServerPolicyDecision;
};

function diag(
  code: Ops440DiagnosticCode,
  message: string,
  path?: string,
  recoverable = false,
): Ops440Diagnostic {
  return {
    code,
    message: message.slice(0, 512),
    recoverable,
    ...(path === undefined ? {} : { path }),
  };
}
function fail(
  code: Ops440DiagnosticCode,
  message: string,
  path?: string,
  recoverable = false,
): Ops440Result {
  return {
    ok: false,
    schemaVersion: OPS440_SCHEMA_VERSION,
    diagnostics: [diag(code, message, path, recoverable)],
  };
}
function pass(
  value: Ops440ResultValue,
  diagnostics: readonly Ops440Diagnostic[] = [],
): Ops440Result {
  return { ok: true, schemaVersion: OPS440_SCHEMA_VERSION, value, diagnostics };
}
function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function id(value: unknown): value is string {
  return typeof value === "string" && ID.test(value);
}
function name(value: unknown): value is string {
  return typeof value === "string" && NAME.test(value);
}
function keys(
  value: Record<string, unknown>,
  allowed: readonly string[],
): Ops440Diagnostic | null {
  const ok = new Set(allowed);
  for (const key of Object.keys(value)) {
    if (FORBIDDEN.has(key)) {
      return diag(
        "CALLER_INJECTION_REJECTED",
        "Server authority and current state are not caller inputs.",
        key,
      );
    }
    if (!ok.has(key)) {
      return diag(
        "CALLER_INJECTION_REJECTED",
        "Unknown public command fields are rejected.",
        key,
      );
    }
  }
  return null;
}
function scalarMetadata(
  value: unknown,
): { value: Ops440ScalarMetadata; diagnostics: readonly Ops440Diagnostic[] } {
  const diagnostics: Ops440Diagnostic[] = [];
  if (!record(value)) {
    return {
      value: {},
      diagnostics: [
        diag("BOUNDED_METADATA_REQUIRED", "Metadata must be a scalar record."),
      ],
    };
  }
  const result: Record<string, string | number | boolean> = {};
  if (Object.keys(value).length > 24) {
    diagnostics.push(
      diag("BOUNDED_METADATA_REQUIRED", "Metadata property count is bounded."),
    );
  }
  for (const [key, item] of Object.entries(value)) {
    if (!/^[A-Za-z][A-Za-z0-9._:-]{0,63}$/.test(key)) {
      diagnostics.push(
        diag("BOUNDED_METADATA_REQUIRED", "Metadata key is invalid.", key),
      );
      continue;
    }
    if (PRIVATE_KEYS.test(key)) {
      diagnostics.push(
        diag(
          "PRIVACY_BOUNDARY_VIOLATION",
          "Private, credential, creative, and payment fields are rejected.",
          key,
        ),
      );
      continue;
    }
    if (
      typeof item === "string" && item.length <= 128 &&
      !/<\/?[a-z][^>]*>/i.test(item)
    ) result[key] = item;
    else if (typeof item === "number" && Number.isFinite(item)) {
      result[key] = item;
    } else if (typeof item === "boolean") result[key] = item;
    else {diagnostics.push(
        diag(
          "PRIVACY_BOUNDARY_VIOLATION",
          "Only bounded scalar metadata is accepted.",
          key,
        ),
      );}
  }
  return { value: result, diagnostics };
}
function eventErrors(value: unknown): readonly Ops440Diagnostic[] {
  if (!record(value)) {
    return [
      diag(
        "EVENT_IDENTITY_INVALID",
        "Event metadata must be a bounded record.",
      ),
    ];
  }
  const error = keys(value, [
    "eventId",
    "eventType",
    "aggregateId",
    "aggregateVersion",
    "payloadHash",
    "providerName",
    "providerEventId",
    "providerSchemaVersion",
  ]);
  const out: Ops440Diagnostic[] = error === null ? [] : [error];
  for (
    const field of [
      "eventId",
      "aggregateId",
      "providerName",
      "providerEventId",
      "providerSchemaVersion",
    ] as const
  ) {
    if (!id(value[field])) {
      out.push(
        diag("EVENT_IDENTITY_INVALID", "Event identity is invalid.", field),
      );
    }
  }
  if (!name(value.eventType)) {
    out.push(
      diag("EVENT_IDENTITY_INVALID", "Event type is invalid.", "eventType"),
    );
  }
  if (!isFp004Hash(String(value.payloadHash))) {
    out.push(
      diag(
        "EVENT_IDENTITY_INVALID",
        "Event payload hash is invalid.",
        "payloadHash",
      ),
    );
  }
  if (
    !Number.isSafeInteger(value.aggregateVersion) ||
    Number(value.aggregateVersion) < 1 ||
    Number(value.aggregateVersion) > 1_000_000_000
  ) {
    out.push(
      diag(
        "EVENT_IDENTITY_INVALID",
        "Aggregate version is invalid.",
        "aggregateVersion",
      ),
    );
  }
  return out;
}
function checked(value: unknown): Ops440Command | readonly Ops440Diagnostic[] {
  if (!record(value) || typeof value.kind !== "string") {
    return [
      diag("INVALID_COMMAND", "Exactly one OPS-440 command is required."),
    ];
  }
  const k = (allowed: readonly string[]) => keys(value, allowed);
  if (value.kind === "ADMIN_PROJECTION") {
    return k(["kind", "projectionId", "scopeReference"]) === null &&
        id(value.projectionId) && id(value.scopeReference)
      ? value as unknown as Ops440Command
      : [
        k(["kind", "projectionId", "scopeReference"]) ??
          diag("INVALID_IDENTIFIER", "Admin identifiers are invalid."),
      ];
  }
  if (value.kind === "ANALYTICS_EVENT") {
    const error = k(["kind", "eventId", "eventName", "surface", "properties"]);
    const meta = scalarMetadata(value.properties ?? {});
    if (
      error === null && id(value.eventId) && name(value.eventName) &&
      typeof value.surface === "string" &&
      SURFACES.has(value.surface as Ops440Surface) &&
      meta.diagnostics.length === 0
    ) return { ...value, properties: meta.value } as unknown as Ops440Command;
    return error === null ? meta.diagnostics : [error, ...meta.diagnostics];
  }
  if (value.kind === "AD_INTENT") {
    return k(["kind", "surface", "slotId"]) === null &&
        typeof value.surface === "string" &&
        SURFACES.has(value.surface as Ops440Surface) && id(value.slotId)
      ? value as unknown as Ops440Command
      : [
        k(["kind", "surface", "slotId"]) ??
          diag("INVALID_COMMAND", "Ad command is invalid."),
      ];
  }
  if (value.kind === "MODERATION_REFERENCE") {
    return k([
            "kind",
            "moderationId",
            "targetType",
            "targetReference",
            "action",
            "reasonCode",
          ]) === null &&
        id(value.moderationId) && id(value.targetReference) &&
        typeof value.reasonCode === "string" && REASON.test(value.reasonCode)
      ? value as unknown as Ops440Command
      : [
        k([
          "kind",
          "moderationId",
          "targetType",
          "targetReference",
          "action",
          "reasonCode",
        ]) ?? diag("INVALID_COMMAND", "Moderation command is invalid."),
      ];
  }
  if (value.kind === "REVENUE_SHADOW") {
    return k(["kind", "projectionId", "scopeId"]) === null &&
        id(value.projectionId) && id(value.scopeId)
      ? value as unknown as Ops440Command
      : [
        k(["kind", "projectionId", "scopeId"]) ??
          diag("INVALID_IDENTIFIER", "Revenue identifiers are invalid."),
      ];
  }
  if (value.kind === "EVENT_INGEST") {
    const error = k(["kind", "surface", "event", "outcome"]);
    const events = eventErrors(value.event);
    if (
      error === null && typeof value.surface === "string" &&
      SURFACES.has(value.surface as Ops440Surface) && events.length === 0 &&
      (value.outcome === undefined ||
        ["SUCCESS", "RETRYABLE_FAILURE", "POISON"].includes(
          String(value.outcome),
        ))
    ) return value as unknown as Ops440Command;
    return [
      error ?? diag("INVALID_COMMAND", "Event command is invalid."),
      ...events,
    ];
  }
  return [diag("INVALID_COMMAND", "Unknown command kind is rejected.", "kind")];
}
function wpFailure(
  result: {
    readonly diagnostics: readonly {
      readonly code: string;
      readonly message: string;
      readonly path?: string;
      readonly recoverable: boolean;
    }[];
  },
): Ops440Result {
  const item = result.diagnostics[0];
  if (item === undefined) {
    return fail("INVALID_COMMAND", "A reused contract rejected the input.");
  }
  const code: Ops440DiagnosticCode = item.code.includes("PRIVACY")
    ? "PRIVACY_BOUNDARY_VIOLATION"
    : item.code.includes("AUTH")
    ? "AUTHORIZATION_DENIED"
    : item.code.includes("SHADOW")
    ? "CANONICAL_MUTATION_FORBIDDEN"
    : "INVALID_COMMAND";
  return fail(code, item.message, item.path, item.recoverable);
}
function fpFailure(
  result: {
    readonly diagnostics: readonly {
      readonly code: string;
      readonly message: string;
      readonly path?: string;
      readonly recoverable: boolean;
    }[];
  },
): Ops440Result {
  const item = result.diagnostics[0];
  if (item === undefined) {
    return fail("EVENT_IDENTITY_INVALID", "FP-004 rejected the event.");
  }
  const code: Ops440DiagnosticCode = item.code === "CONSUMER_FAILURE"
    ? "EVENT_DLQ"
    : item.code.includes("IDENTITY")
    ? "EVENT_IDENTITY_INVALID"
    : item.code === "LEASE_STALE"
    ? "EVENT_REPLAY_NO_SIDE_EFFECT"
    : "AUTHORIZATION_DENIED";
  return fail(code, item.message, item.path, item.recoverable);
}
function wp240Surface(
  surface: Ops440Surface,
):
  | "PUBLIC_DISCOVERY"
  | "PUBLIC_FEED"
  | "MARKET_LISTING"
  | "PUBLIC_RESOURCE"
  | "ACTIVE_STUDIO"
  | "CHECKOUT"
  | "ENTITLEMENT"
  | "COMMISSION"
  | "ACCOUNT_PRIVATE"
  | "PROJECT_PRIVATE" {
  if (surface === "DISCOVER" || surface === "PUBLIC_DISCOVERY") {
    return "PUBLIC_DISCOVERY";
  }
  if (["PUBLIC_SOCIAL", "COMMUNITY", "PUBLIC_FEED"].includes(surface)) {
    return "PUBLIC_FEED";
  }
  if (["MARKET_BROWSE", "MARKET_LISTING"].includes(surface)) {
    return "MARKET_LISTING";
  }
  if (
    [
      "PUBLIC_CREATOR",
      "PUBLIC_PROJECT",
      "PUBLIC_RESOURCE",
      "PUBLIC_GAME",
      "PUBLIC_LISTENING",
    ].includes(surface)
  ) return "PUBLIC_RESOURCE";
  if (["ACTIVE_STUDIO", "STUDIO"].includes(surface)) return "ACTIVE_STUDIO";
  if (surface === "CHECKOUT") return "CHECKOUT";
  if (surface === "ENTITLEMENT") return "ENTITLEMENT";
  if (surface === "COMMISSION") return "COMMISSION";
  if (surface === "ACCOUNT_PRIVATE") return "ACCOUNT_PRIVATE";
  return "PROJECT_PRIVATE";
}
function wp250Surface(surface: Ops440Surface): Wp250Surface {
  const map: Partial<Record<Ops440Surface, Wp250Surface>> = {
    DISCOVER: "DISCOVER",
    PUBLIC_SOCIAL: "PUBLIC_SOCIAL",
    COMMUNITY: "COMMUNITY",
    PUBLIC_CREATOR: "PUBLIC_CREATOR",
    PUBLIC_PROJECT: "PUBLIC_PROJECT",
    MARKET_BROWSE: "MARKET_BROWSE",
    MARKET_LISTING: "MARKET_BROWSE",
    PUBLIC_GAME: "PUBLIC_GAME",
    PUBLIC_LISTENING: "PUBLIC_LISTENING",
    PUBLIC_DISCOVERY: "DISCOVER",
    PUBLIC_FEED: "PUBLIC_SOCIAL",
    PUBLIC_RESOURCE: "PUBLIC_PROJECT",
    ACTIVE_STUDIO: "PRIVATE_PROJECT",
    STUDIO: "PRIVATE_PROJECT",
    DRAW2_EDITOR: "DRAW2_EDITOR",
    GAME_EDITOR: "GAME_EDITOR",
    AUDIO_EDITOR: "AUDIO_EDITOR",
    DIRECT_WORK: "DIRECT_WORK",
    CHECKOUT: "CHECKOUT",
    ACCOUNT_PRIVATE: "ACCOUNT_SECURITY",
    PROJECT_PRIVATE: "PRIVATE_PROJECT",
    PRIVATE_INBOX: "PRIVATE_INBOX",
    ENTITLEMENT: "CHECKOUT",
    COMMISSION: "DIRECT_WORK",
    ADMIN: "ADMIN",
  };
  return map[surface] ?? "PRIVATE_PROJECT";
}
function noAd(command: Ops440AdIntentCommand): Ops440ResultValue {
  return {
    kind: "AD_INTENT",
    surface: command.surface,
    slotId: command.slotId,
    intent: "NONE",
    sdkLoad: "NONE",
    providerRequest: "NOT_REQUESTED",
    layout: "NO_SLOT",
    organicRankingMutated: false,
    contributorAllocationMutated: false,
  };
}

export function createOps440ServerComposition(
  options: Ops440ServerCompositionOptions,
): Ops440ServerComposition {
  const now = options.now ?? (() => new Date());
  const inbox = new Fp004InboxOutboxLeaseAdapter(
    options.inboxPersistence ?? new InMemoryFp004LeasePersistence(),
    {
      policy: {
        maxAttempts: 3,
        leaseMs: 5000,
        baseBackoffMs: 1,
        maxBackoffMs: 4,
      },
      now,
    },
  );
  const versions = new Map<string, number>();
  const processed = new Map<string, Ops440EventResolution>();
  let sequence = 0;
  async function state(
    operation: Ops440Operation,
    command: Ops440Command,
    resourceId: string,
  ): Promise<State | Ops440Result> {
    sequence += 1;
    const context = await deriveServerAuthorityRequestContext({
      authProvider: options.authProvider,
      tenantResolver: options.tenantResolver,
      request: {
        requestId: `ops440:${sequence}`,
        resourceType: operation,
        resourceId,
        sessionReference: `ops440-session:${sequence}`,
        correlationId: `ops440:${sequence}`,
      },
    });
    if (context === null) {
      return fail(
        "AUTHORITY_CONTEXT_REQUIRED",
        "Server-authenticated context is required.",
      );
    }
    let resource: Ops440ServerResourceResolution | null;
    try {
      resource = await options.resourceResolver({
        context,
        operation,
        command,
      });
    } catch {
      return fail(
        "AUTHORIZATION_DENIED",
        "Canonical resource resolution failed closed.",
        undefined,
        true,
      );
    }
    if (
      resource === null || resource.resourceType !== operation ||
      resource.resourceId !== resourceId ||
      resource.tenantId !== context.tenantContext.tenantId ||
      resource.status !== "ACTIVE" || !id(resource.revision)
    ) {
      return fail(
        "CANONICAL_IDENTITY_MISMATCH",
        "Canonical resource identity or tenant does not match.",
      );
    }
    let policy: Ops440ServerPolicyDecision;
    try {
      policy = await options.policyResolver({
        context,
        operation,
        command,
        resource,
      });
    } catch {
      return fail(
        "POLICY_UNKNOWN",
        "Policy resolution failed closed.",
        undefined,
        true,
      );
    }
    if (
      policy.serverResolved !== true ||
      policy.decisionRevision !== resource.revision
    ) {
      return fail(
        "STALE_SERVER_DECISION",
        "Policy and resource revisions are stale or mismatched.",
      );
    }
    return { context, resource, policy };
  }
  function proof(
    s: State,
    operation: Ops440Operation,
    expected: AuthorizationProofExpectation,
  ): AuthorizationProofV1 | null {
    try {
      const boundExpected: AuthorizationProofExpectation = {
        ...expected,
        principalId: s.context.principalId,
        tenantId: s.context.tenantContext.tenantId,
        correlationId: s.context.correlationId,
        policyVersion: AUTHORIZATION_PROOF_POLICY_VERSION,
      };
      return requireAuthorizationProofV1(
        options.authorizationProofResolver({
          context: s.context,
          operation,
          expected: boundExpected,
        }),
        boundExpected,
      );
    } catch {
      return null;
    }
  }
  async function finish(s: State, result: Ops440Result): Promise<Ops440Result> {
    if (!result.ok) return result;
    const consumed = await consumeServerAuthorityRequestContext(s.context, {
      resourceType: s.resource.resourceType,
      resourceId: s.resource.resourceId,
      membershipRegistry: options.tenantResolver.membershipRegistry,
    });
    return consumed ? result : fail(
      "STALE_SERVER_DECISION",
      "Authority context became stale before completion.",
    );
  }
  function enabled(s: State, feature: Ops440Feature): Ops440Diagnostic | null {
    if (options.killSwitch === true || s.policy.killSwitch === true) {
      return diag("KILL_SWITCH_ACTIVE", "Kill switch is active.");
    }
    if (s.policy.offline === true) {
      return diag(
        "OFFLINE_FAIL_CLOSED",
        "Offline state fails closed.",
        undefined,
        true,
      );
    }
    if (s.policy.featureAllowed !== true || options.flags?.[feature] !== true) {
      return diag(
        "FEATURE_DISABLED",
        "Server feature is disabled or unresolved.",
        undefined,
        true,
      );
    }
    return null;
  }
  async function admin(
    command: Extract<Ops440Command, { kind: "ADMIN_PROJECTION" }>,
  ): Promise<Ops440Result> {
    const s = await state("ADMIN_PROJECTION", command, command.projectionId);
    if (!("context" in s)) return s;
    const blocked = enabled(s, "admin-read");
    if (blocked) {
      return fail(
        blocked.code,
        blocked.message,
        undefined,
        blocked.recoverable,
      );
    }
    const p = proof(s, "ADMIN_PROJECTION", {
      resourceType: "ADMIN_PROJECTION",
      resourceId: command.projectionId,
      action: "admin.projection.read",
      capability: "ADMIN_PROJECTION_READ",
    });
    if (!p) return fail("AUTHORIZATION_DENIED", "Admin proof is unavailable.");
    const projection = resolveWp240AdminProjection({
      projectionId: command.projectionId,
      kind: "CONTENT_HEALTH",
      scopeReference: command.scopeReference,
      requiredCapability: "ADMIN_PROJECTION_READ",
      authorizationProof: p,
      authorizationProofResolver: ({ expected }) => p,
    });
    if (!projection.ok) return wpFailure(projection);
    const auditProof = proof(s, "ADMIN_PROJECTION", {
      resourceType: "ADMIN_AUDIT",
      resourceId: `audit:${command.projectionId}`,
      action: "admin.audit.record",
      capability: "ADMIN_PROJECTION_READ",
    });
    if (!auditProof) {
      return fail("AUTHORIZATION_DENIED", "Admin audit proof is unavailable.");
    }
    const audit = createWp250AdminAuditReference({
      auditId: `audit:${command.projectionId}`,
      actorReference: s.context.principalId,
      permission: "ADMIN_PROJECTION_READ",
      operation: "PROJECTION_READ",
      targetReference: command.scopeReference,
      reasonCode: "OPS440_READ",
      authorizationProof: auditProof,
      authorizationProofResolver: ({ expected }) => auditProof,
    });
    if (!audit.ok) return wpFailure(audit);
    return finish(
      s,
      pass({
        kind: "ADMIN_PROJECTION",
        projectionId: command.projectionId,
        scopeReference: command.scopeReference,
        readOnly: true,
        mutatesCanonicalState: false,
        containsPrivateContent: false,
      }),
    );
  }
  async function analytics(
    command: Extract<Ops440Command, { kind: "ANALYTICS_EVENT" }>,
  ): Promise<Ops440Result> {
    const s = await state("ANALYTICS_EVENT", command, command.eventId);
    if (!("context" in s)) return s;
    const blocked = enabled(s, "analytics-read");
    if (blocked) {
      return fail(
        blocked.code,
        blocked.message,
        undefined,
        blocked.recoverable,
      );
    }
    if (s.policy.consentRevoked || s.policy.analyticsConsent === "DENIED") {
      return fail(
        "CONSENT_REVOKED",
        "Analytics consent is denied or revoked.",
        undefined,
        true,
      );
    }
    if (s.policy.analyticsConsent === "UNKNOWN") {
      return fail(
        "POLICY_UNKNOWN",
        "Analytics consent is unresolved.",
        undefined,
        true,
      );
    }
    const event = createWp240AnalyticsEvent({
      eventId: command.eventId,
      eventName: command.eventName,
      surface: wp240Surface(command.surface),
      properties: command.properties,
    });
    if (!event.ok) return wpFailure(event);
    return finish(
      s,
      pass({
        kind: "ANALYTICS_EVENT",
        eventId: event.value.eventId,
        eventName: event.value.eventName,
        surface: command.surface,
        properties: event.value.properties,
        privacySafe: true,
      }),
    );
  }
  async function ad(command: Ops440AdIntentCommand): Promise<Ops440Result> {
    const s = await state("AD_INTENT", command, command.slotId);
    if (!("context" in s)) return s;
    if (PRIVATE.has(command.surface)) {
      return finish(
        s,
        pass(noAd(command), [
          diag(
            "PRIVATE_SURFACE_NO_AD_INTENT",
            "Private surfaces never request Ads.",
            undefined,
            true,
          ),
        ]),
      );
    }
    if (s.policy.killSwitch || options.killSwitch) {
      return finish(
        s,
        pass(noAd(command), [
          diag(
            "KILL_SWITCH_ACTIVE",
            "Ads are closed by kill switch.",
            undefined,
            true,
          ),
        ]),
      );
    }
    if (s.policy.offline) {
      return finish(
        s,
        pass(noAd(command), [
          diag(
            "OFFLINE_FAIL_CLOSED",
            "Ads are closed offline.",
            undefined,
            true,
          ),
        ]),
      );
    }
    if (s.policy.consentRevoked || s.policy.adConsent === "DENIED") {
      return finish(
        s,
        pass(noAd(command), [
          diag(
            "CONSENT_REVOKED",
            "Ad consent is denied or revoked.",
            undefined,
            true,
          ),
        ]),
      );
    }
    if (s.policy.providerEligibility !== "ALLOWED") {
      return finish(
        s,
        pass(noAd(command), [
          diag(
            "PROVIDER_UNAVAILABLE",
            "Provider eligibility is not allowed.",
            undefined,
            true,
          ),
        ]),
      );
    }
    if (options.flags?.["ads-read"] !== true || !s.policy.featureAllowed) {
      return finish(
        s,
        pass(noAd(command), [
          diag("FEATURE_DISABLED", "Ads feature is disabled.", undefined, true),
        ]),
      );
    }
    const policy = resolveWp250ConsentPolicy({
      serverResolved: true,
      region: s.policy.region,
      agePolicy: s.policy.agePolicy,
      adConsent: s.policy.adConsent,
      analyticsConsent: s.policy.analyticsConsent,
    });
    if (!policy.ok || !policy.value.adsAllowed) {
      return finish(
        s,
        pass(noAd(command), [
          diag("POLICY_UNKNOWN", "Ad policy is not allowed.", undefined, true),
        ]),
      );
    }
    const placement = resolveWp240AdPlacement({
      surface: wp240Surface(command.surface),
      serverResolved: true,
      adsEnabled: true,
    });
    if (!placement.ok) return finish(s, wpFailure(placement));
    const eligibility = resolveWp250AdEligibility({
      surface: wp250Surface(command.surface),
      serverResolved: true,
      policy: policy.value,
      providerEligibility: s.policy.providerEligibility,
      viewportProximity: s.policy.viewportProximity,
      slotReserved: s.policy.slotReserved,
    });
    if (!eligibility.ok || !eligibility.value.eligible) {
      return finish(
        s,
        pass(noAd(command), [
          diag(
            "PROVIDER_UNAVAILABLE",
            "Ad eligibility remains closed.",
            undefined,
            true,
          ),
        ]),
      );
    }
    return finish(
      s,
      pass({
        kind: "AD_INTENT",
        surface: command.surface,
        slotId: command.slotId,
        intent: "LAZY_PUBLIC_ADAPTER",
        sdkLoad: "DEFERRED_LAZY_ADAPTER",
        providerRequest: "ON_DEMAND_ONLY",
        layout: "RESERVED",
        organicRankingMutated: false,
        contributorAllocationMutated: false,
      }),
    );
  }
  async function moderation(
    command: Ops440ModerationReferenceCommand,
  ): Promise<Ops440Result> {
    const s = await state(
      "MODERATION_REFERENCE",
      command,
      command.moderationId,
    );
    if (!("context" in s)) return s;
    const blocked = enabled(s, "moderation-read");
    if (blocked) {
      return fail(
        blocked.code,
        blocked.message,
        undefined,
        blocked.recoverable,
      );
    }
    const p = proof(s, "MODERATION_REFERENCE", {
      resourceType: "MODERATION_REFERENCE",
      resourceId: command.moderationId,
      action: "moderation.reference.create",
      capability: "moderation.reference.create",
    });
    const c = proof(s, "MODERATION_REFERENCE", {
      resourceType: "MODERATION_CASE",
      resourceId: command.moderationId,
      action: "moderation.case.create",
      capability: "moderation.case.create",
    });
    if (!p || !c) {
      return fail("AUTHORIZATION_DENIED", "Moderation proof is unavailable.");
    }
    const reference = createWp240ModerationReference({
      moderationId: command.moderationId,
      targetType: command.targetType,
      targetReference: command.targetReference,
      action: command.action === "REVIEW" ? "REPORT" : command.action,
      reasonCode: command.reasonCode,
      authorizationProof: p,
      authorizationProofResolver: ({ expected }) => p,
    });
    if (!reference.ok) return wpFailure(reference);
    const caseValue = createWp250ModerationCase({
      caseId: command.moderationId,
      targetReference: command.targetReference,
      action: command.action,
      reasonCode: command.reasonCode,
      evidenceReferences: [],
      authorizationProof: c,
      authorizationProofResolver: ({ expected }) => c,
    });
    if (!caseValue.ok) return wpFailure(caseValue);
    return finish(
      s,
      pass({
        kind: "MODERATION_REFERENCE",
        moderationId: reference.value.moderationId,
        targetReference: caseValue.value.targetReference,
        action: command.action,
        reasonCode: command.reasonCode,
        containsEvidenceBody: false,
        automaticCanonicalMutation: false,
      }),
    );
  }
  async function revenue(
    command: Ops440RevenueShadowCommand,
  ): Promise<Ops440Result> {
    const s = await state("REVENUE_SHADOW", command, command.projectionId);
    if (!("context" in s)) return s;
    const blocked = enabled(s, "revenue-shadow-read");
    if (blocked) {
      return fail(
        blocked.code,
        blocked.message,
        undefined,
        blocked.recoverable,
      );
    }
    if (!options.revenueResolver) {
      return fail(
        "POLICY_UNKNOWN",
        "Revenue resolver is not configured.",
        undefined,
        true,
      );
    }
    let r: Ops440RevenueResolution | null;
    try {
      r = await options.revenueResolver({
        context: s.context,
        command,
        resource: s.resource,
      });
    } catch {
      return fail(
        "POLICY_UNKNOWN",
        "Revenue resolution failed closed.",
        undefined,
        true,
      );
    }
    if (!r) {
      return fail(
        "POLICY_UNKNOWN",
        "Revenue shadow is unavailable.",
        undefined,
        true,
      );
    }
    const projection = createWp250RevenueCostProjection({
      projectionId: command.projectionId,
      scopeType: "PROJECT",
      scopeId: command.scopeId,
      revenueLines: r.revenueLines,
      costLines: r.costLines,
      serverShadowOnly: true,
      ledgerMutation: false,
      payoutMutation: false,
    });
    if (!projection.ok) return wpFailure(projection);
    const comparison = createWp240RevenueShadowComparison({
      comparisonId: command.projectionId,
      currency: r.currency,
      expectedMinorUnits: r.expectedMinorUnits,
      observedMinorUnits: r.observedMinorUnits,
      serverReadOnly: true,
      ledgerMutation: false,
      payoutMutation: false,
    });
    if (!comparison.ok) return wpFailure(comparison);
    return finish(
      s,
      pass({
        kind: "REVENUE_SHADOW",
        projectionId: projection.value.projectionId,
        scopeId: projection.value.scopeId,
        currency: r.currency,
        revenueMinorUnits: projection.value.revenueMinorUnits,
        costMinorUnits: projection.value.costMinorUnits,
        netMinorUnits: projection.value.netMinorUnits,
        shadowOnly: true,
        ledgerMutation: false,
        payoutMutation: false,
        royaltyMutation: false,
        purchaseMutation: false,
        entitlementMutation: false,
        organicRankingMutated: false,
      }, [
        diag(
          "REVENUE_SHADOW_ONLY",
          "Revenue is a server-read shadow projection.",
          undefined,
          true,
        ),
      ]),
    );
  }
  async function event(
    command: Ops440EventIngestCommand,
  ): Promise<Ops440Result> {
    const s = await state("EVENT_INGEST", command, command.event.eventId);
    if (!("context" in s)) return s;
    const blocked = enabled(s, "event-inbox");
    if (blocked) {
      return fail(
        blocked.code,
        blocked.message,
        undefined,
        blocked.recoverable,
      );
    }
    let r: Ops440EventResolution;
    try {
      r = options.eventResolver({
        context: s.context,
        command,
        resource: s.resource,
      });
    } catch {
      return fail(
        "EVENT_IDENTITY_INVALID",
        "Canonical event resolution failed closed.",
        undefined,
        true,
      );
    }
    if (
      r.canonicalEventId !== asFp004EventId(command.event.eventId) ||
      r.providerIdentity.providerName !== command.event.providerName ||
      r.providerIdentity.providerEventId !== command.event.providerEventId ||
      r.providerIdentity.payloadHash !== command.event.payloadHash ||
      r.aggregateId !== command.event.aggregateId ||
      r.aggregateVersion !== command.event.aggregateVersion ||
      r.tenantId !== s.resource.tenantId ||
      r.resourceType !== s.resource.resourceType ||
      r.resourceId !== s.resource.resourceId ||
      !isFp004Hash(r.providerIdentity.payloadHash)
    ) {
      return fail(
        "CANONICAL_IDENTITY_MISMATCH",
        "Resolved event identity does not match the server metadata.",
      );
    }
    const key =
      `${r.providerIdentity.providerName}:${r.providerIdentity.providerEventId}`;
    const aggregate = `${r.tenantId}:${r.aggregateId}`;
    const previous = versions.get(aggregate) ?? 0;
    if (processed.has(key)) {
      return finish(
        s,
        pass(
          eventValue(
            command.event.eventId,
            r.canonicalEventId,
            true,
            previous,
            inbox.snapshot().deadLetters.length,
          ),
          [diag(
            "EVENT_REPLAY_NO_SIDE_EFFECT",
            "Duplicate event replay has no side effect.",
            undefined,
            true,
          )],
        ),
      );
    }
    if (r.aggregateVersion <= previous || r.aggregateVersion > previous + 1) {
      return fail(
        "EVENT_OUT_OF_ORDER",
        "Stale or gapped event is rejected with no side effect.",
        undefined,
        true,
      );
    }
    const ingress = createFp004ServerProviderIngress({
      principalId: s.context.principalId,
      tenantId: s.context.tenantContext.tenantId,
      resourceType: s.resource.resourceType,
      resourceId: s.resource.resourceId,
      resolve: () => r,
    });
    const accepted = inbox.acceptProviderEvent(ingress, command.event);
    if (!accepted.ok) return fpFailure(accepted);
    const lease = inbox.leaseInbox("ops440", now(), {
      inboxId: accepted.value.inbox.inboxId,
    });
    if (!lease.ok) return fpFailure(lease);
    const outcome = command.outcome ?? "SUCCESS";
    const delivery: Fp004FailureDelivery | {
      readonly outcome: "SUCCESS";
      readonly resultHash: string;
    } = outcome === "SUCCESS"
      ? { outcome: "SUCCESS", resultHash: r.providerIdentity.payloadHash }
      : {
        outcome,
        diagnostic: {
          code: "CONSUMER_FAILURE",
          message: outcome === "POISON"
            ? "Poison event moved to DLQ."
            : "Retry scheduled.",
          recoverable: outcome === "RETRYABLE_FAILURE",
        },
      };
    const ack = inbox.acknowledgeInbox(
      "ops440",
      lease.value.lease.fencingToken,
      delivery,
      now(),
      lease.value.record.inboxId,
    );
    if (!ack.ok) return fpFailure(ack);
    if (outcome === "SUCCESS") {
      versions.set(aggregate, r.aggregateVersion);
      processed.set(key, r);
    }
    return finish(
      s,
      pass(
        eventValue(
          command.event.eventId,
          r.canonicalEventId,
          false,
          lease.value.record.attemptCount,
          inbox.snapshot().deadLetters.length,
        ),
        outcome === "SUCCESS" ? [] : [
          diag(
            outcome === "POISON" ? "EVENT_DLQ" : "RETRY_SCHEDULED",
            outcome === "POISON"
              ? "Event was quarantined in the bounded DLQ."
              : "Event retry was scheduled.",
            undefined,
            true,
          ),
        ],
      ),
    );
  }
  async function execute(input: Ops440Command): Promise<Ops440Result> {
    const value = checked(input);
    if (Array.isArray(value)) {
      return {
        ok: false,
        schemaVersion: OPS440_SCHEMA_VERSION,
        diagnostics: value,
      };
    }
    const command = value as Ops440Command;
    switch (command.kind) {
      case "ADMIN_PROJECTION":
        return admin(command);
      case "ANALYTICS_EVENT":
        return analytics(command);
      case "AD_INTENT":
        return ad(command);
      case "MODERATION_REFERENCE":
        return moderation(command);
      case "REVENUE_SHADOW":
        return revenue(command);
      case "EVENT_INGEST":
        return event(command);
    }
    return fail("INVALID_COMMAND", "Unknown command kind is rejected.");
  }
  return Object.freeze({
    execute,
    snapshot: () => {
      const s = inbox.snapshot();
      return {
        inboxCount: s.inbox.length,
        deadLetterCount: s.deadLetters.length,
        processedEventCount: processed.size,
      };
    },
  });
}

function eventValue(
  eventId: string,
  canonicalEventId: string,
  duplicate: boolean,
  attemptCount: number,
  deadLetterCount: number,
): Ops440ResultValue {
  return {
    kind: "EVENT_INGEST",
    eventId,
    canonicalEventId,
    duplicate,
    sideEffectCount: 0,
    attemptCount,
    deadLetterCount,
  };
}
