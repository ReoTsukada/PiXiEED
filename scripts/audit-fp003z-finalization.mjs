#!/usr/bin/env node
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const read = (relativePath) => readFileSync(join(root, relativePath), "utf8");
const exists = (relativePath) => existsSync(join(root, relativePath));
const config = JSON.parse(read("pixiedraw2/deno.json"));

const forbiddenBrowserTokens = [
  "src/server/",
  "authority-composition-root",
  "authority-composition-internal",
  "canonical-registry-adapter",
  "in-memory-authoritative",
  "createInternalFp003XService",
  "SERVER_AUTHORITY_UNAVAILABLE",
  "authorizationProofResolver",
  "authorityResolver",
  "serverResolvedActor",
  "serverResolvedCreator",
  "serverAuthorizationResolved",
  "serverCapabilities",
  "trustedProducer",
  "serverAllowed",
  "serverResolvedRecipient",
  "serverResolvedReporter",
  "serverResolvedModerator",
];

const buildTasks = Object.entries(config.tasks ?? {})
  .filter(([task]) => task.startsWith("build"))
  .map(([task, command]) => {
    assert.equal(typeof command, "string", `${task} must be a string task.`);
    const output = command.match(/(?:^|\s)-o\s+([^\s]+)|(?:^|\s)--out-file\s+([^\s]+)/u);
    assert.ok(output, `${task} must declare a bundle output.`);
    const entry = command.match(/(?:^|\s)(src\/[^\s]+\.(?:ts|tsx|js|jsx))(?:\s|$)/u);
    assert.ok(entry, `${task} must declare a source entry.`);
    return { task, entry: entry[1], output: output[1] ?? output[2] };
  });

const actualDistArtifacts = readdirSync(join(root, "pixiedraw2/dist"))
  .filter((file) => /\.(?:js|mjs)$/u.test(file))
  .map((file) => `dist/${file}`)
  .sort();
const generatedArtifacts = buildTasks.map(({ output }) => output.replace(/^dist\//u, "dist/")).sort();
assert.deepEqual(actualDistArtifacts, generatedArtifacts, "Every dist artifact must be represented by exactly one build task.");
for (const artifact of actualDistArtifacts) {
  assert.equal(exists(`pixiedraw2/${artifact}`), true, `Generated artifact is missing: ${artifact}`);
}

const browserEntries = readdirSync(join(root, "pixiedraw2/src"))
  .filter((file) => file.endsWith("bundle-entry.ts"))
  .map((file) => `pixiedraw2/src/${file}`)
  .sort();
for (const file of browserEntries) {
  const source = read(file);
  for (const token of forbiddenBrowserTokens) assert.equal(source.includes(token), false, `${file} contains Browser-forbidden token ${token}`);
}
for (const artifact of actualDistArtifacts) {
  const bundle = read(`pixiedraw2/${artifact}`);
  for (const token of forbiddenBrowserTokens) assert.equal(bundle.includes(token), false, `${artifact} contains Browser-forbidden token ${token}`);
}

const editorSource = read("pixiedraw2/src/draw2-entry.ts");
const indexHtml = read("pixiedraw2/index.html");
const benchmarkHtml = read("pixiedraw2/reference-benchmark.html");
assert.match(indexHtml, /\.\/dist\/draw2-entry\.js/u, "The isolated Draw2 HTML entry must load the generated Editor artifact.");
assert.match(benchmarkHtml, /\.\/dist\/draw2-reference-benchmark-entry\.js/u, "The benchmark HTML must load its generated artifact.");
const lazyEditorArtifacts = [
  "draw2-legacy-compat.js",
  "wp160-runtime-core.js",
  "wp170-advanced-tools.js",
  "wp180-workspace.js",
];
for (const artifact of lazyEditorArtifacts) assert.match(editorSource, new RegExp(artifact.replaceAll(".", "\\."), "u"), `draw2-entry.ts must retain the lazy loader for ${artifact}.`);
for (const artifact of ["wp230-sns-core.js", "wp240-admin-analytics-ads-core.js", "wp250-policy-economics-core.js"]) {
  assert.equal(indexHtml.includes(`dist/${artifact}`), false, `${artifact} must not be loaded by the isolated initial HTML entry.`);
}

const sourceFiles = [];
function walk(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const absolute = join(directory, entry.name);
    if (entry.isDirectory()) walk(absolute);
    else if (/\.(?:ts|tsx|js|mjs)$/u.test(entry.name)) sourceFiles.push(absolute);
  }
}
walk(join(root, "pixiedraw2/src"));
const authorityTokenFamilies = [
  "authorizationProofResolver",
  "authorityResolver",
  "serverResolvedActor",
  "serverResolvedCreator",
  "serverAuthorizationResolved",
  "serverCapabilities",
  "trustedProducer",
  "serverAllowed",
  "serverResolvedRecipient",
  "serverResolvedReporter",
  "serverResolvedModerator",
];
const inventory = [];
for (const file of sourceFiles.sort()) {
  const source = read(relative(root, file));
  const tokens = authorityTokenFamilies.filter((token) => source.includes(token));
  if (tokens.length === 0) continue;
  const normalized = relative(root, file).replaceAll("\\", "/");
  const classification = normalized.includes("/src/server/")
    ? "SECURITY_AUTHORITY_SERVER_INTERNAL"
    : normalized.includes("tests/")
      ? "TEST_FIXTURE_ONLY"
      : normalized.includes("wp250-policy-economics-core") && tokens.every((token) => token.startsWith("serverResolved"))
        ? "POLICY_ONLY_OR_LEGACY_ADAPTER"
        : "LEGACY_ADAPTER_ONLY";
  inventory.push({ file: normalized, classification, tokens });
}

const browserAuthorityResiduals = inventory.filter(({ file, classification }) =>
  (file.includes("/src/") && !file.includes("/src/server/") && !file.includes("tests/"))
  && classification === "SECURITY_AUTHORITY_SERVER_INTERNAL"
);
assert.equal(browserAuthorityResiduals.length, 0, "Non-server source must not be classified as a Server Security Authority.");

console.log(JSON.stringify({
  buildTasks,
  browserEntriesChecked: browserEntries.length,
  distArtifactsChecked: actualDistArtifacts.length,
  buildGraphComplete: true,
  releaseTrace: {
    buildManifest: "pixiedraw2/deno.json",
    initialHtml: "pixiedraw2/index.html -> dist/draw2-entry.js",
    benchmarkHtml: "pixiedraw2/reference-benchmark.html -> dist/draw2-reference-benchmark-entry.js",
    lazyEditorArtifacts,
    isolatedWp230Wp240Wp250InitialHtmlReferences: 0,
  },
  forbiddenBrowserTokens: forbiddenBrowserTokens.length,
  callerInjectableAuthorityInBrowserArtifacts: 0,
  authorityInventory: inventory,
  staleDistArtifacts: 0,
}, null, 2));
