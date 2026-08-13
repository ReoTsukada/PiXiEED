/**
 * FP-007 explicit schema compatibility evaluation.
 *
 * Compatibility is evaluated from two registered canonical records. This
 * module never decodes an unregistered caller object and never treats a
 * legacy format as implicitly convertible to a current format.
 */

import {
  type CanonicalSchemaRecord,
  type SchemaCompatibilityMode,
  type SchemaDiagnostic,
  type SchemaFieldDefinition,
  schemaIdentity,
  SchemaRegistry,
  type SchemaResult,
} from "./schema-registry.ts";

export type SchemaChangeKind =
  | "FIELD_ADDED"
  | "FIELD_REMOVED"
  | "FIELD_RENAMED_OR_REPLACED"
  | "FIELD_TYPE_CHANGED"
  | "FIELD_REQUIREDNESS_CHANGED"
  | "FIELD_NULLABILITY_CHANGED";

export interface SchemaChange {
  readonly kind: SchemaChangeKind;
  readonly field?: string;
  readonly fromField?: string;
  readonly toField?: string;
  readonly from?: SchemaFieldDefinition;
  readonly to?: SchemaFieldDefinition;
  readonly backwardCompatible: boolean;
  readonly forwardCompatible: boolean;
}
export type CompatibilityDiagnosticCode =
  | "SCHEMA_NAME_MISMATCH"
  | "SCHEMA_FAMILY_MISMATCH"
  | "LEGACY_ADAPTER_REQUIRED"
  | "COMPATIBILITY_VIOLATION"
  | "MIGRATION_OR_ADAPTER_REQUIRED"
  | "MIGRATION_OR_ADAPTER_NOT_REGISTERED";

export interface CompatibilityDiagnostic {
  readonly code: CompatibilityDiagnosticCode;
  readonly message: string;
  readonly path?: string;
}

export interface SchemaCompatibilityReport {
  readonly from: CanonicalSchemaRecord;
  readonly to: CanonicalSchemaRecord;
  readonly mode: SchemaCompatibilityMode;
  readonly changes: readonly SchemaChange[];
  readonly adapted: boolean;
  readonly legacyConversion: false;
}

export type SchemaCompatibilityResult =
  | {
    readonly ok: true;
    readonly value: SchemaCompatibilityReport;
    readonly diagnostics: readonly CompatibilityDiagnostic[];
  }
  | {
    readonly ok: false;
    readonly diagnostics:
      readonly (CompatibilityDiagnostic | SchemaDiagnostic)[];
  };

function failure(
  diagnostics: readonly (CompatibilityDiagnostic | SchemaDiagnostic)[],
): SchemaCompatibilityResult {
  return { ok: false, diagnostics };
}

function success(
  value: SchemaCompatibilityReport,
  diagnostics: readonly CompatibilityDiagnostic[] = [],
): SchemaCompatibilityResult {
  return { ok: true, value, diagnostics };
}

function compareStable(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function fieldDefinitionEqual(
  left: SchemaFieldDefinition,
  right: SchemaFieldDefinition,
): boolean {
  return left.type === right.type && left.required === right.required &&
    left.nullable === right.nullable && left.hasDefault === right.hasDefault;
}

function addChange(changes: SchemaChange[], change: SchemaChange): void {
  changes.push(change);
}

function detectChanges(
  from: CanonicalSchemaRecord,
  to: CanonicalSchemaRecord,
): readonly SchemaChange[] {
  const fromNames = Object.keys(from.fields).sort(compareStable);
  const toNames = Object.keys(to.fields).sort(compareStable);
  const fromOnly = fromNames.filter((name) => !(name in to.fields));
  const toOnly = toNames.filter((name) => !(name in from.fields));
  const changes: SchemaChange[] = [];

  // A simultaneous remove/add is intentionally classified as a possible
  // rename/replacement. The registry cannot infer a rename safely.
  const renamePairs = Math.min(fromOnly.length, toOnly.length);
  for (let index = 0; index < renamePairs; index += 1) {
    const fromField = fromOnly[index];
    const toField = toOnly[index];
    if (fromField === undefined || toField === undefined) continue;
    const fromDefinition = from.fields[fromField];
    const toDefinition = to.fields[toField];
    if (fromDefinition === undefined || toDefinition === undefined) continue;
    addChange(changes, {
      kind: "FIELD_RENAMED_OR_REPLACED",
      fromField,
      toField,
      from: fromDefinition,
      to: toDefinition,
      backwardCompatible: false,
      forwardCompatible: false,
    });
  }
  for (const field of fromOnly.slice(renamePairs)) {
    const fromDefinition = from.fields[field];
    if (fromDefinition === undefined) continue;
    addChange(changes, {
      kind: "FIELD_REMOVED",
      field,
      from: fromDefinition,
      backwardCompatible: !fromDefinition.required,
      forwardCompatible: true,
    });
  }
  for (const field of toOnly.slice(renamePairs)) {
    const toDefinition = to.fields[field];
    if (toDefinition === undefined) continue;
    addChange(changes, {
      kind: "FIELD_ADDED",
      field,
      to: toDefinition,
      backwardCompatible: !toDefinition.required,
      forwardCompatible: !toDefinition.required || toDefinition.hasDefault,
    });
  }

  for (const field of fromNames) {
    if (!(field in to.fields)) continue;
    const fromDefinition = from.fields[field];
    const toDefinition = to.fields[field];
    if (fromDefinition === undefined || toDefinition === undefined) continue;
    if (fromDefinition.type !== toDefinition.type) {
      addChange(changes, {
        kind: "FIELD_TYPE_CHANGED",
        field,
        from: fromDefinition,
        to: toDefinition,
        backwardCompatible: false,
        forwardCompatible: false,
      });
      continue;
    }
    if (fromDefinition.required !== toDefinition.required) {
      const madeOptional = fromDefinition.required && !toDefinition.required;
      addChange(changes, {
        kind: "FIELD_REQUIREDNESS_CHANGED",
        field,
        from: fromDefinition,
        to: toDefinition,
        backwardCompatible: madeOptional ? false : true,
        forwardCompatible: madeOptional ? true : toDefinition.hasDefault,
      });
    }
    if (fromDefinition.nullable !== toDefinition.nullable) {
      const madeNonNullable = fromDefinition.nullable && !toDefinition.nullable;
      addChange(changes, {
        kind: "FIELD_NULLABILITY_CHANGED",
        field,
        from: fromDefinition,
        to: toDefinition,
        backwardCompatible: madeNonNullable,
        forwardCompatible: !madeNonNullable,
      });
    }
    // hasDefault is intentionally not a standalone incompatibility. It is
    // consumed by the required-field forward-compatibility rule above.
    if (fieldDefinitionEqual(fromDefinition, toDefinition)) continue;
  }
  return changes;
}

function modeAccepts(
  change: SchemaChange,
  mode: SchemaCompatibilityMode,
): boolean {
  if (mode === "backward") return change.backwardCompatible;
  if (mode === "forward") return change.forwardCompatible;
  return change.backwardCompatible && change.forwardCompatible;
}

function resolvePair(
  registry: SchemaRegistry,
  fromIdentity: unknown,
  toIdentity: unknown,
): SchemaResult<
  { readonly from: CanonicalSchemaRecord; readonly to: CanonicalSchemaRecord }
> {
  const from = registry.resolve(fromIdentity);
  if (!from.ok) return from;
  const to = registry.resolve(toIdentity);
  if (!to.ok) return to;
  return {
    ok: true,
    value: { from: from.value, to: to.value },
    diagnostics: [],
  };
}

export function checkSchemaCompatibility(
  registry: SchemaRegistry,
  fromIdentity: unknown,
  toIdentity: unknown,
): SchemaCompatibilityResult {
  const pair = resolvePair(registry, fromIdentity, toIdentity);
  if (!pair.ok) return failure(pair.diagnostics);
  const { from, to } = pair.value;
  if (from.name !== to.name) {
    const legacyInvolved = from.schemaFamily === "LEGACY" ||
      to.schemaFamily === "LEGACY";
    return failure([{
      code: legacyInvolved ? "LEGACY_ADAPTER_REQUIRED" : "SCHEMA_NAME_MISMATCH",
      message: legacyInvolved
        ? "Legacy and canonical schemas require an explicit adapter operation; compatibility never converts them implicitly."
        : "Schema compatibility can only compare versions of the same schema name.",
      path: "schema.name",
    }]);
  }
  if (from.schemaFamily !== "CANONICAL" || to.schemaFamily !== "CANONICAL") {
    return failure([{
      code: "SCHEMA_FAMILY_MISMATCH",
      message:
        "Legacy schema records are isolated from canonical compatibility checks.",
      path: "schema.schemaFamily",
    }]);
  }

  const mode = to.compatibilityMode;
  const changes = detectChanges(from, to);
  const incompatible = changes.filter((change) => !modeAccepts(change, mode));
  if (incompatible.length === 0) {
    return success({
      from,
      to,
      mode,
      changes,
      adapted: false,
      legacyConversion: false,
    });
  }

  if (to.migrationOrAdapterId === null) {
    return failure([{
      code: "MIGRATION_OR_ADAPTER_REQUIRED",
      message:
        `Schema changes violate declared ${mode} compatibility and require an explicit migration or adapter.`,
      path: "schema.migrationOrAdapterId",
    }, {
      code: "COMPATIBILITY_VIOLATION",
      message:
        `Schema has ${incompatible.length} incompatible change(s) under ${mode} mode.`,
      path: "schema.fields",
    }]);
  }
  if (!registry.hasRegisteredMigrationOrAdapter(to.migrationOrAdapterId)) {
    return failure([{
      code: "MIGRATION_OR_ADAPTER_NOT_REGISTERED",
      message:
        "The declared migration or adapter is not present in the canonical registry.",
      path: "schema.migrationOrAdapterId",
    }]);
  }
  return success({
    from,
    to,
    mode,
    changes,
    adapted: true,
    legacyConversion: false,
  }, [{
    code: "COMPATIBILITY_VIOLATION",
    message:
      `Incompatible schema changes are accepted only through registered adapter ${to.migrationOrAdapterId}.`,
    path: "schema.migrationOrAdapterId",
  }]);
}
