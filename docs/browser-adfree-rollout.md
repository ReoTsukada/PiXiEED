# Browser Ad-Free Rollout

PiXiEED のブラウザ版広告非表示を、`STORES購入 -> webhook -> 注文番号からコード受取 -> コード適用` で本番化する手順です。

STORES の商品説明や購入後案内で使う文言は `docs/browser-adfree-stores-copy.md` を参照してください。

## 1. 前提

- Supabase Project Ref: `kyyiuakrqomzlikfaire`
- 追加済み migration
  - `supabase/migrations/20260321010000_browser_adfree_entitlements.sql`
  - `supabase/migrations/20260321020000_browser_adfree_purchase_orders.sql`
- 追加済み Edge Function
  - `supabase/functions/stores-browser-adfree-webhook/index.ts`

## 2. Supabase CLI を使う場合

### 2-1. CLI の準備

```bash
brew install supabase/tap/supabase
supabase login
supabase link --project-ref kyyiuakrqomzlikfaire
```

### 2-2. migration 適用

```bash
supabase db push --project-ref kyyiuakrqomzlikfaire
```

### 2-3. Edge Function secrets 設定

```bash
supabase secrets set \
  PIXIEED_STORES_WEBHOOK_SECRET=__LONG_RANDOM_SECRET__ \
  PIXIEED_BROWSER_ADFREE_DURATION_DAYS=31 \
  PIXIEED_BROWSER_ADFREE_PRODUCT_MATCH=広告非表示 \
  --project-ref kyyiuakrqomzlikfaire
```

### 2-4. Edge Function deploy

Supabase Docs では、外部 webhook 用の Function は `--no-verify-jwt` で deploy できます。  
Ref: https://supabase.com/docs/guides/functions/deploy

```bash
supabase functions deploy stores-browser-adfree-webhook \
  --project-ref kyyiuakrqomzlikfaire \
  --no-verify-jwt \
  --use-api
```

## 3. Supabase Dashboard で進める場合

CLI がない場合は以下でも進められます。

1. SQL Editor で migration 2本を順に実行
2. Edge Functions で `stores-browser-adfree-webhook` を新規作成
3. `supabase/functions/stores-browser-adfree-webhook/index.ts` の内容を貼る
4. Function の JWT 検証を OFF
5. Secrets に以下を追加
   - `PIXIEED_STORES_WEBHOOK_SECRET`
   - `PIXIEED_BROWSER_ADFREE_DURATION_DAYS`
   - `PIXIEED_BROWSER_ADFREE_PRODUCT_MATCH`

## 4. STORES 側 webhook 設定

webhook URL:

```text
https://kyyiuakrqomzlikfaire.supabase.co/functions/v1/stores-browser-adfree-webhook?secret=__LONG_RANDOM_SECRET__&product=browser_ad_free
```

推奨:

- webhook は広告非表示商品の購入完了イベントにだけ向ける
- 商品名に `広告非表示` を含める
- PiXiEED アカウントと同じメールアドレスで購入してもらう

この実装では、購入時メールアドレスとログイン中アカウントのメールアドレスが一致しないと redeem できません。

## 5. 動作確認

### 5-1. webhook 単体テスト

```bash
curl -X POST \
  "https://kyyiuakrqomzlikfaire.supabase.co/functions/v1/stores-browser-adfree-webhook?secret=__LONG_RANDOM_SECRET__&product=browser_ad_free" \
  -H "content-type: application/json" \
  -d '{
    "order": {
      "id": "TEST-ORDER-1001",
      "email": "you@example.com",
      "status": "paid",
      "items": [
        { "name": "PiXiEEDDraw 広告非表示" }
      ]
    }
  }'
```

期待:

- `browser_adfree_purchase_orders` に注文が作成される
- `user_entitlement_codes` にコードが作成される

### 5-2. UI テスト

1. `you@example.com` と同じメールで PiXiEED にログイン
2. PiXiEEDDraw 設定の「広告非表示（ブラウザ版）」へ移動
3. 注文番号 `TEST-ORDER-1001` を入力
4. `購入コードを受け取る` を押す
5. `コードを適用` を押す

期待:

- PiXiEEDDraw のパネル広告
- モバイル下部広告
- 出力ダイアログ広告
- 出力後インタースティシャル

が止まる

## 6. DB 確認用 SQL

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

## 7. 失敗時の確認

- webhook が届いていない
- webhook payload に注文番号 / メール / 商品名が入っていない
- 商品名が `PIXIEED_BROWSER_ADFREE_PRODUCT_MATCH` に一致していない
- 購入時メールと PiXiEED ログインメールが違う
- Edge Function の secret が URL と一致していない

## 8. 一時的な手動復旧

webhook 未整備でも、最悪は `user_entitlement_codes` に手動コードを発行し、購入者へ渡せば広告非表示は有効化できます。  
ただし本来の本番運用は webhook 経由を前提にしてください。
