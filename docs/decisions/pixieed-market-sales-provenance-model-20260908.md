# PiXiEED Market 販売・権利・制作系譜・分配モデル

更新日: 2026-09-08

対象: PiXiEED Market、iDRAW、iAUDIO、iGAME、My Page、販売者設定、購入後Asset利用

## 1. この資料の目的

この資料は、PiXiEEDで作品・Asset・PXD・音楽・SE・動画・文章・世界観を販売する際の、現在の販売形式と今後の利用者向けUI方針を一つにまとめるものである。

ここでは次の4つを分けて扱う。

1. 利用者に見せる販売形式
2. サーバーが保持する購入権・ライセンス・revision
3. 制作者・親作品・祖先作品への分配情報
4. 決済、配信、iGAME利用、PiXYNC同期の境界

販売画面を簡単にしても、権利・決済・制作系譜・監査情報を削除してはならない。複雑な正本はサーバー側に残し、利用者向け画面だけを単純化する。

## 2. 基本方針

### 2.1 利用者に見せる販売形式は3種類に絞る

| 表示 | 意味 |
| --- | --- |
| 無料で取得 | 0円で取得する。購入ではなく無料利用権を発行する |
| 購入する | 固定価格の一回払いで利用権を発行する |
| 限定販売 | 固定価格の一回払いに先着数を設定する |

大元作品・派生作品・Entitlement・revision・ロイヤリティ台帳・Stripe状態は、利用者向けの販売形式とは分ける。

### 2.2 現在の正本の分離

| 領域 | 正本 |
| --- | --- |
| 商品・作者・親作品・系列 | Marketのサーバー側Asset／Series |
| 購入・無料取得 | `market_purchases` とEntitlement |
| 利用条件 | 購入時点のLicense snapshot |
| ファイルの同一性 | source hash、package hash、content hash、revision |
| 売上分配 | Royalty ledger、payout ledger、Stripe Transfer履歴 |
| Project同期 | PiXYNCのProject revision／operation／checkpoint |
| Native連携 | 外部PiXiEED Bridge。Market決済とは別経路 |

Marketの購入権とPiXYNCのオンライン同期は同じものではない。購入したから自動的に共有Projectへ参加できる、または同期したから購入権を得られる、という推測は行わない。

## 3. 現在の販売・取得形式

### 3.1 有料購入

- Stripe Checkoutによる一回払い
- 通貨はJPY
- 通常価格は500円以上、100円単位
- 購入者が支払う価格は商品に表示された固定価格
- 購入者側へ追加のオプション料金は請求しない
- 決済完了後にEntitlement、License、revisionを発行する
- 購入済みAssetはマイページ、ダウンロード、iDRAW、iGAMEから利用できる

決済価格はクライアント入力を正本にせず、サーバー側の商品情報から確認する。

### 3.2 無料取得

- 商品価格が0円のときだけ利用できる
- メール確認済みのログインユーザーが対象
- 匿名ユーザーは無料取得できない
- 作者本人は自分の商品を取得できない
- Stripe決済は発生しない
- 売上、ロイヤリティ、販売数は発生しない
- 有料購入と同じEntitlement判定へ収束する

画面上は「購入済み」ではなく「無料取得済み」と表示する。

### 3.3 管理者取得

管理者・審査担当が確認目的で付与するアクセスであり、一般ユーザー向けの販売形式ではない。

- 決済なし
- 売上なし
- 販売数なし
- ロイヤリティなし
- 管理者取得であることを内部記録する

### 3.4 再ダウンロード・再利用

新しい販売ではない。すでに有効なEntitlementを持つユーザーが、同じ購入時点のrevisionを再利用する形式である。

## 4. 出品作品の形式

### 4.1 大元作品

制作者が直接作成して出品する作品。

- 無料または有料
- 通常販売または限定販売
- 派生販売を許可または禁止
- AI使用あり／なしを申告
- AI使用ありの場合は審査へ送る
- 元作品確認、規約、プライバシー、利用権限を確認する

### 4.2 派生作品

派生販売を許可された作品を正規取得し、改変・追加して出品する作品。

- 親作品ID、系列ID、派生出品権を保持する
- 親作品からの変更・追加内容を必須入力とする
- 親作品より利用条件を緩和できない
- 原則として一つの購入権から一つの派生出品権を発行する
- 派生作品も審査対象とする
- 派生作品の販売時に親作者・祖先作者へ継承ロイヤリティを配分する

派生作品の最低価格は、親系列の価格と必須条件からサーバー側で計算する。派生作品の価格をクライアントだけで決定してはならない。

## 5. 販売数の形式

### 5.1 通常販売

販売数の上限を設定しない形式。商品が公開中で、権利・決済条件を満たしている限り購入できる。

### 5.2 限定販売

- 先着1〜100,000件
- 有料商品のみ設定できる
- 同時購入でも上限を超えないようサーバー側で予約・確定を管理する
- 完売後も商品ページは削除せず、`SOLD OUT`で閲覧できる
- 取り下げ後も既存の購入権・分配履歴は維持する

## 6. 販売パッケージの形式

ファイルの組み合わせは、出品者が細かい構成を手動設計するのではなく、自動判定を基本とする。

- 絵のみ
- 音楽・SEのみ
- 絵＋音楽
- 文章・世界観のみ
- 動画のみ
- 絵＋動画
- 文章＋絵
- PXDプロジェクト
- 対応ファイル全部

### 6.1 対応形式

#### iDRAW・画像・アニメーション

- PXD
- PNG
- WebP
- GIF
- APNG
- PNGスプライトシート

#### iAUDIO

- WAV
- MP3
- AAC
- AIFF
- FLAC
- M4A
- MIDI
- OGG／OGA
- Opus
- WebM Audio

#### 文章・世界観

- 小説・世界観JSON
- TXT
- Markdown
- HTML
- CSV
- RTF
- JSON
- Visual Project JSON

#### 動画

- MP4
- WebM
- MOV
- M4V
- OGV

対応形式のサーバー受理は、ローカルの形式判定・パッケージ処理と、本番Supabase／Edge Functionで分けて受け入れる。

## 7. 利用条件・ライセンス

現在は、オプションごとに追加料金を設定せず、一つの販売価格に利用条件を含める。

### 7.1 利用条件

- 個人利用
- 商用・収益化利用
- ゲーム・アプリ・iGAME利用
- 動画・配信・広告利用
- グッズ・印刷販売
- クレジット表記不要
- 改変・派生販売許可
- 禁止用途

### 7.2 利用者向けプリセット案

販売者が細かい権利IDを理解しなくてもよいよう、UIではプリセットにまとめる。

| プリセット | 内部で付与する権利の例 |
| --- | --- |
| 個人利用 | 個人制作、非商用利用、クレジット条件を明示 |
| 商用・iGAME | ゲーム、アプリ、動画、配信、広告など |
| 商用拡張 | 商用・iGAMEに加えてグッズ・印刷利用 |
| クレジット不要 | 作者名表記を省略可能 |
| 派生販売許可 | 改変した独立作品のPiXiEED内販売を許可 |

「派生販売許可」は通常OFFにし、詳細設定に置く。

購入は著作権譲渡ではなく、購入時点のrevisionに対する利用権・ライセンスの発行である。

## 8. 購入後の利用形式

購入者には、技術形式ではなく目的別のボタンを表示する。

- `iDRAWで開く`
- `iAUDIOで使う`
- `iGAMEに追加`
- `ZIPでダウンロード`
- `マイページで確認`

PXDを含む商品はiDRAWで開ける形式を優先し、iGAMEでは現在のProjectを置換せず、権利確認済みAssetとして追加する。

## 9. 制作情報・制作系譜

### 9.1 商品側で保持する情報

- `creator_user_id`
- 公開作者名
- 公開プロフィールURL
- 親作品ID
- 系列ID
- 派生作品かどうか
- 変更・追加内容
- source SHA-256
- package hash
- provenance manifest
- AI使用申告
- 対応形式
- プレビューとStorage参照

### 9.2 購入時に固定する情報

- 商品ID
- 商品名
- 含まれる形式
- 商品構成
- source hash
- package hash
- source revision ID
- revision番号
- content hash
- License snapshot
- iGAME利用可否
- 派生販売可否
- 禁止用途
- 取得種別（paid／free／admin）

購入時の権利は、後から商品情報が更新されても購入時点の条件で判定できるようにする。

### 9.3 制作証明書の追加案

現在のサーバー記録には作者と系譜が存在するが、購入者がダウンロードするファイルに制作系譜・分配方針を完全な証明書として含める設計は未完了である。

将来的には、以下の`provenance certificate`をPackageへ同梱する。

```json
{
  "schema": "pixieed-provenance-certificate/v1",
  "asset_id": "...",
  "creator": {
    "user_id": "...",
    "display_name": "...",
    "profile_url": "..."
  },
  "lineage": [
    {
      "asset_id": "...",
      "creator_user_id": "...",
      "display_name": "...",
      "depth": 0
    }
  ],
  "source_revision_id": "...",
  "content_hash": "...",
  "license_id": "...",
  "rights": [],
  "distribution_policy_version": "..."
}
```

分配金額や購入者の個人情報は、公開Packageへ含めず、サーバー側の台帳で管理する。

## 10. 売上分配モデル

### 10.1 分配対象額

```text
販売価格
− Stripe決済実費
− PiXiEED利用手数料
= 作者・祖先作者への分配原資
```

利用手数料は価格帯に応じた累進方式で、低価格帯ほど高く、高価格帯ほど限界率が下がる。

### 10.2 大元作品

親作品がない大元作品では、分配対象額を大元作者へ配分する。

### 10.3 派生作品

派生作品では、派生作者と親・祖先作者へ系列に沿って分配する。

現在のロイヤリティ台帳は、受取人ID、系列深度、分配率、micro-yen金額、状態、利用可能日時を記録する。

実際の送金額は、販売直後ではなく、返金・チャージバックのリスクを考慮して保留期間後に確定する。

### 10.4 無料・管理者取得

無料取得と管理者取得は利用権を作るが、販売収益・ロイヤリティ・出金残高を作らない。

### 10.5 表示報酬・プレイ報酬

商品販売によるロイヤリティとは別に、次の報酬を扱える。

- 商品の有効表示に対する表示報酬
- PiXFiND等の有効プレイに対するプレイ報酬

これらは月次予算とポイント配分による別制度であり、販売価格から直接発生するロイヤリティとは分ける。確定後に販売収益・継承ロイヤリティと同じ出金残高へ合算できる。

## 11. 誰に何を見せるか

| 利用者 | 表示する情報 |
| --- | --- |
| 閲覧者 | プレビュー、作者名、価格、対応ツール、利用範囲、派生可否 |
| 購入者 | 作者名、購入したrevision、License、利用可能形式、iGAME利用可否 |
| 販売者 | 販売収益、継承ロイヤリティ、表示報酬、確定残高、出金見込み |
| 運営 | 受取人ID、分配率、台帳、Webhook、返金、送金、監査ログ |

次の情報は通常の利用者画面へ出さない。

- service role情報
- private Storage path
- Entitlement内部ID
- Stripe内部ID
- Webhook処理状態
- 他の作者の個人情報
- 受取人ごとの内部台帳ID

## 12. 利用者向けUIの簡略化

### 12.1 販売者

```text
ファイルを追加
  ↓
形式・プレビューを自動判定
  ↓
無料／価格を選択
  ↓
利用範囲プリセットを選択
  ↓
公開
```

詳細設定へ置くもの。

- 限定販売
- 派生販売許可
- 禁止用途
- AI使用申告の詳細
- Package形式の手動調整

販売者には、出品価格だけでなく、決済実費・PiXiEED手数料控除後の受取見込み額も表示する。

### 12.2 購入者

```text
プレビューを見る
  ↓
利用条件を確認
  ↓
無料で取得／購入する
  ↓
iDRAW・iAUDIO・iGAMEで使う
```

購入画面には、価格、利用範囲、含まれる形式、iGAME利用可否だけを優先表示する。

### 12.3 閲覧者

未ログインでも、プレビュー、試聴、文章確認、お気に入り、共有を利用できる。ログインは取得・購入・利用権が必要な操作時だけ要求する。

## 13. 状態とライフサイクル

### 13.1 商品状態

- draft
- review
- published
- withdrawn
- sold out
- suspended

### 13.2 購入状態

- pending
- paid
- granted
- refunded
- disputed
- cancelled

`pending`はEntitlementではない。支払い完了または明示的な無料・管理者付与が確定するまで、ダウンロードとiGAME利用権を発行しない。

## 14. 現行コードとの対応

| 領域 | 主な実装場所 |
| --- | --- |
| 出品UI・価格・Package | `market/sell.html`、`market/sell.js` |
| 形式判定・Package作成 | `market/listing-package-utils.js` |
| 商品詳細・購入導線 | `market/item.html`、`market/item.js` |
| 作者・公開Catalog | `market_public_catalog_v1`、`market_public_asset_v1` |
| 有料Checkout | `supabase/functions/market-create-checkout/` |
| Stripe確定・返金・係争 | `supabase/functions/market-stripe-webhook/` |
| 無料取得 | `market_acquire_free_asset_v1` |
| Entitlement・revision | `20260906002539_pixieed_vnext_market_entitlements_and_pixync.sql` |
| 安全配信 | `supabase/functions/market-download/` |
| iGAME Asset Binding | `market_record_asset_binding_v1`、`scripts/account-market-purchases.js` |
| 売上・出金画面 | `market/seller.html`、`market/seller.js`、`account/index.html` |
| 表示報酬 | Market reward関連RPC・`market/about.html` |

## 15. 実装状態

### コード上で実装されているもの

- 大元作品と派生作品の出品
- 無料・有料価格
- 限定販売
- PXD、画像、音声、動画、文章、世界観のPackage
- AI使用申告と審査導線
- Stripe Checkout、Webhook署名、冪等処理
- Entitlement、License snapshot、revision、hash
- private Storageと署名URL
- iGAMEへの権利確認済みAsset追加
- 返金・係争時の権利・台帳反転
- 作者・祖先作者へのロイヤリティ台帳
- 売上・継承ロイヤリティ・表示報酬の集計画面

### 本番受入れが必要なもの

- 対象Supabase Projectへの最新Migration適用
- Edge Functionの本番Deploy
- Stripe本番Webhook
- private Storageと署名URL
- RLS、認証、メール確認
- 有料購入の2ユーザー試験
- 無料取得の2ユーザー試験
- Webhook再送・重複処理
- 全額返金・チャージバック・Transfer Reversal
- 30日保留後の送金
- 購入後のiDRAW・iAUDIO・iGAME利用

リポジトリのローカルコードがPASSしていても、上記の外部境界を確認するまでは本番販売完了とは判定しない。

## 16. 既知の不整合・修正方針

### 16.1 無料販売の記述

現在のコードは無料取得を実装しているが、古い資料には「無料配布なし」や「無料取得準備中」の記述が残っている。

今後の正式用語は次に統一する。

- 有料: `購入`
- 0円: `無料取得`
- 管理者用: `管理者取得`

### 16.2 オプション料金

現在のUIと最新RPCは、利用オプションを販売価格へ含め、オプション単体の追加料金を受け付けない。

古い「有料オプションが購入価格へ加算される」という記述は、最新仕様と一致しないため更新対象とする。

### 16.3 制作証明と分配証明

サーバー側のAsset、Series、Entitlement、Royalty ledgerには必要な情報がある。一方、購入者が取得するPackageへ制作者の系譜・分配方針を明示的に同梱する機能は追加候補である。

追加時も、購入者の個人情報、内部Stripe ID、内部受取人ID、分配金額は公開Packageへ含めない。

## 17. 受入れ条件

最低限、以下を満たしたときに販売形式を本番利用可能と判定する。

1. 閲覧者が未ログインで商品と透かし付きPreviewを確認できる
2. 認証済みユーザーが無料Assetを一度だけ無料取得できる
3. 有料購入がStripe CheckoutからWebhook経由で確定する
4. 無料・有料とも同じEntitlement判定で安全配信される
5. 購入時のrevision、hash、Licenseが再読込後も変わらない
6. iDRAW、iAUDIO、iGAMEで権利確認済みAssetを利用できる
7. 派生作品の親作者・祖先作者が正しい台帳へ記録される
8. 同じWebhookを再送しても二重の購入権・台帳・送金が発生しない
9. 返金・係争時に利用権、台帳、送金を正しく反転できる
10. 販売者が販売収益、継承ロイヤリティ、表示報酬、出金見込みを確認できる
11. 利用者向け画面では、販売形式が「無料」「購入」「限定販売」の3種類として理解できる

## 18. 参考実装

- `market/sell.js`
- `market/item.js`
- `market/listing-package-utils.js`
- `market/seller.js`
- `scripts/account-market-purchases.js`
- `supabase/functions/market-create-checkout/`
- `supabase/functions/market-stripe-webhook/`
- `supabase/functions/market-download/`
- `supabase/migrations/20260717150000_market_stripe_connect_payments.sql`
- `supabase/migrations/20260906002539_pixieed_vnext_market_entitlements_and_pixync.sql`
- `docs/decisions/pixieed-vnext-implementation-status-20260906.md`
- `docs/market-stripe-setup.md`
