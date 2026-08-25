import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");
const exists = (relative) => fs.existsSync(path.join(root, relative));

const current = {
  artifact: "pixiedraw2/dist/draw2-entry.js",
  source: "pixiedraw2/src/draw2-entry.ts",
  expectedExports: ["EditorCore", "createProject", "bootstrapDraw2Workspace"],
};
const legacy = [210, 220, 230, 240, 250].map((wp) => ({
  workPackage: `WP-${wp}`,
  artifact: fs.existsSync(path.join(root, "pixiedraw2/dist"))
    ? fs.readdirSync(path.join(root, "pixiedraw2/dist")).find((name) => name.startsWith(`wp${wp}-`)) ?? null
    : null,
}));

const failures = [];
const addFailure = (code, message, target = current.artifact) => failures.push({ code, message, target });

if (!exists("pixiedraw2/index.html")) addFailure("ENTRY_MISSING", "pixiedraw2/index.html is missing.", "pixiedraw2/index.html");
else if (!read("pixiedraw2/index.html").includes(`./${current.artifact.replace("pixiedraw2/", "")}`)) {
  addFailure("CANONICAL_ROUTE_MISMATCH", "index.html does not reference the declared canonical Draw2 artifact.", "pixiedraw2/index.html");
}

if (!exists(current.artifact)) addFailure("ARTIFACT_MISSING", "Current release-bound dist artifact is missing.");
else {
  const source = read(current.source);
  const artifact = read(current.artifact);
  const trimmed = artifact.trim();
  // The real editor contains ordinary HTML attributes and option text such as
  // `placeholder`; only reject explicit artifact markers, not valid UI copy.
  if (trimmed.length < 256 || /(?:placeholder artifact|stub bundle|this build is a placeholder)/i.test(trimmed)) {
    addFailure("PLACEHOLDER_ARTIFACT", "Current dist artifact is empty, unusually small, or contains placeholder markers.");
  }
  for (const expected of current.expectedExports) {
    if (!source.includes(expected) || !artifact.includes(expected)) {
      addFailure("EXPECTED_EXPORT_MISSING", `Expected runtime/export marker is absent: ${expected}.`);
    }
  }
  const provenanceMarkers = [...source.matchAll(/(?:^|\n)import\s+(?!type\s+)[^;]+?from\s+["'](\.\/[^"']+)["'];?/g)]
    .map((match) => match[1])
    .concat(["./draw2-entry.ts"]);
  for (const marker of new Set(provenanceMarkers)) {
    if (!artifact.includes(`// src/${marker.slice(2)}`)) {
      addFailure("SOURCE_DIST_PROVENANCE_MISSING", `Bundle lacks the deterministic source banner for ${marker}.`);
    }
  }
}

const status = failures.length > 0 ? "BLOCKED" : "PASS";
const result = {
  verifier: "pixiedraw2-release-integrity",
  status,
  canonical: {
    index: "pixiedraw2/index.html",
    artifact: current.artifact,
    source: current.source,
    checked: true,
  },
  failures,
  legacyAuditInputs: legacy.map((item) => ({ ...item, status: "LEGACY_NOT_CANONICAL" })),
  notes: [
    "This verifier is file-level and does not rebuild, delete, deploy, or qualify production routes.",
    "A placeholder or an artifact without source-to-dist provenance cannot produce release PASS.",
  ],
};
console.log(JSON.stringify(result, null, 2));
process.exitCode = status === "PASS" ? 0 : 1;
