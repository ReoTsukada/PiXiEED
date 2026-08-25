#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const core = path.join(root, "16_IMPLEMENTATION_STARTER", "reference-core");

function resolveRef(schema, ref) {
  assert.ok(ref.startsWith("#/"), `only local refs are supported: ${ref}`);
  return ref.slice(2).split("/").reduce((value, key) => value[key], schema);
}

function validate(value, schema, rootSchema = schema, location = "$") {
  if (schema.$ref) return validate(value, resolveRef(rootSchema, schema.$ref), rootSchema, location);
  if (schema.const !== undefined && JSON.stringify(value) !== JSON.stringify(schema.const)) {
    return [`${location}: const`];
  }
  if (schema.type === "object") {
    if (!value || typeof value !== "object" || Array.isArray(value)) return [`${location}: object`];
    const errors = [];
    for (const key of schema.required || []) {
      if (!Object.prototype.hasOwnProperty.call(value, key)) errors.push(`${location}.${key}: required`);
    }
    const properties = schema.properties || {};
    if (schema.additionalProperties === false) {
      for (const key of Object.keys(value)) {
        if (!Object.prototype.hasOwnProperty.call(properties, key)) errors.push(`${location}.${key}: additional`);
      }
    }
    for (const [key, child] of Object.entries(properties)) {
      if (Object.prototype.hasOwnProperty.call(value, key)) errors.push(...validate(value[key], child, rootSchema, `${location}.${key}`));
    }
    if (schema.additionalProperties && typeof schema.additionalProperties === "object") {
      for (const [key, childValue] of Object.entries(value)) {
        if (!Object.prototype.hasOwnProperty.call(properties, key)) errors.push(...validate(childValue, schema.additionalProperties, rootSchema, `${location}.${key}`));
      }
    }
    return errors;
  }
  if (schema.type === "array") {
    if (!Array.isArray(value)) return [`${location}: array`];
    const errors = [];
    if (schema.minItems !== undefined && value.length < schema.minItems) errors.push(`${location}: minItems`);
    if (schema.maxItems !== undefined && value.length > schema.maxItems) errors.push(`${location}: maxItems`);
    if (schema.uniqueItems && new Set(value.map(item => JSON.stringify(item))).size !== value.length) errors.push(`${location}: uniqueItems`);
    if (schema.items) value.forEach((item, index) => errors.push(...validate(item, schema.items, rootSchema, `${location}[${index}]`)));
    return errors;
  }
  if (schema.type === "string") {
    if (typeof value !== "string") return [`${location}: string`];
    const errors = [];
    if (schema.minLength !== undefined && value.length < schema.minLength) errors.push(`${location}: minLength`);
    if (schema.pattern && !(new RegExp(schema.pattern, "u").test(value))) errors.push(`${location}: pattern`);
    return errors;
  }
  if (schema.type === "integer") {
    if (!Number.isInteger(value)) return [`${location}: integer`];
    if (schema.minimum !== undefined && value < schema.minimum) return [`${location}: minimum`];
    if (schema.maximum !== undefined && value > schema.maximum) return [`${location}: maximum`];
    return [];
  }
  if (schema.type === "number") {
    if (typeof value !== "number" || !Number.isFinite(value)) return [`${location}: number`];
    if (schema.minimum !== undefined && value < schema.minimum) return [`${location}: minimum`];
    if (schema.maximum !== undefined && value > schema.maximum) return [`${location}: maximum`];
    return [];
  }
  return [];
}

const cases = [
  ["command-envelope-v1.schema.json", "command-envelope-v1.valid.json"],
  ["canonical-operation-v1.schema.json", "canonical-operation-v1.valid.json"],
  ["project-state-v1.schema.json", "project-state-v1.valid.json"],
  ["pxd-manifest-v1.schema.json", "pxd-manifest-v1.valid.json"],
];

const readJson = file => JSON.parse(fs.readFileSync(file, "utf8"));
for (const [schemaName, fixtureName] of cases) {
  const schema = readJson(path.join(core, "schemas", schemaName));
  const fixture = readJson(path.join(core, "fixtures", fixtureName));
  assert.deepEqual(validate(fixture, schema), [], `${fixtureName} should validate`);
}

const fixture = name => readJson(path.join(core, "fixtures", name));
const schema = name => readJson(path.join(core, "schemas", name));
const invalid = (schemaName, value, label) => assert.notDeepEqual(validate(value, schema(schemaName)), [], `${label} should fail`);

const command = fixture("command-envelope-v1.valid.json");
delete command.assetId;
invalid("command-envelope-v1.schema.json", command, "missing command asset");
invalid("command-envelope-v1.schema.json", { ...fixture("command-envelope-v1.valid.json"), schemaVersion: 2 }, "unsupported command version");

invalid("canonical-operation-v1.schema.json", { ...fixture("canonical-operation-v1.valid.json"), operationId: "op_invalid" }, "invalid operation id");
invalid("canonical-operation-v1.schema.json", { ...fixture("canonical-operation-v1.valid.json"), unexpected: true }, "unknown operation field");

const state = fixture("project-state-v1.valid.json");
state.assets["asset-1"].pixels.data = [256];
invalid("project-state-v1.schema.json", state, "invalid pixel byte");
invalid("project-state-v1.schema.json", { ...fixture("project-state-v1.valid.json"), schemaVersion: 2 }, "unsupported state version");

invalid("pxd-manifest-v1.schema.json", { ...fixture("pxd-manifest-v1.valid.json"), format: "pixieedraw" }, "unsupported manifest format");
invalid("pxd-manifest-v1.schema.json", { ...fixture("pxd-manifest-v1.valid.json"), extra: true }, "unknown manifest field");

const types = fs.readFileSync(path.join(core, "src", "types.ts"), "utf8");
for (const name of ["Diagnostic", "ProjectState", "CommandEnvelope", "CanonicalOperation", "CommandResult", "CommandHandler"]) {
  assert.match(types, new RegExp(`export (type|interface) ${name}\\b`), `types.ts exports ${name}`);
}

console.log(JSON.stringify({ workPackage: "WP-010", schemasValidated: cases.length, invalidCasesValidated: 8, status: "pass" }, null, 2));
