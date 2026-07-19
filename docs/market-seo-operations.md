# PiXiEEDマーケット SEO運用

GitHub Pagesでは商品ごとにサーバー描画できないため、公開済み商品は静的HTMLとして生成する。

1. `supabase db push` で `20260720100000_market_public_seo_catalog.sql` を適用する。
2. `node scripts/generate-market-seo-pages.mjs` を実行する。
3. `node scripts/test-market-seo-pages.mjs` と `git diff --check` を実行し、生成された `market/items/<UUID>/index.html` と `sitemap.xml` を確認する。
4. 生成物を通常のサイト更新としてコミット・公開する。

商品一覧・マイページ・Stripeの戻り先を恒久URLへ切り替えるのは、生成済みページを含む公開リリースと同時に行う。先にリンクだけを切り替えると、GitHub Pages上で商品ページが404になる。

生成ページは、公開中かつ取り下げ前の商品だけを対象に、固有canonical URL、初期HTMLのタイトル・説明・価格・利用条件、`Product` JSON-LDを持つ。署名URLで保護しているプレビュー画像は1時間で失効するため、構造化データには含めない。画像検索を強化する場合は、透かし済みの公開用プレビューを別bucketへ配置してから `image` を追加する。
