# PiXiEED vNext 実装状態

更新日: 2026-09-06

この文書は、Creator App／iDRAW／iAUDIO／iGAME／Market／文章・世界観／画像・動画を、既存のProject・PXD・PiXiSYNC・Marketの契約を壊さずに接続する作業の実装境界を記録する。ここで「実装済み」はコードが存在する状態であり、最終検証を通過したことを意味しない。

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

## ローカル最終検証結果（2026-09-06）

- `deno task check`、全対象bundle再生成、`git diff --check`、対象JavaScript全件の`node --check`がPASS。
- Draw2基礎／Creator／PXD／iAUDIO／iGAME／Market／PiXYNC／StudioのDenoテストがPASS（代表値: 65、214、247、55）。
- Market公開・SEO・Package契約・検証ガード、5構成のブラウザ出品検証、Core Shell WP-080／WP-090がPASS。
- 公開Shell、Creator App、Writing、Visual、Market、Account、Help、Notes、Draw2、iGAME Playerを3 viewport・30ケースで確認し、HTTP 200、横スクロールなし、実行時エラーなし。
- `scripts/test-verify-canonical-package-alignment.mjs` は、作業ツリーに存在しないローカル状態ファイル `.codex/PIXIEED_IMPLEMENTATION_STATE.yaml` を前提とするため未実施扱い。製品コードの失敗ではない。

## 未実装・本番適用／外部境界で停止中

| 優先度 | 未実装部分 | 残る変更 |
| --- | --- | --- |
| P0 | Supabase／Edge Functionへの適用と本番受入れ | このMigrationを対象Projectへ適用し、Stripe webhook、Storage、RLS、Realtime、2ユーザーの購入・無料取得・配信・再接続を本番相当環境で検証する。コードは実装済みだが、適用・受入れは未実施 |
| P1 | 公開iGAME PlayerのRegistry商品materialize | `igame-player.html` の実行専用Hostと認証契約は実装済み。Project revisionからRegistryのGame Runtime package／manifest／asset deliveryを作成し、`AuthorizationProofV1` と一緒に公開URLへ渡すServer Providerが未接続 |
| P1 | 外部Build worker | APK／AAB／IPA／Desktopの受付契約とidentity／Entitlementゲートは実装済み。署名鍵を含むBuild worker、Artifact Storage、配布・返金連携は未接続 |
| P1 | 本番Registry／Project／Asset Provider | Creator App／iGAMEのローカルProject保存と既存Market委譲は実装済み。Project Registry、Asset Registry、PiXYNC Realtimeの本番接続と権限Proof発行は未接続 |

### 未実装と判定しない安全境界

- 現行Marketサーバーが受け付けない文章・Visual JSON・動画形式を、ローカルUIから送信しない処理は実装済みの fail-closed 境界である。形式検出とPackage準備は実装済みだが、本番受理は未実装のままである。
- 無料商品を「購入済み」と表示せず「無料取得準備中」と停止する処理は、Entitlementを端末表示から推測しないための実装済み境界である。
- `core-shell/assets/routes/*-route.js` のUnavailable表示、iGAME PlayerのRuntime package未接続停止、Bridgeの外部リポジトリ境界は、欠落を隠すための仮成功ではなく、未接続を明示するための仕様である。

## このリポジトリの対象外

- PiXiEED BridgeのNative runtime／Aseprite／Unity connectorは、別リポジトリ `Documents/Codex/2026-08-30/referenced-chatgpt-conversation-this-is-an/outputs/pixieed-bridge/` が正本。
- `core-shell/assets/routes/*-route.js` のIsolated Preview用Unavailableは、公開Creator Appの実装欠落ではなく、Core Shellの隔離テスト境界である。
- 権利情報がサーバーから明示されない場合に停止するUIは、未実装ではなく安全側の必須状態である。

## 外部受入れ工程

1. 対象Supabase ProjectへMigrationを適用し、Edge FunctionをDeployする。
2. Stripe webhook、private Storage、RLS、Realtime、2ユーザーの購入／無料取得／配信／再接続を本番相当環境で受け入れる。
3. Registry／Project／Asset Providerを接続し、公開iGAME PlayerのRuntime package／manifestをmaterializeする。
4. 外部Build worker、Artifact Storage、署名・配布・返金連携を接続する。
