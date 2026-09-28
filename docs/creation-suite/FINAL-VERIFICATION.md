# 最終ローカル検証と本番反映手順

2026-09-28。今回の制作・投稿・審査・公開プレイのローカル実装をまとめた記録。ユーザーの依頼により関連ソースをコミット・プッシュする。本番DB/APIの適用は未実施。既存のカメラ・地球儀・望遠鏡と並行変更を含む作業ツリーを一括で公開しない。

## 今回揃えたもの

- 確認済みの間違い探し・もの探しを、端末内の固定Draw版から地球儀の投稿画面へ渡す。元PNG・任意の変更後PNG・正解定義・出自を一度に送る。
- タイトル・場所・再送キーを小さい別データとして保持し、通信失敗→再読込→確認チェックのやり直しでも同じ投稿として再送する。成功応答後に受け渡しを消す。
- 実PNGを検査した受付を、親投稿・非公開位置・パズルを同時に保存するDB関数へ接続した。再送キーは作者単位。同じkeyで別内容を拒否し、別作者の同一PNGを拒否しない。
- 審査では固有の公開画像パスを作り、親・地図・パズルの状態を同じDBトランザクションで確定する。Storageは別サービスのためDBと完全な原子処理ではなく、試行単位の後片付けと結果再確認を行う。
- 公開読取は親published・地図published・パズルapprovedを単一のDB読取で照合し、指定パスの実PNGを再検証する。出自・作者ID・非公開位置・内部メモ・隔離パスを公開応答へ含めない。
- 地球儀の公開作品から「遊ぶ」で新問題を開ける。管理画面ではSpotの変更画素、Hiddenの対象名とマスクを確認できる。
- 小さい縦横画面の試遊・投稿ボタンの重なりを修正した。音楽は従来どおり隙間のない1セル1音、色と音色の組合せ、40音色候補を維持する。

本格版iDRAW・iAUDIO・iGAME、旧PiXFiND、旧SNS作品・有償素材の元データは変更しない。ゲーム制作は完了ゴール外の簡易アップロード版を維持。販売と作品一覧の公開導線は戻さない。

公開の切替前に `supabaseConfig.puzzlePublicationEnabled` を `false` としている。旧APIがパズル情報を無視して通常画像として受け付ける誤送信を、認証・POST通信の前で止める。DBと3 Functionsの本番検証後にのみ `true` へ変更する。有効時も返された `puzzleMode` が送信内容と一致しなければ成功扱いにせず、端末の受け渡しを残す。ブラウザーハーネスはテスト内だけで明示的にフラグを有効にする。

## 検証結果

| 検査 | 結果 | 境界 |
| --- | --- | --- |
| 制作ハーネス全12スイート | Node 229件PASS、失敗/skip 0 | 純粋処理・契約・回帰、静的SEO5件・共有HTML7件・公開受付ゲート1件を含む |
| 検索・一般共有用HTML/画像 | HTTP 55項目PASS、PNG 15枚復号/寸法PASS | ループバックの静的ファイル配信、JavaScriptなし。作品別OGP・本番検索/SNSは未確認 |
| 受付・審査・公開読取・通信ヘルパー | Deno 23件PASS、3 Function型検査PASS | 実handlerと明示的なテスト用通信 |
| DB移行・公開パズル受入・旧作品配置 | 実PostgreSQL PASS | 独立した一時DB、テストauth/storage/socialスキーマ。実Supabaseサービスとは別 |
| 実Function→実DB→審査→公開応答→プレイヤー契約 | Deno 2件PASS、両mode正常 | 認証・Storageはテストadapter。通常投稿と別作者の同一PNGも確認 |
| 作者画面・失敗後の復元と再送 | Chrome/WebKit 12条件PASS | 320×568・390×844・568×320、IndexedDB・実DOM、受付通信は遮断して503→201を模擬 |
| 公開作品の遊ぶリンク・プレイ・非公開時拒否 | Chrome/WebKit 20条件PASS | 320×568・390×440・568×320・768×800・1280×800。実DB/Functionが出力した応答・PNGを使い、ブラウザー通信を置換 |
| 管理画面の正解プレビュー・明示承認 | Chrome/WebKit 6条件PASS | 320×568・568×320・1280×800、実モジュール。審査一覧と承認通信は模擬 |
| 横はみ出し・画面例外 | 上記38条件で0件 | 実機Safari/Chromeとは分ける |
| 旧PiXFiND方式の個別HTML生成 | Node 7件PASS、実Function/DB応答の両modeを入力してPASS | 公開元画像だけを参照。実個別ページ生成・配信は未実施 |
| 横長OG画像のCanvas補助処理 | Chromiumの1280×720 PNG復号・整数倍・混色なしPASS | 試験用2色画像。生成スクリプトへの接続・保存・公開は未実装 |

本日のDB証拠は端末の一時ディレクトリ `pixieed-puzzle-db-bIVxtU`、ブラウザーに渡した公開fixtureは `pixieed-puzzle-db-aWSHzI/public-fixtures.json` にある。いずれも試験用画像のみ。一時DBは終了処理で停止している。

確認中に見つけた修正: SQLのCASE括弧、Hiddenの不要な追加画像キー、再送の確定投稿IDと試行画像回収、公開204応答、旧schema fallbackの検査、下部操作配置、制作確認チェックによる再送キーの誤更新。ブラウザーの遅延画像読込はカードへスクロールして検査した。

コミット前には共有作業ツリーから関連204ファイルだけを選び、選択したGit treeを独立した一時フォルダーへ取り出して検証した。上のNode229件、Deno23件、Chrome/WebKit38条件はその保存対象で再実行してPASS。一般共有HTTP55項目も選択内容でPASS。天体描画、未完成の望遠鏡ナビ、ホーム遊びの操作変更など13ファイルの作業中差分は保存対象から除外し、元の作業ファイルに残した。既にmainへコミット済みのホーム変更は通常のpush対象として維持する。

## 再実行

```sh
node scripts/creation-suite-harness.mjs --all
deno test --allow-env supabase/functions/create-post/index.test.ts supabase/functions/moderate-post/index.test.ts supabase/functions/public-post-puzzle/index.test.ts supabase/functions/_shared/key-aware-fetch.test.ts supabase/functions/_shared/post-rollback.test.ts
deno check supabase/functions/create-post/index.ts supabase/functions/moderate-post/index.ts supabase/functions/public-post-puzzle/index.ts
node scripts/puzzle-db-harness.mjs --integration
```

DBハーネスは既存の `initdb/pg_ctl/psql` とDenoを使い、固有Unix socketの一時DBだけを起動する。環境に無ければ導入を勝手に行わない。実行末尾に出る一時フォルダーの `public-fixtures.json` を次へ渡す。

```sh
PIXIEED_PLAYWRIGHT_MODULE=/path/to/existing/playwright/index.mjs node scripts/puzzle-browser-harness.mjs
PIXIEED_PLAYWRIGHT_MODULE=/path/to/existing/playwright/index.mjs PIXIEED_TEST_PUBLIC_FIXTURES=/path/to/test-db/public-fixtures.json node scripts/puzzle-public-browser-harness.mjs
```

ブラウザーハーネスは既存Playwrightを明示的に指定する。既定はlocalhost:4173、任意の本番URLは拒否し、外部通信は試験応答で遮断する。

## 確認後に適用する差分

対象DBは公開設定と照合した `kyyiuakrqomzlikfaire`。直前に本番の履歴とスキーマを再読取する。未適用候補は次の5件であり、読み取り確認は適用の証拠ではない。

1. `20260927062906_classify_globe_posts.sql` — 手描き/カメラの種別。
2. `20260927065511_expand_pixel_art_post_dimensions.sql` — 最大512px、既存寸法を保持。
3. `20260927120000_verify_new_pixel_post_limits.sql` — 新規PNGの寸法・色数規則、既存行に遡及しない。
4. `20260927163635_add_social_post_map_points.sql` — 作者本人が旧公開showcaseをセルへ配置。座標を推測して補わない。
5. `20260927234715_complete_puzzle_publication.sql` — 非公開パズル、再送キー、原子的な受付/審査、公開読取。画像hash全作者一意indexを通常indexへ変更。

続いて `create-post`、`moderate-post`、`public-post-puzzle` の3 Functionを反映する。新読取だけ匿名GETのため `verify_jwt=false`。投稿・審査の認証設定とhandler認可は維持する。service keyを画面・Gitへ追加しない。

最後に制作ページ・共通UI・読込revを含む関連サイト差分を反映する。共有ファイルには前回作業と他担当の差分があるため、Claude側の未完成変更と混ぜず、ファイル/差分を確認してコミット対象を確定する。

切替時は旧WebP/128色超のタブが新規規則で拒否され得る。投稿の切替時間を短くし、DB→Function→画面を続けて確認する。旧行は削除しない。全作者の同一hash投稿が追加された後は、旧unique indexをそのまま復元できない。問題時は新公開導線を止め、追加データと新しい再送契約を残す。

## 本番・実機で残る受入

- 検索・一般共有の18ページとブランドアイコンを反映した後、検索クロール/SNSカード/ホーム画面を確認する。作品ごとの共有HTMLは旧PiXFiND方式で生成するソースを再利用し、公開データ照合・同期・失効・画像生成の本番確認を残す。一般ページのOGPだけを個別共有完了とは扱わない。詳細は [SEO-AND-SHARING.md](SEO-AND-SHARING.md)。
- 実Supabase Auth/Storage/HTTP経由で自分のテスト作品を1件ずつ送信し、審査前の非公開、明示承認、地球儀表示、Spot/Hiddenプレイまで確認する。旧本人ログインと配置、別人からの拒否も確認する。
- iPhone/Androidの実タッチ、描画/音楽の操作、実際の40音色の聴感、カメラ撮影/保存/音楽への受け渡しを確認する。
- 公開サイトの新URL・旧6問題・作品一覧転送・販売導線の非表示を確認する。
- **非公開化後の画像回収は別の運用ゲート。** 親hiddenは新規地図/問題読取を拒否するが、公開済みPNGのStorage削除・CDN失効を自動実装したものではない。既に配布された公開URL/キャッシュの回収成功は未検証。DB状態だけで画像URLも即時失効すると扱わず、削除・残存確認を行って記録する。
- DB/Storageの通信結果が分からない場合は行/関連行/試行パスを照合して復旧する。Storageまで含む完全な原子性や、クライアント出自による作者本人の保証は主張しない。

ローカル接続を完成したことと、本番で利用者が使える状態・全体ゴール完了は別である。本番反映と実機の結果を得てからStep17と全体ゴールを完了扱いにする。
