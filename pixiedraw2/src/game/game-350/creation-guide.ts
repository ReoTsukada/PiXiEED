/** Beginner-facing creation flow for the first iGAME Studio surface. */

export const GAME_CREATION_GUIDE_SCHEMA_VERSION = 1 as const;

/**
 * The creation choice is a first-entry UI state, not part of the persisted
 * Game editor record. Once a project has been created, OPEN restores the
 * project directly and the choice is no longer shown.
 */
export type GameCreationMode = "UNSELECTED" | "RPG_TEMPLATE" | "BLANK";
export type SelectedGameCreationMode = Exclude<
  GameCreationMode,
  "UNSELECTED"
>;

export interface GameCreationModeOption {
  readonly id: SelectedGameCreationMode;
  readonly title: string;
  readonly badge: string;
  readonly detail: string;
  readonly recommended: boolean;
}

export const GAME_CREATION_MODE_OPTIONS: readonly GameCreationModeOption[] = [
  {
    id: "RPG_TEMPLATE",
    title: "RPGテンプレートから開始",
    badge: "おすすめ",
    detail: "マップ・主人公・NPC・カメラ・イベントの土台を配置します。",
    recommended: true,
  },
  {
    id: "BLANK",
    title: "空白から開始",
    badge: "自由制作",
    detail: "空のGameから、必要なオブジェクトや仕組みを追加します。",
    recommended: false,
  },
] as const;

export function normalizeGameCreationMode(value: unknown): GameCreationMode {
  return value === "RPG_TEMPLATE" || value === "BLANK"
    ? value
    : "UNSELECTED";
}

export function isSelectedGameCreationMode(
  value: unknown,
): value is SelectedGameCreationMode {
  return value === "RPG_TEMPLATE" || value === "BLANK";
}

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
  /** Asset references are useful for a finished game but not required to start a test play. */
  readonly required: boolean;
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
 * The first recipe follows an RPG Maker-like path: create a map and actors,
 * add an event, test it immediately, then optionally attach Draw/Audio
 * references. Future genre templates can reuse this shape without changing
 * the editor contract.
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
      title: "マップと登場人物を用意",
      detail: starterReady
        ? "RPGスターターのマップ・主人公・NPC・カメラがあります。"
        : "RPGスターターでマップ・主人公・NPC・カメラをまとめて配置します。",
      action: "ADD_STARTER",
      actionLabel: starterReady ? "Game側を確認" : "RPGスターターを配置",
      complete: starterReady,
      required: true,
    },
    {
      id: "EVENT",
      order: 2,
      title: "会話・イベントを作る",
      detail: eventReady
        ? "NPC・扉・宝箱などのイベントを編集できます。"
        : "NPCを選び、会話・条件・アクションを設定します。",
      action: "EDIT_EVENT",
      actionLabel: eventReady ? "イベントを編集" : "会話を作る",
      complete: eventReady,
      required: true,
    },
    {
      id: "PREVIEW",
      order: 3,
      title: "Playでテストする",
      detail: input.previewReady
        ? "Previewが起動しています。"
        : "素材がなくても、まず動きをPlayで確認できます。",
      action: "START_PREVIEW",
      actionLabel: input.previewReady ? "Previewを開く" : "Playを開始",
      complete: input.previewReady,
      required: true,
    },
    {
      id: "ASSET_REFERENCE",
      order: 4,
      title: "素材を追加する（任意）",
      detail: assetReferenceReady
        ? "iDRAW / iAUDIO素材をGameから参照しています。"
        : "iDRAW / iAUDIO素材は後から参照できます。原素材は変更しません。",
      action: "OPEN_ASSETS",
      actionLabel: assetReferenceReady ? "参照を管理" : "素材を選ぶ",
      complete: assetReferenceReady,
      required: false,
    },
  ];
  return {
    schemaVersion: GAME_CREATION_GUIDE_SCHEMA_VERSION,
    steps,
    nextStep: steps.find((step) => step.required && !step.complete),
  };
}
