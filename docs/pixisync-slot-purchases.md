# PiXiSYNC 作成枠販売

PiXiSYNCのシェアプロジェクト作成枠を、Stripe Checkoutで1枠100円の買い切りとして販売する実装メモです。無料枠は1アカウント1枠で、購入ごとに永久枠を1つ追加します。

## 安全性の前提

- ブラウザの完了画面だけでは枠を付与しない。
- `checkout.session.completed` の署名済みWebhook、またはログイン済み購入者によるStripe Session再照合で決済を確認する。
- `amount_total = 100`、商品キー、購入ID、ユーザーID、Checkout Session IDがすべて一致した場合だけ付与する。
- WebhookイベントはイベントIDで冪等化し、同じイベントを再送しても枠を重複付与しない。
- Stripe秘密鍵とWebhook署名SecretはEdge FunctionsのSecretに置き、ブラウザやGitへ含めない。本番は既存の`market-stripe-webhook`と`STRIPE_WEBHOOK_SECRET`を再利用する。
- 返金またはチャージバック時は購入枠を差し引くが、既存のシェアプロジェクトは削除しない。

## 決済手段

100円販売ではカード決済だけを有効にします。コンビニ決済はStripeの最低手数料が商品価格を上回るため使用しません。Checkout上ではカードに対応するウォレットが利用できる場合があります。

## Stripeテストモード

1. Edge Functionsへテスト用の `STRIPE_SECRET_KEY` と `STRIPE_PIXISYNC_WEBHOOK_SECRET` を設定する。後者はPiXiSYNC用EndpointにStripeが発行した署名Secretを使う。
2. `pixisync-stripe-webhook` をStripeテストモードのWebhook Endpointへ登録する。
3. 次のイベントを購読する。
   - `checkout.session.completed`
   - `checkout.session.async_payment_succeeded`
   - `checkout.session.async_payment_failed`
   - `checkout.session.expired`
   - `charge.refunded`
   - `charge.dispute.created`
   - `charge.dispute.closed`
4. テストカードで100円を購入し、戻り画面で作成枠が1つ増えることを確認する。
5. 同じWebhookを再送しても購入枠が重複しないことを確認する。
6. 全額返金で購入枠が1つ減り、既存プロジェクトが削除されないことを確認する。

## 本番Webhook

本番は既存の署名検証済み`market-stripe-webhook`へPiXiSYNC専用ハンドラを追加する。既存Endpointが上記7イベントをすでに購読しているため、新しいStripe Endpointや署名Secretは不要。Checkoutの`pixieed_product_key = pixisync_project_slot`、または購入台帳に記録されたCharge IDへ一致したイベントだけをPiXiSYNC処理へ分岐し、それ以外は従来のMarketplace処理へ渡す。

## Supabase適用順

```sh
supabase db push --dry-run
supabase db push --yes
supabase migration list
supabase functions deploy pixisync-create-slot-checkout --use-api
supabase functions deploy pixisync-reconcile-slot-purchase --use-api
supabase functions deploy market-stripe-webhook --use-api
```

2026年8月3日に本番DB、購入用Edge Functions、既存Stripe Webhookへの分岐を適用済み。実決済を伴う購入・返金の最終確認は、運用アカウントで100円の課金を許可したうえで行う。

## 公開前確認

- `terms/`、`legal/`、`privacy/`の販売主体、提供時期、返金条件、Stripeへの情報提供を確認する。
- 返金運用は初回リリースでは全額返金に限定する。
- 100円の税込表示と会計処理を確認する。
- 本番Webhookの失敗通知と再送状況を運用確認する。
