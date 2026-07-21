# PiXiEEDマーケット Stripe接続手順

## 対象

この手順は、素材単位の新しいマーケット決済専用です。退役した広告非表示・支援向け固定商品のStripe処理、商品、Price、Webhookは再利用しません。

## 構成

- 有料購入: Stripe Checkout
- 販売者: Stripe Connect Express
- 決済モデル: Separate Charges and Transfers
- 権利付与: Stripe署名検証済みWebhook
- 作者分配: PiXiEED内部のmicro-yen台帳
- 送金: 30日保留後、最低額以上を作者単位でStripe Transfer
- 返金・チャージバック: 権利と台帳を取消し、送金済み分はTransfer Reversal
- 販売価格: 選択オプションを含む販売価格500円以上（無料配布なし）

## 必要なSecrets

Supabase Edge Functionsへ次を設定する。

```sh
supabase secrets set \
  STRIPE_SECRET_KEY=sk_live_... \
  STRIPE_WEBHOOK_SECRET=whsec_... \
  SITE_URL=https://pixieed.jp \
  MARKET_PAYOUT_SECRET=十分に長いランダム値 \
  MARKET_PAYOUT_MINIMUM_YEN=1000
```

`SUPABASE_URL`、`SUPABASE_ANON_KEY`、`SUPABASE_SERVICE_ROLE_KEY`はSupabaseがEdge Functionsへ提供する。秘密鍵をブラウザ側へ置かない。

本番接続前は必ずStripeテストモードの`sk_test_...`とテスト用Webhook Secretで一連の動作を確認する。本番鍵への変更は別作業とする。

## Stripe側の設定

1. Stripe Connectを有効にし、日本のExpress販売者アカウントを利用できる状態にする。
2. 次のWebhook Endpointを追加する。

   `https://kyyiuakrqomzlikfaire.supabase.co/functions/v1/market-stripe-webhook`

3. 次のイベントを購読する。

   - `account.updated`
   - `checkout.session.completed`
   - `checkout.session.async_payment_succeeded`
   - `checkout.session.async_payment_failed`
   - `checkout.session.expired`
   - `charge.refunded`
   - `charge.dispute.created`
   - `charge.dispute.closed`

4. Endpoint作成後に表示される署名Secretを`STRIPE_WEBHOOK_SECRET`へ設定する。

## Supabase適用順

```sh
supabase db push
supabase functions deploy market-stripe-connect
supabase functions deploy market-create-checkout
supabase functions deploy market-stripe-webhook
supabase functions deploy market-stripe-payout
```

このリポジトリへの実装だけでは、上記コマンドは自動実行しない。

## 月次送金

`market-stripe-payout`を月1回、POSTで呼び出す。Headerには次を付ける。

```text
x-pixieed-market-payout-secret: MARKET_PAYOUT_SECRETと同じ値
```

呼出先:

```text
https://kyyiuakrqomzlikfaire.supabase.co/functions/v1/market-stripe-payout?limit=20
```

Supabase Cronなどから呼ぶ場合もSecretはVault等で管理し、SQL、Git、ブラウザへ平文で保存しない。処理はバッチIDをStripeのIdempotency Keyへ使用するため、同じバッチの再試行で二重Transferを作らない。

## 公開前テスト

1. 販売者情報とTOTPを登録する。
2. Stripe Connectテストアカウントのオンボーディングを完了する。
3. `account.updated`で販売者状態が`verified`になることを確認する。
4. テスト商品をStripe Checkoutで購入する。
5. `market_purchases`が`paid`になり、購入権とロイヤリティー台帳が1回だけ作られることを確認する。
6. 同じWebhookを再送しても重複付与されないことを確認する。
7. 全額返金で購入権と台帳が取り消されることを確認する。
8. 保留期間と最低額をテスト環境で短縮した検証用データにより、TransferとTransfer Reversalを確認する。

部分返金は初回リリース対象外とし、Stripe Dashboardの運用では全額返金のみを使用する。

## 公開前の法務確認

現在の`terms/index.html`、`privacy/index.html`、`legal/index.html`には旧決済手段の記述が残っている。Stripe本番決済を有効化する前に、マーケットの販売主体、返金条件、Stripeへの情報提供、販売者への送金、手数料、チャージバック負担、特定商取引法上の表示を専門家と確認し、公開文書を更新する。コード実装だけを根拠に本番販売を開始しない。
