# PiXiEEDマーケット SEO運用

GitHub Pagesでは商品ごとにサーバー描画できないため、公開済み商品は静的HTMLとして生成する。

1. `supabase db push` で `20260720100000_market_public_seo_catalog.sql` を適用する。
2. `node scripts/generate-market-seo-pages.mjs` を実行する。
3. `node scripts/test-market-seo-pages.mjs` と `git diff --check` を実行し、生成された `market/items/<UUID>/index.html` と `sitemap.xml` を確認する。
4. 生成物を通常のサイト更新としてコミット・公開する。

通常運用では `.github/workflows/generate-market-ogp.yml` が5分ごとに同じ生成処理を実行する。公開済み商品に差分がある場合だけ、GitHub Actionsが `market/items/` と `sitemap.xml` を自動コミットする。新規出品、審査承認、出品内容の更新はいずれも次回実行時に反映される。GitHubリポジトリの **Actions workflow permissions** は「Read and write permissions」に設定しておく。

商品一覧・マイページ・Stripeの戻り先を恒久URLへ切り替えるのは、生成済みページを含む公開リリースと同時に行う。先にリンクだけを切り替えると、GitHub Pages上で商品ページが404になる。

生成ページは、公開中かつ取り下げ前の商品だけを対象に、固有canonical URL、初期HTMLのタイトル・説明・価格・利用条件、`Product` JSON-LDを持つ。生成時には署名付きの透かし済みプレビューを取得し、`PiXiEEDMarket.png` の台紙へ合成した `market/items/<UUID>/share.png` を作成する。この固定画像を OGP / X Card に指定するため、共有先は JavaScript を実行しなくても商品サムネイルを表示できる。

`PiXiEED Market OGP.png` は商品一覧 `https://pixieed.jp/market/` 専用のOGP画像であり、商品別の共有画像には使用しない。公開済み商品の変更後は必ず生成スクリプトを再実行して、`share.png` と商品ページを更新する。
