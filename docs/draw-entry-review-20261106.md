# 描画入口・初回保存の改善と公開前検証（2026-11-06）

対象は既存ページの案内・完成例・開始と保存の導線。検索実績の調査は別作業であり、検索流入減少の原因や改善効果をこの変更から断定しない。ユーザーは実画面候補を確認した後に公開を承認した。本書は公開前に候補へ含める検証記録で、公開処理の最終SHA・CI・配信状況はPRとActionsの結果で確認する。

## 作業前の確認と変更範囲

- 作業開始時は未コミット変更なし。main、記録済みorigin/main、`git ls-remote origin refs/heads/main` の読み取り結果はいずれも `57da78bf9f24210c89b1bf3f220b46c13221234f`。指定されていた `1b681621` の後にイベント更新がある。
- リポジトリの手順を確認し、既存のHTML/CSSと関連検証に変更範囲を限定した。
- 既存ブランチ・worktreeを確認。描画性能と数値変形アイコンの作業はmainの `f3faed0c` / `f989258c` にsquash済み。旧保存・案内改善ブランチはmainに取り込み済み。別worktreeや旧作業を変更していない。
- `/draw/` は説明・検索用のself-canonicalページ。`/tools/start/draw/` は `scripts/build-pages-site.mjs` と `js/tool-start-routes.mjs` により同じHTMLから生成され、`noindex,follow`、canonicalは `/draw/` のまま。既存の役割とsitemapを維持した。
- 旧 `/PiXiEEDraw/`、`/pixiedraw/`、`/pixiedraw2/` は、既知の安全な入口だけを移動させ、未知の旧作品指定では説明に留まる。旧保存領域の非互換・自動移行なし・削除しない説明を維持した。

## 根拠と実装

現行UIの［出力］は直接ダウンロードせず、共通の「変換・出力」画面を開き、そこで［PNGで保存］等を押す仕組みだった。既存説明とブラウザーharnessには旧直接ダウンロードの案内・待機が残っていた。共通出力への変更は `c781bf92`。実際のローカルビルドで確認し、案内を更新した。

|ファイル|変更|
|---|---|
|`draw/index.html`|開始ボタンの近くに既存16×16の魔王サンプルを表示。冒頭の色数制限を機能説明に移動。描く→PNG保存→任意のGIF制作の順に整理。現在の保存画面と［ファイル］→［今の作品］→［その他］→［保存し直す］を案内。自動保存の［保存済み］確認、失敗時にタブを保持して再試行する説明を追加。|
|`css/tool-shell.css`|Drawの完成例のサイズと配置だけを追加。スマホではCTAの下、PCでは右側。ピクセル表示を維持。drawページのCSS revisionを更新。|
|`tests/site/draw-seo.test.mjs`|既存の保存案内検査を現行UIに合わせた。タイトル・動的タイトル・canonical・sitemap・GIF機能検査を維持。|
|`scripts/draw-search-browser-harness.mjs`|既存PNG/GIF検査を、共通プレビュー→明示保存→編集へ戻る操作に対応。出力画素・フレームの検証を維持。|
|`scripts/draw-entry-browser-harness.mjs`|ローカルビルドに対して初回描画、タッチ、保存、説明との往復、再読込、プレビューから保存せず戻る、繰り返し出力、Back/Forward、保存失敗と再試行、空のファイル選択、ホーム・一覧・旧URLを検証。|
|`scripts/seo-http-harness.mjs`|既存の正規ページ `/explore/`、`/welcome/`、`/terms/` をHTTP検査とsitemapの固定期待値に追加。sitemap全体の順序を含む厳密な一致検査は維持。|

描画、レイヤー、フレーム、Undo、保存実装、プライバシー、広告設定、canonical、旧URLアダプター、サイトマップのコードは変更していない。無料・登録不要の新しい約束は追加していない。

## 公開承認前のレビュー記録

最終ビルド: `npm run build -- --output /tmp/pixieed-draw-entry-review-final-20261106` は成功。通常のposting-policy検査を含む。1030ファイル、イベント161ページ、既存パズル6ページ、変換ガイド9件のビルド結果。Drawの検索用と開始用の両方に最終文言とCSS revisionが入ることを確認した。

- 関連Node検査: 12/12成功。`draw-seo`、`draw-guide-entry`、`legacy-project-entry`、`tool-offerwall-build`。
- 最終描画導線ブラウザー: Chromium 151、6/6ケース成功。320・390pxはタッチエミュレーション、1280pxはマウス。トップとツール一覧から通常開始URLへ進み、旧3入口では未知状態を保護し、二重queryと旧ガイドhashを保持することも確認。
- 最終検索説明・出力ブラウザー: 7/7ケース成功。JavaScriptあり/なしの320・390・1440px、初期CTAの画面内配置、横はみ出し、200%文字、説明だけでは重い編集runtimeを読み込まないこと、保存と再読込、整数倍PNGの全画素、2フレームGIF、320・390pxでGIF操作が届くことを確認。
- `git diff --check`、変更した2つのbrowserスクリプトの `node --check` は成功。専用lintスクリプトはpackage.jsonにない。
- 全Node検査の最初の実行は3188/3188成功。最終の再実行は容量不足により3182成功・6失敗（esbuild出力とportable-releaseの一時fixture作成）。中間ビルド2つだけを削除し、失敗した2ファイルを直列に再実行して8/8成功（失敗6件すべてを含む）。未解決のNode検査失敗はないが、最終の全件一括実行そのものは成功扱いにしない。

この段階の `node scripts/seo-http-harness.mjs` は、sitemap全体の固定期待値に `/explore/`、`/welcome/`、`/terms/` が欠けるため失敗した（152行）。この時点ではsitemapと当該harnessはHEADから変更していなかった。HEADのGit blobで比較入力を再構成しても同じ3ページだけが余分で、それを除くと順序まで一致した。変更前のHTTP検査全体の再実行はしていない。

途中のブラウザー検査には端末のENOSPCによる中断と、検証用プロキシの終了処理の不備があった。中間ビルドの整理とharnessの終了処理修正後、最終ビルドに対する上記2つのブラウザー検証は成功した。

## 公開直前の再検証

- 最新origin/mainは引き続き `57da78bf9f24210c89b1bf3f220b46c13221234f`。承認済み6ファイルに、上記SEO検証スクリプト1ファイルだけを加えた。
- 3ページはいずれもself-canonicalであり、exploreは `index,follow`、welcomeとtermsにもnoindexはない。通常ビルドにもindex除外処理はない。ページやsitemapを変更せず、固定期待値と検査対象を正しい既存仕様に合わせた。
- `npm test`: 3188成功、0失敗、skip 0。`node scripts/seo-http-harness.mjs`: 219項目成功。
- 標準ローカルbuildは再びENOSPCで失敗。今回生成した中間成果物だけを整理し、並列のbuild/testを避けても解消しなかった。通常ホスト実行とローカル限定のcopy-on-write実験も失敗した。ソースや本番ビルド設定へ回避策は追加していない。
- 配信用ビルドの検証はdraft PRのCI標準buildをmerge前の条件にする。前回レビュー後に画面・runtimeの変更はないが、今回のブラウザー確認は既存のビルドHTML変換関数で開始ページを生成し、runtimeと画像をソースから読むローカルプレビューに対して行う。これはminify済み配信artifactの検証と区別する。
- このソースプレビューに対する描画導線6件と説明・PNG/GIF出力7件は、すべて成功。結果は `/tmp/pixieed-draw-publish-entry-evidence-20261106/report.json` と `/tmp/pixieed-draw-publish-search-evidence-20261106/report.json`。追加の差分レビューでも具体的な阻害事項は見つからなかった。
- `git diff --check` と変更browserスクリプトの構文検査を行う。専用lint設定はない。

## ローカル成果物と再現

- 公開承認前ビルド `/tmp/pixieed-draw-entry-review-final-20261106` は容量整理で削除済み。実画面キャプチャと機能検証JSONは残した。
- 公開前のソースプレビュー: `http://127.0.0.1:4202/draw/`、`http://127.0.0.1:4202/tools/start/draw/`（ローカルサーバーが動いている間）。
- 初回描画のJSON・画面・PNG: `/tmp/pixieed-draw-entry-final-evidence-20261106/`
- 説明のJS有無・文字拡大・PNG/GIFの画素とフレーム: `/tmp/pixieed-draw-search-final-evidence-20261106/`
- 検証ログ: `/tmp/pixieed-draw-entry-build-final.log`、`/tmp/pixieed-draw-entry-tests.log`、`/tmp/pixieed-draw-entry-tests-final.log`、`/tmp/pixieed-draw-entry-focused-tests-final.log`、`/tmp/pixieed-draw-entry-space-retry-tests.log`、`/tmp/pixieed-draw-entry-seo-http.log`。

```sh
PIXIEED_BROWSER_BASE_URL=http://127.0.0.1:4202 node scripts/draw-entry-browser-harness.mjs
PIXIEED_BROWSER_BASE_URL=http://127.0.0.1:4202 node scripts/draw-search-browser-harness.mjs
```

初回描画harnessはcanonical-originのURL判定も検証するため、ブラウザー上の `https://pixieed.jp` へのGET/HEADをlocalhostのビルドで応答する。実サイトからデータを取得せず、外部通信と書き込みリクエストを遮断し、保存は独立したテスト用ブラウザーcontext内だけで行う。実ユーザーのローカル作品には触れない。

## 未検証・制約

実機のiPhone/Android、Safari、OS共有、OSダウンロード取消、保存先フォルダーの選択と受け取り、実広告・計測送信、Googleの巡回・順位・集客効果は未検証。保存失敗はテストcontext内のIndexedDB書き込みを故意に失敗させた検査であり、実際のストレージ障害すべてを網羅するものではない。
