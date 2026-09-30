# 検索用サイトマップ

`sitemap.xml` は `https://pixieed.jp/sitemap.xml` で公開する検索エンジン向けXMLです。`robots.txt` から参照済みです。ナビゲーションや作品一覧の画面は追加しません。

## 掲載範囲

17ページの正規URLを掲載します。ホーム、地球儀、ツール一覧、公開中の制作・パズルツール、ドット絵カメラ、PiXiEELENS、サイト紹介、使い方、プライバシーポリシー、店舗一覧、公開店舗です。

以下は掲載しません。

- 開発中で公開リンクを外した `/game/`。
- 端末内の個人記録である `/collection/` とマイページ・管理画面。
- 転送用の `/home/`、`/telescope/`、旧ページ、廃止した販売作品・サンプル店舗。
- カメラや地球儀の内部実装ページ、テスト画面。
- 一時的な設定・端末内のPXD参照・個別共有のクエリ付きURL。

ゲーム、コレクション、望遠鏡の転送ページには `noindex,follow` を設定しています。検索除外はアクセス制限ではなく、URLを直接開く操作や既存の転送は維持します。公開投稿を個別に検索へ載せる場合は、端末内データに依存しない正規の公開ページを別途用意してから追加します。

## 更新と確認

新しい公開ページを追加するときは、自己参照のcanonical、検索除外・転送の有無を確認し、`sitemap.xml` と `tests/creation-suite/seo.test.mjs` の対象ページを更新します。開発ページやリダイレクトを自動収集しないよう、掲載範囲は明示的に管理します。

```sh
node scripts/creation-suite-harness.mjs --suite seo
```

検証では掲載URL、重複、正規URLとの一致、検索除外・転送ページの混入、`robots.txt` からの参照を確認します。実際のXML構文も公開前に検証してください。検索への登録・順位を保証する検証ではありません。

正確な重要更新日を管理していないため、`lastmod` は省略します。Googleが使用しない `priority` と `changefreq` も付けません。

## 本番反映後

Search Consoleの対象プロパティで「サイトマップ」を開き、`https://pixieed.jp/sitemap.xml` を送信してください。送信済みなら同じURLを使用します。本番でXMLと各URLが正常に取得できることを確認します。

参考: [Google公式のサイトマップ作成・送信方法](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap?hl=ja)
