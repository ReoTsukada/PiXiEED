// src/fp003z-browser-command-contract.ts
var FP003Z_BROWSER_COMMAND_SCHEMA_VERSION = "FP003Z_BROWSER_COMMAND_V1";
var SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,255}$/;
var SAFE_REVISION = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,255}$/;
var SAFE_CODE = /^[A-Z0-9][A-Z0-9._:-]{0,63}$/;
var SAFE_PATH = /^\/(?!\/|.*(?:javascript:|data:|vbscript:))[A-Za-z0-9._~:/?#\[\]@!$&'()*+,;=%-]*$/i;
var MAX_TEXT = 2048;
function failure(diagnostics) {
  return {
    ok: false,
    diagnostics
  };
}
function success(value) {
  return {
    ok: true,
    value,
    diagnostics: []
  };
}
function validateId(value, path, diagnostics) {
  if (!SAFE_ID.test(value)) diagnostics.push({
    code: "INVALID_ID",
    message: "Command references must be stable identifiers.",
    path
  });
}
function validateRevision(value, path, diagnostics) {
  if (!SAFE_REVISION.test(value)) diagnostics.push({
    code: "INVALID_REVISION",
    message: "Commands require a bounded expected revision.",
    path
  });
}
function validateText(value, path, diagnostics) {
  if (value.length === 0 || value.length > MAX_TEXT) diagnostics.push({
    code: "INVALID_INPUT",
    message: "Command text must remain bounded.",
    path
  });
}
function validateCode(value, path, diagnostics) {
  if (!SAFE_CODE.test(value)) diagnostics.push({
    code: "INVALID_INPUT",
    message: "Command codes must remain bounded and stable.",
    path
  });
}
function validateReferences(values, path, diagnostics) {
  if (values.length > 64) diagnostics.push({
    code: "INVALID_INPUT",
    message: "Command references must remain bounded.",
    path
  });
  values.forEach((value, index) => validateId(value, `${path}[${index}]`, diagnostics));
}
function createSnsPostCommand(input) {
  const diagnostics = [];
  validateId(input.commandId, "commandId", diagnostics);
  validateId(input.postId, "postId", diagnostics);
  validateId(input.shareCommandId, "shareCommandId", diagnostics);
  validateId(input.resourceId, "resourceId", diagnostics);
  validateRevision(input.expectedRevision, "expectedRevision", diagnostics);
  validateText(input.caption, "caption", diagnostics);
  validateReferences(input.references, "references", diagnostics);
  if (input.publicPath !== void 0 && !SAFE_PATH.test(input.publicPath)) diagnostics.push({
    code: "INVALID_INPUT",
    message: "Public paths must remain same-origin paths.",
    path: "publicPath"
  });
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
      references: [
        ...input.references
      ],
      ...input.publicPath === void 0 ? {} : {
        publicPath: input.publicPath
      }
    }
  });
}
function createAdminProjectionCommand(input) {
  const diagnostics = [];
  validateId(input.commandId, "commandId", diagnostics);
  validateId(input.projectionId, "projectionId", diagnostics);
  validateId(input.scopeReference, "scopeReference", diagnostics);
  validateRevision(input.expectedRevision, "expectedRevision", diagnostics);
  if (input.requestedCapability !== void 0) validateCode(input.requestedCapability, "requestedCapability", diagnostics);
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
      ...input.requestedCapability === void 0 ? {} : {
        requestedCapability: input.requestedCapability
      }
    }
  });
}
function createAdminAuditCommand(input) {
  const diagnostics = [];
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
    input: {
      auditId: input.auditId,
      targetReference: input.targetReference,
      operation: input.operation,
      reasonCode: input.reasonCode
    }
  });
}
function createModerationCommand(input) {
  const diagnostics = [];
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
    input: {
      caseId: input.caseId,
      targetReference: input.targetReference,
      action: input.action,
      reasonCode: input.reasonCode,
      evidenceReferences: [
        ...input.evidenceReferences
      ]
    }
  });
}
export {
  FP003Z_BROWSER_COMMAND_SCHEMA_VERSION,
  createAdminAuditCommand,
  createAdminProjectionCommand,
  createModerationCommand,
  createSnsPostCommand
};
