/// <reference lib="dom" />

import {
  importPxdProject,
  type PxdProjectImport,
} from "../../draw2-export.ts";
import type { ProjectState, RasterAsset } from "../../draw2-core.ts";
import {
  createGameGenreRuntime,
  playGameGenre,
  stepGameGenre,
  type GameGenreRuntimeInput,
  type GameGenreRuntimeState,
} from "./genre-runtime.ts";
import type { GameProject } from "../game-300/core.ts";
import {
  createIGameRuntimeLaunchConfig,
  type IGamePlayerRuntimeHandle,
  type IGamePlayerRuntimeMountContext,
  type IGamePlayerRuntimeSource,
} from "./runtime-launch.ts";
import {
  fetchIGamePublicPackage,
  type IGamePublicBootstrap,
} from "./igame-public-bootstrap.ts";

interface GameSourceData {
  readonly project: GameProject;
  readonly draw: ProjectState;
  readonly imported: PxdProjectImport;
}

interface BrowserRuntimeState {
  readonly game: GameGenreRuntimeState;
  readonly animationTick: number;
}

interface BrowserRuntimeInput extends GameGenreRuntimeInput {
  readonly pause?: boolean;
}

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function gameProjectFrom(imported: PxdProjectImport): GameProject {
  const candidate = record(record(imported.game?.record).canonicalProject);
  const timeline = record(candidate.editorTimeline);
  if (
    candidate.schemaVersion !== 1 || typeof candidate.projectId !== "string" ||
    !Array.isArray(candidate.scenes) || !Array.isArray(candidate.prefabs) ||
    !Array.isArray(candidate.dependencies) || !Array.isArray(candidate.behaviors) ||
    !Array.isArray(timeline.tracks)
  ) {
    throw new Error("PXDに再生可能なGame Projectが含まれていません。");
  }
  return candidate as unknown as GameProject;
}

function assetIdByDefinition(
  imported: PxdProjectImport,
  definitionId: string | undefined,
): string | undefined {
  if (!definitionId) return undefined;
  const definition = imported.assetDefinitions.find((entry) => entry.definitionId === definitionId);
  const identity = record(definition?.registryIdentity);
  return typeof identity.assetId === "string"
    ? identity.assetId
    : definitionId;
}

function assetIdForTrack(
  project: GameProject,
  imported: PxdProjectImport,
  trackId: string,
): string | undefined {
  const animation = project.editorTimeline?.animationBindings?.find((binding) => binding.trackId === trackId);
  const animationAsset = assetIdByDefinition(imported, animation?.assetDefinitionId);
  if (animationAsset) return animationAsset;
  const binding = project.editorTimeline?.assetBindings?.find((candidate) => candidate.trackId === trackId && candidate.kind === "DRAW");
  return binding?.assetId;
}

function resizeCanvas(canvas: HTMLCanvasElement): { width: number; height: number } {
  const rect = canvas.getBoundingClientRect();
  const ratio = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
  const width = Math.max(320, Math.floor(rect.width * ratio));
  const height = Math.max(180, Math.floor(rect.height * ratio));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  return { width, height };
}

function drawRaster(
  context: CanvasRenderingContext2D,
  asset: RasterAsset,
  x: number,
  y: number,
  width: number,
  height: number,
): void {
  const pixels = asset.raster.toUint8Array();
  const image = new ImageData(asset.width, asset.height);
  for (let index = 0; index < pixels.length; index += 1) {
    const paletteIndex = pixels[index] ?? 0;
    const color = asset.palette[paletteIndex] ?? 0;
    const offset = index * 4;
    image.data[offset] = (color >>> 16) & 0xff;
    image.data[offset + 1] = (color >>> 8) & 0xff;
    image.data[offset + 2] = color & 0xff;
    image.data[offset + 3] = paletteIndex === 0 ? 0 : (color >>> 24) & 0xff;
  }
  const offscreen = document.createElement("canvas");
  offscreen.width = asset.width;
  offscreen.height = asset.height;
  offscreen.getContext("2d")?.putImageData(image, 0, 0);
  context.imageSmoothingEnabled = false;
  context.drawImage(offscreen, x, y, width, height);
}

function renderBrowserGame(
  canvas: HTMLCanvasElement,
  state: BrowserRuntimeState,
  source: GameSourceData,
  assetByTrack: ReadonlyMap<string, string>,
): void {
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas 2D Runtimeを初期化できませんでした。");
  const { width, height } = resizeCanvas(canvas);
  const game = state.game;
  const worldWidth = Math.max(8, game.world.width);
  const worldHeight = Math.max(6, game.world.height);
  const viewWidth = Math.max(8, Math.min(worldWidth, game.camera2D.referenceWidth / Math.max(1, game.camera2D.pixelsPerUnit)));
  const viewHeight = Math.max(6, Math.min(worldHeight, game.camera2D.referenceHeight / Math.max(1, game.camera2D.pixelsPerUnit)));
  const left = Math.max(0, Math.min(worldWidth - viewWidth, game.playerPosition.x - viewWidth / 2));
  const top = Math.max(0, Math.min(worldHeight - viewHeight, game.playerPosition.y - viewHeight / 2));
  const sx = width / viewWidth;
  const sy = height / viewHeight;
  const toCanvasX = (value: number) => (value - left) * sx;
  const toCanvasY = (value: number) => (value - top) * sy;

  const gradient = context.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, "#142642");
  gradient.addColorStop(1, "#07101c");
  context.fillStyle = gradient;
  context.fillRect(0, 0, width, height);

  context.strokeStyle = "rgba(142, 190, 229, 0.12)";
  context.lineWidth = 1;
  for (let x = Math.floor(left); x <= left + viewWidth; x += 1) {
    context.beginPath();
    context.moveTo(toCanvasX(x), 0);
    context.lineTo(toCanvasX(x), height);
    context.stroke();
  }
  for (let y = Math.floor(top); y <= top + viewHeight; y += 1) {
    context.beginPath();
    context.moveTo(0, toCanvasY(y));
    context.lineTo(width, toCanvasY(y));
    context.stroke();
  }
  const drawEntity = (trackId: string, x: number, y: number, isPlayer: boolean): void => {
    const assetId = assetByTrack.get(trackId);
    const asset = assetId ? source.draw.assets[assetId] : undefined;
    const entitySize = Math.max(0.6, Math.min(1.8, isPlayer ? 1 : 0.9));
    const canvasX = toCanvasX(x - entitySize / 2);
    const canvasY = toCanvasY(y - entitySize / 2);
    const canvasSize = Math.max(8, entitySize * Math.min(sx, sy));
    if (asset) {
      const ratio = asset.width / Math.max(1, asset.height);
      const drawHeight = canvasSize;
      const drawWidth = drawHeight * ratio;
      drawRaster(context, asset, canvasX - (drawWidth - canvasSize) / 2, canvasY, drawWidth, drawHeight);
      return;
    }
    context.fillStyle = isPlayer ? "#7fe6d4" : "#ff7997";
    context.fillRect(canvasX, canvasY, canvasSize, canvasSize);
    context.fillStyle = "rgba(255,255,255,0.7)";
    context.fillRect(canvasX + canvasSize * 0.25, canvasY + canvasSize * 0.2, canvasSize * 0.16, canvasSize * 0.16);
    context.fillRect(canvasX + canvasSize * 0.6, canvasY + canvasSize * 0.2, canvasSize * 0.16, canvasSize * 0.16);
  };

  for (const cell of game.world.solidCells) {
    const canvasX = toCanvasX(cell.x);
    const canvasY = toCanvasY(cell.y);
    const cellWidth = Math.max(1, sx);
    const cellHeight = Math.max(1, sy);
    context.fillStyle = "rgba(102, 149, 193, 0.42)";
    context.fillRect(canvasX, canvasY, cellWidth, cellHeight);
  }
  for (const object of game.objects) drawEntity(object.id, object.position.x, object.position.y, false);
  drawEntity(game.playerId, game.playerPosition.x, game.playerPosition.y, true);

  context.fillStyle = "rgba(4, 9, 17, 0.72)";
  context.fillRect(12, 12, Math.min(330, width - 24), 52);
  context.fillStyle = "#eef4ff";
  context.font = `${Math.max(12, Math.floor(Math.min(width, height) / 48))}px system-ui, sans-serif`;
  context.fillText(source.project.name, 24, 34);
  context.fillStyle = "#a8b6ca";
  context.fillText(`HP ${game.health}  •  ${game.runtimeFamily}  •  ${Math.floor(state.animationTick / 60)}s`, 24, 52);
}

function inputFromKeys(keys: ReadonlySet<string>): BrowserRuntimeInput {
  return {
    left: keys.has("ArrowLeft") || keys.has("a") || keys.has("A"),
    right: keys.has("ArrowRight") || keys.has("d") || keys.has("D"),
    up: keys.has("ArrowUp") || keys.has("w") || keys.has("W"),
    down: keys.has("ArrowDown") || keys.has("s") || keys.has("S"),
    jump: keys.has(" ") || keys.has("z") || keys.has("Z"),
    attack: keys.has("x") || keys.has("X"),
  };
}

function sourceAssetMap(
  project: GameProject,
  imported: PxdProjectImport,
): ReadonlyMap<string, string> {
  const map = new Map<string, string>();
  for (const track of project.editorTimeline?.tracks ?? []) {
    const assetId = assetIdForTrack(project, imported, track.trackId);
    if (assetId) map.set(track.trackId, assetId);
  }
  return map;
}

function mountBrowserGame(
  context: IGamePlayerRuntimeMountContext,
  source: GameSourceData,
): IGamePlayerRuntimeHandle {
  const shell = document.createElement("div");
  shell.className = "igame-browser-runtime";
  const canvas = document.createElement("canvas");
  canvas.className = "igame-browser-runtime__canvas";
  canvas.tabIndex = 0;
  canvas.setAttribute("aria-label", "iGAMEプレイ画面");
  const hint = document.createElement("p");
  hint.className = "igame-browser-runtime__hint";
  hint.textContent = "矢印キー / WASDで移動　Zでジャンプ　Xで攻撃　Escで停止";
  shell.append(canvas, hint);
  context.root.replaceChildren(shell);
  const keys = new Set<string>();
  const assetMap = sourceAssetMap(source.project, source.imported);
  let state: BrowserRuntimeState = {
    game: playGameGenre(createGameGenreRuntime(source.project)),
    animationTick: 0,
  };
  let frameHandle = 0;
  let stopped = false;
  const onKeyDown = (event: KeyboardEvent): void => {
    if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", " ", "z", "Z", "x", "X", "Escape"].includes(event.key)) {
      event.preventDefault();
    }
    if (event.key === "Escape") {
      void context.requestStop();
      return;
    }
    keys.add(event.key);
  };
  const onKeyUp = (event: KeyboardEvent): void => {
    keys.delete(event.key);
  };
  const onResize = (): void => renderBrowserGame(canvas, state, source, assetMap);
  const tick = (): void => {
    if (stopped) return;
    state = {
      game: stepGameGenre(state.game, inputFromKeys(keys)),
      animationTick: state.animationTick + 1,
    };
    renderBrowserGame(canvas, state, source, assetMap);
    frameHandle = window.requestAnimationFrame(tick);
  };
  window.addEventListener("keydown", onKeyDown, { passive: false });
  window.addEventListener("keyup", onKeyUp);
  window.addEventListener("resize", onResize);
  canvas.focus({ preventScroll: true });
  tick();
  return {
    dispose: () => {
      stopped = true;
      window.cancelAnimationFrame(frameHandle);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("resize", onResize);
      context.root.replaceChildren();
    },
  };
}

export async function createIGameBrowserRuntimeSource(
  bootstrap: IGamePublicBootstrap,
  packageBytes: Uint8Array,
): Promise<IGamePlayerRuntimeSource> {
  const imported = await importPxdProject(packageBytes, {
    expectedPackageHash: bootstrap.package.sha256,
  });
  const project = gameProjectFrom(imported);
  if (project.projectId !== bootstrap.manifest.projectId) {
    throw new Error("公開GameのProject IDがManifestと一致しません。");
  }
  const data: GameSourceData = { project, draw: imported.state, imported };
  const launch = createIGameRuntimeLaunchConfig({
    title: bootstrap.manifest.title,
    subtitle: "公開Revisionを確認しました。STARTでGameを開始します。",
    startSceneId: project.editorTimeline?.tracks[0]?.trackId || "scene-start",
    startLabel: "START",
  });
  return {
    manifest: bootstrap.manifest,
    proof: bootstrap.proof,
    launch,
    mount: async (context) => mountBrowserGame(context, data),
  };
}

export async function createIGameBrowserRuntimeSourceFromBootstrap(
  bootstrap: IGamePublicBootstrap,
): Promise<IGamePlayerRuntimeSource> {
  const packageBytes = await fetchIGamePublicPackage(bootstrap);
  return createIGameBrowserRuntimeSource(bootstrap, packageBytes);
}
