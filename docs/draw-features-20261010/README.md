# PiXiEEDraw 新機能・検証結果 — 2026-10-10

開始状態は `main` / `888482d52ecceb90e18144ae4e094d081adec0ff`、作業ツリーclean。実装と検証まで完了し、commit・push・公開はしていない。

| 機能 | 実装・操作 |
| --- | --- |
| 色調 | 固定列の「色調」で明るさ・コントラスト・彩度・RGBトーンカーブをpreview。初期対象は現在コマの現在レイヤー／選択範囲。「全コマ・全レイヤー」は明示選択。適用は1 Undo、取消で原本を保持。 |
| 文字 | 「文字」で入力、書体・サイズ・既存パレット色・座標・左／中央／右配置をpreviewして適用。現在レイヤー／選択内にラスタライズし1 Undo。 |
| 投げ縄・複数範囲 | 閉じたpixel maskに透明セルも含める。PCはShift加算、Ctrl／⌘減算。touch／仮想カーソルは修飾キーなしドラッグで加算。移動は専用ハンドル、既存Alt移動も保持。 |
| 確定・選択解除 | 固定44px操作列から常時到達。移動・変形内容を保持して枠を解除。Enterも確定・解除、Escapeは既存の取消動作を保持。 |

詳しい [操作表](../creation/draw-selection-operations.md) と [フォント配布元・同梱ライセンス](../draw-font-licenses.md) を参照。DotGothic16／Press Start 2Pを遅延読み込みし、失敗・5秒timeout時はシステムsansへfallbackする。文字coverageを二値化し、余分なAA色を追加しない。可逆なベクターテキストや個別R/G/Bカーブは未実装。新規依存パッケージは導入していない。

現在レイヤーの色調調整は既存パレットを書き換えず、調整色を追加するか既存色に近似する。実際の32色上限に達した場合はpreview／適用を拒否して原本を保持する。全体調整は共通パレットを変更し全コマ・全レイヤーに作用する。ロック中のレイヤーがある場合は全体調整を拒否する。

全体検証は `node --test tests/**/*.test.mjs tests/draw-text.test.mjs` **1,837件成功**、creation-suite **19 suites成功**、pointer continuationブラウザ回帰 **34 checks成功**。Pages buildは **648 files / 6 puzzle pages / 86 event pages**。新規module・CSS・font・OFLはbuild出力とのバイト一致を確認した。build由来のイベント10ファイルは開始時cleanと生成物のバイト一致を確認したものだけ明示パスで復元し、既存SEO/home/OGP/広告/出力変更を保護した。

独立したChromium実操作でも空透明キャンバス全選択→固定ボタン／Enter解除、preview取消と1 Undo／Redo、トーンカーブのkeyboard／pointer操作、32色上限拒否、font通信遮断時の日本語fallbackを確認した。色調適用後、実際の出力UIからPNGをダウンロードし、**2048×2048、非透明画素16,384、色 `166,178,184,255` が適用後キャンバスと一致**した。外部／広告通信は遮断している。

画面画像 `PiXiEEDraw-new-features-mobile.png` は正規Libraryへ保存済み。物理iPhone／Android、Safari、本番公開環境は未検証。

The final headless Chromium run passed all 12 browser scenarios in both viewports: desktop 1280×800 and mobile 390×844 (device scale factor 3). The machine-readable run details are in [report.json](evidence/report.json), with final viewport captures in [desktop](evidence/desktop-draw-features.png) and [mobile](evidence/mobile-draw-features.png).

Coverage includes fixed selection controls on transparent and full-canvas selections, polygonal lasso and modifier unions/subtractions, outside touch tap/drag behavior, move confirmation with one undo/redo, touch and Shift lasso while a move is pending, virtual cursor/cancel behavior, offscreen pointer movement and pinch, selected-cel and whole-animation color preview/cancel/apply/undo/redo, Japanese text fallback and lazy local font loading, selection clipping, binary indexed coverage, and saved-PXD serialization round-trips.

The PXD checks save through the project workspace, load the exact persisted revision, encode it with the application codec, and decode it to verify palette, layers, frames, and edited cel data. Downloading a standalone PXD file is untested because the current Draw workspace has no downloadable PXD export control. The screenshots are local headless-browser evidence; they do not represent physical devices. External origins were blocked during the run.

The reproducible browser harness is [draw-features-browser-harness.mjs](../../scripts/draw-features-browser-harness.mjs). It writes its fixture PXD files and report into this evidence directory.

主な変更: `draw/index.html`, `js/creation/draw-page.mjs`, `draw-entry.mjs`, 色調のcore/panel/CSS、文字のcore/panel/CSSと `assets/fonts/`、選択のinput/settings/overlay/panel/CSS、build allowlist、creation-suiteと関連テスト。
