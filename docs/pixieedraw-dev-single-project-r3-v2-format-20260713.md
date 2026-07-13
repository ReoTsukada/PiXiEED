# PiXiEEDrawDEV R3: 単一プロジェクト V2 形式

対象は `PiXiEEDrawDEV/` のみであり、`pixiedraw/`（本番）は変更しない。

## 新規V2の保存構造

build `20260713-045` から、新しく保存・自動保存・V2エクスポートするデータは一つのプロジェクトだけを保持する。

```text
V2 archive (.pixieedraw ZIP)
├── manifest.json
├── project.json        # document / session / timelapse metadata
├── canvases/*.json
└── bitmaps/*.rgba.zlib
```

`project.json`、archive manifest、IndexedDBの新manifestには、次を出力しない。

- `sheets`
- `sheetOrder`
- `activeSheetId`
- inactive tab payload
- sheet単位のcheckpoint / journal参照

アニメーションのフレーム、レイヤー、履歴、タイムラプスは `document` と `session` の中に残る。これらはプロジェクトタブとは別の描画データである。

## 自動保存

新しいIndexedDB V2 manifestは `projectLayout: 'single-project'` と単一の `project` checkpoint / journal参照を使う。物理ストア名は既存DBとの互換のため当面変更しないが、新規レコードに `sheetId`、`sheets`、`activeSheetId` は書かれない。

ピクセル変更だけの自動保存も、同じ単一project journalへ追記する。保存先ファイルへの通常上書きは `project.json` と必要なcanvas / bitmapだけを書き出す。

## 外部ファイルを開いた直後のV2化

PNG、JPEG、WebP、GIF、V1、旧V2を開くと、入力bytesは読込・デコード直後に単一V2の作業プロジェクトへ正規化する。入力形式のdecoded payload、元ファイルの保存handle、旧V2のsheet collectionを作業状態へ保持しない。

- 次の保存は必ずV2の保存先選択から始まる。
- 元V1・旧V2・画像ファイルを通常保存や自動保存で上書きしない。
- 元ファイルはユーザーの端末上に残す。PiXiEEDrawが削除・置換することはない。
- 一度に開ける外部ファイルは一つだけとし、旧「複数ファイルをプロジェクトタブへ追加」の経路は使用しない。

## 既存V2・V1との互換

- 旧V2に `sheets` がある場合は読み込み専用で受理する。
- 複数プロジェクトを含む旧V1／旧V2は、全件の分割V2保存が成功するまで読み込み完了にしない。各プロジェクトは別々のV2 manifestとして作成し、旧ファイルは上書きしない。
- 読み込み画面には旧ファイルのactive projectだけを表示するが、残りの各projectも同時に個別V2として作成する。分割できない場合は読み込みを成功扱いにせず、元ファイルはそのまま残す。
- 旧V2の自動保存manifestも読み込み可能にし、次回のcheckpoint保存から単一project manifestへ置換する。
- V1、PNG、JPEG、WebP、GIFは既存の入力処理で現在の一つの描画プロジェクトとして読み込み、次の保存時に単一V2となる。

## 削減対象と非対象

削減されるのは、同時に開かれていた別プロジェクトのdocument / history / timelapse / thumbnailを一つの保存payloadへ複製する部分である。単一の大きなGIFや高解像度canvas自体の画像メモリは残るため、今回だけでそのピーク使用量が画像サイズに比例して小さくなるわけではない。

## 検証

静的・単体検証:

```sh
node scripts/test-pixiedraw-dev-single-project-v2-r3.mjs
node scripts/test-pixiedraw-dev-autosave-schema-v2-phase4m.mjs
node scripts/test-pixiedraw-dev-autosave-schema-v2-recovery-open-phase4r.mjs
node scripts/test-pixiedraw-dev-autosave-schema-v2-restore-preview-phase4q.mjs
node scripts/test-pixiedraw-dev-project-storage-phase2.mjs
node scripts/test-pixiedraw-dev-project-storage-phase4d-persistence.mjs
node scripts/test-pixiedraw-dev-active-project-session-r2.mjs
node scripts/check-pixiedraw-dev-tdz.mjs
```

すべて成功。実ブラウザでは build `20260713-045` を読み込んだ後、V2初回保存、同一保存先上書き、旧V2複数プロジェクト読込・分割、V1/画像入力、recent/recovery/reloadを順に確認する。
