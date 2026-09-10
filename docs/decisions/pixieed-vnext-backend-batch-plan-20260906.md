# PiXiEED vNext 本番バックエンド一括実装計画

更新日: 2026-09-06

この文書は、ローカル制作画面と既存Marketの間に残っている本番境界を、機能ごとに細切れにせず一つの契約で実装するための作業単位を固定する。Migration、Edge Function、クライアント接続コードはこのリポジトリへ実装済みであり、Supabaseへの適用・Stripe／Storage／Realtimeを使う本番受入れ・Deployは別工程として扱う。

## 目的

以下を一つの利用権フローとして成立させる。

`公開Catalog → 有料購入／無料取得 → Entitlement・License発行 → secure delivery → 現在のProjectへAssetBinding → iGAMEで利用`

PiXYNCはこの購入フローとは分離し、Projectのrevision／operation／checkpointを正本として実装する。

## 既存契約の扱い

| 既存契約 | 扱い |
| --- | --- |
| `market_purchases` | 決済・取得履歴として保持。既存のStripe webhook、管理者取得、売上・返金履歴を壊さない |
| `market_asset_series` / `market_assets` | 公開商品・系列の正本として保持。公開済みAssetをブラウザの入力だけで権利付与しない |
| `market_download_events` | 署名URL発行の監査記録として保持 |
| `market-private` Storage | privateのまま維持。元ファイルURLをCatalogやクライアントへ返さない |
| `market_asset_formats` | 文章・Visual JSON・動画形式を追加するが、サーバー検証・配信の対応完了まで公開受理しない |
| `pixync_draw2_*` RPC契約 | 現在の `pixiedraw2/src/pixync/supabase-provider.ts` が期待する名前と戻り値を正本にする |

## 一括実装ストリーム

### Stream A: Market形式・Revision・Entitlement

Migrationを一つのまとまりとして作成し、次を同時に揃える。

- `market_asset_formats` に `text`、`novel-json`、`visual-project`、Markdown系、動画、必要な音声形式を登録する。
- `media_kind` を `project`／`image`／`animation`／`text`／`video`／`audio` として扱えるようにする。
- `market_asset_revisions` を追加し、Assetごとの immutable revision、content hash、package manifest、Storage pathを保持する。
- `market_asset_entitlements` を追加し、`paid`／`free`／`admin` の取得種別、ユーザー、Asset revision、License snapshot、状態を保持する。
- `(user_id, asset_id, active)` の重複取得を一意化し、無料取得と有料購入を同じ利用権判定へ収束する。
- 取得時点のLicense、source revision、content hashをスナップショット化する。
- RLSは直接INSERTを許可せず、認証済みRPCまたはservice roleのみが付与する。

### Stream B: 無料取得・有料購入・安全配信

既存の有料Stripeフローを壊さず、取得結果を共通Entitlementへ反映する。

- `market_acquire_free_asset_v1(asset_id)` を追加する。
- 公開中、価格0、本人の商品ではない、認証済みという条件をサーバー側で確認する。
- Postgres transaction内で重複取得を抑止し、Entitlement、License snapshot、監査ログを同時に作成する。
- Stripe webhook／既存有料materializerも同じEntitlement materializerを呼ぶ。
- `market-download` は `market_purchases` の直接判定ではなく、active Entitlementとrevision snapshotを判定する。
- `market_asset_formats` とEdge Functionの許可形式を同じRegistryから検証する。
- 文章・動画はprivate Storageの署名URLで配信し、元データをpublic Catalogに出さない。
- 無料取得の購入ボタンは、RPC成功とEntitlement発行が確認できるまで「取得済み」にしない。

### Stream C: 制作画面・iGAME接続

サーバーから明示された権利情報だけをローカル既存契約へ渡す。

- `market_public_catalog_v1`／`market_public_asset_v1` に形式、revision、content hash、利用可能な公開メタデータを追加する。
- Account購入一覧とDownload responseにEntitlement、License、source revisionを追加する。
- `scripts/account-market-purchases.js` はEntitlementがない場合にiGAMEへ渡さない。
- `pixiedraw2/src/draw2-entry.ts` は現在Projectを置換せず、AssetBindingとして追加する既存動作を維持する。
- `market-asset-binding.ts` の `FREE` は、無料表示ではなく発行済みEntitlementが存在する場合だけ `AVAILABLE` へ遷移させる。
- Project保存後のreloadでBinding、revision、rights snapshotが維持されるようにする。

### Stream D: PiXYNC本番Transport

既存の純粋契約と `supabase-provider.ts` のRPC境界に合わせる。

- Room／Project membership、session generation、roleを保持するテーブルを追加する。
- `pixync_draw2_open_session_v1` を追加する。
- `pixync_draw2_commit_operation_v1` を追加し、認証済みmembership、revision順、idempotency、operation fingerprint、roleをサーバー側で検証する。
- `pixync_draw2_get_operations_since_v1` を追加し、連続したrevisionだけを返す。
- Realtimeはoperation本体を運ばず、`pixync_hint`通知とPresenceだけを使う。
- checkpointは既存の `room-provisioning.ts`／`checkpoint-publishing.ts` が要求する prepare／register／attest／activate契約を同じroom revisionへ接続する。
- RLSはroom membershipを毎回確認し、クライアント入力のactor、role、roomを権利として扱わない。

### Stream E: 実行bundle・最終統合

- `pixiedraw2/src/` の変更を `pixiedraw2/dist/` に反映する。
- Creator App、Market、Account、iDRAW、iGAMEのレスポンス型を一度だけ統合確認する。
- 最終段階でのみ、テスト、Migration検証、Edge Function検証、bundle生成、ブラウザ検証、responsive確認を実行する。

## 依存関係と並列化

```text
契約固定
  ├─ Stream A: schema / revision / entitlement
  │    └─ Stream B: free / paid materializer / secure delivery
  ├─ Stream D: PiXYNC RPC / RLS / Realtime
  └─ Stream C: UI response adapter（Aのresponse shape確定後）
       └─ Stream E: dist / integration / final validation
```

- Stream AとStream Dは独立して設計・実装できる。
- Stream BはStream AのEntitlement schemaに依存する。
- Stream CはStream A／Bのresponse shape確定後にまとめて変更する。
- 同一Migration・同一Edge Functionを複数Agentで同時編集しない。
- 統合責任者はSol相当のレビュー工程に固定する。

## 現在の実装状態

- Stream A: `20260906002539_pixieed_vnext_market_entitlements_and_pixync.sql` に実装済み。形式、revision、Entitlement、License snapshot、無料取得、Asset Binding、public catalogを含む。
- Stream B: `market-download` と `market-verify-listing-package` に実装済み。PXD・文章・Visual JSON・動画のサーバー検証とprivate Storage signed URL配信を含む。
- Stream C: Account／iGAME／Draw2に実装済み。revision hashとPXD本体bytes hashを分離し、現在のProjectへAsset-onlyで追加する。
- Stream D: 既存PiXYNC Foundation／checkpoint／Draw2 aggregate Migration群を復元済み。Supabase適用、Realtime、2クライアント受入れは未実施。
- Stream E: source変更をdistへ再生成し、ローカル最終検証（型検査、テスト、Market／Core Shell／主要ルートのブラウザ検証）まで完了。外部適用・本番相当受入れは未実施。

## Must-not-change

- 既存の購入・返金・売上・ロイヤリティ履歴を削除または再計算しない。
- 現在のProject、未保存編集、Scene、Draw frame／layer、Audio Track／TickをMarket取得で置換しない。
- クライアントのlocalStorage、IndexedDB、checkout URL、Catalog表示を権利の正本にしない。
- Realtime通知にAsset raw bytesやprivate Storage URLを載せない。
- 無料取得を「購入済み」と偽装しない。
- Migration適用前に現行Edge Functionだけを先に切り替えない。

## 一括受入条件

1. 公開価格0のAssetを、認証済みユーザーが一度だけ無料取得できる。
2. 無料取得後、Account、secure delivery、iGAME素材棚が同じEntitlementを参照する。
3. 有料購入は既存Stripe導線を維持し、paid materializerが同じEntitlementへ収束する。
4. 文章・動画を出品、Preview、購入、署名URL配信、Downloadできる。
5. 取得したAssetを現在のProjectへ追加して保存・再読込・iGAME利用できる。
6. 二つの認証クライアントでPiXYNCのopen、commit、duplicate、reconnect、checkpoint recoveryが成立する。
7. 権利・revision・hash不一致、未知形式、期限切れ、権限不足はすべてfail-closedになる。

## 適用境界

Supabase公式Changelog／RLS／Realtime／Storageの契約確認、`supabase migration new` によるMigration作成、Migration／Function／UIのコード実装、ローカル型検査・テスト・ブラウザ検証は完了している。Deploy、Migration適用、本番決済・Storage・Realtimeの受入れ、外部Build worker接続は、このリポジトリのローカル検証とは分離して実施する。
