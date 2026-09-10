/**
 * Small, shared vocabulary for Project collaboration scope and consent.
 *
 * The product uses one collaboration flow. Casual co-drawing and public or
 * commercial production are explained as cautions on the consent screen, not
 * as mutually exclusive modes. A participant's edit history is never treated
 * as a rights claim; only an explicit assignment/request and consent can
 * create a scope record.
 */

export const COLLABORATION_SCOPE_KEYS = [
  "DRAW",
  "AUDIO",
  "GAME",
  "WRITING",
  "PUBLISH",
] as const;
export type CollaborationScopeKey = (typeof COLLABORATION_SCOPE_KEYS)[number];

export const SCOPE_ASSIGNMENT_STATES = [
  "PENDING_MEMBER",
  "PENDING_MASTER",
  "APPROVED",
  "REMOVAL_REQUESTED",
  "REJECTED",
  "REMOVED",
] as const;
export type ScopeAssignmentState = (typeof SCOPE_ASSIGNMENT_STATES)[number];

/**
 * Editing policy is intentionally separate from the collaboration notice.
 * OPEN is the safe default so a new participant is never silently locked out.
 */
export const COLLABORATION_EDIT_SCOPE_POLICIES = [
  "OPEN",
  "ASSIGNED_ONLY",
] as const;
export type CollaborationEditScopePolicy =
  (typeof COLLABORATION_EDIT_SCOPE_POLICIES)[number];

export const COLLABORATION_EDIT_SCOPE_POLICY_LABELS: Readonly<
  Record<CollaborationEditScopePolicy, string>
> = Object.freeze({
  OPEN: "自由に編集",
  ASSIGNED_ONLY: "担当範囲のみ",
});

export const COLLABORATION_SCOPE_LABELS: Readonly<
  Record<CollaborationScopeKey, string>
> = Object.freeze({
  DRAW: "iDRAW・絵とアニメーション",
  AUDIO: "iAUDIO・音楽とSE",
  GAME: "iGAME・ゲーム配置と設定",
  WRITING: "文章・世界観",
  PUBLISH: "公開・販売",
});

export type CollaborationScopeRecord = Readonly<{
  userId: string;
  displayName: string;
  memberRole: "owner" | "editor" | "viewer";
  scopeKey: CollaborationScopeKey;
  state: ScopeAssignmentState | null;
  canManage: boolean;
  isCurrentUser: boolean;
}>;

export function isCollaborationScopeKey(
  value: unknown,
): value is CollaborationScopeKey {
  return typeof value === "string" &&
    (COLLABORATION_SCOPE_KEYS as readonly string[]).includes(value);
}

export function isCollaborationEditScopePolicy(
  value: unknown,
): value is CollaborationEditScopePolicy {
  return typeof value === "string" &&
    (COLLABORATION_EDIT_SCOPE_POLICIES as readonly string[]).includes(value);
}

export function editScopePolicyLabel(value: unknown): string {
  return isCollaborationEditScopePolicy(value)
    ? COLLABORATION_EDIT_SCOPE_POLICY_LABELS[value]
    : COLLABORATION_EDIT_SCOPE_POLICY_LABELS.OPEN;
}

export function scopeLabel(value: unknown): string {
  return isCollaborationScopeKey(value)
    ? COLLABORATION_SCOPE_LABELS[value]
    : "担当範囲";
}

export function isScopeApproved(value: unknown): boolean {
  return value === "APPROVED";
}

export function isScopeRemovalPending(value: unknown): boolean {
  return value === "REMOVAL_REQUESTED";
}

export function isScopeActionableByParticipant(value: unknown): boolean {
  return value === "PENDING_MEMBER" || value === "REMOVAL_REQUESTED";
}

export function isScopeActionableByMaster(value: unknown): boolean {
  return value === "PENDING_MASTER";
}
