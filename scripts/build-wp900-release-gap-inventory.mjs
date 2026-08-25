import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const inventoryDirectory = path.join(root, "docs/inventory");
const outputRelative = "docs/inventory/wp900-aggregated-release-gaps.json";
const outputPath = path.join(root, outputRelative);
const checkOnly = process.argv.includes("--check");
const statusPattern = /\b(?:UNTESTED|PARTIAL|DECISION_PENDING|BLOCKED|UNKNOWN)\b/i;
const isOwnArtifact = (name) => name.startsWith("wp900-");

function collectJsonFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json") && !isOwnArtifact(entry.name))
    .map((entry) => path.join(directory, entry.name))
    .sort((left, right) => left.localeCompare(right));
}

function collectStatusReferences(value, valuePath = [], output = []) {
  if (typeof value === "string") {
    if (statusPattern.test(value)) output.push({ path: valuePath.join("."), status: value });
    return output;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => collectStatusReferences(item, [...valuePath, String(index)], output));
    return output;
  }
  if (value !== null && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) collectStatusReferences(item, [...valuePath, key], output);
  }
  return output;
}

const markdownGaps = [
  {
    id: "current-production-live-state",
    status: "UNKNOWN",
    gate: "G6",
    source: "docs/inventory/current-production-boundaries.md",
    title: "Live Production row/object counts, Stripe replay state, deployed cache identity, native signing, and device behavior are repository-only unknowns."
  },
  {
    id: "pixisync-live-coexistence",
    status: "UNTESTED",
    gate: "G4",
    source: "docs/inventory/pixisync-data-contracts.md",
    title: "Old/new client coexistence, live reorder/delay, Checkpoint object authorization, and Production row/object counts are not proven."
  },
  {
    id: "market-live-contract",
    status: "UNKNOWN",
    gate: "G4",
    source: "docs/inventory/market-data-contracts.md",
    title: "Live RLS behavior, Storage objects, Stripe replay state, and Production row counts remain unknown."
  },
  {
    id: "workspace-pointer-device",
    status: "UNTESTED",
    gate: "G2",
    source: "docs/inventory/wp180-interaction-audit.md",
    title: "Physical Pointer/Touch/Stroke and Canvas visible-input end-to-end evidence is absent."
  },
  {
    id: "aseprite-operation-completeness",
    status: "PARTIAL",
    gate: "G2",
    source: "docs/inventory/wp190-aseprite-ux-audit.md",
    title: "Dedicated Line UI, full playback UX, shortcut finalization, temporary tool switching, and device end-to-end evidence remain incomplete."
  },
  {
    id: "mobile-comparison-interaction-count",
    status: "UNTESTED",
    gate: "G2",
    source: "docs/inventory/wp190-mobile-comparison.md",
    title: "Current PiXiEEDraw versus Draw2 real-device interaction-count comparison is not measured."
  }
];

const sourceFiles = collectJsonFiles(inventoryDirectory);
const sourceStatusReferences = sourceFiles.flatMap((sourcePath) => {
  const relative = path.relative(root, sourcePath);
  const parsed = JSON.parse(fs.readFileSync(sourcePath, "utf8"));
  return collectStatusReferences(parsed).map((reference) => ({ source: relative, ...reference }));
}).sort((left, right) => `${left.source}:${left.path}`.localeCompare(`${right.source}:${right.path}`));

const aggregate = {
  schemaVersion: 1,
  workPackage: "WP-900",
  status: "AGGREGATED_EXISTING_GAPS_NOT_REVALIDATED",
  sourceSnapshotDate: "2026-08-09",
  derivation: "Deterministic scan of existing top-level docs/inventory JSON status strings plus curated Markdown Gap entries. It copies status evidence and does not promote, suppress, or reinterpret a predecessor result.",
  sourceInventoryFiles: sourceFiles.map((sourcePath) => path.relative(root, sourcePath)),
  sourceInventoryCount: sourceFiles.length,
  sourceStatusReferences,
  sourceStatusReferenceCount: sourceStatusReferences.length,
  curatedMarkdownGaps: markdownGaps,
  statusPreservation: "SOURCE_STATUS_UNCHANGED",
  validationStatus: "DEFINITION_ONLY_NO_GATE_EXECUTION"
};
const serialized = `${JSON.stringify(aggregate, null, 2)}\n`;

if (checkOnly) {
  if (!fs.existsSync(outputPath)) throw new Error(`Missing aggregated WP-900 gap inventory: ${outputRelative}`);
  const current = fs.readFileSync(outputPath, "utf8");
  if (current !== serialized) throw new Error("WP-900 aggregated Gap Inventory is stale; run node scripts/build-wp900-release-gap-inventory.mjs.");
  console.log(JSON.stringify({ workPackage: "WP-900", status: "PASS_DEFINITION_GAP_AGGREGATE_CURRENT", sourceInventoryCount: aggregate.sourceInventoryCount, sourceStatusReferenceCount: aggregate.sourceStatusReferenceCount, curatedMarkdownGapCount: aggregate.curatedMarkdownGaps.length }, null, 2));
} else {
  fs.writeFileSync(outputPath, serialized);
  console.log(JSON.stringify({ workPackage: "WP-900", status: "BUILT_EXISTING_GAP_AGGREGATE", output: outputRelative, sourceInventoryCount: aggregate.sourceInventoryCount, sourceStatusReferenceCount: aggregate.sourceStatusReferenceCount, curatedMarkdownGapCount: aggregate.curatedMarkdownGaps.length }, null, 2));
}
