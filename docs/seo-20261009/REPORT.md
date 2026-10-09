# SEO・名称・イベント導線の改善記録

2026-10-09 UTC。作業開始・終了とも `main` / `f02ae441`。開始時の作業ツリーはclean。リポジトリと親ディレクトリにAGENTS.md、リポジトリに.agents/skillsは見つからなかった。ローカルのPiXiEED Lunaワークフローとイベント調査スキルを読み、限定したLuna担当へ名称・イベントページ・旧URL調査を委任した。

## IMPLEMENTED

- 正規エディターURLは `/draw/` のまま、名称をPiXiEEDraw、検索タイトルを「ドット絵エディター・アニメーション制作｜PiXiEEDraw」へ変更。説明に実装済みレイヤー、フレームアニメ、選択編集を明記。既存の保存キー・DB名・PXD形式は変更していない。
- カメラ、音楽、出力、ジグソーのtitle/description/H1/OG/Twitter、ホーム・一覧の名前を実機能に整合。動画形式はブラウザー対応に依存することを記載。ゲーム作成ページとプレイページの役割は維持。
- 公開画面・ナビの「地球儀」を「世界地図」へ修正。`/globe/` のタイトルは「ドット絵のイベント・作品を世界地図で探す｜PiXiEED」。ホームの遊べるヒーローと初期パレット非表示を維持。
- `/PiXiEEDraw/` はnoindexの互換入口。通常リンクとJSのreplace移動を持ち、query/hashを引き継ぐ。`/pixiedraw/`、`/pixiedraw2/`、`/studio/` は説明型の案内。旧データの自動移行・削除をしない。404の大小文字別名処理は認識済みの入口だけを対象にし、外部URLへは転送しない。
- `/index.html` のアクセスは `/` へquery/hashを保ったclient-side replace。rootのcanonical・OG URL・sitemapは `/` に統一。静的なブランドリンクも `/` に整合。
- 102カタログレコードを監査し、86紹介ページと `/events/` を生成。日付付き97記録から同一開催回の重複1件を除く96開催回、次回未定5件。次回未定5件・説明不足10件・重複1件は個別URLを作らず、日時・会場・出典・確認日のある一覧行に残した。静的HTML本文、公式出典、確認日、未確認項目、開催状態、過去回と次回待ちの相互リンクを備える。重複レコードは情報源付きの一覧行として保持。正規URL一覧は [events/catalog.json](../../events/catalog.json)。
- 世界地図の静的一覧リンクと、選択イベント詳細から紹介ページへのリンクを追加。生成manifest内のIDだけにリンクするので、外部フィードだけのイベントに存在しないURLを作らない。紹介ページから世界地図へ戻れる。
- Pixel Art Park 9を公式本文で再確認し、開催回、正式名、説明、チケット参加方法を補足。他のcheckedAtは一律に変更しない。[確認根拠](../event-pages-evidence.md)。
- buildはカタログからイベントページを再生成し、sitemapに同じ86個別URLと一覧URLを含める。一般の未追跡実験ファイルは公開artifactに入れない。生成対象が減ったとき、古いイベントURLはartifactから除く。
- 新規イベントページは既存の同意を守るGA4境界と、既存 `select_content` / `event_outbound` を利用。GA4設定、同意キー、キーイベントは変更していない。

旧URLは履歴で `/pixiedraw/` が実在。正確な大文字 `/PiXiEEDraw/` の旧フォルダは見つからなかった。旧版一式は `de1c31ec` で既に削除済み。調査時の公開 `/PiXiEEDraw/`、`/pixiedraw/`、`/pixiedraw2/`、`/studio/` は404、`/draw` は `/draw/` に着地した。起動可能な旧版を置き換える変更はない。

旧PiXiEEDrawは `pixieedraw-autosave`、Draw2は `pixiedraw2-draw-subdocuments` / `pixiedraw2-workspace-manifest`。現行は `pixieed-creation-drafts-v1` / `pixieed-pxd-v1`。旧PXDの一部は原本として保持できるが、現行編集用の画像・アニメへの復元処理はない。案内ページにこの違いを明記した。

## 検証

| 検査 | 結果・限界 |
| --- | --- |
| 関連Nodeテスト | 初期の102/102 PASS。追加監査後の関連56/56 PASS。SEO、Pages build、互換URL、イベント、GA4同意、出力受渡し・速度/FPS等。コマンド一覧は下記。 |
| ローカルSEO HTTP | 最終155項目PASS（個別ページを101件から86件に減らしたため初期170項目から減少）。canonical、メタ情報、sitemap、静的イベント本文等。JS実行・Google巡回を証明しない。 |
| 新規SEOブラウザー検査 | Chromium、320×568 / 390×844 / 1280×800、42ケースPASS。横はみ出しなし、初期パレット非表示、ヒーロー操作、地図詳細→紹介リンク、indexとeditorのquery/hash、Back、現行PXD画素の復帰、旧DB/LocalStorage保持。大小文字404経路はGitHub Pagesの404.htmlを返すローカルfixtureで検証。 |
| 既存地図イベントUI | Chromiumの320/390/844/1280px、4画面PASS。一覧、20件からの追加、keyboard、focus、reload/back、ICS、期間filter。任意広告module失敗でも操作可。WebKitは未導入で未実行。 |
| 既存広告・出力browser | Chromium 47/47 PASS。外部広告はstub/遮断。`/output/work/`のopaque id、戻る/進む/reload、通常download、広告遮断下の保存を確認。実広告配信は未確認。 |
| 既存PXD harness | IndexedDBの2タブCASはPASS。drawのfile import待機がtimeout。変更前 `f02ae441` を配信した別localhostでも同じ168行でtimeoutした。harness全体の合格としては報告しない。 |
| Pages artifact | 最終631ファイル、既存puzzleページ6、イベント86。出力先 `/tmp/pixieed-seo-review-audited-20261009`。イベントHTML/CSS/analyticsと4互換入口が含まれることを確認。docs/tests/supabaseと任意の未追跡実験を除外。公開はしていない。 |
| 全既存Nodeテスト | リポジトリの261個の `.test.mjs` をすべて実行し、1806/1806 PASS、skip 0。既存 creation-suite の `--all` も19スイート・699/699 PASS。ブラウザー・実機・本番の全検査を通した意味ではない。 |
| その他 | 変更JSの構文、`git diff --check` PASS。イベント再生成の同日一致を確認。 |

Node検査:

```sh
node scripts/creation-suite-harness.mjs --all --json
node --test $(rg --files tests | rg '\.test\.mjs$' | sort)
node --test tests/creation-suite/pages-build.test.mjs tests/site/editor-entry.test.mjs tests/site/event-pages.test.mjs tests/site/usage-events.test.mjs tests/creation-suite/seo.test.mjs tests/globe/event-calendar.test.mjs tests/globe/event-catalog.test.mjs tests/globe/map-events.test.mjs tests/globe/event-density.test.mjs tests/globe/map-event-presentation.test.mjs tests/site/tool-help-data.test.mjs tests/creation-suite/output-handoff.test.mjs tests/creation-suite/output-timing.test.mjs
node scripts/seo-http-harness.mjs
node scripts/generate-event-pages.mjs --generate
node scripts/build-pages-site.mjs --output <新しいローカル出力先>
```

ブラウザー検査は既存Playwright runtimeとlocalhostを使い、隔離contextで外部通信を遮断。検査スクリプトは `scripts/seo-navigation-browser-harness.mjs`、`scripts/globe-event-ui-browser-harness.mjs`、`scripts/adsense-browser-harness.mjs`。[42ケースの記録](browser-results.json)。

## イベント監査の内訳

元データは `data/pixel-art-events.json`、version 1、updatedAt `2026-10-09T17:36:31+00:00`。このupdatedAtは全件を当日再確認した意味ではない。

| 項目 | 最終件数 |
| --- | ---: |
| 元レコード | 102 |
| 日付付き記録 / 重複を除いた開催回 | 97 / 96（カタログ上の区別。全件の公式本文を今回再検証した件数ではない） |
| 日程未発表の次回待ち | 5 |
| indexableな個別ページ | 86 |
| 一覧内だけの記録 | 16（次回待ち5、説明不足10、重複1） |
| 出典URLと有効なcheckedAtを持つ元記録 / 個別ページ | 102 / 86 |
| 個別ページの開催予定 / 開催中 / 過去 | 19 / 8 / 59（東京2026-10-10時点） |
| Google Event JSON-LD | 0 |
| ユーザー投稿フィールド / 投稿DBからの生成 | 0 / なし |
| イベントcanonical / sitemap URL | 87 / 87（一覧1＋個別86、一意、自身をcanonical） |

次回待ちの5件はSHIBUYA PIXEL ART、冬のドット絵大作戦、九州ピクセルマルシェ、Newgrounds Pixel Day、CROSS PICO名古屋。過去開催とのリンクは残すが次回日を作らない。説明不足10件はPixel Art Park 1、KAI巡回展の5店舗、Beppu講座2日、LCCLキャンプ2回。共通説明から別URLを増やさず、一覧の日時と会場で区別する。重複はモトクロス斉藤「ウルトラドープ」同名・同日・同出典の2記録で、`kac-ultra-dope-motocross-2026` を個別URLとした。

残る同一短文の群はPixel Art Park 5/6とMoertelのSPIEL/VIECC出展。前者は異なる開催回の公式ページ、後者は異なる催事・日付・会場を持つため保持した。公開本文から調査メモを除き、日付・会場・出典を示す。固有の説明や参加方法は追加調査の余地があり、全86件の内容が同じ深さに揃ったとは報告しない。短い説明を含む30元記録、空説明3件も監査JSONに記録した（空説明は次回待ちで個別ページなし）。

今回公式本文を確認してカタログの確認日を更新したのはPixel Art Park 9の1件だけ。監査担当がSHIBUYA PIXEL ART 2025と九州ピクセルマルシェ公式TOPも読み取り確認したが、既存checkedAtは変更していない。確認日の元記録の分布は10/5＝61件、10/6＝13件、10/7＝17件、10/8＝10件、10/9＝1件。正式名の追加は1件、主催者欄0件、参加方法欄1件で、それ以外は未確認表示を含む。

全102行のHTML出典URLとcheckedAt、86個別URL＋一覧のcanonicalとsitemap一致を機械検査し、欠落・重複は0件。[監査集計](event-audit.json)、[全102件の元項目とページ判定](event-record-evidence.json)、[検査要約](verification.json)。

## PXD harness未完了の再現条件

`PIXIEED_PXD_ORIGIN=http://127.0.0.1:4182 PIXIEED_PXD_CASES=store,draw,audio,responsive,unknown node scripts/pxd-browser-harness.mjs` を隔離Chromiumで実行。storeの2タブCASが通った後、drawで新規context→`/draw/`→canvas/input待機→`browser-fixture.pxd`をsetInputFiles→`#pxd-file-status`の「PXDの作品を開きました」待機（168行）でtimeout。後続audio/responsive/unknownは実行されていない。

比較対象は変更前SHA `f02ae4418d80254bd59255380eb1a7f0ac728b0c` のgit archiveを別localhost4183で配信したもの。`PIXIEED_PXD_ORIGIN=http://127.0.0.1:4183 PIXIEED_PXD_CASES=draw node scripts/pxd-browser-harness.mjs` でも同じ待機位置でtimeoutした。既存fixtureは現在のdraw所有タグを持たない。新規SEO browser検査ではdraw所有PXDを保存してalias経由で戻し、画素復帰を確認したが、既存PXD harness全体の代替合格とは扱わない。

## 変更ファイル・比較画像

主な変更は `index.html`, `draw/`, `pixel-camera.html`, `audio/`, `output/index.html`, `jigsaw/`, `tools/`, `globe/`, 共通UIの名称・案内文、`sitemap.xml`。追加は4互換入口、イベントHTML、generator、manifestリンク、同意を守るイベント計測、検証スクリプト・テスト。全ファイルは [changed-files.txt](changed-files.txt)。生成物は手で修正せずカタログとgeneratorを修正する。

| 比較 | 変更前 | 変更後 |
| --- | --- | --- |
| PCのホーム機能紹介 | [前](screenshots/tools-1280-before.png) | [後](screenshots/tools-1280-after.png) |
| モバイルのホーム機能紹介 | [前](screenshots/tools-390-before.png) | [後](screenshots/tools-390-after.png) |
| PCのエディター | [前](screenshots/draw-1280-before.png) | [後](screenshots/draw-1280-after.png) |
| モバイルのエディター | [前](screenshots/draw-390-before.png) | [後](screenshots/draw-390-after.png) |
| 新規イベント紹介 | — | [PC](screenshots/event-1280-after.png) / [モバイル](screenshots/event-390-after.png) |

## UNIMPLEMENTED / UNTESTED・公開前

- GitHub Pagesのため任意のHTTP 301設定は今回実装していない。JS replaceは301ではない。真の `/index.html` → `/` の301が必要ならホスティング/エッジ側の別判断が必要。`/` と `/index.html` は同じ静的ファイルであり、各々に異なるHTTPヘッダーは指定していない。
- Googleが選択するcanonical、再巡回、インデックス反映、検索順位改善は未確認。公開後にSearch Consoleで `/`・`/index.html`・`/draw/`・代表イベントURLを確認する。
- 全イベントの今回の再調査ではない。出典URLと既存確認日を持つカタログが基礎。項目の存在と今回の公式本文再確認は別である。主催・正式名・通称等が未確認なら未確認を表示。Google Event JSON-LDは出していない。日程不明に日付を補わず、JSON-LDも捏造しない。
- 実機iPhone/Android/Safari、実カメラ/音声/MP4全環境、実広告配信、実アカウントの旧作品復旧は未確認。GA4対象プロパティの利用者数/CV率は取得していない。
- 旧版の復元・旧端末DBからの移行は範囲外。必要なら旧アプリごとのデータ復元を別途設計する。今回の案内で自動復元できるとは表示しない。
- `/output/work/` のnoindex,nofollow・Offerwall policy・保存実装・GA4設定は差分なし。Amazon内部リンク非公開と望遠鏡非表示も維持。stash、ブランチ削除/統合、commit、push、deploy、DB/APIの外部変更は行っていない。
- 依頼どおり公開していない。公開前にこの差分と、未確認項目を含むイベント紹介内容をレビューする。日程表示はbuild時点の東京日付で算出され、公開中の再生成は既存Pages workflowの実行時に更新される。

Libraryへの2画像登録は、正式のprepared-upload helperで試行したが `Library prepare_uploads is not available` で停止した。登録完了の証拠とlibrary_file_idはない。別経路のアップロードは行っていない。比較PNGは上記ローカル成果物に保存済み。公開判断・push・deployは依頼どおり行っていない。
