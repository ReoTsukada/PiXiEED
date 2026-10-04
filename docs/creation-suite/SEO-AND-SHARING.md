# 検索表示・サイトアイコン・パズル共有

2026-09-28。検索向けの静的ページ整備と、作品ごとの共有カードを分けて扱う。今回のソースをコミット・プッシュする。本番DB/APIとSNS側のカード表示は未確認。

## 2026-10-04 個別共有の公開接続

公開中の間違い探し・もの探しを、公開プレイヤーの「共有URLをコピー」から共有する。新しい投稿方式は審査済みの公開投稿、以前の方式は公開済みの投稿と問題の一致を確認する。地球儀で作品を開き「遊ぶ」でその問題へ進む。下書き、未承認、非公開の問題には個別共有ボタンを出さない。

共有URLは `/play/spot-difference/puzzles/<投稿ID>/` と `/play/hidden-object/puzzles/<投稿ID>/`。ページのcanonical・og:urlと同じ投稿IDを確認し、そのページのOGP PNGが配信されている場合だけコピーする。未反映なら再試行の案内を出す。クリップボードが許可されない端末では、確認済みURLを手動コピーできる欄を表示する。

`.github/workflows/pages.yml` はmainへのpush、手動実行、15分ごとの同期で、新しい公開地図候補は `public-post-puzzle`、以前の問題は匿名で読める `social_posts` と `pixfind_puzzles` の一致を再確認して生成し、GitHub Pagesへ公開する。GitHubの実行待ちで15分を超えることはある。承認取り消しも次の正常な同期で個別HTML/PNGを撤去する。途中の取得・生成が失敗した場合は公開済みサイトを置換しない。

ビルドは既存の公開素材、CNAME、追跡済みサイトファイルを保持し、DB・テスト・スクリプト・未追跡の並行作業を公開成果物に含めない。生成物はGitに追加せずPages artifactに含める。秘密キーをGitHubへ追加せず、公開用キーと匿名公開reader・公開済み旧問題の読み取りだけを使う。既存macOS runnerのChromeを使い、日本語OGP用パッケージを追加しない。

本番移行 `20261004125700_enable_puzzle_ogp_publication.sql`、投稿・審査・公開readerの3処理を適用し、匿名のDB/RPC直接アクセス拒否と1〜256px新規投稿制限を確認した。保存済み512px作品の読み取りは維持する。private puzzle tableはRLS有効・ユーザーへの直接権限なし・service_roleのみのため、RLS policyなしというINFOは意図した非公開境界。ブラウザゲームは承認済みの正解定義を読み込むため、公開APIの応答には正解座標が含まれる。個別共有HTML/画像には正解の印や座標を入れない。

ローカルDBで2モードの投稿→承認→公開読み取り、PNG検証、OGP画像の元画素一致、共有URLの準備中/コピー/手動コピーを検証する。新しい投稿方式は反映時点で0件。以前の方式の公開問題6件（間違い探し4件・もの探し2件）も、公開状態を再確認して個別HTMLとPNGの生成対象にする。以前の投稿は複製せず、再投稿・再承認を要求しない。旧IDのプレフィックスを共有URLに残し、新しいUUID投稿と衝突させない。旧問題への移動先は `?puzzle=<旧ID>`、新しい投稿は `?postPuzzle=<投稿ID>`。SNS側の実カード表示は別途確認する。旧問題の `--preview` はPNGも読み取って寸法を確認するが、ファイルは生成しない。以下は9月28日時点の整備・調査記録。

## 静的ページの整備

サイト、各制作ツール、案内ページに日本語タイトル・説明、正規URL、Open Graph、Twitter CardをHTMLのheadへ直接入れる。共有画像は `/assets/og/` の1200×630 PNGを使う。画面のJavaScriptが動くことを前提にしない。サイト共通の共有画像は既存PiXiEEDロゴ、ツールはそれぞれの既存アイコンを使い、作品サンプルを販売用素材のように扱わない。

検索アイコンは既存48pxロゴを整数倍にした96px PNG。白いロゴが見える濃紺の背景を付ける。ホーム画面用180px、アプリ用192/512px、ICO互換アイコンも同じロゴから作る。ブランド形状を変更しない。生成手順は `scripts/generate-site-brand-assets.mjs`。Playwrightが既にある環境で `PIXIEED_PLAYWRIGHT_MODULE` を指定して再生成でき、新しい依存を自動導入しない。

サイトマップには公開ツールの正規URLを入れる。下書き、管理画面、プロフィールの私的な画面、販売ページ、廃止した作品一覧を追加しない。内部検証画面、旧カメラ試作、存在しない旧サンプル店舗もHTMLでnoindexを指定する。OGPの設定は検索順位・SNS上の表示・更新時期を保証しない。

**IMPLEMENTED:** 公開18ページの静的メタ情報、全37 HTMLのブランドアイコン、18ページの検索除外、サイトマップ、OG画像11枚、PNGアイコン4枚と96px PNGを埋めたICO。今回の変更はheadと静的素材であり、本文・ツール操作・旧作品データは変更しない。

## 作品ごとの共有カード：旧PiXFiND方式を再利用

ユーザーの指定に従い、以前のPiXiEED間違い探しで使用した「ID別の静的HTMLを作り、GitHub Pagesで配信してゲーム画面へ転送する」方式を再利用する。新しいHTML配信サービス、料金契約、DNS設定は追加しない。`?postPuzzle=...` の画面でJavaScriptがmetaを書き換えるだけでは、作品の情報を最初のHTMLとして返せないためである。

Git履歴の根拠は `d93b55ff:scripts/generate-pixfind-ogp-pages.mjs`（個別HTML）、`53e70787:pixfind/app.js`（Canvas画像合成）、`e88a093e:supabase/functions/pixfind-ogp-dispatch/index.ts`（生成の呼出し）。当時のCanvasは横長1280×720、補間なしの合成を行い、ID別共有ページからゲームへ転送していた。これらは `de1c31ec` で削除されており、現在も稼働しているとは扱わない。旧公開Storageへのクライアント直接アップロード、5分ごとのmainへの自動push、旧DB直接列挙はそのまま戻さない。

PiXFiNDという名前はなくし、間違い探し（`/play/spot-difference/`）ともの探し（`/play/hidden-object/`）を別々のゲームとした。旧 `/pixfind/` のリンクは該当するゲームへ転送する。

現在の公開readerに合わせた静的HTML生成処理を `scripts/generate-puzzle-ogp-pages.mjs` と `js/creation/puzzle-share-page.mjs` に移す。公開地図の候補を単件readerで再確認し、投稿ID・種類・題名・公開作者名と、承認済みの固定画像を使用する。実行は明示操作とし、自動生成workflowや公開済み個別ページはまだ作成しない。公開DB/APIの更新と失効時のページ撤去の運用を検証してから切り替える。

`--help` は通信も書込みもしない。`--preview` は公開メタデータだけを読み、生成予定のパスを表示する（PNGは生成しない）。`--generate` は全取得・画像生成・検証の成功後、生成専用マーカーのある `play/spot-difference/puzzles/` と `play/hidden-object/puzzles/` だけを入れ替える。公開受付フラグが無効なら両データ操作は通信前に停止する。

2026-10-03の改修では、間違い探しのOGPを元絵・変更後の絵の2枚だけを左右に並べた1200×630 PNGに変更した。`spotDifferenceOgpLayout` をCanvasと生成側で共用し、同じ整数倍率・補間なし・切抜きなしで配置する。12px以上の外余白と16pxの絵の間隔を設け、透明画素の背景は `#f7f8f6`。タイトル・ロゴ・正解マーク・対象一覧は画像に描かない。32pxの正方形は18倍、128pxは4倍、256pxは2倍、512pxは1倍となる。

`scripts/lib/puzzle-ogp-artifacts.mjs` は公開PNGを既存の制限付きデコーダーで検証し、間違い探しはNode標準ライブラリだけで合成・圧縮する。生成したPNGのhashをファイル名に含め、共有HTMLの `og:image` と `twitter:image` は同じPNGを参照する。ダウンロードは同一プロジェクト・投稿IDの公開PNGに限り、リダイレクト拒否、15秒の期限、512KiBの上限を設ける。画像生成失敗時には不完全な共有ページを配信しない。

もの探しも1200×630 PNGを生成し、左に元絵全体、右に「探すもの」を配置する。作成画面の折りたたみ欄で任意の文言（180文字まで）を指定でき、空欄なら登録した対象名を使う。`鍵が6こ` のような数を含む文言は作者が入力する。画像から対象や個数を推測せず、既存の対象名の重複拒否も変更しない。文言は正解マスクとは別の注釈で、下書き保存・読み込み・投稿用定義・公開応答に保持する。未指定の旧下書きも読み込める。対象一覧が長い場合は入る項目を表示し、残りを「ほか○個」と知らせる。

日本語の文字描画には既存のPlaywright/Chromiumを再利用する `scripts/lib/puzzle-ogp-browser.mjs` を使う。ブラウザーは生成時のみ起動し、バッチ内で共有して最後に閉じる。画像と公開文言だけを渡し、マスクや座標は渡さない。外部通信を遮断した空のページで描画し、ツール利用者の画面へ追加の処理を入れない。`PIXIEED_PLAYWRIGHT_MODULE` で既存パッケージを指定できる。新規依存の導入は行わず、必要な実行環境がなければ生成を停止する。環境の日本語フォントが見えることも生成時に確認する。

| 種類 | 共有する情報 | 画像と移動先 | 制約 |
| --- | --- | --- | --- |
| ジグソー | 公開元作品ID、種類、2/3/4の分割数 | 公開元画像のプレビュー、同じ絵・分割数のジグソー | 元作品を変更・再投稿しない。端末画像と未公開下書きを自動公開しない |
| 間違い探し | 承認済みの親投稿ID、公開題名・作者名 | 元絵＋変更後の絵の横並びPNG、`/play/spot-difference/?postPuzzle=<ID>` | 正解マーク、差分マスク、内部審査情報をカードに含めない |
| もの探し | 承認済みの親投稿ID、公開題名・作者名、作者の文言または対象名 | 元絵＋探すもののPNG、`/play/hidden-object/?postPuzzle=<ID>` | 正解座標・マスク・内部審査情報をカードに含めない |

全モードで公開状態を照合する。新しいSpot/Hiddenは `public-post-puzzle` の公開応答を利用し、親published・地図published・パズルapprovedの条件を緩めない。ジグソーの旧SNS/PiXFiND元作品も現在の公開参照を確認する。ユーザーが指定した任意URLからHTML配信側が画像を取得する作りにはしない。秘密キーや作者IDをカードへ含めず、題名・作者名はHTML属性を含めてエスケープする。

共有画像は縦横比を守り、ドットを整数倍で拡大して余白に配置する。輪郭補間や切り抜きで絵を変えない。非公開化・参照不一致・通信エラー時に過去の画像へ勝手に戻さない。SNS側が既に取得したカードのキャッシュ回収と、公開PNGのStorage/CDN回収は別の運用課題として確認する。

## 検証の境界

静的head、正規URL、サイトマップ、PNGの寸法・復号、ブランドアイコンの整合を検査した。静的SEO契約5件と個別共有HTML契約7件PASS。制作ツール全12スイート229件PASS。実Function/DBの公開reader試験応答はSpot/Hiddenとも共有HTMLへ変換できた。Canvas補助処理は試験画像で1280×720 PNG復号、整数倍、混色なしをChromiumで確認した。ループバックのHTTP検査55項目PASS（18ページと検証用queryの最初のHTML、11 OGP、4 PNGアイコン、ICO、manifest、sitemap、robots）。PNG15枚は生成時のChromium画像復号もPASS。内部/旧ページ19件は変更前後の本文hashが一致することも確認した。

```sh
node scripts/creation-suite-harness.mjs --suite seo
node scripts/seo-http-harness.mjs
```

HTTPハーネスはチェック対象の静的ファイルだけを一時的な127.0.0.1サーバーで配信し、JavaScriptを実行せずに取得する。終了時にサーバーを閉じ、外部通信・本番書込みを行わない。

**2026-10-03 IMPLEMENTED:** 間違い探しの2枚を並べたPNG生成・保存処理、固有画像を指定する共有HTML。関連25件のテストが合格。自作風景で生成したPNGとChromiumのCanvas描画を756,000画素で照合し不一致0、1200/600/390px幅で横はみ出しなし。既存の公開受付フラグは無効のまま、本番データを取得・公開していない。

**同日の追加実装:** もの探しの元絵と探すものを並べた共有画像、任意文言の保存・投稿用定義への保持、両作成画面の選択前プレビュー枠・ドロップ・状況別主ボタン。関連76件のNodeテストが合格。もの探しの実PNGをChromiumで生成し、元絵部分の整数倍画素が不一致0。任意文言180文字と空欄時の対象名表示、1200/600/390pxの幅を確認した。両作成画面は320×568・390×844・844×390・1280×800で画像選択・単一主操作・編集・保存を確認し、初期画面の主操作がナビに隠れないことも測定した。もの探しは文言の保存・復元、画像の遅延読込をまたぐ作品切替も確認した。これらはローカル実装・検証であり、本番の共有画像を自動公開した結果ではない。

**2026-10-03時点のUNIMPLEMENTED:** 個別共有HTMLの本番生成・同期運用、プレイヤーや地球儀から個別共有HTMLを渡す共有ボタン、ジグソーの同じ公開絵・分割数を受け取る共有URL。現在のゲームCTAは `?postPuzzle=` を直接開き、作品固有のOGPページを共有する動線とは別である。**UNTESTED:** 本番での検索クロール、SNSアプリの実カード、ホーム画面への実機追加。一般ツールのOGPと作品別OGPを取り違えない。

作品別共有の完了条件は、JavaScriptを使わないHTTP取得で作品固有のmetaが読み取れること、同じ共有URLから実際に遊べること、非公開作品の新規取得を拒否すること。ローカルのmeta書換えやテスト用HTMLだけを、本番で共有可能になった証拠にはしない。

## 調査根拠

- [Open Graph protocol](https://ogp.me/) — 基本metaと画像の補助情報。
- [Google：検索結果のfavicon](https://developers.google.com/search/docs/appearance/favicon-in-search) — 正方形・安定したURL・クロール条件。更新時期や表示は保証されない。
- [Google：JavaScript SEO](https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics) — JavaScript処理と最初のHTML、事前描画の役割。
- [GitHub Pagesの配信方式](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages) — 静的サイトの配信。
- [Supabase：HTML応答の制限](https://supabase.com/docs/guides/functions/development-tips)と[Custom Domainに関する変更](https://supabase.com/changelog/29633-xhtml-responses-are-only-allowed-with-a-custom-domain-enabled) — 標準の共有ドメインへHTMLを返すだけでは共有ページを完成できない。
