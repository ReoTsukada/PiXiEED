/** Beginner-facing creation flow for the first iGAME Studio surface. */

export const GAME_CREATION_GUIDE_SCHEMA_VERSION = 1 as const;

export type GameCreationGuideStepId =
  | "STARTER"
  | "EVENT"
  | "ASSET_REFERENCE"
  | "PREVIEW";

export type GameCreationGuideAction =
  | "ADD_STARTER"
  | "EDIT_EVENT"
  | "OPEN_ASSETS"
  | "START_PREVIEW";

export interface GameCreationGuideTrack {
  readonly id: string;
  readonly label: string;
  readonly kind: string;
}

export interface GameCreationGuideInput {
  readonly tracks: readonly GameCreationGuideTrack[];
  readonly behaviorCount: number;
  readonly bindingCount: number;
  readonly previewReady: boolean;
}

export interface GameCreationGuideStep {
  readonly id: GameCreationGuideStepId;
  readonly order: number;
  readonly title: string;
  readonly detail: string;
  readonly action: GameCreationGuideAction;
  readonly actionLabel: string;
  readonly complete: boolean;
}

export interface GameCreationGuide {
  readonly schemaVersion: typeof GAME_CREATION_GUIDE_SCHEMA_VERSION;
  readonly steps: readonly GameCreationGuideStep[];
  readonly nextStep: GameCreationGuideStep | undefined;
}

function normalizedTrackText(track: GameCreationGuideTrack): string {
  return `${track.id} ${track.label} ${track.kind}`.toLowerCase();
}

function hasTrack(
  tracks: readonly GameCreationGuideTrack[],
  patterns: readonly string[],
): boolean {
  return tracks.some((track) => {
    const text = normalizedTrackText(track);
    return patterns.some((pattern) => text.includes(pattern));
  });
}

/**
 * The first recipe is intentionally small: a starter scene, one no-code
 * event, a read-only Draw/Audio reference, then Preview. Future genre
 * templates can reuse this shape without changing the editor contract.
 */
export function createGameCreationGuide(
  input: GameCreationGuideInput,
): GameCreationGuide {
  const starterReady = hasTrack(input.tracks, ["hero", "player", "主人公"]) &&
    hasTrack(input.tracks, ["enemy", "npc", "guide", "キャラクター"]) &&
    hasTrack(input.tracks, ["tilemap", "map", "rpg", "マップ"]);
  const eventReady = Number.isSafeInteger(input.behaviorCount) &&
    input.behaviorCount > 0;
  const assetReferenceReady = Number.isSafeInteger(input.bindingCount) &&
    input.bindingCount > 0;
  const steps: readonly GameCreationGuideStep[] = [
    {
      id: "STARTER",
      order: 1,
      title: "ゲームの土台を用意",
      detail: starterReady
        ? "RPGスターターのPlayer・NPC・MapがGame側にあります。"
        : "RPGスターターでPlayer・NPC・Mapをまとめて配置します。",
      action: "ADD_STARTER",
      actionLabel: starterReady ? "Game側を確認" : "スターターを配置",
      complete: starterReady,
    },
    {
      id: "EVENT",
      order: 2,
      title: "ルールを作る",
      detail: eventReady
        ? "ノーコードイベントが1件以上あります。"
        : "NPCを選んで、会話やアクションを設定します。",
      action: "EDIT_EVENT",
      actionLabel: eventReady ? "イベントを編集" : "NPCイベントを作る",
      complete: eventReady,
    },
    {
      id: "ASSET_REFERENCE",
      order: 3,
      title: "素材を参照する",
      detail: assetReferenceReady
        ? "iDRAW / iAUDIO素材をGameから参照しています。"
        : "iDRAW / iAUDIOは参照だけを追加します。原素材は変更しません。",
      action: "OPEN_ASSETS",
      actionLabel: assetReferenceReady ? "参照を管理" : "参照を追加",
      complete: assetReferenceReady,
    },
    {
      id: "PREVIEW",
      order: 4,
      title: "Playで確認する",
      detail: input.previewReady
        ? "Previewが起動しています。"
        : "Play / Stop / RestartでGameの動きを確認します。",
      action: "START_PREVIEW",
      actionLabel: input.previewReady ? "Previewを開く" : "Playを開始",
      complete: input.previewReady,
    },
  ];
  return {
    schemaVersion: GAME_CREATION_GUIDE_SCHEMA_VERSION,
    steps,
    nextStep: steps.find((step) => !step.complete),
  };
}
