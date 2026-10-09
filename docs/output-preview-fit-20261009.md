# 出力プレビューのCSSフィット検証

対象: `/output/work/`。2026-10-09。修正・ローカル検証のみ。commit/push/公開は行っていない。

## IMPLEMENTED

- 画像・タイムラインcanvas・動画を共通フィット処理で表示する。親の実bounding rectからborder/paddingを除き、元出力の比率に対して `min(欄幅/元幅, 欄高/元高)` を使う。小さい画像はCSSで拡大し、整数や1以上の倍率に制限しない。
- プレビューを単一gridセルにし、非表示canvasを含むmediaを `display:none` にする。タイムラインの非同期原寸確認でも別の静止画を表示しない。
- 親ResizeObserver、画像load、動画loadedmetadata/resize、canvas属性・表示素材の変更、画面resize/orientationchangeで再計算する。pagehideで監視を止め、bfcache復帰時に再接続する。
- 表示倍率は全体フィットを基準に50〜100%。小画像の実拡大率は100%でも1倍を大きく超え、＋ボタンが全体サイズを超えて切り抜くことはない。
- 小さい素材と既存pixel-art根拠にはpixelatedを使う。表示用寸法をdatasetに保持し、SVGのnaturalWidthがCSS寸法に影響される環境でも元比率を維持する。
- 巨大画像の既存縮小プレビュー上限（最大辺1536px・200万画素）は変更していない。1×4096px→1×1536pxのように縮小バッファの丸めで元比率が変わる場合だけ、明示CSS寸法とobject-fit:fillで元出力比率に戻す。元Blob・RGBA・出力サイズ・原寸検出は変更しない。
- `/output/work/` noindex、Offerwall設定・ローダー、PXD直接保存、画像音楽合成、音楽速度/FPS、原寸検出の処理を保持した。

## 表示寸法（CSS px、実bounding rect）

|画面|元画像|修正前|修正後|
|---|---|---|---|
|1280×800|1×1|1×1|561.188×561.188|
|1280×800|16×16|16×16|561.188×561.188|
|1280×800|160×160|160×160|561.188×561.188|
|390×844|1×1|1×1|278.797×278.797|
|390×844|16×16|16×16|278.797×278.797|
|390×844|160×160|160×160|278.797×278.797|
|1280×800|8×2048|6×1536、下側が切れる|2.188×561.188、全体表示|
|390×844|8×2048|1.703×438.875、下側が切れる|1.078×278.797、全体表示|

PCの欄内寸は694.188×561.188、390px幅の欄内寸は338×278.797。修正前には非表示canvasが150pxの行を占有し、画像の位置・収まりを崩していた。1×4096pxも原本は1×4096、縮小バッファは1×1536のまま、PCでは約0.125×561.188pxに表示する（CSSのサブピクセル丸めがある）。

## TESTED

- Chromium統合: **161ケース PASS**。本物の出力ページ、IndexedDB、PNG/JPEG/SVG、GIF/APNG、canvasコマ再生、MediaRecorder生成WebMを使用。1px/16px/160px/1024px/4000×3000px、縦・横・正方形、1×4096px/4096×1pxを確認。
- 1280×800、320×568、390×844、844×390で全4辺の収まりと最大比例寸法をbounding rectでassert。最大寸法の許容誤差0.05 CSS px。設定details開閉、親欄の幅変更、padding/border、出力項目切替、開いたままの画面サイズ変更、縮小→全体復帰、GIF停止用poster/再開も確認。
- 表示操作の前後で元Blob・各出力Blob・元RGBAデータのSHA-256、元/実出力メタデータ、フレーム寸法・delay、音楽/再生設定を比較し一致。ダウンロードURLのBlobも保存済み出力と一致。
- WebKit表示分離検証: **72ケース PASS**。本物の出力ページDOM/CSSと共通fitter、画像/SVG・canvasで元比率、収まり、拡大、pixelatedを確認。IndexedDBを介さない分離検証。
- 既存関連Nodeテスト: **256件 PASS、失敗/skip 0**。output-handoff/import/encoders/timing/video/render、SEO、PXD各テスト、audio-video/export、広告関連。
- `node --check`、`git diff --check` PASS。
- 開始時の既存未コミット差分53ファイル分をbinary diff単位で比較し、全て完全一致。開始時の追跡・未追跡パスは全て存在。

再実行（localhost 4173にリポジトリの静的サーバーが必要）:

```sh
node scripts/output-preview-fit-browser-harness.mjs
node scripts/output-preview-fit-dom-browser-harness.mjs
```

既存Playwrightランタイムを使い、追加依存はインストールしていない。外部広告/通信は遮断。`PIXIEED_BROWSER_BASE_URL` / `PIXIEED_PLAYWRIGHT_MODULE` / `PIXIEED_WEBKIT_EXECUTABLE` で既存環境を指定できる。

## UNTESTED / 制約

- WebKitの完全な出力ページ統合は、既存テストランタイムでIndexedDBへBlobを保存する際の `UnknownError: Error preparing Blob/File data to be stored in object store` により未確認。WebKitでGIF/APNG/動画の出力ページ統合が通ったとは主張しない。
- 実機スマートフォン、実機回転、配信サイト、実広告、bfcacheによる実際の履歴復帰は未確認。
- 正規Library uploadはこの委譲実行環境でprepare_uploads経路が使えず保存できなかった。回避アップロードは行っていない。スクリーンショットとログはローカルに保存済み。

## ローカル証跡

- [修正後スマホ](/tmp/pixieed-output-preview-fit/after-chromium-390-png-16x16.png)
- [修正後PC](/tmp/pixieed-output-preview-fit/after-chromium-1280-png-16x16.png)
- [修正前スマホ](/tmp/pixieed-output-preview-fit/before-chromium-390-png-16x16.png)
- [Chromium寸法JSON](/tmp/pixieed-output-preview-fit/after-chromium.json)
- [WebKit分離寸法JSON](/tmp/pixieed-output-preview-fit/after-webkit-fit-only.json)
- [関連Nodeテストログ](/tmp/pixieed-preview-final.tap)

変更ファイル: `css/tool-output.css`、`js/creation/output-page.mjs`、`js/creation/output-preview-fit.mjs`、`output/work/index.html`、`scripts/output-preview-fit-browser-harness.mjs`、`scripts/output-preview-fit-dom-browser-harness.mjs`、この検証記録。
