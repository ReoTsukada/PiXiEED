import {
  COLLABORATION_EDIT_SCOPE_POLICIES,
  COLLABORATION_SCOPE_KEYS,
  editScopePolicyLabel,
  isCollaborationEditScopePolicy,
  isCollaborationScopeKey,
  isScopeActionableByMaster,
  isScopeActionableByParticipant,
  isScopeApproved,
  isScopeRemovalPending,
  scopeLabel,
} from "../../src/pixync/collaboration-scope.ts";

Deno.test("edit scope policy defaults to an explicit, non-blocking choice", () => {
  if (COLLABORATION_EDIT_SCOPE_POLICIES.join(",") !== "OPEN,ASSIGNED_ONLY") {
    throw new Error("Edit scope policy catalog is incorrect.");
  }
  if (
    !isCollaborationEditScopePolicy("OPEN") ||
    !isCollaborationEditScopePolicy("ASSIGNED_ONLY")
  ) {
    throw new Error("Edit scope policy validation is incorrect.");
  }
  if (
    isCollaborationEditScopePolicy("CASUAL") ||
    editScopePolicyLabel("NOPE") !== "自由に編集"
  ) {
    throw new Error("Unknown edit scope policies must fall back to OPEN.");
  }
});

Deno.test("collaboration scope stays independent from the consent notice", () => {
  if (
    isCollaborationScopeKey("DRAW") === false || isCollaborationScopeKey("NOPE")
  ) {
    throw new Error("Scope key validation is incorrect.");
  }
  if (
    COLLABORATION_SCOPE_KEYS.length !== 5 ||
    !scopeLabel("PUBLISH").includes("公開")
  ) {
    throw new Error("Scope catalog is incomplete.");
  }
});

Deno.test("scope consent distinguishes assignment, approval, and removal", () => {
  if (!isScopeActionableByParticipant("PENDING_MEMBER")) {
    throw new Error("Members must be able to accept a master's assignment.");
  }
  if (!isScopeRemovalPending("REMOVAL_REQUESTED")) {
    throw new Error("Approved scope removal must wait for the participant.");
  }
  if (!isScopeActionableByMaster("PENDING_MASTER")) {
    throw new Error("Masters must be able to review participant requests.");
  }
  if (!isScopeApproved("APPROVED")) {
    throw new Error("Approved state was not recognized.");
  }
});
