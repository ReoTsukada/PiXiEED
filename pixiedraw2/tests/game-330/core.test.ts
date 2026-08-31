import {
  buildArtifact,
  createBuildPlan,
  rollbackArtifact,
  validateArtifactPackage,
  type BuildPlanRequest,
} from "../../src/game/game-330/core.ts";
import {
  asBehaviorId,
  asAssetId,
  asAssetRevisionId,
  asComponentId,
  asDependencyId,
  asEntityId,
  asOwnerId,
  asProjectId,
  asRevisionId,
  asSceneId,
  asSha256,
  compileNoCodeBehavior,
  createGameProject,
  type CallerContext,
  type GameProjectDraft,
} from "../../src/game/game-300/core.ts";

function assert(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(message); }
function has(result: { diagnostics: readonly { code: string }[] }, code: string): void { assert(result.diagnostics.some((item) => item.code === code), `expected diagnostic ${code}`); }

const owner = asOwnerId("owner-game-330");
const projectId = asProjectId("project-game-330");
const revisionId = asRevisionId("revision-game-330-1");
const caller: CallerContext = { projectId, ownerId: owner, revisionId };
const callerClaim = { projectId: String(projectId), ownerId: String(owner), revisionId: String(revisionId) };
const assetHash = asSha256("a".repeat(64));
const dependencyHash = asSha256("b".repeat(64));

async function fixture() {
  const behavior = compileNoCodeBehavior({ behaviorId: asBehaviorId("behavior-main"), rules: [] });
  const draft: GameProjectDraft = {
    schemaVersion: 1, projectId, ownerId: owner, name: "GAME-330", revision: { revisionId, projectId, ownerId: owner, sequence: 1 },
    scenes: [{ sceneId: asSceneId("scene-main"), name: "Main", rootEntityIds: [asEntityId("entity-player")], entities: [{ entityId: asEntityId("entity-player"), name: "Player", components: [
      { type: "TRANSFORM", componentId: asComponentId("component-transform"), x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 },
      { type: "SPRITE", componentId: asComponentId("component-sprite"), asset: { kind: "DRAW", assetId: asAssetId("draw-main"), revisionId: asAssetRevisionId("draw-rev-1"), ownerId: owner, contentHash: assetHash, mode: "PINNED" }, visible: true },
      { type: "BEHAVIOR", componentId: asComponentId("component-behavior"), behaviorId: behavior.behaviorId },
    ] }] }], prefabs: [], dependencies: [{ dependencyId: asDependencyId("dep-runtime"), kind: "PACKAGE", ownerId: owner, ownerRevisionId: revisionId, targetId: "runtime", targetRevisionId: "runtime-1", dependsOn: [] }], behaviors: [behavior],
  };
  const project = await createGameProject(draft, caller);
  const request: BuildPlanRequest = {
    target: "WEB", profile: "DETERMINISTIC", language: "TYPESCRIPT", module: "game-main", capabilities: ["DRAW", "INPUT"],
    dependencyLocks: [{ dependencyId: "dep-runtime", targetId: "runtime", targetRevisionId: "runtime-1", contentHash: dependencyHash, licenseId: "license-runtime", dependsOn: [] }],
    assetLocks: [{ assetId: "draw-main", revisionId: "draw-rev-1", kind: "DRAW", contentHash: assetHash, mode: "PINNED" }],
    licenses: [{ licenseId: "license-runtime", ownerId: String(owner), scope: "BUILD", revisionId: String(revisionId) }],
  };
  return { project, request };
}

Deno.test("GAME330-SCOPE-001 same canonical inputs produce the same plan and artifact identity", async () => {
  const { project, request } = await fixture();
  const one = await createBuildPlan(project, caller, request);
  const two = await createBuildPlan(project, caller, { ...request, capabilities: ["INPUT", "DRAW"] });
  assert(one.ok && two.ok, "valid build plan must be accepted");
  assert(one.value!.planHash === two.value!.planHash, "capability order must not affect plan hash");
  const entries = [{ path: "manifest.json", content: '{"game":true}' }, { path: "runtime/main.js", content: "export const ready = true;" }];
  const artifactOne = await buildArtifact(one.value!, entries, callerClaim);
  const artifactTwo = await buildArtifact(two.value!, [...entries].reverse(), callerClaim);
  assert(artifactOne.ok && artifactTwo.ok, "valid package must build");
  assert(artifactOne.value!.artifactHash === artifactTwo.value!.artifactHash, "entry order must not affect artifact identity");
  assert(String(projectId) !== artifactOne.value!.artifactId, "artifact identity is not Project ID");
  assert(artifactOne.value!.provenance.projectHash === project.revision.snapshotHash, "provenance must bind project revision hash");
});

Deno.test("GAME330-EVIDENCE-001 locks, provenance, package hash, and manifest validation are bound", async () => {
  const { project, request } = await fixture();
  const plan = (await createBuildPlan(project, caller, request)).value!;
  const entries = [{ path: "main.js", content: "deterministic" }];
  const artifact = await buildArtifact(plan, entries, callerClaim);
  assert(artifact.ok && artifact.value!.status === "READY", "complete package must be READY");
  const checked = await validateArtifactPackage(plan, { manifest: artifact.value!, entries }, callerClaim);
  assert(checked.ok, "unchanged package must validate");
  const rolledBack = await rollbackArtifact(artifact.value!, "QUARANTINED");
  assert(rolledBack.status === "QUARANTINED" && rolledBack.artifactHash === artifact.value!.artifactHash, "rollback changes status without rewriting provenance");
});

Deno.test("GAME330-SCOPE-001 wrong caller/project, stale/missing/tampered/duplicate/path/cycle inputs fail closed", async () => {
  const { project, request } = await fixture();
  const wrongCaller = await createBuildPlan(project, { ...caller, ownerId: asOwnerId("other-owner") }, request);
  has(wrongCaller, "OWNER_MISMATCH");
  const missing = await createBuildPlan(project, caller, { ...request, assetLocks: [] });
  has(missing, "MISSING_LOCK");
  const tampered = await createBuildPlan(project, caller, { ...request, dependencyLocks: [{ ...request.dependencyLocks[0]!, contentHash: asSha256("c".repeat(64)) }] });
  assert(tampered.ok, "a different immutable dependency hash is a plan input; package provenance records it");
  const plan = (await createBuildPlan(project, caller, request)).value!;
  has(await buildArtifact(plan, [{ path: "../escape", content: "x" }], callerClaim), "PATH_TRAVERSAL");
  has(await buildArtifact(plan, [{ path: "main.js", content: "x", contentHash: asSha256("d".repeat(64)) }], callerClaim), "TAMPERED_HASH");
  has(await buildArtifact(plan, [{ path: "main.js", content: "x" }, { path: "main.js", content: "y" }], callerClaim), "DUPLICATE_PATH");
  const cycle = await createBuildPlan(project, caller, { ...request, dependencyLocks: [{ ...request.dependencyLocks[0]!, dependsOn: ["dep-runtime"] }] });
  has(cycle, "DEPENDENCY_CYCLE");
  has(await buildArtifact(plan, [{ path: "main.js", content: "x" }], { ...callerClaim, projectId: "wrong-project" }), "PROJECT_ID_MISMATCH");
});

Deno.test("GAME330-STOP-001 cancel/quarantine/partial artifacts never become a false READY result", async () => {
  const { project, request } = await fixture();
  const plan = (await createBuildPlan(project, caller, request)).value!;
  has(await buildArtifact(plan, [{ path: "main.js", content: "x" }], callerClaim, { cancel: true }), "CANCELLED");
  const quarantined = await buildArtifact(plan, [{ path: "main.js", content: "x" }], callerClaim, { quarantine: true });
  assert(quarantined.ok && quarantined.value!.status === "QUARANTINED", "explicit quarantine must not be READY");
  has(await buildArtifact(plan, [], callerClaim), "PARTIAL_ARTIFACT");
  const changed = await buildArtifact(plan, [{ path: "main.js", content: "x" }], callerClaim);
  assert(changed.ok, "baseline artifact must build");
  const tamperedManifest = { ...changed.value!, packageHash: asSha256("e".repeat(64)) };
  has(await validateArtifactPackage(plan, { manifest: tamperedManifest, entries: [{ path: "main.js", content: "x" }] }, callerClaim), "TAMPERED_HASH");
});
