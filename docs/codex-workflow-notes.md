# Codex Workflow Notes

Codex が PiXiEED の精査・修正・検証を進めるための作業メモです。公開向け仕様ではなく、同じ確認でつまずかないための実務メモとして扱います。

## 基本

- 作業ルートは `/Users/tsukadareine/Documents/GitHub/PiXiEED`。
- ローカル表示は `node scripts/static-server.mjs` を使う。URL は通常 `http://localhost:8000/`。
- PiXiEEDraw は `http://localhost:8000/pixiedraw/`。
- まず `rg` / `rg --files` で対象を探す。
- 手編集は `apply_patch` を使う。
- 既存の未コミット変更はユーザー作業の可能性があるため、勝手に戻さない。

## Playwright 検証

- Playwright は `tools/screenshots` 配下の依存を使える。
- Playwright 実行時は `workdir` を `tools/screenshots` にすると `require('playwright')` が通りやすい。
- macOS のサンドボックス内では Chromium 起動が次のように落ちることがある。
  - `bootstrap_check_in ... Permission denied (1100)`
  - `browserType.launch: Target page, context or browser has been closed`
- この起動エラーが出たら、同じ検証コマンドを `sandbox_permissions: "require_escalated"` 付きで再実行する。権限付き実行が表示検証に必要。
- Playwright で非表示パネルを検証するときは、`waitForSelector('#panelFrames', { state: 'attached' })` のように「DOMに存在」を待つ。`visible` 待ちはモバイルパネルやドロワーでタイムアウトしやすい。
- CSS レイアウト検証では、スクリーンショットだけでなく `getBoundingClientRect()`、`scrollWidth/clientWidth`、`scrollHeight/clientHeight`、`scrollTop/scrollLeft` を計測すると原因を絞りやすい。

## PiXiEEDraw 確認ポイント

- 主な対象ファイル:
  - `pixiedraw/index.html`
  - `pixiedraw/assets/css/style.css`
  - `pixiedraw/assets/js/app.js`
- 通常チェック:
  - `node --check pixiedraw/assets/js/app.js`
  - `git diff --check -- pixiedraw/index.html pixiedraw/assets/css/style.css pixiedraw/assets/js/app.js`
- タイムライン/レイヤーフレームUIは、PC下レーン、PC右レーン、モバイル半分表示、モバイル全表示で別々に確認する。
- レイヤーフレームのコンパクト判定は右レーンではなく下レーン状態が絡むため、PC下レーンの `body.is-bottom-timeline-docked` と `.bottom-timeline-dock[data-compact]` を確認する。
- モバイル半分表示は `body.is-mobile-layout .mobile-drawer[data-mode='half'] #panelFrames` のCSSが効く。
- タイムラインのセル群は横だけでなく縦スクロールも確認する。レイヤーが多い場合、縦スクロール不可だとセルクリック移動も破綻しやすい。
- 再生中/停止後のセル移動は共有プロジェクト時の選択セル同期と絡むため、単独プロジェクトだけでなく共有状態でも確認する。

## 共有プロジェクト周り

- 旧マルチ由来の名前や状態が残っている箇所は、共有プロジェクトの同期ずれ調査で優先的に見る。
  - `connectMultiSessionAs`
  - `multiState.role`
  - `bindMultiChannelRealtimeHandlers`
  - `sendMultiBroadcast`
  - `multiState.assignments`
  - `multiState.participants`
- 共有プロジェクトの安全性を見るときは、復元、自動保存、タブ切替、ファイルを開く、同一アカウント参加、PWA/モバイルを分けて確認する。
- 参加キーはパスワード扱いにしない。通常入力として扱い、ブラウザのパスワード保存やパスワード用キーボードを誘発しないことを確認する。

