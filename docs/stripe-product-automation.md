# Stripe Product Automation

PiXiEED の Stripe 商品と Price は `scripts/stripe-create-products.mjs` で作成できます。

このスクリプトはデフォルトで dry-run です。`--apply` を付けない限り Stripe へ通信せず、商品も作りません。

## 対象

組み込み定義は現在の checkout function と同じ商品キーを作ります。

- `browser_ad_free`
- `pixiedraw_ad_free`
- `pixieed_support_monthly`
- `support_tip`

作成後は、出力された Price ID を Supabase Edge Function secrets に設定します。

## 確認だけ

```bash
node scripts/stripe-create-products.mjs --dry-run
```

## Stripe へ作成

本番商品を作る前に Stripe Dashboard の本番/テスト切替を確認してください。
`sk_test_...` を使えばテスト環境、`sk_live_...` を使えば本番環境に作成されます。

```bash
STRIPE_SECRET_KEY=sk_test_xxxxxxxxxxxxx node scripts/stripe-create-products.mjs --apply
```

既に同じ `lookup_key` の active Price がある場合は再利用します。なければ Product と Price を作成します。

## Supabase secrets へ反映

`--apply` の出力に次の形式のコマンドが表示されます。

```bash
supabase secrets set \
  PIXIEED_STRIPE_BROWSER_ADFREE_PRICE_ID=price_xxxxxxxxxxxxx \
  PIXIEED_STRIPE_PIXIEDRAW_ADFREE_PRICE_ID=price_xxxxxxxxxxxxx \
  PIXIEED_STRIPE_PIXIEED_SUPPORT_MONTHLY_PRICE_ID=price_xxxxxxxxxxxxx \
  PIXIEED_STRIPE_SUPPORT_TIP_PRICE_ID=price_xxxxxxxxxxxxx \
  --project-ref kyyiuakrqomzlikfaire
```

実行後、checkout function と webhook function を再デプロイします。

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

## プラグイン商品の追加

プラグイン用の商品は JSON ファイルで渡せます。

```json
{
  "products": [
    {
      "key": "pixiedraw_plugin_example",
      "name": "PiXiEEDraw Plugin Example",
      "description": "Example PiXiEEDraw plugin.",
      "amount": 300,
      "currency": "jpy",
      "mode": "payment",
      "lookupKey": "pixiedraw_plugin_example_v1",
      "priceEnv": "PIXIEED_STRIPE_PLUGIN_EXAMPLE_PRICE_ID",
      "metadata": {
        "pixieed_product_key": "pixiedraw_plugin_example",
        "pixieed_plugin_key": "example"
      }
    }
  ]
}
```

```bash
node scripts/stripe-create-products.mjs --file ./stripe-products.plugins.json --dry-run
STRIPE_SECRET_KEY=sk_test_xxxxxxxxxxxxx node scripts/stripe-create-products.mjs --file ./stripe-products.plugins.json --apply
```

注意: Stripeの商品/Priceだけを作っても、PiXiEEDraw内で購入済みプラグインとして使えるようにはなりません。checkout function、webhook、Supabaseの権限テーブル、PiXiEEDraw側の読み込み許可を別途追加する必要があります。
