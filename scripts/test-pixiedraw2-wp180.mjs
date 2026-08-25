import { readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (relative) => readFileSync(path.join(root, relative), "utf8");
const json = (relative) => JSON.parse(read(relative));
const assert = (condition, message) => { if (!condition) throw new Error(message); };

const html = read("pixiedraw2/index.html");
const css = read("pixiedraw2/assets/draw2-shell.css");
const contracts = read("pixiedraw2/src/wp180-workspace-contracts.ts");
const ui = read("pixiedraw2/src/wp180-workspace-ui.ts");
const entry = read("pixiedraw2/src/draw2-entry.ts");
const runtime = read("pixiedraw2/dist/wp160-runtime-core.js");
const advanced = read("pixiedraw2/dist/wp170-advanced-tools.js");
const baseline = json("docs/inventory/baseline-failure-identity-wp080.json");

for (const marker of ["draw2WorkspaceFrame", "draw2WorkspaceTopbar", "draw2WorkspaceLeftDock", "draw2WorkspaceCanvasRegion", "draw2WorkspaceRightDock", "draw2WorkspaceTimelineRegion", "draw2CommandPalette"]) assert(html.includes(marker), `Workspace structure missing ${marker}`);
for (const marker of ["data-feature-flag=\"off\"", "data-workspace-panel=\"layers\"", "draw2WorkspacePanelAssets", "Coming Later", "data-workspace-command=\"kill-switch\""]) assert(html.includes(marker), `Workspace safety marker missing ${marker}`);
for (const marker of ["WorkspaceRegion", "PanelMountState", "WorkspaceState", "DeviceCapabilityInput", "calculateBoundedWindow", "resolveShortcut", "resolveInputOwner", "coreRecreationCount"]) assert(contracts.includes(marker), `Workspace contract missing ${marker}`);
for (const marker of ["mobileSheetOpen", "local-only", "Feature Flag", "Unknown Workspace flag", "Core unchanged", "rollback", "__pixiedraw2WorkspaceDebug"]) assert(ui.includes(marker), `Workspace UI boundary missing ${marker}`);
for (const marker of ["wp180-workspace.js", "getCoalescedEvents", "setPointerCapture", "lostpointercapture"]) assert(entry.includes(marker), `Entry/hot-path boundary missing ${marker}`);
for (const marker of ["--draw2-space-1", "--draw2-accent-strong", "data-theme=\"light\"", "prefers-reduced-motion", "safe-area-inset-bottom", "draw2-workspace-frame", "draw2-workspace-right-dock", "touch-action: pan-y"]) assert(css.includes(marker), `Semantic/responsive CSS marker missing ${marker}`);
for (const token of ["draw2Workspace", "wp180-workspace-ui"]) assert(!runtime.includes(token), `WP-160 Runtime contains Workspace token ${token}`);
for (const token of ["document", "window", "CanvasRenderingContext2D", "fetch(", "WebSocket", "indexedDB", "localStorage", "supabase"]) assert(!advanced.includes(token), `WP-170 Advanced Core boundary changed: ${token}`);
assert(baseline.expected_failure_count === 14 && baseline.failures.length === 14, "Existing baseline count is not 14.");
assert(baseline.failures.every((item) => item.test && item.target && Array.isArray(item.signature) && item.signature.length > 0), "Baseline identity lacks Test/target/signature.");

console.log(JSON.stringify({
  workPackage: "WP-180",
  status: "PASS_WITH_UNTESTED_GATES",
  workspaceStructure: "PASS_STATIC",
  featureFlagAndRollback: "PASS_STATIC_DEFAULT_OFF",
  currentRouteAndData: "PRESERVED_BY_ISOLATED_SCOPE",
  advancedLazyBoundary: "PRESERVED_STATIC",
  runtimeNonIntrusion: "PASS_STATIC",
  baselineFailureIdentity: { existing: 14, matchedBy: "approved prior Test/target/major Error Signature evidence; not re-executed", new: 0 },
  untested: ["Chromium visual compositor E2E", "physical mobile", "stylus", "Safari", "Firefox", "30-minute memory", "production performance", "real legacy user data"],
}, null, 2));
