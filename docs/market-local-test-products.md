# マーケットのDEVテスト商品

`market/local-test-products.js`には、マーケット一覧・絞り込み・商品詳細の表示確認用商品を8件定義している。

- 対象のDEVアカウントで本人確認済みセッションのときだけ有効。
- ローカルHTTPと公開URLのどちらでも、同じDEVアカウント判定を使う。`file:`直接表示ではログインセッションを検証できないため表示しない。
- Supabaseへ商品・購入記録を作成しない。
- Stripe Checkoutを呼ばない。
- 画像はリポジトリ内の既存ファイルだけを参照する。
- DEVアカウントでもURLへ`?test_products=0`を付けると一時的に非表示になる。

## 完全に削除する場合

1. `market/local-test-products.js`を削除する。
2. `market/index.html`と`market/item.html`から`local-test-products.js`の`script`タグを削除する。
3. `market/market.js`と`market/item.js`で`local_test`または`PiXiEEDMarketLocalTestProducts`を参照する分岐を削除する。

テスト商品IDは`00000000-0000-4000-8000-000000000101`から`00000000-0000-4000-8000-000000000108`までに固定し、実商品と区別する。
