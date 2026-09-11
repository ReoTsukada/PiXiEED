/**
 * Builds a self-contained PXD v2 package for one fixed Draw Asset Definition.
 *
 * Asset Package manifests are metadata-only.  Market delivery therefore needs
 * a deterministic raster payload as well as the definition.  This module
 * converts the captured visible RGBA snapshots into the indexed raster form
 * already understood by the existing PXD importer and Market Asset Binding.
 */

import {
  IndexedTileRaster,
  createProject,
  type Draw2Cel,
  type Draw2Frame,
  type Draw2Layer,
  type ProjectState,
  type RasterAsset,
} from "../../draw2-core.ts";
import {
  exportPxdProject,
  type PxdAssetDefinitionEntry,
  type PxdProjectExport,
} from "../../draw2-export.ts";
import type { AssetPackageManifest } from "./assetization.ts";

export interface AssetMarketPxdExportOptions {
  readonly entry: PxdAssetDefinitionEntry;
  readonly assetPackage?: AssetPackageManifest;
}

interface CapturedFrame {
  readonly sourceFrameId: string;
  readonly width: number;
  readonly height: number;
  readonly pixels: Uint8ClampedArray;
  readonly durationMs: number;
}

const MAX_FRAMES = 512;
const MAX_DIMENSION = 4096;
const MAX_PIXELS = 16 * 1024 * 1024;

function safeProjectId(value: string): string {
  const normalized = value
    .normalize("NFC")
    .replace(/[^A-Za-z0-9._-]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .slice(0, 96);
  return `pixieed-asset-${normalized || "unnamed"}`;
}

function safeDuration(value: number | undefined, fallback: number): number {
  return Number.isFinite(value) && value !== undefined && value > 0
    ? Math.max(1, Math.round(value))
    : fallback;
}

function sourceFramesFor(entry: PxdAssetDefinitionEntry): CapturedFrame[] {
  const frames: CapturedFrame[] = [];
  const seen = new Set<string>();
  const clips = entry.definition.animationMapping;
  for (const clip of clips) {
    const sourceFrames = clip.sourceFrames ?? [];
    for (const [index, source] of sourceFrames.entries()) {
      const snapshot = source.rasterSnapshot;
      if (snapshot === undefined) {
        throw new Error(
          `Asset「${entry.definition.metadata.name || entry.definitionId}」の${index + 1}フレームに確定画像がありません。iDRAWで表示中の範囲を再登録してください。`,
        );
      }
      if (
        !Number.isSafeInteger(snapshot.width) || snapshot.width < 1 ||
        snapshot.width > MAX_DIMENSION ||
        !Number.isSafeInteger(snapshot.height) || snapshot.height < 1 ||
        snapshot.height > MAX_DIMENSION ||
        snapshot.width * snapshot.height > MAX_PIXELS ||
        !Array.isArray(snapshot.data) ||
        snapshot.data.length !== snapshot.width * snapshot.height * 4 ||
        snapshot.data.some((value) =>
          !Number.isSafeInteger(value) || value < 0 || value > 255
        )
      ) {
        throw new Error(
          `Asset「${entry.definition.metadata.name || entry.definitionId}」に不正な画像フレームがあります。`,
        );
      }
      const pixels = new Uint8ClampedArray(snapshot.data);
      // A source frame can belong to more than one action.  Identical
      // captures are stored once so the PXD remains compact and deterministic.
      const signature = `${source.sourceFrameId}:${snapshot.width}x${snapshot.height}:${Array.from(pixels).join(",")}`;
      if (seen.has(signature)) continue;
      seen.add(signature);
      const duration = clip.frameDurationsMs?.[index] ?? source.durationMs;
      frames.push({
        sourceFrameId: source.sourceFrameId,
        width: snapshot.width,
        height: snapshot.height,
        pixels,
        durationMs: safeDuration(duration, Math.round(1000 / (clip.fps ?? 12))),
      });
      if (frames.length > MAX_FRAMES) {
        throw new Error("1 Assetのフレーム数がMarket上限を超えています。アニメーションを分割してください。");
      }
    }
  }
  if (frames.length === 0) {
    throw new Error(
      `Asset「${entry.definition.metadata.name || entry.definitionId}」に確定済みのアニメーションフレームがありません。`,
    );
  }
  return frames;
}

function argbFromRgba(pixels: Uint8ClampedArray, offset: number): number {
  return (((pixels[offset + 3] ?? 0) << 24) |
    ((pixels[offset] ?? 0) << 16) |
    ((pixels[offset + 1] ?? 0) << 8) |
    (pixels[offset + 2] ?? 0)) >>> 0;
}

function rgbaFromArgb(value: number): [number, number, number, number] {
  return [
    (value >>> 16) & 0xff,
    (value >>> 8) & 0xff,
    value & 0xff,
    (value >>> 24) & 0xff,
  ];
}

function indexedFramesFor(frames: readonly CapturedFrame[]): {
  readonly palette: readonly number[];
  readonly pixels: readonly Uint8Array[];
  readonly width: number;
  readonly height: number;
} {
  const width = Math.max(...frames.map((frame) => frame.width));
  const height = Math.max(...frames.map((frame) => frame.height));
  const frequencies = new Map<number, number>();
  for (const frame of frames) {
    for (let offset = 0; offset < frame.pixels.length; offset += 4) {
      const color = argbFromRgba(frame.pixels, offset);
      if ((color >>> 24) === 0) continue;
      frequencies.set(color, (frequencies.get(color) ?? 0) + 1);
    }
  }
  const palette = [0, ...Array.from(frequencies.keys()).sort((left, right) =>
    (frequencies.get(right) ?? 0) - (frequencies.get(left) ?? 0) || left - right
  ).slice(0, 255)];
  const exact = new Map(palette.map((color, index) => [color, index]));
  const nearest = (color: number): number => {
    const exactIndex = exact.get(color);
    if (exactIndex !== undefined) return exactIndex;
    if (palette.length === 1) return 0;
    const target = rgbaFromArgb(color);
    let bestIndex = 1;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (let index = 1; index < palette.length; index += 1) {
      const candidate = rgbaFromArgb(palette[index] ?? 0);
      const distance = (target[0] - candidate[0]) ** 2 +
        (target[1] - candidate[1]) ** 2 +
        (target[2] - candidate[2]) ** 2 +
        2 * (target[3] - candidate[3]) ** 2;
      if (distance < bestDistance) {
        bestDistance = distance;
        bestIndex = index;
      }
    }
    return bestIndex;
  };
  const indexed = frames.map((frame) => {
    const output = new Uint8Array(width * height);
    for (let y = 0; y < frame.height; y += 1) {
      for (let x = 0; x < frame.width; x += 1) {
        const sourceOffset = (y * frame.width + x) * 4;
        output[y * width + x] = nearest(argbFromRgba(frame.pixels, sourceOffset));
      }
    }
    return output;
  });
  return { palette, pixels: indexed, width, height };
}

function syntheticProject(
  entry: PxdAssetDefinitionEntry,
  frames: readonly CapturedFrame[],
): ProjectState {
  const indexed = indexedFramesFor(frames);
  const projectId = safeProjectId(entry.definitionId);
  const created = createProject({
    projectId,
    name: entry.definition.metadata.name || entry.definitionId,
    width: indexed.width,
    height: indexed.height,
    tileSize: 32,
    palette: indexed.palette,
  });
  const layerId = `${projectId}:asset-layer`;
  const assets: Record<string, RasterAsset> = {};
  const projectFrames: Draw2Frame[] = [];
  const cels: Draw2Cel[] = [];
  for (const [index, frame] of frames.entries()) {
    const assetId = `${projectId}:frame:${String(index).padStart(4, "0")}`;
    const raster = IndexedTileRaster.empty(indexed.width, indexed.height, 32);
    const pixels = indexed.pixels[index]!;
    for (let y = 0; y < indexed.height; y += 1) {
      for (let x = 0; x < indexed.width; x += 1) {
        const colorIndex = pixels[y * indexed.width + x] ?? 0;
        if (colorIndex !== 0) raster.setPixel(assetId, x, y, colorIndex);
      }
    }
    assets[assetId] = {
      id: assetId,
      width: indexed.width,
      height: indexed.height,
      palette: indexed.palette,
      raster,
      revision: 0,
    };
    const frameId = `${projectId}:frame:${String(index).padStart(4, "0")}`;
    const celId = `${projectId}:cel:${String(index).padStart(4, "0")}`;
    projectFrames.push({
      id: frameId,
      frameId,
      index,
      orderKey: String(index).padStart(8, "0"),
      durationMs: frame.durationMs,
      timingUnit: "MILLISECONDS",
      metadataVersion: 1,
    });
    cels.push({
      id: celId,
      celId,
      layerId,
      layerTrackId: layerId,
      frameId,
      assetId,
      bindingMode: "RASTER",
      recordVersion: 1,
      lifecycle: "ACTIVE",
    });
  }
  const layer: Draw2Layer = {
    id: layerId,
    layerTrackId: layerId,
    name: "Asset",
    order: 0,
    orderingKey: "00000000",
    visible: true,
    opacity: 1,
    blendMode: "NORMAL",
    locked: false,
    lifecycle: "ACTIVE",
    kind: "RASTER",
  };
  const firstFrame = projectFrames[0]!;
  const firstAsset = assets[Object.keys(assets)[0]!]!;
  return {
    ...created,
    name: entry.definition.metadata.name || entry.definitionId,
    activeAssetId: firstAsset.id,
    layers: [layer],
    frames: projectFrames,
    cels,
    timeline: {
      id: `${projectId}:timeline`,
      timelineId: `${projectId}:timeline`,
      frameOrder: projectFrames.map((frame) => frame.frameId),
      layerTrackOrder: [layerId],
      metadataVersion: 1,
    },
    activeLayerId: layerId,
    activeFrameId: firstFrame.frameId,
    activeCelId: cels[0]!.celId,
    assets,
    tilemaps: {},
    appliedCommandIds: [],
    lastClientSequenceByClient: {},
  };
}

export async function exportAssetDefinitionPxd(
  options: AssetMarketPxdExportOptions,
): Promise<PxdProjectExport> {
  const frames = sourceFramesFor(options.entry);
  return await exportPxdProject(syntheticProject(options.entry, frames), {
    assetDefinitions: [options.entry],
    ...(options.assetPackage === undefined
      ? {}
      : { assetPackages: [options.assetPackage] }),
  });
}
