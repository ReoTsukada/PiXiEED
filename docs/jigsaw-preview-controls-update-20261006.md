# ジグソー完成図・難易度・操作メニュー更新（2026-10-06）

前回の[ゲーム結果一覧・進行初期化](puzzle-result-list-update-20261006.md)を保持した追加対応。既存の制作画像、PXD、端末保存、再開時のピース配置・難易度・進行は変更しない。

## 実装

- `jigsaw/index.html` / `css/creation-jigsaw.css`：完成図ボタンを輪郭の明瞭な画像SVGへ変更。44px、OFF白・ON黄色＋チェック、`aria-pressed` / `aria-expanded` / 表示状態に応じた名称。ヘッダーの位置と盤面寸法は維持。
- 新規 `js/creation/jigsaw-preview.mjs`：完成図の移動とサイズ変更を専用controllerへ分離。上部44pxの移動欄、44px閉じるボタン、下部44pxのサイズ変更ボタン。画像の元canvas/RGBAは変えずCSS表示寸法だけを調整。
- リサイズは画像比率を維持し、ヘッダー下8pxから下部ナビ上8pxへ制限。通常shell最小128px/最大520px。極端な縦長は操作欄幅と画像幅を分離し、1px未満のCSS画像幅も許容する。小さな横画面ではviewport制約が優先し、その範囲内で画像をさらに縮小できる。
- 独立した`pointerId`を保持してhandleでcapture。別指が所有権を奪わず、盤面へ伝播しない。upはUI位置/寸法を保存、cancel・capture喪失・blur・pagehide・閉じるは操作前へ戻し解放。回転/resizeでは境界へ収め、通常時の希望寸法を上書きしない。
- キーボード：移動欄の矢印で16px（Shift32px）、サイズ欄の矢印で大小調整、Home最小/End最大。Escapeで閉じる。明示的に閉じた後は完成図ボタンへfocus。
- 新UI設定キー`pixieed:jigsaw:preview-window:v1`。既存`pixieed:jigsaw:preview-position:v1`を読み込み、位置の互換書込みも維持。ゲーム保存データと分離。
- 「…」は「全体を見る＋現在の拡大率」「前/次のページ＋現在/全ページ数」「別の絵を選ぶ」。前後ボタンは端で無効表示。拡大率は実際の盤面paintから同期。
- 開始前は4難易度カードのみ。`#jigsaw-grid-size`はhidden内部設定として残し、既存保存/再開・固定partition fixtureの互換性を保持。小さな3px画像は最初の難易度で1ピースにfallback。他の利用不能な難易度は従来どおり無効。
- 専用CSS/page/arcade/new previewのcache revは`20261006-jigsaw-preview-1`。共通ヘッダー・共通Result APIの変更は今回不要。

## 検証

新規 `scripts/jigsaw-preview-browser-harness.mjs`：隔離context、ローカルの合成PNGのみ、外部通信を遮断。

| 条件 | Chromium | WebKit |
|---|---:|---:|
| 320×568 / 390×844 / 844×390 / 1280×800 × 正方形・横長4:1・縦長1:4 | 12/12 PASS | 12/12 PASS |
| 844×390 × 極端な縦長3×3000（比率0.001） | 1/1 PASS | 1/1 PASS |
| 上記各条件のpageerror | 0 | 0 |

全条件でhidden pxと4難易度・選択状態、旧位置pref、ON/OFF表示、画像比率、header/nav内の境界、44px close/resize、実mouseのサイズ変化とtrusted pointercapture、矢印/Shift/Home/End、cancel/blur/capture喪失/閉じる/再ON、viewport回転、ページ無効/ページ移動、実wheelの拡大率→全体表示100%を確認。

保存したdocumentに対し、保存せずピースをさらに1ステップ動かしてから完成図を操作。操作中も既存保存documentが不変、次の明示保存では予測した未保存位置を含むdocumentと完全一致、その後の明示再開も元gameId・source fingerprint・layout・group配置・進行と一致。完成図canvas.toDataURLもリサイズ前後で完全一致。

390正方形ChromiumではCDP `Input.dispatchTouchEvent` の実touchStart/move/end/cancel、trusted capture、`hasPointerCapture`、別指追加時のpointerId維持を確認。blurイベントは合成、マウスcancelイベントも合成。マウスcapture取得/喪失、マウスupとCDP touch cancelは実ブラウザー入力経路。

- 専用geometry＋既存jigsaw単体：23/23 PASS（新規11・既存12）。極端な比率0.001の微小幅、min/max、viewport優先、実縮小を含む。
- `scripts/jigsaw-result-list-browser-harness.mjs`：4画面PASS。3×3合成画像＋実難易度カードで1ピースを開始、完成、一覧link/Enter/Escape/中央nav、未保存game保持、後の明示保存まで確認。
- 親担当回帰：全単体727/727 PASS、feedback各engine4/4、zoom各engine4/4（4096ピース、culling時82draw・完全RGBA一致を含む）、共通Result実フローChromium30/30・WebKit25/25 PASS。
- 既存zoom/feedbackの固定px fixtureはhidden内部selectへ値を設定してchangeする形に更新。zoom再開fixtureはPXD自動読込の完了を待ち、既存「別の絵」→「つづきから」で明示保存を再開。culling比較oracleは保存source.dataUrlをdecodeして正確な原画を使用。renderer本体変更なし。

ログ/集計：

- `/tmp/pixieed-jigsaw-preview-chromium.log` / `/tmp/pixieed-jigsaw-preview-webkit.log`
- `/tmp/pixieed-jigsaw-preview-{chromium,webkit}-20261006/results.json`
- `/tmp/pixieed-jigsaw-preview-unit.log`
- `/tmp/pixieed-jigsaw-result-list-preview-final.log`
- `/tmp/pixieed-jigsaw-preview-regression-{chromium,webkit}.json`（親担当各回帰ログの実パスを記載）

## 確認画像

合成fixtureを使用。difficultyはCSS選択transitionを終えた状態で撮影。

| 画像 | ローカルファイル | Library ID（親保存、最終画像version 1） |
|---|---|---|
| 390px完成図 | `/tmp/pixieed-jigsaw-preview-chromium-20261006/jigsaw-390-square-preview.png` | `libfile_adc2e478e2d0819183fa1a83d72d214d` |
| 横向き縦長完成図 | `/tmp/pixieed-jigsaw-preview-chromium-20261006/jigsaw-844-tall-preview.png` | `libfile_0244a7e338e0819188ac96502a396844` |
| PC操作メニュー | `/tmp/pixieed-jigsaw-preview-chromium-20261006/jigsaw-1280-menu.png` | `libfile_93cefc9b5ab08191b58a7261d02a0aa2` |
| 320px難易度 | `/tmp/pixieed-jigsaw-preview-chromium-20261006/jigsaw-320-difficulty.png` | `libfile_b7567815dd808191b1788ee9a074f5b8` |

各engineの同ディレクトリに4サイズのdifficulty/menu/previewと横向きwide/tall/extreme画像がある。

## 未検証と範囲

物理iPhone/iPad・実Safariのtouch、OSのfocus切替、スクリーンリーダー読み上げは未検証。WebKitはMac headlessで実mouse/keyboardを確認。実公開作品の投稿/送信/公開は行っていない。今回の変更はジグソー専用。前回のDraw再生不能症状は今回の検証対象ではなく、修正済みとも扱わない。

ローカル試用：`http://127.0.0.1:4188/jigsaw/`。Git操作・公開は親担当。既存ゲーム結果から問題一覧へ戻る動線、共有fallback、その他ツールの前回修正は保持。
