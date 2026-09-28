# 検索表示・サイトアイコン・パズル共有

2026-09-28。検索向けの静的ページ整備と、作品ごとの共有カードを分けて扱う。今回のソースをコミット・プッシュする。本番DB/APIとSNS側のカード表示は未確認。

## 静的ページの整備

サイト、各制作ツール、案内ページに日本語タイトル・説明、正規URL、Open Graph、Twitter CardをHTMLのheadへ直接入れる。共有画像は `/assets/og/` の1200×630 PNGを使う。画面のJavaScriptが動くことを前提にしない。サイト共通の共有画像は既存PiXiEEDロゴ、ツールはそれぞれの既存アイコンを使い、作品サンプルを販売用素材のように扱わない。

検索アイコンは既存48pxロゴを整数倍にした96px PNG。白いロゴが見える濃紺の背景を付ける。ホーム画面用180px、アプリ用192/512px、ICO互換アイコンも同じロゴから作る。ブランド形状を変更しない。生成手順は `scripts/generate-site-brand-assets.mjs`。Playwrightが既にある環境で `PIXIEED_PLAYWRIGHT_MODULE` を指定して再生成でき、新しい依存を自動導入しない。

サイトマップには公開ツールの正規URLを入れる。下書き、管理画面、プロフィールの私的な画面、販売ページ、廃止した作品一覧を追加しない。内部検証画面、旧カメラ試作、存在しない旧サンプル店舗もHTMLでnoindexを指定する。OGPの設定は検索順位・SNS上の表示・更新時期を保証しない。

**IMPLEMENTED:** 公開18ページの静的メタ情報、全37 HTMLのブランドアイコン、18ページの検索除外、サイトマップ、OG画像11枚、PNGアイコン4枚と96px PNGを埋めたICO。今回の変更はheadと静的素材であり、本文・ツール操作・旧作品データは変更しない。

## 作品ごとの共有カード：旧PiXFiND方式を再利用

ユーザーの指定に従い、以前のPiXiEED間違い探しで使用した「ID別の静的HTMLを作り、GitHub Pagesで配信してゲーム画面へ転送する」方式を再利用する。新しいHTML配信サービス、料金契約、DNS設定は追加しない。`?postPuzzle=...` の画面でJavaScriptがmetaを書き換えるだけでは、作品の情報を最初のHTMLとして返せないためである。

Git履歴の根拠は `d93b55ff:scripts/generate-pixfind-ogp-pages.mjs`（個別HTML）、`53e70787:pixfind/app.js`（Canvas画像合成）、`e88a093e:supabase/functions/pixfind-ogp-dispatch/index.ts`（生成の呼出し）。当時のCanvasは横長1280×720、補間なしの合成を行い、ID別共有ページからゲームへ転送していた。これらは `de1c31ec` で削除されており、現在も稼働しているとは扱わない。旧公開Storageへのクライアント直接アップロード、5分ごとのmainへの自動push、旧DB直接列挙はそのまま戻さない。

PiXFiNDという名前はなくし、間違い探し（`/play/spot-difference/`）ともの探し（`/play/hidden-object/`）を別々のゲームとした。旧 `/pixfind/` のリンクは該当するゲームへ転送する。

現在の公開readerに合わせた静的HTML生成処理を `scripts/generate-puzzle-ogp-pages.mjs` と `js/creation/puzzle-share-page.mjs` に移す。公開地図の候補を単件readerで再確認し、投稿ID・種類・題名・公開作者名・元画像だけを共有HTMLへ渡す。実行は明示操作とし、今回のプッシュでは自動生成workflowや公開済み個別ページを作らない。公開DB/APIの更新と失効時のページ撤去の運用を検証してから切り替える。

`--help` は通信も書込みもしない。`--preview` は公開データだけを読み、生成予定のパスを表示する。`--generate` は全取得と検証の成功後、生成専用マーカーのある `play/spot-difference/puzzles/` と `play/hidden-object/puzzles/` だけを入れ替える。公開受付フラグが無効なら両データ操作は通信前に停止する。画像合成のCanvas補助関数も元画像のみ・1280×720・整数倍・補間なしとして用意したが、生成スクリプトへの接続とPNG保存は未実装。

| 種類 | 共有する情報 | 画像と移動先 | 制約 |
| --- | --- | --- | --- |
| ジグソー | 公開元作品ID、種類、2/3/4の分割数 | 公開元画像のプレビュー、同じ絵・分割数のジグソー | 元作品を変更・再投稿しない。端末画像と未公開下書きを自動公開しない |
| 間違い探し | 承認済みの親投稿ID、公開題名・作者名 | 元画像だけ、`/play/spot-difference/?postPuzzle=<ID>` | 正解マーク、差分マスク、変更箇所、内部審査情報をカードに含めない |
| もの探し | 承認済みの親投稿ID、公開題名・作者名 | 元画像だけ、`/play/hidden-object/?postPuzzle=<ID>` | 正解座標・対象名一覧・内部審査情報をカードに含めない |

全モードで公開状態を照合する。新しいSpot/Hiddenは `public-post-puzzle` の公開応答を利用し、親published・地図published・パズルapprovedの条件を緩めない。ジグソーの旧SNS/PiXFiND元作品も現在の公開参照を確認する。ユーザーが指定した任意URLからHTML配信側が画像を取得する作りにはしない。秘密キーや作者IDをカードへ含めず、題名・作者名はHTML属性を含めてエスケープする。

共有画像は縦横比を守り、ドットを整数倍で拡大して余白に配置する。輪郭補間や切り抜きで絵を変えない。非公開化・参照不一致・通信エラー時に過去の画像へ勝手に戻さない。SNS側が既に取得したカードのキャッシュ回収と、公開PNGのStorage/CDN回収は別の運用課題として確認する。

## 検証の境界

静的head、正規URL、サイトマップ、PNGの寸法・復号、ブランドアイコンの整合を検査した。静的SEO契約5件と個別共有HTML契約7件PASS。制作ツール全12スイート229件PASS。実Function/DBの公開reader試験応答はSpot/Hiddenとも共有HTMLへ変換できた。Canvas補助処理は試験画像で1280×720 PNG復号、整数倍、混色なしをChromiumで確認した。ループバックのHTTP検査55項目PASS（18ページと検証用queryの最初のHTML、11 OGP、4 PNGアイコン、ICO、manifest、sitemap、robots）。PNG15枚は生成時のChromium画像復号もPASS。内部/旧ページ19件は変更前後の本文hashが一致することも確認した。

```sh
node scripts/creation-suite-harness.mjs --suite seo
node scripts/seo-http-harness.mjs
```

HTTPハーネスはチェック対象の静的ファイルだけを一時的な127.0.0.1サーバーで配信し、JavaScriptを実行せずに取得する。終了時にサーバーを閉じ、外部通信・本番書込みを行わない。

**UNIMPLEMENTED:** 個別共有HTMLの本番生成・同期運用、横長の作品別OG画像生成・保存、ジグソーの同じ公開絵・分割数を受け取る共有URL。**UNTESTED:** 本番での検索クロール、SNSアプリの実カード、ホーム画面への実機追加。今回のHTML生成は元画像の公開URLを参照するため、小さい元画像でSNSの大きなカード表示が成立した証拠ではない。一般ツールのOGPと作品別OGPを取り違えない。

作品別共有の完了条件は、JavaScriptを使わないHTTP取得で作品固有のmetaが読み取れること、同じ共有URLから実際に遊べること、非公開作品の新規取得を拒否すること。ローカルのmeta書換えやテスト用HTMLだけを、本番で共有可能になった証拠にはしない。

## 調査根拠

- [Open Graph protocol](https://ogp.me/) — 基本metaと画像の補助情報。
- [Google：検索結果のfavicon](https://developers.google.com/search/docs/appearance/favicon-in-search) — 正方形・安定したURL・クロール条件。更新時期や表示は保証されない。
- [Google：JavaScript SEO](https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics) — JavaScript処理と最初のHTML、事前描画の役割。
- [GitHub Pagesの配信方式](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages) — 静的サイトの配信。
- [Supabase：HTML応答の制限](https://supabase.com/docs/guides/functions/development-tips)と[Custom Domainに関する変更](https://supabase.com/changelog/29633-xhtml-responses-are-only-allowed-with-a-custom-domain-enabled) — 標準の共有ドメインへHTMLを返すだけでは共有ページを完成できない。
