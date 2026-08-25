/**
 * Draw2 Export の唯一の形式レジストリ。
 *
 * UI、プレビュー、実出力はこの定義を参照する。実装されていない形式を
 * UIへ出さないため、将来候補もここで visible / supported を明示する。
 */

export type ExportFormat =
  | "png"
  | "jpeg"
  | "webp"
  | "avif"
  | "bmp"
  | "tiff"
  | "gif"
  | "apng"
  | "webm"
  | "wav"
  | "audio-webm"
  | "audio-ogg"
  | "svg"
  | "sprite-sheet"
  | "atlas-json"
  | "tileset"
  | "pxd"
  | "glb";

export type ExportCategory =
  | "image"
  | "animation"
  | "audio"
  | "tiles"
  | "project"
  | "game";

export type ExportPackageMode = "single" | "zip";

export interface ExportState {
  readonly name: string;
  readonly selectedFormats: readonly ExportFormat[];
  readonly scale: number;
  readonly packageMode: ExportPackageMode;
  readonly options: {
    readonly includeOriginal?: boolean;
    readonly colorSpriteComposite?: boolean;
    readonly grid?: {
      readonly width: number;
      readonly height: number;
    };
  };
}

export interface ExportFormatDefinition {
  readonly id: ExportFormat;
  readonly category: ExportCategory;
  readonly label: string;
  readonly description: string;
  readonly extension: string;
  readonly mimeType: string;
  readonly visible: boolean;
  readonly supported: boolean;
  readonly supportsScale: boolean;
}

/**
 * PNG keeps a bounded output budget while still allowing tiny pixel canvases
 * to become useful presentation-sized images. A 16×16 canvas can therefore
 * reach 4096×4096 at 256×, while a 256×256 canvas remains capped at 16×.
 */
export const PNG_EXPORT_MAX_PIXELS = 4096 * 4096;
export const PNG_EXPORT_MAX_DIMENSION = 8192;
export const PNG_EXPORT_MAX_SCALE = 256;
export const PNG_EXPORT_SCALE_PRESETS: readonly number[] = Object.freeze([
  1,
  2,
  3,
  4,
  6,
  8,
  12,
  16,
  24,
  32,
  48,
  64,
  96,
  128,
  192,
  256,
]);

export function maxPngExportScale(width: number, height: number): number {
  const safeWidth = Math.max(1, Math.floor(Number.isFinite(width) ? width : 1));
  const safeHeight = Math.max(
    1,
    Math.floor(Number.isFinite(height) ? height : 1),
  );
  const sourcePixels = safeWidth * safeHeight;
  const byPixels = Math.floor(Math.sqrt(PNG_EXPORT_MAX_PIXELS / sourcePixels));
  const byDimension = Math.floor(
    PNG_EXPORT_MAX_DIMENSION / Math.max(safeWidth, safeHeight),
  );
  return Math.max(
    1,
    Math.min(PNG_EXPORT_MAX_SCALE, byPixels, byDimension),
  );
}

export function pngExportScaleOptions(
  width: number,
  height: number,
): number[] {
  const maxScale = maxPngExportScale(width, height);
  return PNG_EXPORT_SCALE_PRESETS.filter((scale) => scale <= maxScale);
}

export const EXPORT_FORMATS: readonly ExportFormatDefinition[] = Object.freeze([
  {
    id: "png",
    category: "image",
    label: "PNG",
    description: "透過を保った画像",
    extension: "png",
    mimeType: "image/png",
    visible: true,
    supported: true,
    supportsScale: true,
  },
  {
    id: "jpeg",
    category: "image",
    label: "JPEG",
    description: "軽量な画像",
    extension: "jpg",
    mimeType: "image/jpeg",
    visible: true,
    supported: true,
    supportsScale: true,
  },
  {
    id: "webp",
    category: "image",
    label: "WebP",
    description: "軽量・透過対応の画像",
    extension: "webp",
    mimeType: "image/webp",
    visible: true,
    supported: true,
    supportsScale: true,
  },
  {
    id: "avif",
    category: "image",
    label: "AVIF",
    description: "ブラウザ対応時の高圧縮画像",
    extension: "avif",
    mimeType: "image/avif",
    visible: true,
    supported: true,
    supportsScale: true,
  },
  {
    id: "bmp",
    category: "image",
    label: "BMP",
    description: "互換性重視のビットマップ",
    extension: "bmp",
    mimeType: "image/bmp",
    visible: true,
    supported: true,
    supportsScale: true,
  },
  {
    id: "tiff",
    category: "image",
    label: "TIFF",
    description: "印刷・保存向けの高品質画像",
    extension: "tiff",
    mimeType: "image/tiff",
    visible: true,
    supported: true,
    supportsScale: true,
  },
  {
    id: "gif",
    category: "animation",
    label: "GIF",
    description: "アニメーション画像",
    extension: "gif",
    mimeType: "image/gif",
    visible: true,
    supported: true,
    supportsScale: true,
  },
  {
    id: "apng",
    category: "animation",
    label: "APNG",
    description: "透過対応アニメーション",
    extension: "apng",
    mimeType: "image/apng",
    visible: true,
    supported: true,
    supportsScale: true,
  },
  {
    id: "webm",
    category: "animation",
    label: "WebM Draw + Audio",
    description: "Drawアニメーションと選択したAudioを一体化した動画",
    extension: "webm",
    mimeType: "video/webm",
    visible: true,
    supported: true,
    supportsScale: false,
  },
  {
    id: "wav",
    category: "audio",
    label: "WAV Mix",
    description: "選択したBGM・SE・楽器を含む非圧縮ミックス",
    extension: "wav",
    mimeType: "audio/wav",
    visible: true,
    supported: true,
    supportsScale: false,
  },
  {
    id: "audio-webm",
    category: "audio",
    label: "WebM Audio (Opus)",
    description: "選択したBGM・SE・楽器を軽量なOpus音声で保存",
    extension: "webm",
    mimeType: "audio/webm",
    visible: true,
    supported: true,
    supportsScale: false,
  },
  {
    id: "audio-ogg",
    category: "audio",
    label: "Ogg Audio (Opus)",
    description: "対応ブラウザで選択したAudioをOgg/Opusで保存",
    extension: "ogg",
    mimeType: "audio/ogg",
    visible: true,
    supported: true,
    supportsScale: false,
  },
  {
    id: "svg",
    category: "image",
    label: "SVG",
    description: "ベクター画像",
    extension: "svg",
    mimeType: "image/svg+xml",
    visible: true,
    supported: true,
    supportsScale: true,
  },
  {
    id: "sprite-sheet",
    category: "animation",
    label: "Sprite Sheet",
    description: "全フレームを並べた画像",
    extension: "png",
    mimeType: "image/png",
    visible: true,
    supported: true,
    supportsScale: true,
  },
  {
    id: "atlas-json",
    category: "animation",
    label: "Atlas metadata",
    description: "Sprite Sheetの座標メタデータ",
    extension: "json",
    mimeType: "application/json",
    visible: true,
    supported: true,
    supportsScale: false,
  },
  {
    id: "tileset",
    category: "tiles",
    label: "Tileset",
    description: "タイル素材と配置情報",
    extension: "png",
    mimeType: "image/png",
    visible: true,
    supported: true,
    supportsScale: true,
  },
  {
    id: "pxd",
    category: "project",
    label: "PXD Project",
    description: "Draw / Audio / Gameを含むプロジェクト",
    extension: "pxd",
    mimeType: "application/vnd.pixieed.pxd",
    visible: true,
    supported: true,
    supportsScale: false,
  },
  {
    id: "glb",
    category: "game",
    label: "GLB",
    description: "3Dゲーム素材（将来対応）",
    extension: "glb",
    mimeType: "model/gltf-binary",
    visible: false,
    supported: false,
    supportsScale: false,
  },
]);

const EXPORT_FORMAT_BY_ID: ReadonlyMap<ExportFormat, ExportFormatDefinition> =
  new Map(EXPORT_FORMATS.map((definition) => [definition.id, definition]));

export function exportFormatDefinition(
  id: ExportFormat,
): ExportFormatDefinition {
  const definition = EXPORT_FORMAT_BY_ID.get(id);
  if (definition === undefined) {
    throw new Error(`Unknown Draw2 export format: ${id}`);
  }
  return definition;
}

export function visibleExportFormats(): readonly ExportFormatDefinition[] {
  return EXPORT_FORMATS.filter((definition) => definition.visible);
}

export function normalizeExportFormats(
  formats: readonly ExportFormat[],
): ExportFormat[] {
  const selected = new Set(formats);
  return EXPORT_FORMATS
    .filter((definition) => definition.visible && definition.supported)
    .filter((definition) => selected.has(definition.id))
    .map((definition) => definition.id);
}
