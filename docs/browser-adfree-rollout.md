# Browser Ad-Free Rollout

PiXiEED のブラウザ版広告非表示を、`Stripe Checkout (PayPay対応) -> webhook -> 自動反映 or 購入番号入力 -> 適用` で本番化する手順です。

以前の `STORES購入 -> webhook -> 注文番号からコード受取` 導線は legacy として残っていますが、現在の購入導線は Stripe 前提です。

## 1. 前提

- Supabase Project Ref: `kyyiuakrqomzlikfaire`
- 追加済み migration
  - `supabase/migrations/20260321010000_browser_adfree_entitlements.sql`
  - `supabase/migrations/20260321020000_browser_adfree_purchase_orders.sql`
- 追加済み Edge Functions
  - `supabase/functions/stripe-browser-adfree-checkout/index.ts`
  - `supabase/functions/stripe-browser-adfree-webhook/index.ts`

## 2. Stripe 側で用意するもの

Stripe Dashboard で以下を作成または確認します。

- 広告非表示用の Product / Price
- PayPay を有効化した Checkout
- Webhook Endpoint

必要な値:

- `STRIPE_SECRET_KEY`
- `PIXIEED_STRIPE_WEBHOOK_SECRET`
- `PIXIEED_STRIPE_BROWSER_ADFREE_PRICE_ID`
- `PIXIEED_STRIPE_SUPPORT_TIP_PRICE_ID`

任意:

- `PIXIEED_STRIPE_ALLOWED_HOSTS`
- `PIXIEED_STRIPE_DEFAULT_RETURN_URL`
- `PIXIEED_BROWSER_ADFREE_DURATION_DAYS`

## 3. Supabase CLI を使う場合

### 3-1. CLI の準備

```bash
brew install supabase/tap/supabase
supabase login
supabase link --project-ref kyyiuakrqomzlikfaire
```

### 3-2. migration 適用

```bash
supabase db push --project-ref kyyiuakrqomzlikfaire
```

### 3-3. Edge Function secrets 設定

```bash
supabase secrets set \
  STRIPE_SECRET_KEY=__STRIPE_SECRET_KEY__ \
  PIXIEED_STRIPE_WEBHOOK_SECRET=__STRIPE_WEBHOOK_SECRET__ \
  PIXIEED_STRIPE_BROWSER_ADFREE_PRICE_ID=price_xxxxxxxxxxxxx \
  PIXIEED_STRIPE_SUPPORT_TIP_PRICE_ID=price_xxxxxxxxxxxxx \
  PIXIEED_STRIPE_ALLOWED_HOSTS=pixieed.jp,www.pixieed.jp,localhost,127.0.0.1 \
  PIXIEED_STRIPE_DEFAULT_RETURN_URL=https://pixieed.jp/pixiedraw/ \
  PIXIEED_BROWSER_ADFREE_DURATION_DAYS=31 \
  --project-ref kyyiuakrqomzlikfaire
```

### 3-4. Edge Function deploy

```bash
supabase functions deploy stripe-browser-adfree-checkout \
  --project-ref kyyiuakrqomzlikfaire \
  --no-verify-jwt \
  --use-api

supabase functions deploy stripe-browser-adfree-webhook \
  --project-ref kyyiuakrqomzlikfaire \
  --no-verify-jwt \
  --use-api
```

## 4. Supabase Dashboard で進める場合

1. SQL Editor で migration 2本を順に実行
2. Edge Functions で以下を新規作成
   - `stripe-browser-adfree-checkout`
   - `stripe-browser-adfree-webhook`
3. 各 `index.ts` の内容を貼る
4. Function の JWT 検証を OFF
5. Secrets に以下を追加
   - `STRIPE_SECRET_KEY`
   - `PIXIEED_STRIPE_WEBHOOK_SECRET`
   - `PIXIEED_STRIPE_BROWSER_ADFREE_PRICE_ID`
   - `PIXIEED_STRIPE_SUPPORT_TIP_PRICE_ID`
   - `PIXIEED_STRIPE_ALLOWED_HOSTS`
   - `PIXIEED_STRIPE_DEFAULT_RETURN_URL`
   - `PIXIEED_BROWSER_ADFREE_DURATION_DAYS`

## 5. Stripe Webhook 設定

Webhook URL:

```text
https://kyyiuakrqomzlikfaire.supabase.co/functions/v1/stripe-browser-adfree-webhook
```

listen する event:

- `checkout.session.completed`
- `checkout.session.async_payment_succeeded`
- `checkout.session.async_payment_failed`

この実装では Checkout Session の `metadata.product_key=browser_ad_free` を見て広告非表示商品だけ処理します。

## 6. フロントの流れ

`広告非表示を購入` ボタンは次の Function を開きます。

```text
https://kyyiuakrqomzlikfaire.supabase.co/functions/v1/stripe-browser-adfree-checkout
```

Function 側で Stripe Checkout Session を作り、購入後は元のページへ戻します。戻り URL には `stripe_checkout_session_id` が付き、ログイン済みなら自動で適用を試みます。

`product=support_tip` で開いた場合は、同じ checkout Function を使って応援チップ決済へ進みます。こちらは entitlement を付けず、決済後は元のページへ戻るだけです。

自動反映できなかった場合でも、同じ入力欄に以下どちらかを入れて `適用` を押せば反映できます。

- 購入番号: Stripe Checkout Session ID (`cs_...`)
- 購入コード: `PXA...`

## 7. 動作確認

### 7-1. 決済確認

1. PiXiEED でログインした状態で `広告非表示を購入`
2. Stripe Checkout で PayPay またはカード決済
3. 元のページへ戻る

期待:

- `stripe_checkout_session_id` 付きで戻る
- ログイン済みなら自動で広告非表示が有効になる

### 7-2. 手動適用確認

1. PiXiEEDDraw 設定の `広告非表示（ブラウザ版）` へ移動
2. `cs_...` の購入番号または `PXA...` の購入コードを入力
3. `適用` を押す

期待:

- PiXiEEDDraw のパネル広告
- モバイル下部広告
- 出力ダイアログ広告
- 出力後インタースティシャル

が止まる

## 8. DB 確認用 SQL

```sql
select provider, provider_order_id, buyer_email, payment_status, code, issued_at, claimed_at
from public.browser_adfree_purchase_orders
order by created_at desc
limit 20;
```

```sql
select code, entitlement_key, duration_days, redemption_count, active, metadata
from public.user_entitlement_codes
where entitlement_key = 'browser_ad_free'
order by updated_at desc
limit 20;
```

```sql
select user_id, entitlement_key, status, expires_at, redeemed_code, created_at
from public.user_entitlements
where entitlement_key = 'browser_ad_free'
order by updated_at desc
limit 20;
```

## 9. 失敗時の確認

- `STRIPE_SECRET_KEY` / `PIXIEED_STRIPE_WEBHOOK_SECRET` / `PIXIEED_STRIPE_BROWSER_ADFREE_PRICE_ID` が未設定
- Stripe Webhook が必要 event を送っていない
- 購入時メールと PiXiEED ログインメールが違う
- `PIXIEED_STRIPE_ALLOWED_HOSTS` に現在のホストが入っていない
- Webhook の `checkout.session.completed` は来ているが、反映前に戻って claim が先に走っている

最後のケースは、同じ入力欄に `cs_...` を入れて `適用` を押せば再試行できます。

## 10. 一時的な手動復旧

webhook 未整備でも、最悪は `user_entitlement_codes` に手動コードを発行し、購入者へ渡せば広告非表示は有効化できます。  
ただし本来の本番運用は Stripe webhook 経由を前提にしてください。
