# PiXiEEDraw 軽量保存形式・Codex実装プロンプト集

## 目的

PiXiEEDrawの `.pixieedraw` ファイルの読み書きを軽量化する。

現状の `.pixieedraw` はJSONベースの独自形式で、画像データが `layer.direct` にBase64化されたRGBAとして保存されている。

この方式は実装やデバッグがしやすい一方で、ファイルサイズが大きくなりやすく、読み込み・保存・メモリ使用量の面で不利。

目標は、既存ファイル互換を壊さず、将来的に以下のような軽量形式へ移行できるようにすること。

```text
project.pixieedraw
├─ manifest.json
├─ project.json
├─ canvases/canvas_001.json
├─ bitmaps/{hash}.rgba.zlib
├─ thumbnails/preview.png
└─ timelapse/events.jsonl.zst
```

## 重要な前提

いきなり全面改修しない。

まずはCodexに現状を調査させ、保存・読み込み・出力・タイムラプス・スプライトマップ・販売用出力に影響が出る箇所を精査する。

その後、段階的に以下を進める。

1. Phase 0：調査のみ
2. Phase 1：保存・読み込み処理の抽象化
3. Phase 2：v2 ZIP保存形式の実験実装
4. Phase 3：軽量化強化、Web Worker化、遅延ロード、タイムラプス分離

---

# Codexプロンプト 1：まず理解・精査させる

以下をCodexにそのまま貼る。

```text
あなたはPiXiEEDrawのコードベースを調査・改善するエンジニアです。

目的は、`.pixieedraw` ファイルの読み書きを軽量化するために、現行保存形式を理解し、破壊的変更を避けながら、v2保存形式への移行計画と最小実装案を出すことです。

重要：最初の作業では、いきなり大規模修正しないでください。まず現状理解・影響範囲・変更案・テスト方針を精査してください。

背景：
現在の `.pixieedraw` はJSONベースの独自形式です。画像データは `layer.direct` にBase64化されたRGBAとして保存されています。提出済みサンプル `タイムラプステスト.pixieedraw` では、`type: "pixieedraw-project"`、`packageVersion: 2`、`document.width: 21`、`document.height: 21`、`document.canvases` が複数存在し、各canvasにframes、各frameにlayersがあります。layerには `indices`、`direct`、`directOnly` などがあります。`direct` はRGBA raw bytesをBase64化したものと考えられます。

やりたいこと：
1. 現行 `.pixieedraw` の保存・読み込み実装を調査する
2. どこでJSONを生成しているかを特定する
3. `direct` / `indices` / frames / canvases / timelapse / selection / mirror / playback がどこで使われているか調査する
4. v2軽量形式に移行した場合の影響範囲をまとめる
5. 既存ファイルを壊さず読み込める互換方針を提案する
6. 可能なら最小実装として、現行JSON形式を維持したまま、軽量化しやすい抽象レイヤーを追加する

最終的に目指すv2形式：
`.pixieedraw` をZIPコンテナ化する。

例：
project.pixieedraw
- manifest.json
- project.json
- canvases/canvas_001.json
- bitmaps/{hash}.rgba.zlib
- thumbnails/preview.png
- timelapse/events.jsonl.zst

設計方針：
- JSON内にBase64画像を直書きしない
- ピクセルデータは `bitmaps/{hash}.rgba.zlib` のような別エントリに保存する
- canvas/frame/layerの構造情報はJSONに残す
- layer/celは `bitmapRef` でbitmapを参照する
- 空レイヤー・完全透明bitmapは保存しない
- 透明領域はトリミングして `x, y, w, h` を持つcelとして保存する
- manifestだけ先読みできるようにする
- activeCanvas以外は遅延ロードできるようにする
- timelapseは本体から分離し、必要なときだけ読む
- Undo履歴は保存ファイルに含めない
- 既存v1 JSONは必ず読み込めるようにする
- v2保存はfeature flagまたは別関数として追加し、既存保存を壊さない

最初にやってほしいこと：
以下を調査して、Markdownで報告してください。

調査項目：
1. `.pixieedraw` の読み込み処理の入口
2. `.pixieedraw` の保存処理の入口
3. 現在のProject/Document/Canvas/Frame/Layer型の定義場所
4. `direct` を生成している箇所
5. `direct` を読み込んでcanvasへ復元している箇所
6. `indices` の用途
7. `directOnly` の用途
8. timelapseを保存しているか、保存している場合の場所
9. 複数canvasの読み書きの流れ
10. sprite map出力と保存形式の関係
11. 販売用出力に接続できそうな箇所
12. v2化した場合に壊れそうな箇所
13. 最小修正で入れるべき抽象化レイヤー

次に、実装案を3段階で提案してください。

Phase 0：調査のみ
- コードは変更しない
- 現状の読み書き構造を報告
- v2移行のリスクを列挙

Phase 1：安全な下準備
- 既存保存形式は変えない
- `ProjectStorageAdapter` のような抽象化を追加
- v1 JSON読み書きを adapter 経由にする
- テストを追加
- 既存ファイルが読み込めることを確認

Phase 2：v2実験実装
- v2保存を別関数として追加
- `.pixieedraw` ZIPコンテナを書き出せるようにする
- manifest.json / project.json / canvases/*.json / bitmaps/*.rgba.zlib を生成
- v2読み込みを追加
- feature flagで有効化
- v1読み込み互換は維持

Phase 3：軽量化強化
- 透明領域トリミング
- hashによるbitmap重複排除
- activeCanvas遅延ロード
- timelapse分離
- Web Worker化

実装する場合の注意：
- 既存ファイル互換を絶対に壊さない
- まずv1の読み込み・保存テストを作る
- サンプル `.pixieedraw` をfixtureとして使えるなら使う
- ブラウザ環境で動く圧縮ライブラリを確認する
- Node専用APIに依存しない
- メインスレッドを重くしない設計にする
- 大きな変更は小さなPR単位に分ける

調査後の出力形式：
1. 現状の保存形式の説明
2. 読み込み処理の流れ
3. 保存処理の流れ
4. 問題点
5. v2化で得られる効果
6. 影響範囲
7. 実装リスク
8. 最小修正案
9. 追加すべきテスト
10. 次に実装するべきファイル一覧

まだ実装に入る前に、まずこの調査レポートを出してください。
```

---

# Codexプロンプト 2：Phase 1 安全な下準備

Codexの調査結果を確認した後、問題なければ以下を投げる。

```text
前回の調査レポートを前提に、Phase 1の安全な下準備だけを実装してください。

目的：
既存 `.pixieedraw` の読み書き仕様を壊さず、将来v2 ZIP保存形式へ移行できるように、保存・読み込み処理の抽象化レイヤーを追加する。

やること：
1. 現在の `.pixieedraw` 読み込み処理を探す
2. 現在の `.pixieedraw` 保存処理を探す
3. `ProjectStorageAdapter` インターフェースを追加する
4. 現行JSON形式用の `PixieeDrawV1JsonAdapter` を追加する
5. 既存の読み込み・保存処理を可能な範囲でadapter経由にする
6. ただし保存されるファイル内容は現状と同じにする
7. 既存サンプルファイルが読み込めるテストを追加する
8. 既存保存形式が壊れていないことを確認するテストを追加する

まだやらないこと：
- ZIPコンテナ化はしない
- v2保存はまだ有効化しない
- UI変更はしない
- ファイル拡張子変更はしない
- Aseprite import/exportはしない
- timelapse分離はしない
- 大きなリファクタはしない

実装方針：
- 小さな差分にする
- 既存挙動を変えない
- 既存関数の中身をいきなり削らない
- 可能なら既存保存処理をadapter内部に移す
- 型が不明な部分は既存型を優先する
- anyを使う場合はTODOコメントを残す

追加してほしいファイル例：
- src/storage/ProjectStorageAdapter.ts
- src/storage/v1/PixieeDrawV1JsonAdapter.ts
- src/storage/index.ts
- src/storage/__tests__/PixieeDrawV1JsonAdapter.test.ts

完了後に報告してほしいこと：
1. 変更したファイル
2. 既存挙動が変わらない理由
3. 追加したテスト
4. v2化するときに次に触るべき箇所
5. 残っているリスク
```

---

# Codexプロンプト 3：Phase 2 v2実験保存

Phase 1が安定してから投げる。

```text
Phase 2として、`.pixieedraw v2` の実験保存・読み込みを追加してください。

重要：
既存v1 JSON保存をデフォルトのまま残してください。v2保存はfeature flagまたは明示的な関数からのみ使えるようにしてください。

目的：
JSON内Base64画像をやめ、ZIPコンテナ内に圧縮bitmapとして保存できる実験実装を追加する。

v2構造：
- manifest.json
- project.json
- canvases/{canvasId}.json
- bitmaps/{sha256}.rgba.zlib
- thumbnails/preview.png 任意
- timelapse/events.jsonl.zst 任意、今回は未実装でよい

実装すること：
1. `PixieeDrawV2ZipAdapter` を追加
2. v1 projectをv2構造へnormalizeする関数を追加
3. `layer.direct` のBase64 RGBAをUint8Arrayへ変換
4. 完全透明レイヤーはbitmap保存しない
5. 透明領域をトリミングしてcelとして保存
6. celには `x, y, w, h, bitmapRef, hash, encoding` を保存
7. RGBA bitmapをZLIB圧縮して `bitmaps/{hash}.rgba.zlib` に保存
8. 同じhashのbitmapは重複保存しない
9. manifestだけで概要が読めるようにする
10. v2を読み込んだとき、既存アプリが扱えるv1相当構造へ復元する処理を追加
11. テストを追加

使うライブラリ：
- 既存プロジェクトに圧縮/zipライブラリがあればそれを使う
- なければブラウザ対応の軽量ライブラリを検討
- Node専用APIには依存しない
- 候補は `fflate`

テスト：
1. v1サンプルをv2へ保存できる
2. v2を読み戻すとwidth/height/canvas/frame/layer数が一致する
3. RGBAピクセルが保存前後で一致する
4. 完全透明レイヤーがbitmap保存されない
5. 同一bitmapが重複保存されない
6. manifestだけを読み出せる
7. v1読み込み互換が壊れていない

まだやらないこと：
- UI接続
- デフォルト保存形式の変更
- Aseprite import/export
- Web Worker化
- timelapse分離
- tile差分保存

完了後に、v1ファイルサイズとv2ファイルサイズの比較を出してください。
```

---

# コードテンプレート

## storage/types.ts

```ts
export type PixieeDrawFileVersion = 1 | 2;

export interface PixieeDrawManifestV2 {
  format: "pixieedraw";
  version: 2;
  packageVersion: number;
  projectId?: string;
  width: number;
  height: number;
  canvasCount: number;
  activeCanvasId: string;
  thumbnail?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface PixieeDrawProjectV2 {
  type: "pixieedraw-project";
  version: 2;
  document: {
    width: number;
    height: number;
    activeCanvasId: string;
    palette?: PixieeColor[];
    canvases: PixieeCanvasMetaV2[];
    playback?: unknown;
    mirror?: unknown;
  };
  session?: unknown;
  market?: unknown;
}

export interface PixieeColor {
  r: number;
  g: number;
  b: number;
  a: number;
  name?: string;
}

export interface PixieeCanvasMetaV2 {
  id: string;
  name: string;
  path: string;
  width: number;
  height: number;
  frameCount: number;
  layerCount: number;
}

export interface PixieeCanvasV2 {
  id: string;
  name: string;
  width: number;
  height: number;
  activeFrame: number;
  activeLayer: number;
  frames: PixieeFrameV2[];
}

export interface PixieeFrameV2 {
  id: string;
  name?: string;
  duration: number;
  layers: PixieeLayerV2[];
}

export interface PixieeLayerV2 {
  id: string;
  name: string;
  visible: boolean;
  opacity: number;
  blendMode: "normal" | string;
  cel?: PixieeCelV2;
  empty?: boolean;
}

export interface PixieeCelV2 {
  x: number;
  y: number;
  w: number;
  h: number;
  bitmapRef: string;
  hash: string;
  encoding: "rgba-zlib";
}
```

## storage/ProjectStorageAdapter.ts

```ts
export interface ProjectStorageAdapter<TProject = unknown> {
  readonly version: number;

  canRead(input: ArrayBuffer | string): boolean | Promise<boolean>;

  read(input: ArrayBuffer | string): Promise<TProject>;

  write(project: TProject): Promise<Blob | ArrayBuffer | string>;
}
```

## storage/v1/PixieeDrawV1JsonAdapter.ts

```ts
import { ProjectStorageAdapter } from "../ProjectStorageAdapter";

export class PixieeDrawV1JsonAdapter implements ProjectStorageAdapter<any> {
  readonly version = 1;

  async canRead(input: ArrayBuffer | string): Promise<boolean> {
    try {
      const text =
        typeof input === "string"
          ? input
          : new TextDecoder().decode(input);

      const json = JSON.parse(text);
      return json?.type === "pixieedraw-project";
    } catch {
      return false;
    }
  }

  async read(input: ArrayBuffer | string): Promise<any> {
    const text =
      typeof input === "string"
        ? input
        : new TextDecoder().decode(input);

    return JSON.parse(text);
  }

  async write(project: any): Promise<string> {
    return JSON.stringify(project);
  }
}
```

## storage/v2/bitmap.ts

```ts
export function base64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }

  return bytes;
}

export function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = "";

  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }

  return btoa(binary);
}

export function isFullyTransparentRgba(rgba: Uint8Array): boolean {
  for (let i = 3; i < rgba.length; i += 4) {
    if (rgba[i] !== 0) return false;
  }

  return true;
}

export interface TrimmedRgba {
  x: number;
  y: number;
  w: number;
  h: number;
  rgba: Uint8Array;
}

export function trimTransparentRgba(
  rgba: Uint8Array,
  width: number,
  height: number
): TrimmedRgba | null {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const alphaIndex = (y * width + x) * 4 + 3;

      if (rgba[alphaIndex] !== 0) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (maxX < 0 || maxY < 0) {
    return null;
  }

  const trimmedWidth = maxX - minX + 1;
  const trimmedHeight = maxY - minY + 1;
  const trimmed = new Uint8Array(trimmedWidth * trimmedHeight * 4);

  for (let y = 0; y < trimmedHeight; y += 1) {
    const sourceStart = ((minY + y) * width + minX) * 4;
    const sourceEnd = sourceStart + trimmedWidth * 4;
    const targetStart = y * trimmedWidth * 4;

    trimmed.set(rgba.subarray(sourceStart, sourceEnd), targetStart);
  }

  return {
    x: minX,
    y: minY,
    w: trimmedWidth,
    h: trimmedHeight,
    rgba: trimmed,
  };
}
```

## storage/v2/hash.ts

```ts
export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);

  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
```

## storage/v2/PixieeDrawV2ZipAdapter.ts

```ts
import {
  zipSync,
  unzipSync,
  strToU8,
  strFromU8,
  zlibSync,
} from "fflate";

import { ProjectStorageAdapter } from "../ProjectStorageAdapter";
import {
  PixieeDrawManifestV2,
  PixieeDrawProjectV2,
  PixieeCanvasV2,
} from "../types";

export class PixieeDrawV2ZipAdapter implements ProjectStorageAdapter<any> {
  readonly version = 2;

  async canRead(input: ArrayBuffer | string): Promise<boolean> {
    if (typeof input === "string") return false;

    try {
      const files = unzipSync(new Uint8Array(input));
      if (!files["manifest.json"]) return false;

      const manifest = JSON.parse(strFromU8(files["manifest.json"]));
      return manifest?.format === "pixieedraw" && manifest?.version === 2;
    } catch {
      return false;
    }
  }

  async read(input: ArrayBuffer | string): Promise<any> {
    if (typeof input === "string") {
      throw new Error("PixieeDraw v2 must be read from binary data.");
    }

    const files = unzipSync(new Uint8Array(input));

    const manifest = JSON.parse(
      strFromU8(files["manifest.json"])
    ) as PixieeDrawManifestV2;

    const project = JSON.parse(
      strFromU8(files["project.json"])
    ) as PixieeDrawProjectV2;

    const activeCanvasMeta = project.document.canvases.find(
      (c) => c.id === manifest.activeCanvasId
    );

    if (!activeCanvasMeta) {
      throw new Error(`Active canvas not found: ${manifest.activeCanvasId}`);
    }

    const activeCanvas = JSON.parse(
      strFromU8(files[activeCanvasMeta.path])
    ) as PixieeCanvasV2;

    return {
      manifest,
      project,
      activeCanvas,
      files,
    };
  }

  async write(project: any): Promise<ArrayBuffer> {
    const normalized = await normalizeProjectToV2(project);

    const fileMap: Record<string, Uint8Array> = {};

    fileMap["manifest.json"] = strToU8(
      JSON.stringify(normalized.manifest)
    );

    fileMap["project.json"] = strToU8(
      JSON.stringify(normalized.project)
    );

    for (const canvas of normalized.canvases) {
      fileMap[`canvases/${canvas.id}.json`] = strToU8(
        JSON.stringify(canvas)
      );
    }

    for (const bitmap of normalized.bitmaps) {
      fileMap[bitmap.path] = zlibSync(bitmap.rgba);
    }

    const zipped = zipSync(fileMap, {
      level: 6,
    });

    return zipped.buffer.slice(
      zipped.byteOffset,
      zipped.byteOffset + zipped.byteLength
    );
  }
}

async function normalizeProjectToV2(project: any): Promise<{
  manifest: PixieeDrawManifestV2;
  project: PixieeDrawProjectV2;
  canvases: PixieeCanvasV2[];
  bitmaps: Array<{ path: string; rgba: Uint8Array; hash: string }>;
}> {
  throw new Error("Implement after mapping current project shape.");
}
```

## storage/v2/restore.ts

```ts
import { unzlibSync } from "fflate";
import { uint8ArrayToBase64 } from "./bitmap";

export function restoreV2CanvasToV1Shape(
  canvas: any,
  files: Record<string, Uint8Array>,
  width: number,
  height: number
): any {
  return {
    ...canvas,
    frames: canvas.frames.map((frame: any) => ({
      ...frame,
      layers: frame.layers.map((layer: any) => {
        if (!layer.cel) {
          return {
            ...layer,
            direct: undefined,
            directOnly: true,
          };
        }

        const compressed = files[layer.cel.bitmapRef];

        if (!compressed) {
          throw new Error(`Missing bitmap: ${layer.cel.bitmapRef}`);
        }

        const trimmedRgba = unzlibSync(compressed);
        const fullRgba = new Uint8Array(width * height * 4);

        blitRgba(
          fullRgba,
          width,
          height,
          trimmedRgba,
          layer.cel.w,
          layer.cel.h,
          layer.cel.x,
          layer.cel.y
        );

        return {
          ...layer,
          direct: uint8ArrayToBase64(fullRgba),
          directOnly: true,
        };
      }),
    })),
  };
}

function blitRgba(
  target: Uint8Array,
  targetWidth: number,
  targetHeight: number,
  source: Uint8Array,
  sourceWidth: number,
  sourceHeight: number,
  x: number,
  y: number
): void {
  for (let row = 0; row < sourceHeight; row += 1) {
    const targetY = y + row;

    if (targetY < 0 || targetY >= targetHeight) continue;

    const targetStart = (targetY * targetWidth + x) * 4;
    const sourceStart = row * sourceWidth * 4;
    const length = sourceWidth * 4;

    target.set(source.subarray(sourceStart, sourceStart + length), targetStart);
  }
}
```

---

# 実装判断

## まずやるべきこと

最初はCodexプロンプト1だけを実行する。

理由は、既存の保存・読み込み処理の場所を確認せずに修正すると、以下を壊す可能性があるため。

- 既存ファイルの読み込み
- 通常保存
- タイムラプス
- スプライトマップ出力
- 複数canvas
- selection
- mirror
- playback
- 販売用出力
- 今後のAseprite import/export

## いきなりやってはいけないこと

- 既存 `.pixieedraw` の保存形式を即変更する
- Base64を完全削除する
- v2をデフォルト保存にする
- UIからv2保存を有効化する
- ZIP化とAseprite対応を同時に入れる
- Web Worker化まで同時にやる
- タイムラプス分離を同時にやる

## 最も安全な順番

1. 調査
2. v1保存読み込みのテスト追加
3. storage adapter追加
4. v1 adapter化
5. v2 adapterを実験追加
6. v1→v2→v1復元テスト
7. ファイルサイズ比較
8. UI接続
9. Web Worker化
10. Aseprite import/export

---

# 最終結論

PiXiEEDrawの読み書きを軽くするには、JSON内Base64保存をやめる必要がある。

ただし、既存ファイル互換を壊してはいけない。

そのため、まずCodexには調査をさせる。

次に、保存・読み込みを `ProjectStorageAdapter` で抽象化する。

その後、v2 ZIPコンテナ形式を実験的に追加する。

v2では、構造情報はJSONに残し、ピクセルデータはZLIB圧縮されたバイナリとして分離する。

透明領域はトリミングし、完全透明レイヤーは保存しない。

将来的には、activeCanvasの遅延ロード、timelapse分離、Web Worker化、Aseprite import/exportへ進める。
