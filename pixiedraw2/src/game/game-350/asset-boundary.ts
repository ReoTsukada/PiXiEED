/**
 * iGAME's cross-product asset boundary.
 *
 * Game owns placement, references, and Game-side behavior. Draw and Audio own
 * their source content. This policy is deliberately host-neutral so the UI,
 * persistence adapter, and future command surfaces can share the same
 * fail-closed decision.
 */

export type GameAssetReferenceKind = "DRAW" | "AUDIO";
export type GameAssetBoundaryScope =
  | "GAME_OWNED"
  | "DRAW_REFERENCE"
  | "AUDIO_REFERENCE";

export type GameAssetMutation =
  | "EDIT_GAME_PLACEMENT"
  | "ATTACH_REFERENCE"
  | "DETACH_REFERENCE"
  | "CHANGE_REFERENCE_MODE"
  | "EDIT_SOURCE_CONTENT"
  | "EDIT_SOURCE_METADATA"
  | "DELETE_SOURCE";

export type GameAssetBoundaryCode =
  | "GAME_SCOPE_ALLOWED"
  | "REFERENCE_ONLY_ALLOWED"
  | "SOURCE_WRITE_DENIED"
  | "UNSUPPORTED_MUTATION";

export interface GameAssetBoundaryDecision {
  readonly allowed: boolean;
  readonly code: GameAssetBoundaryCode;
  readonly message: string;
}

const SOURCE_WRITE_MESSAGE =
  "iGAMEでは原素材を変更できません。Game側の参照・配置だけを編集できます。";

const REFERENCE_ONLY_OPERATIONS: readonly GameAssetMutation[] = [
  "ATTACH_REFERENCE",
  "DETACH_REFERENCE",
  "CHANGE_REFERENCE_MODE",
];

const SOURCE_WRITE_OPERATIONS: readonly GameAssetMutation[] = [
  "EDIT_SOURCE_CONTENT",
  "EDIT_SOURCE_METADATA",
  "DELETE_SOURCE",
];

/**
 * Decide whether a Game editor operation is allowed for the selected scope.
 * Source writes are denied for both Draw and Audio references, while changing
 * how a reference is placed in Game remains explicitly allowed.
 */
export function decideGameAssetMutation(
  scope: GameAssetBoundaryScope,
  mutation: GameAssetMutation,
): GameAssetBoundaryDecision {
  if (SOURCE_WRITE_OPERATIONS.includes(mutation)) {
    return {
      allowed: false,
      code: "SOURCE_WRITE_DENIED",
      message: SOURCE_WRITE_MESSAGE,
    };
  }
  if (scope === "GAME_OWNED" && mutation === "EDIT_GAME_PLACEMENT") {
    return {
      allowed: true,
      code: "GAME_SCOPE_ALLOWED",
      message: "Game側の配置・名前・イベントを編集できます。",
    };
  }
  if (
    (scope === "DRAW_REFERENCE" || scope === "AUDIO_REFERENCE") &&
    (REFERENCE_ONLY_OPERATIONS.includes(mutation) ||
      mutation === "EDIT_GAME_PLACEMENT")
  ) {
    return {
      allowed: true,
      code: "REFERENCE_ONLY_ALLOWED",
      message: "Game側の参照・配置だけ変更できます。原素材は読み取り専用です。",
    };
  }
  return {
    allowed: false,
    code: "UNSUPPORTED_MUTATION",
    message: "この操作はiGAMEの編集範囲に含まれていません。",
  };
}

export function gameAssetBoundaryScopeFor(
  kind: GameAssetReferenceKind,
): GameAssetBoundaryScope {
  return kind === "DRAW" ? "DRAW_REFERENCE" : "AUDIO_REFERENCE";
}
