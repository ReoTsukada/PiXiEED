# PiXiEED vNext 実装状態

更新日: 2026-09-14

現在の進行方向の正本: [`pixieed-current-progress-and-next-direction-20260914.md`](./pixieed-current-progress-and-next-direction-20260914.md)

この文書は、Creator App／iDRAW／iAUDIO／iGAME／Market／文章・世界観／画像・動画を、既存のProject・PXD・PiXiSYNC・Marketの契約を壊さずに接続する作業の実装境界を記録する。ここで「実装済み」はコードが存在する状態であり、最終検証を通過したことを意味しない。

2026-09-14時点では、PC版の入力競合とモード間レイアウト記憶を安定化し、対象Supabase ProjectへMigration／Edge Functionを反映した段階である。次は、実商品を用いたMarket成功系・失敗系、iDRAWからiGAMEの実体縦断、Unity実環境の受入れを進める。タブレット／モバイルは今回の進行対象に含めず、PC受入れ後に扱う。

## 実装済み（ローカル最終検証済み）

| 領域 | 実装内容 | 主な場所 |
| --- | --- | --- |
| Creator App | Project Home、新規Project、Project Library、My Page、SNS／Market導線、Draw2 Workspace manifestの再接続 | `app/`, `app/assets/creator-project-store.js`, `app/assets/app-shell.js` |
| 文章・世界観 | Novel、章、WorldNode、WorldEdge、参照、権利スナップショット、JSON／Markdown／TXT入出力、Project保存 | `app/writing/`, `pixiedraw2/src/platform/content/index.ts` |
| 画像・動画 | 画像／動画Asset、IndexedDB Blob保存、再接続、レイヤー、非破壊調整、変形、Clip IN／OUT、Preview、PNG／WebM出力 | `app/visual/` |
| 制作結果の出品引き渡し | Writing／Visualから一時IndexedDBへファイル群を渡し、既存Market出品画面で再検査 | `app/assets/creator-market-transfer.js`, `market/sell.js` |
| Marketローカル処理 | PXD／画像／音声に加え、文章・Markdown・Novel JSON・Visual JSON・動画の形式判定、Preview生成、パッケージ構成、一覧分類、SEO静的ページの形式／無料価格表示、現行サーバー非対応形式の送信停止 | `market/listing-package-utils.js`, `market/sell.js`, `market/discovery-utils.js`, `market/market.js`, `market/item.js`, `scripts/generate-market-seo-pages.mjs` |
| iGAME素材棚 | 購入済み／明示された利用権だけをMarket Asset Binding候補にし、現在のProjectを置換せず素材参照として追加 | `pixiedraw2/src/game/game-350/market-asset-binding.ts`, `pixiedraw2/src/draw2-entry.ts`, `pixiedraw2/src/wp180-workspace-ui.ts` |
| PiXYNC契約 | revision、operationId、idempotency、hash、順序、checkpoint、offline queue、conflictの純粋な契約 | `pixiedraw2/src/platform/pixync-vnext/index.ts` |
| Market本番境界（コード） | 形式Registry、immutable revision、active Entitlement、License snapshot、無料取得RPC、有料／管理者取得materializer、private Storage配信、購入済み／無料取得済みのiGAME binding RPC、文章・動画の検証形式 | `supabase/migrations/20260906002539_pixieed_vnext_market_entitlements_and_pixync.sql`, `supabase/functions/market-download/`, `supabase/functions/market-verify-listing-package/`, `supabase/functions/_shared/market-package-verifier.ts` |
| PiXYNC本番境界（コード） | 既存PiXYNC Foundation／checkpoint契約とDraw2 aggregate RPC（open、commit、since、Game revision、RLS／Presence）を現行クライアントが期待するMigration群として復元 | `supabase/migrations/20260730001656_pixisync_collab_v1_foundation.sql` ～ `supabase/migrations/20260828120000_pixisync_detach_require_localized_owner_record.sql` |
| iGAME Market直追加 | Catalogの権利表示、無料取得、secure delivery、PXD本体SHA-256検証、現在のProjectへのAsset-only追加、server-side Binding記録 | `pixiedraw2/src/wp180-workspace-ui.ts`, `scripts/account-market-purchases.js`, `pixiedraw2/src/draw2-entry.ts`, `supabase/functions/market-download/index.ts` |
| iGAME公開Player | `/igame/?product=...` の入口、Market Entitlement／immutable Revision／署名PXD URLのBootstrap、Manifest／Proof／Package Hash検証、Game ProjectのCanvas Runtime再生 | `igame/index.html`, `pixiedraw2/src/game/game-350/igame-player-entry.ts`, `pixiedraw2/src/game/game-350/igame-public-bootstrap.ts`, `pixiedraw2/src/game/game-350/igame-browser-runtime.ts`, `supabase/functions/igame-player-bootstrap/` |
| PC入力・表示基盤 | iDRAW／iAUDIO／iGAMEの入力面ごとの矢印キー所有、Spaceの再生／パン分離、GAME操作の面外漏れ防止、モード別Timeline高さの保持、PC iAUDIOの重複ツールバー非表示 | `pixiedraw2/src/draw2-input-ownership.ts`, `pixiedraw2/src/draw2-entry.ts`, `pixiedraw2/src/wp180-workspace-ui.ts`, `pixiedraw2/index.html`, `pixiedraw2/tests/draw2-shortcuts.test.ts`, `pixiedraw2/tests/wp180-workspace.test.ts` |

## ローカル検証結果（2026-09-14）

- `deno task check`、`deno task build`、`deno task build:workspace:min`、変更対象TypeScriptの`deno check --no-remote`、`git diff --check`がPASS。
- `deno task test`は97件PASS。入力所有権・Workspace UIの対象テストは、許可範囲を明示した実行で48件PASS（`draw2-shortcuts` 5件を含む）。
- Market PXD verifierは3件、iGAME公開Player静的契約、Market検証、Market SEO、Market公開入口、Core URL契約がPASS。
- 現在のブラウザでDraw2のGAME／DRAW／AUDIO切替とモード別Timeline保持、Consoleエラーなしを確認。表示中ブラウザは幅504pxのため、1120px以上のPCレイアウト受入れは未完了。Spaceの再生／パンとキー所有権は契約テストで確認済み。
- `supabase db lint --local` は、この環境でPostgres（127.0.0.1:54322）が起動していないため未実施。SQL／Edge Functionの本番適用確認とは別の環境制約であり、製品コードのテスト失敗ではない。

## 本番反映・受入れ状況（2026-09-14）

- CLIの接続先はSupabase Project `kyyiuakrqomzlikfaire`（東京）で、Auth healthはHTTP 200、既存`market-download`は未認証時HTTP 401を返した。
- `igame-player-bootstrap`、`market-verify-listing-package`、`market-download`の更新版を含むローカル管理下の13 Functionを本番へ配備し、全てACTIVEを確認した。リモート専用の既存Function 3件は保持した。
- リモートだけに存在した過去Migration 35件を履歴上のみ`reverted`として整理し、dry-runで対象を確認後、ローカルに存在する2026-08-24以降の11 migrationを適用した。必要な新規テーブルの存在をSQLで確認した。
- 未認証HTTPスモークは認証必須Functionで401、公開Previewで200を確認した。実ユーザーを使う成功系はまだ未受入れである。
- この環境にはUnity Editor／Unity Project本体がないため、Unity Import／Compile／再生は未実施。生成Packageの決定的テストまでを確認済みとする。

### 2026-09-14 反映前の読み取り再確認

- 対象Project `kyyiuakrqomzlikfaire`の反映前リモートDBには、`market_asset_revisions`、`market_asset_entitlements`、`market_asset_bindings`、共同制作のscope／consentテーブル、および無料取得・同意・編集範囲RPCが存在しなかった。これは反映前の記録である。
- 反映前のリモートEdge Functionは14件がACTIVE。`igame-player-bootstrap`と`market-verify-listing-package`は未配備で、`market-download`はリモートの`verify_jwt=false`とローカル設定の`verify_jwt=true`が不一致だった。
- Security AdvisorはRLSポリシーなし27件、mutable search_path 12件、Security Definer実行権限、匿名サインイン関連、漏洩パスワード保護無効などを報告している。既存の意図を確認するまで本番公開判定をPASSにしない。
- `supabase db push --dry-run`は、リモートだけに存在する過去Migrationとローカルだけに存在する新しいMigrationの混在で停止した。履歴修復、`--include-all`、本番DBへの直接適用はまだ行っていない。

## 未完了・本番適用／外部境界で停止中

| 優先度 | 状態 | 未完了部分 | 残る変更 |
| --- | --- | --- | --- |
| P0 | 反映済み・未受入れ | Supabase／Edge Functionへの適用と本番受入れ | Migration履歴を整理し、11 migrationとローカル管理下の13 Functionを対象Projectへ反映した。Stripe webhook、Storage、RLS、Realtime、2ユーザーの購入・無料取得・配信・再接続の成功系・失敗系は実ユーザーで受入れが必要 |
| P1 | 部分実装 | iDRAW → iGAMEの実体化縦断 | 表示中の合成画像を1枚目としてMaterializeし、複数Frame／方向／duration／PivotをManifestへ確定。iGAMEライブラリで実画像表示、ドラッグ配置、保存・再読込、既定Animationを受入れる |
| P1 | 部分実装 | Unity向け画像・音声出力の実環境受入れ | PNG／Sheet／Manifest／Prefab／Animatorの生成契約を、対象UnityプロジェクトでImport、Compile、Playまで確認する。現環境にはUnity Editor／Projectがないため未実施 |
| P1 | 反映済み・未受入れ | 公開iGAME Player | Bootstrap FunctionとDB契約は反映済み。検証済みPXDを持つ公開Market Assetでログイン、権利確認、Revision固定、再生、失敗時停止を受入れる |
| P1 | 未接続 | 外部Build worker | APK／AAB／IPA／Desktopの受付契約とidentity／Entitlementゲートは実装済み。署名鍵を含むBuild worker、Artifact Storage、配布・返金連携は未接続 |
| P1 | 未接続 | 本番Registry／Project／Asset Provider | Creator App／iGAMEのローカルProject保存と既存Market委譲は実装済み。Project Registry、Asset Registry、PiXYNC Realtimeの本番接続と権限Proof発行は未接続 |
| P2 | 段階対応 | Inspector／パネルの役割整理 | 直接操作、Timeline、Layer、Palette、Assetへ移せる項目を移し、選択中だけContext表示する。挙動の受入れ後に、既存操作性を壊さない範囲でUIを更新する |
| P3 | 保留 | タブレット／モバイル | PC版の受入れ完了後に別スコープで評価する。今回の入力・レイアウト変更の受入れ対象にはしない |

### 未実装と判定しない安全境界

- 現行Marketサーバーが受け付けない文章・Visual JSON・動画形式を、ローカルUIから送信しない処理は実装済みの fail-closed 境界である。形式検出とPackage準備は実装済みだが、本番受理は未実装のままである。
- 無料商品を「購入済み」と表示せず「無料取得準備中」と停止する処理は、Entitlementを端末表示から推測しないための実装済み境界である。
- `core-shell/assets/routes/*-route.js` の隔離Preview用Unavailable表示、公開PlayerのBootstrap／Package取得失敗時の安全停止、Bridgeの外部リポジトリ境界は、欠落を隠すための仮成功ではなく、未適用・未接続を明示するための仕様である。

## このリポジトリの対象外

- PiXiEED BridgeのNative runtime／Aseprite／Unity connectorは、別リポジトリ `Documents/Codex/2026-08-30/referenced-chatgpt-conversation-this-is-an/outputs/pixieed-bridge/` が正本。
- `core-shell/assets/routes/*-route.js` のIsolated Preview用Unavailableは、公開Creator Appの実装欠落ではなく、Core Shellの隔離テスト境界である。
- 権利情報がサーバーから明示されない場合に停止するUIは、未実装ではなく安全側の必須状態である。

## 外部受入れ工程

1. 実商品を用いてStripe webhook、private Storage、RLS、Realtime、2ユーザーの購入／無料取得／配信／再接続を本番相当環境で受け入れる。
2. 公開iGAME Playerで公開Market AssetのRuntime package／manifest、権利確認、Revision固定、再生を受け入れる。
4. 外部Build worker、Artifact Storage、署名・配布・返金連携を接続する。
