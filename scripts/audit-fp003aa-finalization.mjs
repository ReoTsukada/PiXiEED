#!/usr/bin/env node
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const read = (relativePath) =>
  readFileSync(join(root, relativePath), "utf8");
const exists = (relativePath) => existsSync(join(root, relativePath));
const config = JSON.parse(read("pixiedraw2/deno.json"));

const releaseRoot = read("pixiedraw2/src/server/authority-composition-root.ts");
assert.match(
  releaseRoot,
  /export const fp003zHandler = defaultComposition\.handler/u,
  "Release Root must expose the fixed Handler.",
);
for (const pattern of [
  /export function\s+createServerAuthorityCompositionRoot/u,
  /export const fp003zService/u,
  /export function\s+createServerAuthorityHandler/u,
  /export function\s+composeAuthorityService/u,
]) {
  assert.doesNotMatch(
    releaseRoot,
    pattern,
    "Release Root must not expose a DI or Service bypass.",
  );
}

const browserEntries = readdirSync(join(root, "pixiedraw2/src"))
  .filter((file) => file.endsWith("bundle-entry.ts"))
  .map((file) => `pixiedraw2/src/${file}`);
const forbiddenImports = [
  "src/server/",
  "authority-composition-root",
  "authority-composition-internal",
  "authenticated-context",
  "createServerAuthPrincipalProvider",
];
for (const entry of browserEntries) {
  const source = read(entry);
  for (const token of forbiddenImports) {
    assert.equal(source.includes(token), false, `${entry} exposes ${token}`);
  }
}

const distFiles = readdirSync(join(root, "pixiedraw2/dist"))
  .filter((file) => /\.(?:js|mjs)$/u.test(file))
  .map((file) => `pixiedraw2/dist/${file}`)
  .sort();
const serverTokens = [
  "SERVER_AUTHORITY_REQUEST_CONTEXT_V1",
  "SERVER_AUTHORITY_CONTEXT_SOURCE",
  "createServerAuthPrincipalProvider",
  "authority-composition-root.ts",
  "authority-composition-internal.ts",
  "authenticated-context.ts",
];
for (const artifact of distFiles) {
  const source = read(artifact);
  for (const token of serverTokens) {
    assert.equal(source.includes(token), false, `${artifact} contains ${token}`);
  }
}

const buildTasks = Object.entries(config.tasks ?? {})
  .filter(([task]) => task.startsWith("build"))
  .map(([task, command]) => ({ task, command }));
for (const { task, command } of buildTasks) {
  assert.equal(
    /src\/server\//u.test(command),
    false,
    `${task} must not bundle src/server files.`,
  );
}

const staticRootSourceExposure = [
  "pixiedraw2/src/server/internal/authenticated-context.ts",
  "pixiedraw2/src/server/authority-composition-root.ts",
  "pixiedraw2/tests/fixtures/fp003aa-server-auth-fixture.ts",
].filter(exists);

console.log(JSON.stringify({
  releaseRootHandlerOnly: true,
  browserEntriesChecked: browserEntries.length,
  distArtifactsChecked: distFiles.length,
  buildTasksChecked: buildTasks.length,
  serverImplementationInBrowserArtifacts: false,
  staticRootSourceExposure: staticRootSourceExposure.length === 0
    ? "NONE"
    : "P1_REVIEW_REQUIRED",
  staticRootSourcePaths: staticRootSourceExposure,
  productionDeployment: "UNTESTED",
}, null, 2));
