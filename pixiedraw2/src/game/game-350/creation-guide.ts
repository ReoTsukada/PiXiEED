/** Beginner-facing creation flow for the first iGAME Studio surface. */

export const GAME_CREATION_GUIDE_SCHEMA_VERSION = 1 as const;

/**
 * The creation choice is shown only on first entry, then retained as
 * lightweight project metadata so OPEN can keep the selected starter family.
 */
export type GameCreationMode =
  | "UNSELECTED"
  | "RPG_TEMPLATE"
  | "ACTION_2D"
  | "DODGE_2D"
  | "SCROLL_2D"
  | "BLANK";
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
    id: "DODGE_2D",
    title: "敵よけゲームから開始",
    badge: "すぐ遊べる",
    detail: "主人公・追跡する敵・アリーナ・カメラ・接触ルールを配置します。",
    recommended: false,
  },
  {
    id: "ACTION_2D",
    title: "2Dアクションから開始",
    badge: "物理",
    detail: "重力・床・主人公・敵・カメラの土台を配置します。",
    recommended: false,
  },
  {
    id: "SCROLL_2D",
    title: "2Dスクロールから開始",
    badge: "スクロール",
    detail: "地面・主人公・ゴール・追従カメラの土台を配置します。",
    recommended: false,
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
  return value === "RPG_TEMPLATE" || value === "ACTION_2D" ||
      value === "DODGE_2D" || value === "SCROLL_2D" || value === "BLANK"
    ? value
    : "UNSELECTED";
}

export function isSelectedGameCreationMode(
  value: unknown,
): value is SelectedGameCreationMode {
  return value === "RPG_TEMPLATE" || value === "ACTION_2D" ||
    value === "DODGE_2D" || value === "SCROLL_2D" || value === "BLANK";
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
  readonly mode?: SelectedGameCreationMode;
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
  const starterName = input.mode === "ACTION_2D"
    ? "2Dアクションスターター"
    : input.mode === "DODGE_2D"
    ? "敵よけスターター"
    : input.mode === "SCROLL_2D"
    ? "2Dスクロールスターター"
    : input.mode === "BLANK"
    ? "スターター"
    : "RPGスターター";
  const dedicatedRuntimePreviewReady = true;
  const eventReady = Number.isSafeInteger(input.behaviorCount) &&
    input.behaviorCount > 0;
  const assetReferenceReady = Number.isSafeInteger(input.bindingCount) &&
    input.bindingCount > 0;
  const steps: readonly GameCreationGuideStep[] = [
    {
      id: "STARTER",
      order: 1,
      title: "テンプレートとSceneルールを選ぶ",
      detail: starterReady
        ? starterName + "のSceneルールと役割（主人公・NPC・マップ・カメラ）があります。"
        : starterName + "で重力・移動・カメラと役割をまとめて配置します。",
      action: "ADD_STARTER",
      actionLabel: starterReady ? "Game側を確認" : starterName + "を配置",
      complete: starterReady,
      required: true,
    },
    {
      id: "EVENT",
      order: 2,
      title: "イベントカードを作る",
      detail: eventReady
        ? "誰が・条件・起こすことをカードで編集できます。"
        : "Trackを選び、誰が・条件・起こすことを設定します。",
      action: "EDIT_EVENT",
      actionLabel: eventReady ? "イベントを編集" : "会話を作る",
      complete: eventReady,
      required: true,
    },
    {
      id: "PREVIEW",
      order: 3,
      title: dedicatedRuntimePreviewReady
        ? "Playでテストする"
        : "Playでテストする",
      detail: input.previewReady
        ? "Previewが起動しています。"
        : "素材がなくても、まず動きをPlayで確認できます。",
      action: "START_PREVIEW",
      actionLabel: input.previewReady
        ? "Previewを開く"
        : "Playを開始",
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
