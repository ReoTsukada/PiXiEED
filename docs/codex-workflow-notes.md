# Codex Workflow Notes

Codex が PiXiEED の精査・修正・検証を進めるための作業メモです。公開向け仕様ではなく、同じ確認でつまずかないための実務メモとして扱います。

## 基本

- 作業ルートは `/Users/tsukadareine/Documents/GitHub/PiXiEED`。
- ローカル表示は `node scripts/static-server.mjs` を使う。URL は通常 `http://localhost:8000/`。
- PiXiEEDraw は `http://localhost:8000/pixiedraw/`。
- 分割作業用 PiXiEEDDraw は `http://localhost:8000/PiXiEEDDraw.dev/`。
- VS Code では `PiXiEEDraw (prod)` と `PiXiEEDDraw.dev (split work)` の launch を使う。
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

## ローカルサーバー検証の注意

- managed sandbox では、通常権限の `curl -I http://localhost:8001/...` が `Failed to connect` になることがある。サーバー停止と即断しない。
- `env PORT=8001 node scripts/static-server.mjs` が `EADDRINUSE` で落ちた場合、そのポートは別プロセスが掴んでいる。通常権限のcurl失敗と矛盾して見えても、サンドボックス由来の可能性がある。
- ローカルサーバーの生存確認は、必要なら権限付きで `curl -I http://127.0.0.1:<port>/...` を使う。`localhost` より `127.0.0.1` の方が切り分けしやすい。
- 検証用に固定ポートへこだわらない。ポート競合を避ける検証は、空きポートを自動選択するスクリプトへ寄せる。

## 広場ページ検証

- Playwright実行はmacOSのChrome起動権限が必要なことがある。`browserType.launch` やローカル接続で権限エラーが出たら、同じコマンドを `sandbox_permissions: "require_escalated"` 付きで再実行する。
- 広場の自キャラ要素は `#localAvatar` ではなく `.plaza-avatar.is-self`。存在しないIDを待ってタイムアウトさせない。
- PC幅では右側のチャットパネルがシーンのクリックを一部覆う。シーン操作の検証は `locator.click('#plazaScene')` に頼らず、`getBoundingClientRect()` の左寄り座標へ `mouse.click` する。
- 検証時は外部広告、Google Fonts、Supabase CDNをPlaywright routeで止めてよい。ローカルUIの成立条件は、外部通信が失敗しても確認できるようにする。

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

## PiXiEEDDraw.dev 分割時のガード

- 分割後は最低限 `node --check PiXiEEDDraw.dev/assets/js/app.js` と `node scripts/check-pixiedraw-dev-tdz.mjs` を通す。
- `restoreSessionState()` より前に呼ばれる関数は、後段の `const` / `let` destructuring に依存させない。必要なら readiness フラグを置き、初期化前は return する。
- 仮想カーソルの描画ボタンは左半分が primary、右半分が secondary。RGBモードでも `getActiveDrawColor(..., paletteIndexOverride)` が `paletteIndexOverride` を無視しないこと。
- `updateFloatingDrawButtonPalettePreview()` は起動復元中にも呼ばれるため、`pointerState` 初期化前に `getActiveDrawColor()` を経由させない。
- ポインター座標判定は実イベントでは `clientX + getBoundingClientRect()` を優先し、`offsetX` はフォールバックとして扱う。

## PiXiEEDrawDEV v2 includeSheets 手動検証

- Phase 3-E/F の `includeSheets:true` 実験保存は `PiXiEEDrawDEV/` 限定で、通常保存・autosave・recentProjects・旧shared sync には接続しない。
- console から `await window.__pixieedrawSaveV2ExperimentalIncludeSheets()` を呼ぶ。通常UIへの追加導線はまだ付けない。
- この導線は `pixieedraw-v2-zip-experimental` を `includeSheets:true` で呼び、v1 bundle と v2 bundle の `blob.size` を console 比較する。
- v2 保存は既存 file handle に上書きしない。export directory を使う場合も `resolveUniqueExportDirectoryFilename()` で新規名に寄せる。
- 保存後の console では少なくとも `v1 bytes`, `v2 bytes`, `saved bytes`, `reduction percent`, `saved as new file` を確認する。
- 手動確認チェック:
  - 通常保存は v1 JSON のまま
  - autosave は v1 のまま
  - recentProjects は v1 のまま
  - 旧shared sync には未接続
  - v2 保存後に再読込できる
  - active sheet / non-active sheet / activeSheetId が維持される
  - 各sheet内の multi-canvas が維持される
  - `directOnly` / `indices` / `direct` / `importSourceDirect` / `timelapse` が維持される

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
