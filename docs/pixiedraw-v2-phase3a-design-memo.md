# PiXiEEDraw V2 Phase 3-A Design Memo

## 1. Phase 3-Aの目的

`includeSheets:true` によって、v2を active sheet 限定の実験形式から、複数sheetを含む PiXiEEDraw 元ファイル候補へ拡張する。

前提:
- 対象は `PiXiEEDrawDEV/` のみ
- 本番 `pixiedraw/` には触れない
- 既定保存は v1 JSON のまま維持する
- v2 は experimental / 明示経路のまま扱う

## 2. 採用する構造

```text
manifest.json
project.json
sheets/{sheetId}/project.json
sheets/{sheetId}/canvases/{canvasId}.json
bitmaps/{hash}.rgba.zlib
```

## 3. 採用方針

`B` を器にして `C` を中身にする。

- 各sheetを active sheet と同じ normalize 処理に通す
- bitmap は archive 全体の共通 `bitmaps/` で hash 重複排除する
- root `project.json` には root metadata、`session`、`activeSheetId`、軽量な `sheets[]` manifest を持たせる
- 各sheet本体は `sheets/{sheetId}/...` 配下へ分離する

## 4. 採用しない方針

`A` 案、つまり `sheets/{sheetId}.json` に `sheet.project` の v1 packaged payload をそのまま入れる方式は採用しない。

理由:
- 非active sheet の `direct` Base64 が raw v1 nested payload として残る
- 結果として軽量化が崩れる
- active sheet と non-active sheet で保存ルールが分かれ、復元保証も弱くなる

## 5. 実装前に必ず直すこと

bitmap hash key を `cropped RGBA bytes` のみから、少なくとも `encoding + w + h + bytes` を含む形に変更する。

理由:
- 全sheet共通 `bitmaps/` にする前に、同一bytesだが異なる `w/h` の衝突余地を潰す必要がある
- sheet 間 dedupe を安全に広げる前提条件になる

## 6. 復元時の必須条件

v2読込後は、root も各sheet も v1 packaged project shape へ復元する。

維持必須項目:
- `type`
- `packageVersion`
- `document`
- `session`
- `sheets`
- `activeSheetId`
- `document.canvases`
- `activeCanvasId`
- `frames`
- `layers`
- `indices`
- `direct`
- `directOnly`
- `importSourceDirect`
- `timelapse`

補足:
- active sheet 内の multi-canvas と top-level multi-sheet は別問題として扱う
- ただし販売用元ファイル候補にするには、最終的に両方を同時に維持できる必要がある

## 7. 追加fixture

- active sheet のみ、single-sheet, multi-canvas
- active + non-active sheet
- non-active sheet に multi-canvas
- sheet 間で同一bitmap共有
- timelapse あり
- `directOnly` layer
- indexed layer
- mixed indexed + direct layer
- 同一bytesだが異なる `w/h` の bitmap collision fixture

## 8. 販売用元ファイルへの判断

複数sheet作品を販売用元ファイルにするなら `includeSheets:true` は必須。

active sheet のみ販売で問題ないのは、単一sheet作品として提供するケースだけ。

`timelapse` は元ファイルの最低条件ではなく、工程再生を商品仕様に含める場合のみ必要。

販売用元ファイルとして最低限必要なこと:
- 全sheetが欠落しない
- 各sheetの multi-canvas が欠落しない
- `indices` / `direct` / `directOnly` / `importSourceDirect` が維持される
- `activeSheetId` / `activeCanvasId` が維持される
- PiXiEEDraw 再編集に必要な `session` 情報が維持される

## 9. Phase 3実装順

1. Phase 3-A: 設計メモ化
2. Phase 3-B: hash key を `encoding + w + h + bytes` 含みに強化
3. Phase 3-C: bitmap collision fixture / test 追加
4. Phase 3-D: sheet archive schema実装
5. Phase 3-E: multi-sheet / multi-canvas round-trip test
6. Phase 3-F: DEV hidden V2保存で `includeSheets:true` 手動検証
7. Phase 3-G: サイズ・速度・復元比較
8. Phase 3-H: timelapse分離設計
9. Phase 3-I: Web Worker化設計

## 10. 実装前に再確認すること

- `includeSheets:true` を有効にしたとき、non-active sheet が raw v1 nested payload のまま残らないこと
- 各sheetが active sheet と同じ normalize / restore 経路を通ること
- root `project.json` に sheet本体を肥大化させないこと
- 既定保存、autosave、recentProjects、shared sync は引き続き v1 JSON のままであること
