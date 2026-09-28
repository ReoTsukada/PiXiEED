# 間違い探し・もの探しの地球儀公開計画

2026-09-28: この計画に基づく受付・審査・公開読取RPC/Function、作者画面・地球儀・管理者プレビューをローカル実装した。実DBとブラウザーの確認結果、本番未反映・実機未確認・画像回収運用の境界は [FINAL-VERIFICATION.md](FINAL-VERIFICATION.md) が最新。本書後半のロールアウト条件は、計画を実装しただけで本番合格となることを意味しない。

## 目的と境界

作者が端末内で作成し、自分で確認済みにした間違い探し／もの探しを、地球儀上の新しい投稿として一度の投稿操作で審査へ送る。承認後は、その地球儀投稿から訪問者が固定版をプレイできるようにする。作者に同じ絵を別途投稿させない。

対象は新規制作ツールの公開だけ。旧PiXFiNDの閲覧・共有URL、旧 `social_posts`、Market作品の行・画像・権利条件は変更しない。他人の投稿や有償アセットを問題の素材として取り込まない。既存の本格版iDRAW/iAUDIO/iGAMEも対象外。

## hashと画像の関係

ローカルDrawの `revision.documentHash` は `sha256-canonical-v1` で、編集文書の正規JSONから作られる。一方、`user_posts.content_hash` と `create-post` の重複検査はアップロードPNGのバイト列SHA-256である。PNGエンコーダーや圧縮方法が異なれば、同じ画素でもバイトhashは変わるため、この二つを一致条件にしてはならない。

投稿リクエストでは、作者が確認したと申告する固定版からクライアントが出力した表示PNGとパズル定義を一緒に送る。Spot Differenceでは元画像PNGを地球儀投稿画像として使い、変更後PNGだけを問題の追加画像として送る。Hidden Objectでは元画像PNGが地球儀投稿画像になり、作者指定マスクと名前を定義として送る。固定版のdraft/revision IDとcanonical hashは出自メタデータとして別々に保持するが、サーバーは端末IndexedDBやログイン利用者とローカル `local-owner` の対応を証明できない。従ってcanonical hash、draft ID、クライアントの `confirmed: true` は本人性・権限・作者確認の証拠にせず、認可根拠に使わない。サーバーが検証できるのはJWTの送信者、届いた各PNGの実画素／実バイトと寸法・色数、指定された正解画素が実際のSpot差分に含まれること、そして認証済み利用者からの明示的な投稿要求である。作者が自分の作品・権利を持つという表明や実際に自分で確認操作をしたことは、クライアントだけでは暗号学的に証明できない。投稿時の明示的な権利確認と運営審査を設け、厳格な作者来歴保証をうたわない。ピクセル文書hashをPNGのバイトhashに置き換えない。

## 推奨するデータと投稿契約

既存 `user_posts` を親投稿として再利用し、追加の `user_post_puzzles` テーブルを1つ設ける。パズルだけを表す別投稿や、既存の `social_posts`／`pixfind_puzzles` への書込みは作らない。

`user_post_puzzles` は `post_id` を主キー兼 `user_posts.id` への外部キーとし、`mode`（`spot_difference` / `hidden_object`）、`schema_version`、固定版のsource metadata、検証済みの公開ゲーム定義、審査状態、時刻、審査メモを持つ。投稿ごとにパズルは最大1つ。地球儀側の画像・作者・場所・公開可否は親 `user_posts` と `post_map_points` を唯一の正本とし、パズル表に作者ID、コピー位置、別タイトルや別の公開状態を重複保存しない。必要な作者表示は親投稿から読む。

`create-post` に任意の `puzzle` 受付フィールドを追加する。通常の画像投稿契約はそのまま保つ。パズル投稿では同じリクエストの画像、タイトル、公開セル、確認済みパズル文書をひとまとまりとして受け付ける。既存の認証、サイズ／色数／PNG実体検査、`post-quarantine`、`user_posts`、非公開位置保存を使う。Spotの変更後PNGは投稿ID配下の隔離パスへ保存する。Hiddenのマスク／ラベルは検証後のJSONBとして隔離状態で保存する。親投稿・非公開位置・パズル定義のDB行は一つのDBトランザクションで確定させ、通常投稿にはパズル行を作らない。Storageへの画像保存はDBと原子的にまとめられないため、失敗時は各書込結果を再確認して安全に補償し、結果不明の画像・pending行を運営が特定して復旧できる記録を残す。「通信断でも部分状態が絶対に残らない」とは扱わない。

現行の `user_posts_content_hash_idx` は画像バイトhashを**全作者で一意**にしており、別の作者が同じ小さなドット絵を投稿することも拒否する。`create-post` の事前照会も作者を見ずに同じhashを拒否するため、公開前にこの契約を解消する。画像hashは実体検査と記録には残し、重複送信の防止は本人とリクエストに結び付く安定したidempotency keyで行う。新規の送信には `user_posts` にnullableのrequest keyと検証済みpayload digestを保存し、`(author_id, request_key)` をkeyがある行だけ一意にする。既存行は書き換えない。同じkey・同じ内容の再試行は、親投稿・非公開位置・パズル行が揃ったことを確認してから既存受付結果へ収束させる。同じkeyで異なる内容は拒否し、進行中・結果不明の要求は成功と返さず再確認可能な状態にする。別の作者や、本人が明示的に新たに送る同一画像は画像hashだけで拒否しない。古い一意indexの変更、受付Functionとクライアントの再試行契約、既存pending行との共存を**一緒に**移行・検証する。切替期間はkeyを送らない旧タブの通常投稿を受け付けるが、その再送については冪等性を保証しない。新しい公開ボタンを出す前に、この変更を通常投稿とパズル投稿の両方で確認する。

Edge Functionからの個別のREST insertは一つのDBトランザクションにならない。検証済みpayloadを渡すservice role専用のDB関数で、親投稿・非公開位置・任意のパズル行を同時に挿入し、keyの一意衝突では既存のdigestと必要な行の成立を照合する。digestには実画像のバイトhashだけでなく、正規化したタイトル・説明・公開セル・投稿種別・パズルmode／定義・変更後画像のバイトhashを含め、同じkeyで別内容を受け付けない。DB関数は固定search_pathと対象行の検証を持たせ、実行権限を `PUBLIC`、`anon`、`authenticated` から取り消して `service_role` にだけ付与する。Storageへの隔離画像はこのDB関数より前に試行ごとの固有パスへ保存し、DB確定失敗時にはその試行の画像だけを回収する。一意衝突から既存の成功結果へ収束する場合も、今回の再試行でアップロードした画像を回収してから応答する。DB関数の応答が不明なときは親行と関連行を読み直し、成功を確認できないまま同じkeyへ成功を返したり、公開／隔離画像を推測で消したりしない。孤立画像の検知・回収方法を運営手順に残す。

各modeの受入検証は独立した共有契約にする。共通でschema/version、許可キー、サイズ・総量上限、親画像との寸法一致、source hashの形式を検証する。`confirmed: true` はUI状態の申告にすぎず、サーバー側の検証で作者が手で見て確認した事実を証明できない。Spotは同寸PNG、1〜256候補、空・重複・範囲外・候補間重複画素を拒否し、**指定された正解画素がすべて実画像間の差分に含まれる**ことを検証する。正解に含めなかった差分は、作者が候補を除外できる既存操作に合わせて許す。差分が全くない画像や、実際は変わらない画素を正解とする定義は拒否する。透明画素どうしの隠れRGBだけの違いは差分にしない。Hiddenは1〜128個の名前付きmaskを要求し、空・重複・範囲外mask、mask相互重複、重複名、押せない／重なるhitboxを拒否する。サーバーは受理した不変payloadの定義hashを発行する。これは改変検知用で、ローカル作成者や人手確認の証明ではない。未知mode/versionは拒否する。

Hiddenのhitboxは、568×320の試遊で512px画像が約144 CSS px幅まで縮む実測を踏まえ、120 CSS px幅でも各対象が24 CSS px以上となるよう作る。公開受付側はローカル画面の `confirmed` や保存済みhitboxを信用せず、同じ最小幅でmaskから再計算して、押し分けられない定義を拒否する。旧216 CSS px基準で作った端末内下書きは元データを残し、試遊時に新基準へ再計算する。重なって再計算できないものは公開・試遊に流さず、作者へ対象を離して作り直すよう伝える。

## 審査・公開・読取

新しいパズル行は親投稿と同時にpendingになる。`moderate-post` のpending一覧にmodeと必要な画像を含める。Spotは元画像と変更後画像、正解候補のプレビューを審査できるようにし、Hiddenは親画像と対象名／mask overlayを審査できるようにする。approveでは公開画像のコピー後、service role専用のDB関数で親行のpublished化、coarse map point作成、パズル行のpublished化を一つのDBトランザクションで確定する。rejectも親・パズル双方を一括してrejectedにし、審査前画像を公開bucketへ移さない。公開処理の途中失敗は既存moderationの補償削除パターンにならい、DBの確定状態を読み直してから、その試行だけの公開画像を回収する。DB確定済みか応答不明なら画像を推測で削除せず、再試行・運営復旧の対象とする。

隔離中の変更後画像とパズルJSONは `post-quarantine` 等の非公開領域から出さない。承認後の変更後画像だけを `post-public` に移す。Hiddenのmask/答え定義はDBのRLSで公開前はservice roleのみが読める。公開後も地球儀一覧にはパズルIDとmodeだけを返し、答えデータは含めない。訪問者がプレイヤーを開始した際、公開済みパズルIDを指定して親投稿と公開状態を確認する読取APIを通じて固定版定義を取得する。プレイには正解定義をブラウザーへ渡す必要があるため、これは公開後の秘密情報とは扱わない。URLを知る訪問者にも公開問題の答えデータを秘匿できる仕組みではない。

RLSはブラウザーからのinsert/update/deleteを拒否し、受付・審査Functionをservice roleに限定する。RLSの行filterだけでは許可された行の全列が読める構成になり得るため、`user_post_puzzles` base tableへの `SELECT` を `PUBLIC`、`anon`、`authenticated` から明示的にrevokeし、直接REST読取を許可しない。匿名の地球儀一覧とプレイ読取は公開用Edge読取Functionだけを入口にする。一覧Functionは親投稿・公開map point・公開パズルの成立を確認し、post ID、modeなどのallowlist列だけを返す。プレイFunctionは同じ公開条件を再確認し、mode別に定めたプレイに必要な固定画像locatorとゲーム定義だけを返す。service roleでDBを読む場合も列allowlistと公開条件をFunction内で強制し、審査メモ、作者ID、source metadata、quarantine path、内部状態を応答へ含めない。現行 `post_map_points` の公開RLSは `published_at is not null` だけで親 `user_posts.status` を見ないため、非公開化時には公開セル自体も匿名読取から消えるようRLSまたはDB側の状態遷移を更新する。親投稿が非公開化／削除された場合はパズルと変更後画像も公開読取から消し、公開Storage画像の回収を運営処理で確認する。公開bucketのURLはRLSだけでは失効せず、画像削除後もCDNキャッシュが残る可能性がある。即時失効を必須とするなら公開bucketではなく権限付き配信へ変更する必要があるため、公開前に要件と実際の失効時間を確認する。投稿行の非公開化とStorage回収が分離して失敗した場合の検知・復旧もテストする。位置・投稿者ID・審査メモ・quarantine pathを公開読取モデルへ出さない。

[SupabaseのData APIアクセス規則](https://supabase.com/docs/guides/api/securing-your-api)では新しい公開スキーマ表の自動権限付与に依存しない構成へ移行している。追加migrationでは `user_post_puzzles` の権限を明示し、`service_role` に受付・審査・公開読取に必要な最小権限だけをgrant、`PUBLIC`・`anon`・`authenticated` から直接読取・書込権限をrevokeする。表のRLSとDB関数のEXECUTE権限も同じmigrationで定義する。ローカルと本番のData API公開設定、GRANT、RLSを別々に照合し、どれか一つだけで公開安全性が成立したとみなさない。

## 実装ファイルと責務

- `js/creation/spot-difference-core.mjs` と `hidden-object-core.mjs`: 公開可能な確認済み固定版の取り出し、送信用document構築。編集／プレイ用コアの下書き限定契約は保ち、公開状態をローカル保存データに書き込まない。
- `spot-difference/` と `hidden-object/` の各HTML／page module: 地球儀投稿に必要なタイトル・セル選択・最終確認を追加し、認証後に一度の送信操作を提供。送信中・pending・rejected状態を表示し、再送時の二重登録を防ぐidempotency keyを保持する。
- `supabase/functions/create-post/index.ts`: optional puzzle payloadを認証済み利用者から受け、共通画像検査に加えてmode別定義を検証し、親投稿とpendingパズルを一貫して隔離保存する。通常画像投稿のpayloadと振る舞いは維持する。
- `supabase/migrations/<新規migration>.sql`: `user_post_puzzles`、FK／mode／status／版・サイズ制約、RLS、service role専用の受付・審査DB関数を追加する。既存 `user_posts` にはnullableのrequest key／digestと作者単位の一意制約を追加し、画像hashの全作者一意indexを外す。既存行・`social_posts`・`pixfind_puzzles`・Market表とデータは移行・削除しない。パズルbase tableは公開SELECT policyを作らず、直接SELECT権限を明示的に取り消す。
- `supabase/functions/moderate-post/index.ts` と `admin/moderation.js`: パズル添付を審査し、既存親投稿の画像／地球儀位置公開と同じ承認判断でパズルを公開状態にする。
- `js/globe/post-supabase.mjs` および `js/globe/post-ui.mjs`: 公開親投稿にパズルのID/modeを付け、投稿詳細から `/pixfind/?puzzle=<id>` 相当の現行プレイ入口へ遷移する。既存投稿の表示データ契約はoptional fieldとして後方互換にする。
- `js/creation/pixfind-play.mjs`: 旧 `social_posts` + `pixfind_puzzles` の読取経路を残し、新しいID namespace／API経路を追加する。旧ID・slugの照合規則や既存6問題を変更しない。
- `tests/creation-suite/`、`supabase/functions/create-post/`、`supabase/functions/moderate-post/`: 契約・認可・審査のローカルテストを追加する。実DBのRLSはローカルSupabase環境で別途検証する。

## 権利と後方互換

投稿画像として受け付けるのは送信されたPNGと検証済み定義であり、サーバーはそれが特定の端末内Draw draftから出たことや、送信者が元画像の作者／権利者であることまでは保証できない。ログインしたsubmitter IDを記録し、明示的な権利表明と運営審査で扱う。任意のclient IDやローカルdraft owner文字列をアカウント所有権の証明にしない。公開パズルの利用許可はプレイの範囲に限るものとして表示し、派生素材の権利を付与したり、旧データの権利状態を推定したりしない。公開後に端末内draftを編集しても公開中のPNGとゲーム定義は更新されず、修正版は別投稿として再審査する。

旧 `pixfind_puzzles` とMarketへの書込み・変換・削除を行わない。旧問題は従来の公開行によってのみ一覧へ出し、作者確認済みの旧データとみなしたり、新テーブルへ自動コピーしたりしない。Marketアセット、販売状態、価格、public catalog、画像pathを新投稿へ流用しない。既存の投稿受付とmoderation、地球儀公開点を再利用するため、審査前非公開、位置のcoarse化、公開画像配信の現行契約も保つ。

## プレイヤーの公開読取契約

ローカルの新入口は `/pixfind/?postPuzzle=<親投稿UUID>` とする。旧 `puzzle` / slug / hashと端末内の `localSpot` / `localHidden` は維持し、新入口との混在は拒否する。新入口から匿名の `GET /functions/v1/public-post-puzzle?postId=<UUID>` を `cache: no-store` で呼ぶ。読取Function自体はまだ未実装であり、配信するまで地球儀に新しいプレイリンクは出さない。

成功応答はHTTP 200で `{ok:true,puzzle:{postId,title,author,mode,originalImage,changedImage?,definition}}` を返す。modeは `spot_difference` / `hidden_object`、画像は `{url,width,height}`、definitionは受付と同じschemaVersion 1・confirmed・寸法・mode別正解を用いる。画像URLは同じSupabase originの公開 `post-public` PNGだけに限定し、認証情報・query・hashを含めない。Spotは元画像と変更後画像の実寸と正解画素の差分をプレイヤーでも照合する。Hiddenは対象maskから120 CSS px基準のhitBoxesを再計算する。未公開・不明ID・未知schema/mode・画像/定義不一致はプレイ不可とする。このクライアント検証は、Functionによる親投稿・公開map point・公開パズルの照合を代替しない。

読取Functionは、親投稿・公開地図行・審査済みパズルを同じ投稿IDで結合した単一の読取スナップショットとして取得する。別々のリクエストや古いキャッシュを組み合わせて公開可否を決めない。公開地図行が残っていても親投稿がhiddenなら拒否する。ローカルの `public-puzzle.mjs` はそのsnapshotと、指定された公開object keyから取得した実PNGをプレイ用allowlistへ整える部品とし、DB行の実読取やRLSを代替しない。adapter inputはDB列を直接公開せず、`parent`・`point`・`puzzle`・各PNGのbyte列に正規化する。

匿名プレイのFunctionはユーザーJWTを必須にしない構成を別途設定する。Supabaseの[公開Functionの公式説明](https://supabase.com/docs/guides/functions/auth#public-functions)に従ってplatformの `verify_jwt` 設定を確認し、既存の投稿・審査Functionの認証設定は維持する。この読取のために新しい依存を追加しない。公開URLの設定だけでservice roleによる非公開データ読取が安全になるわけではなく、上記の公開状態照合と返却列制限をhandler側で必須とする。

## ロールアウトと合格ゲート

1. 追加migrationとmode別payload schemaを作り、テストfixtureで既存DB行・旧PiXFiND／Market行に変更がないことを確認する。ローカルSupabaseで匿名・別ユーザー・作者本人・service roleのRLSを検証する。
2. Function単体テストで、通常投稿回帰、spot/hidden双方の正常送信、JWTなし／不正、未確認申告、hash不正、画像実寸不一致、異寸spot、実際は変わらない画素を正解にする定義の拒否、作者が除外した差分を含む正常送信、空／重複／範囲外候補・mask、重なるhitbox、上限超過、未知version、添付保存失敗、二重送信、審査失敗と補償処理を確認する。画像hashの全作者一意制約を外した後、別作者の同一画像、本人の新規送信、同一keyの同内容再試行、同一keyの異内容拒否をDBとFunctionの両側で検証する。実画像のPNG bytes hashとcanonical document hashを意図的に別値として通し、相互比較していないことを確認する。テスト名や説明でローカルdraftの所有者・手動確認をサーバーが検証できるかのように扱わない。
3. 審査Functionとadmin画面のfixtureで、承認前はDB直REST／公開Edge API／公開Storageから画像・答えが取れないこと、`anon` と `authenticated` にbase tableの直接SELECT権限がないこと、公開Edgeの各レスポンスが列allowlistに限定されることを確認する。承認時のみ親投稿／map point／puzzleがそろって公開され、却下時に添付が公開されないことも確認する。公開後に親をhiddenへ変更したfixtureでは、直接RESTのmap pointと一覧／プレイAPIが直ちに消えること、公開Storageの元画像・変更後画像を回収する処理が成功したこと、実URLの残存時間を別々に確認する。Storage回収が失敗した場合は成功扱いにせず運営復旧に残す。
4. 作者ブラウザーでローカルdraft選択→確認→セル選択→一回送信→pending表示→審査後の地球儀詳細まで確認し、再読み込み／通信再試行で重複投稿しないことを検証する。訪問者ブラウザーでは地球儀からplay開始、Spotの元／変更画像、Hiddenのmask hit判定、正解進行を確認する。
5. 320/390/768/1280px、短い縦画面、DPR 1/2/3、キーボードとタッチで制作・投稿・再生の操作到達性と重なりを確認する。既存6旧問題のID/slug再生、通常地球儀投稿、Market参照除外も回帰確認する。Step17の実端末確認は実施結果を別記し、未実施は `UNTESTED` のままにする。

migration／Function／審査UI／読取APIがローカルで揃うまで新しい公開ボタンをツール一覧で有効化しない。ここに書いた計画自体は仕様案であり、DB適用・本番公開・リリースを許可するものではない。

本番反映の順序は、既存受付と互換なDB移行→通常投稿も受け付ける新版受付・審査・読取Function→新しい画面の公開とする。画像hashの全作者一意indexを外した後に別作者の同一画像が入ると、元のindexを単純に作り直すロールバックはできない。戻す場合は新版UIを止めて受付を互換モードへ戻し、追加済み投稿を削除せずに新しい再試行規則を保持する。DB適用とサイト公開はそれぞれ実施前に差分と確認手順を提示する。
