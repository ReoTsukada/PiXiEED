/**
 * Browser-safe command envelopes for the FP-003Z authority boundary.
 *
 * This module contains only bounded IDs, expected revisions, and user input.
 * It deliberately has no identity, permission, authority, provider, or
 * server decision input. A server command handler must resolve those values
 * again from its authenticated session and Canonical Registry.
 */

export const FP003Z_BROWSER_COMMAND_SCHEMA_VERSION = "FP003Z_BROWSER_COMMAND_V1" as const;

export type BrowserCommandDomain = "SNS" | "ADMIN" | "POLICY";

export interface BrowserCommandDiagnostic {
  readonly code: "INVALID_ID" | "INVALID_REVISION" | "INVALID_INPUT";
  readonly message: string;
  readonly path?: string;
}

export type BrowserCommandResult<T> =
  | { readonly ok: true; readonly value: T; readonly diagnostics: readonly BrowserCommandDiagnostic[] }
  | { readonly ok: false; readonly diagnostics: readonly BrowserCommandDiagnostic[] };

export interface BrowserCommandEnvelope<T extends object = Record<string, unknown>> {
  readonly schemaVersion: typeof FP003Z_BROWSER_COMMAND_SCHEMA_VERSION;
  readonly commandId: string;
  readonly domain: BrowserCommandDomain;
  readonly operation: string;
  readonly resourceId: string;
  readonly expectedRevision: string;
  readonly input: T;
}

export interface SnsPostCommandInput {
  readonly commandId: string;
  readonly postId: string;
  readonly shareCommandId: string;
  readonly resourceId: string;
  readonly expectedRevision: string;
  readonly kind: "CREATOR_NOTE" | "ASSET_SHARE" | "MARKET_CARD" | "PIXFiND_REFERENCE" | "PROJECT_UPDATE";
  readonly visibility: "PUBLIC" | "UNLISTED" | "PROJECT_MEMBERS" | "CREATOR_PRIVATE" | "PRIVATE";
  readonly status: "DRAFT" | "PUBLISHED" | "ARCHIVED" | "HIDDEN" | "QUARANTINED";
  readonly caption: string;
  readonly references: readonly string[];
  readonly publicPath?: string;
}

export type SnsPostCommand = BrowserCommandEnvelope<{
  readonly postId: string;
  readonly shareCommandId: string;
  readonly resourceId: string;
  readonly kind: SnsPostCommandInput["kind"];
  readonly visibility: SnsPostCommandInput["visibility"];
  readonly status: SnsPostCommandInput["status"];
  readonly caption: string;
  readonly references: readonly string[];
  readonly publicPath?: string;
}>;

export interface AdminProjectionCommandInput {
  readonly commandId: string;
  readonly projectionId: string;
  readonly scopeReference: string;
  readonly expectedRevision: string;
  readonly kind: "CONTENT_HEALTH" | "MODERATION_QUEUE" | "ANALYTICS_SUMMARY" | "REVENUE_SHADOW";
  readonly requestedCapability?: string;
}

export type AdminProjectionCommand = BrowserCommandEnvelope<{
  readonly projectionId: string;
  readonly scopeReference: string;
  readonly kind: AdminProjectionCommandInput["kind"];
  readonly requestedCapability?: string;
}>;

export interface AdminAuditCommandInput {
  readonly commandId: string;
  readonly auditId: string;
  readonly targetReference: string;
  readonly expectedRevision: string;
  readonly operation: string;
  readonly reasonCode: string;
}

export type AdminAuditCommand = BrowserCommandEnvelope<{
  readonly auditId: string;
  readonly targetReference: string;
  readonly operation: string;
  readonly reasonCode: string;
}>;

export interface ModerationCommandInput {
  readonly commandId: string;
  readonly caseId: string;
  readonly targetReference: string;
  readonly expectedRevision: string;
  readonly action: "REPORT" | "REVIEW" | "HIDE" | "REMOVE" | "RESTRICT" | "SUSPEND" | "APPEAL";
  readonly reasonCode: string;
  readonly evidenceReferences: readonly string[];
}

export type ModerationCommand = BrowserCommandEnvelope<{
  readonly caseId: string;
  readonly targetReference: string;
  readonly action: ModerationCommandInput["action"];
  readonly reasonCode: string;
  readonly evidenceReferences: readonly string[];
}>;

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,255}$/;
const SAFE_REVISION = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,255}$/;
const SAFE_CODE = /^[A-Z0-9][A-Z0-9._:-]{0,63}$/;
const SAFE_PATH = /^\/(?!\/|.*(?:javascript:|data:|vbscript:))[A-Za-z0-9._~:/?#\[\]@!$&'()*+,;=%-]*$/i;
const MAX_TEXT = 2048;

function failure(diagnostics: readonly BrowserCommandDiagnostic[]): { readonly ok: false; readonly diagnostics: readonly BrowserCommandDiagnostic[] } {
  return { ok: false, diagnostics };
}

function success<T>(value: T): BrowserCommandResult<T> {
  return { ok: true, value, diagnostics: [] };
}

function validateId(value: string, path: string, diagnostics: BrowserCommandDiagnostic[]): void {
  if (!SAFE_ID.test(value)) diagnostics.push({ code: "INVALID_ID", message: "Command references must be stable identifiers.", path });
}

function validateRevision(value: string, path: string, diagnostics: BrowserCommandDiagnostic[]): void {
  if (!SAFE_REVISION.test(value)) diagnostics.push({ code: "INVALID_REVISION", message: "Commands require a bounded expected revision.", path });
}

function validateText(value: string, path: string, diagnostics: BrowserCommandDiagnostic[]): void {
  if (value.length === 0 || value.length > MAX_TEXT) diagnostics.push({ code: "INVALID_INPUT", message: "Command text must remain bounded.", path });
}

function validateCode(value: string, path: string, diagnostics: BrowserCommandDiagnostic[]): void {
  if (!SAFE_CODE.test(value)) diagnostics.push({ code: "INVALID_INPUT", message: "Command codes must remain bounded and stable.", path });
}

function validateReferences(values: readonly string[], path: string, diagnostics: BrowserCommandDiagnostic[]): void {
  if (values.length > 64) diagnostics.push({ code: "INVALID_INPUT", message: "Command references must remain bounded.", path });
  values.forEach((value, index) => validateId(value, `${path}[${index}]`, diagnostics));
}

export function createSnsPostCommand(input: SnsPostCommandInput): BrowserCommandResult<SnsPostCommand> {
  const diagnostics: BrowserCommandDiagnostic[] = [];
  validateId(input.commandId, "commandId", diagnostics);
  validateId(input.postId, "postId", diagnostics);
  validateId(input.shareCommandId, "shareCommandId", diagnostics);
  validateId(input.resourceId, "resourceId", diagnostics);
  validateRevision(input.expectedRevision, "expectedRevision", diagnostics);
  validateText(input.caption, "caption", diagnostics);
  validateReferences(input.references, "references", diagnostics);
  if (input.publicPath !== undefined && !SAFE_PATH.test(input.publicPath)) diagnostics.push({ code: "INVALID_INPUT", message: "Public paths must remain same-origin paths.", path: "publicPath" });
  if (diagnostics.length > 0) return failure(diagnostics);
  return success({
    schemaVersion: FP003Z_BROWSER_COMMAND_SCHEMA_VERSION,
    commandId: input.commandId,
    domain: "SNS",
    operation: "sns.post.create",
    resourceId: input.postId,
    expectedRevision: input.expectedRevision,
    input: {
      postId: input.postId,
      shareCommandId: input.shareCommandId,
      resourceId: input.resourceId,
      kind: input.kind,
      visibility: input.visibility,
      status: input.status,
      caption: input.caption,
      references: [...input.references],
      ...(input.publicPath === undefined ? {} : { publicPath: input.publicPath }),
    },
  });
}

export function createAdminProjectionCommand(input: AdminProjectionCommandInput): BrowserCommandResult<AdminProjectionCommand> {
  const diagnostics: BrowserCommandDiagnostic[] = [];
  validateId(input.commandId, "commandId", diagnostics);
  validateId(input.projectionId, "projectionId", diagnostics);
  validateId(input.scopeReference, "scopeReference", diagnostics);
  validateRevision(input.expectedRevision, "expectedRevision", diagnostics);
  if (input.requestedCapability !== undefined) validateCode(input.requestedCapability, "requestedCapability", diagnostics);
  if (diagnostics.length > 0) return failure(diagnostics);
  return success({
    schemaVersion: FP003Z_BROWSER_COMMAND_SCHEMA_VERSION,
    commandId: input.commandId,
    domain: "ADMIN",
    operation: "admin.projection.read",
    resourceId: input.projectionId,
    expectedRevision: input.expectedRevision,
    input: {
      projectionId: input.projectionId,
      scopeReference: input.scopeReference,
      kind: input.kind,
      ...(input.requestedCapability === undefined ? {} : { requestedCapability: input.requestedCapability }),
    },
  });
}

export function createAdminAuditCommand(input: AdminAuditCommandInput): BrowserCommandResult<AdminAuditCommand> {
  const diagnostics: BrowserCommandDiagnostic[] = [];
  validateId(input.commandId, "commandId", diagnostics);
  validateId(input.auditId, "auditId", diagnostics);
  validateId(input.targetReference, "targetReference", diagnostics);
  validateRevision(input.expectedRevision, "expectedRevision", diagnostics);
  validateCode(input.operation, "operation", diagnostics);
  validateCode(input.reasonCode, "reasonCode", diagnostics);
  if (diagnostics.length > 0) return failure(diagnostics);
  return success({
    schemaVersion: FP003Z_BROWSER_COMMAND_SCHEMA_VERSION,
    commandId: input.commandId,
    domain: "POLICY",
    operation: "admin.audit.record",
    resourceId: input.auditId,
    expectedRevision: input.expectedRevision,
    input: { auditId: input.auditId, targetReference: input.targetReference, operation: input.operation, reasonCode: input.reasonCode },
  });
}

export function createModerationCommand(input: ModerationCommandInput): BrowserCommandResult<ModerationCommand> {
  const diagnostics: BrowserCommandDiagnostic[] = [];
  validateId(input.commandId, "commandId", diagnostics);
  validateId(input.caseId, "caseId", diagnostics);
  validateId(input.targetReference, "targetReference", diagnostics);
  validateRevision(input.expectedRevision, "expectedRevision", diagnostics);
  validateCode(input.reasonCode, "reasonCode", diagnostics);
  validateReferences(input.evidenceReferences, "evidenceReferences", diagnostics);
  if (diagnostics.length > 0) return failure(diagnostics);
  return success({
    schemaVersion: FP003Z_BROWSER_COMMAND_SCHEMA_VERSION,
    commandId: input.commandId,
    domain: "POLICY",
    operation: "moderation.case.create",
    resourceId: input.caseId,
    expectedRevision: input.expectedRevision,
    input: { caseId: input.caseId, targetReference: input.targetReference, action: input.action, reasonCode: input.reasonCode, evidenceReferences: [...input.evidenceReferences] },
  });
}
