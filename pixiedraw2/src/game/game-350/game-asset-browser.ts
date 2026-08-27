/** Pure helpers for the iGAME Project/Asset browser. */

import {
  type AssetAnimationClip,
  assetAnimationClipKey,
  assetAnimationDirectionName,
  assetAnimationMotionName,
} from "../../draw2-creator-workspace.ts";
import type { PxdAssetDefinitionEntry } from "../../draw2-export.ts";
import type { AudioAssetRecord } from "../../audio/audio-200/contracts.ts";
import type { GameAnimationBinding } from "../game-300/core.ts";

export type GameAssetBrowserTab =
  | "SCENE"
  | "ASSETS"
  | "ANIMATION"
  | "GAME_DATA"
  | "EVENTS";

export type GameAssetBrowserSource = "GAME" | "DRAW" | "AUDIO" | "TEMPLATE";

export interface GameAssetBrowserTrack {
  readonly id: string;
  readonly label: string;
  readonly kind: string;
  readonly role?: string;
}

export interface GameAssetBrowserTemplate {
  readonly id: string;
  readonly label: string;
  readonly detail: string;
}

export interface GameAssetBrowserEntry {
  readonly id: string;
  readonly source: GameAssetBrowserSource;
  readonly label: string;
  readonly detail: string;
  readonly readOnly: boolean;
  readonly trackId?: string;
  readonly definitionId?: string;
  readonly templateId?: string;
  readonly animationCount?: number;
}

export interface GameAnimationClipReference {
  readonly id: string;
  readonly definitionId: string;
  readonly definitionName: string;
  readonly clipKey: string;
  readonly clip: AssetAnimationClip;
  readonly motionName: string;
  readonly direction?: string;
}

export interface UpsertGameAnimationBindingResult {
  readonly bindings: readonly GameAnimationBinding[];
  readonly changed: boolean;
}

function searchable(values: readonly (string | undefined)[]): string {
  return values.filter((value): value is string => value !== undefined)
    .join(" ")
    .toLocaleLowerCase();
}

/** Build one read-only catalog projection for the lower Game rail. */
export function buildGameAssetBrowserEntries(input: {
  readonly tracks: readonly GameAssetBrowserTrack[];
  readonly drawDefinitions: readonly PxdAssetDefinitionEntry[];
  readonly audioAssets: readonly AudioAssetRecord[];
  readonly templates?: readonly GameAssetBrowserTemplate[];
  readonly query?: string;
  readonly source?: GameAssetBrowserSource | "ALL";
}): readonly GameAssetBrowserEntry[] {
  const query = input.query?.trim().toLocaleLowerCase() ?? "";
  const source = input.source ?? "ALL";
  const entries: GameAssetBrowserEntry[] = [
    ...input.tracks.map((track) => ({
      id: `game:${track.id}`,
      source: "GAME" as const,
      label: track.label,
      detail: `${track.role ?? track.kind} · Game設定を編集できます`,
      readOnly: false,
      trackId: track.id,
    })),
    ...input.drawDefinitions.map((entry) => ({
      id: `draw:${entry.definitionId}`,
      source: "DRAW" as const,
      label: entry.definition.metadata.name || entry.definitionId,
      detail:
        `${entry.definition.assetKind} · ${entry.definition.animationMapping.length} Animation Clip · iDRAW参照専用`,
      readOnly: true,
      definitionId: entry.definitionId,
      animationCount: entry.definition.animationMapping.length,
    })),
    ...input.audioAssets.map((asset) => ({
      id: `audio:${String(asset.assetId)}`,
      source: "AUDIO" as const,
      label: asset.sourceName,
      detail:
        `${asset.kind} · ${asset.revisionIds.length} revision · iAUDIO参照専用`,
      readOnly: true,
    })),
    ...(input.templates ?? []).map((template) => ({
      id: `template:${template.id}`,
      source: "TEMPLATE" as const,
      label: template.label,
      detail: template.detail,
      readOnly: false,
      templateId: template.id,
    })),
  ];
  return entries.filter((entry) => {
    if (source !== "ALL" && entry.source !== source) return false;
    return query.length === 0 || searchable([
      entry.label,
      entry.detail,
      entry.trackId,
      entry.definitionId,
      entry.templateId,
    ]).includes(query);
  });
}

function characterLike(track: GameAssetBrowserTrack): boolean {
  return track.role === "PLAYER" || track.role === "NPC" ||
    (track.role === "CUSTOM" && track.kind === "SPRITE") ||
    track.kind === "SPRITE";
}

/** Resolve every matching Motion/Direction clip for a selected Game object. */
export function findGameAnimationClips(input: {
  readonly track: GameAssetBrowserTrack;
  readonly drawDefinitions: readonly PxdAssetDefinitionEntry[];
  readonly boundDrawAssetId?: string;
}): readonly GameAnimationClipReference[] {
  const definitionsByBoundAsset = input.boundDrawAssetId === undefined
    ? []
    : input.drawDefinitions.filter((entry) =>
      entry.registryIdentity?.assetId === input.boundDrawAssetId
    );
  const definitions = definitionsByBoundAsset.length > 0
    ? definitionsByBoundAsset
    : characterLike(input.track)
    ? input.drawDefinitions.filter((entry) =>
      entry.definition.assetKind === "CHARACTER"
    )
    : input.drawDefinitions;
  const seen = new Set<string>();
  const result: GameAnimationClipReference[] = [];
  for (const definition of definitions) {
    for (const clip of definition.definition.animationMapping) {
      const clipKey = assetAnimationClipKey(clip);
      const id = `${definition.definitionId}:${clipKey}`;
      if (seen.has(id)) continue;
      seen.add(id);
      const direction = assetAnimationDirectionName(clip);
      result.push({
        id,
        definitionId: definition.definitionId,
        definitionName: definition.definition.metadata.name ||
          definition.definitionId,
        clipKey,
        clip,
        motionName: assetAnimationMotionName(clip),
        ...(direction === undefined ? {} : { direction }),
      });
    }
  }
  return result;
}

export function gameAnimationBindingKey(
  binding: Pick<
    GameAnimationBinding,
    "trackId" | "assetDefinitionId" | "clipKey"
  >,
): string {
  return `${binding.trackId}\u0000${binding.assetDefinitionId}\u0000${binding.clipKey}`;
}

export function gameAnimationBindingIdFor(
  trackId: string,
  definitionId: string,
  clipKey: string,
): string {
  const value = `animation:${trackId}:${definitionId}:${clipKey}`
    .replace(/[^A-Za-z0-9._:/-]/gu, "-");
  return value.length <= 128 ? value : value.slice(0, 128);
}

function sameBinding(
  left: GameAnimationBinding,
  right: GameAnimationBinding,
): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

/** Upsert by object + definition + clip; assigning the same values is a no-op. */
export function upsertGameAnimationBinding(
  current: readonly GameAnimationBinding[],
  next: GameAnimationBinding,
): UpsertGameAnimationBindingResult {
  const key = gameAnimationBindingKey(next);
  const index = current.findIndex((binding) =>
    gameAnimationBindingKey(binding) === key
  );
  if (index < 0) {
    return { bindings: [...current, next], changed: true };
  }
  const previous = current[index];
  if (previous !== undefined && sameBinding(previous, next)) {
    return { bindings: current, changed: false };
  }
  const bindings = [...current];
  bindings[index] = next;
  return { bindings, changed: true };
}
