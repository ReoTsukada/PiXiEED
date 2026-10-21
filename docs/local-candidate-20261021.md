# SNS・パズル・カメラ候補の保存と公開前条件

2026-10-21。ユーザーから全変更のcommit/pushとSNSを含む本番公開の依頼を受けた候補。現段階は公開済みd8cb45ccを基準にした候補ブランチへのソース保存であり、本番公開完了ではない。未検証のままmainへmerge/deployしない。

## 保存対象

- 最新のSNSフィード/操作構成/内部ツール紹介カード/広幅の広告レーン余白、元音源Blobの端末内下書き、文章/音楽のサーバー候補、コメントなし。
- ゲスト投稿、新規メール登録時の同ID昇格、既存アカウントへの二者所有権確認による投稿移管、Google PKCE復帰、端末内作品のmetadata関連付け。元の私的作品をログインで公開しない。
- 間違い探し/もの探しの端末内試遊と明示公開の分離。ジグソーは既存公開条件内の自分のDraw固定版のみ投稿候補に対応。写真/端末ファイル/PXD/他人の公開作品/旧分割ジグソーの投稿は未対応のまま、端末内プレイは保持。
- Draw/Camera/Audio出力からSNS下書きへの返却導線。
- カメラ固有PX/比率設定と操作適用コード。追加の明示許可を受けた正式なローカル実行経路で、Chromeの320/390/1280px操作試験を完了。実カメラ・実機は未確認。
- 地図の段階起動/失敗表示/投稿API準備完了待ち、情報ページの不要なデータ読込抑制、通常buildのapp/home-startup圧縮・内容版付け。
- 自分用を選んだ文章/音楽も新規投稿UIでは端末内保存に留め、サーバー作成へ進まない。

正式ロゴ、Drawの許可済み魔王様作例、Cameraの許可済み風景、ヘッダー64px/24遷移先、イベントUI/情報ページ余白/実験媒体の配信除外は既に公開済みの基準を維持。旧queryや古いSNS実装で上書きしない。

画像・音源ファイルの新規追加/変更、QAキャプチャ、実験生成画像、提供素材原版8枚、古い実験SNSデモ、秘密・ログ・Cookieはこの変更へ含めない。既存媒体のGit履歴を消去したわけではない。元素材の選択UI・作例は未実装。

## 検証境界

通常のNode全体/関連試験、合成Auth/Storage/RPCを使うDeno、通常build2回の一致、依存/cache/画像除外を検証する。2026-10-21 15:48/15:49 UTCの追加許可に基づき、正式なrequire_escalated経路でローカルPostgreSQLとChromeの実行が成功した。古い実行拒否を別経路で迂回したものではない。実機・実広告・実Supabaseサービスの検証とは区別する。

`supabase/migrations/20261021121542_jigsaw_publication.sql` の承認mapは空のまま。保存済み4制約・4関数の独立レビューと合成catalog上の実PostgreSQL実行を完了したが、本番catalogへ適用する判断は未了。`jigsaw_constraint_review_required` で停止し、guardを外して適用する候補ではない。

## 本番公開の最小blocking項目

1. **文書は確定候補、実基盤の発効条件は未了。** `/terms/` と `/privacy/` の本文、版（terms-20261021-1 / privacy-20261021-1）、SHA256、発効候補日2026-10-21を確定。作者権利維持・限定サイト内利用・将来ゲームへの適用・保護者同意・メール受付・完了対応記録の原則90日整理はユーザー承認済み。通常設定はstate=draftを維持し、未検証のまま公開送信を有効化しない。詳細は `posting-policy-review-20261021.md`。
2. ローカルPostgreSQLで実SQLのschema/権限/複数所有者/削除/通報/容量/移管競合を確認し、Chromeで実IndexedDB・下書き音源Blobの同一性・keyboard/320/390/1280pxを確認した。ただしDB側のAuth/Storage表は合成shim、ブラウザーのAuth/APIは合成adapterであり、実Supabase Auth/Storage/Gateway、音源HTTP Range、実認証経路の証拠ではない。既存connectorには本番1project/main branchのみで、独立stagingは確認できない。ローカルフルスタックに必要なDocker API互換ランタイムも未導入。新環境/ソフト/契約/credentialsは作成していない。
3. project `kyyiuakrqomzlikfaire` の現在の匿名Auth/manual linking/メール確認・provider/Google redirect値は未確認。設定読取の専用ツールがなく、同条件で失敗済みの操作は繰り返していない。現在値を確認する権限・手段が必要。

## 本番変更の承認境界（すべて未適用）

2026-10-21 15:41 UTCに、SNS投稿/通報/引継ぎ/同意記録のservice限定保存先、private音源保存・公開投稿だけの配信、新SNSの公開閲覧と本人書込み、旧pixfind直接書込み制限について条件付き承認を受けた。実サービス検証前の適用はしない。匿名Auth/manual linking/メール確認/Google設定は承認範囲外で、現在値も未確認。下表のAuth関連は別の具体確認が必要。承認済みDB/Function/Storage変更について同じ承認を取り直す必要はない。

| 項目 | 対象と誰へのアクセスか | 影響/条件 |
| --- | --- | --- |
| 匿名Auth | 現在無効なら、明示投稿/登録時だけ匿名ユーザーを作れる設定 | 既存利用者を匿名化しない。匿名にもauthenticatedロールが付くので、既存likes/reports/collab等への権限が増え得る。既存RLSを先に再確認し、意図しない権限を放置しない |
| 同IDメール登録 | 現在無効ならmanual linking、メール確認/OTPが既存のメール変更経路で使える設定 | 公式の匿名昇格仕様はmanual linkingを要求する。既存アカウントへの二者データ移管とは別物。設定はproject全体に及び得るため個別承認が必要。新SMTPや秘密は作らない |
| 既存Google | 既存providerと `https://pixieed.jp/profile/?view=posts` / www側のPKCE復帰許可を確認。欠ける設定だけ具体化 | Google secret/providerを交換しない。Google identityをゲストIDへ直接linkする実装ではない。古い未検証implicit callbackを移管証明へ流用しない |
| SNS移行 | `20261020232509_sns_feed.sql` のsns_posts/sns_reports、`20261021092108_guest_claim.sql` のsns_guest_claims。RLS有効、PUBLIC/anon/authenticatedの直接権限撤回、service_roleのみCRUD/RPC | 既存user_postsのowner移管/元媒体ownerを扱うtriggerと削除RPCも変わる重要変更。両トークンをgetUserで確認し、公開状態/元pathを保持。実DBのlock/競合/旧schema互換を先に検証 |
| 新social-feedのみ | Gateway `verify_jwt=false` の限定案。公開読取は無token、書込/private/編集削除/移管はhandler getUserで所有者確認。PUBLIC_SITE_ORIGINは正式2originのみ | 既存Functionや全体のJWT保護を弱めない。CORS/不正token/二者claimを実Gatewayで確認してから |
| 音源bucket | 新sns-audioをprivateにし、service経由保存、公開選択したready音源だけFunctionから配信。private既存音源は所有者のみ | 一般Storage read/list/uploadは与えない。16MiB/600秒、所有者合計128MiB。取得済み公開コピーは回収不能。実Range206、拒否、削除cleanupの試験が必要 |
| パズル/ジグソー | 既存公開基盤にmode追加の4check/4検証・作成・審査関数。create-post/moderate-post/public-post-puzzleを一緒に検証 | 新しい匿名table grant/bucket/Gateway変更はこのmode追加には不要。制約式の承認mapは未確定。現行基盤の配備状態を確認する前にUIだけ公開しない |

公式参照: [Anonymous Sign-Ins](https://supabase.com/docs/guides/auth/auth-anonymous)、[Identity Linking](https://supabase.com/docs/guides/auth/auth-identity-linking)。仕様上必要な設定と、対象projectの現在値は区別する。

実サービス試験には、許可済みstagingまたは件数・公開範囲・回収方法を限定承認された合成主体/合成素材が必要。本番にテストAuthユーザーや投稿を作る許可はまだない。既存ユーザーデータは試験に使わない。所有者と作成IDのallowlistで後片付けし、任意の既存行を削除しない。管理者通報処理、退会・保持期限、公開読取の濫用対策、容量/MAU/配信費の予算も運用上の残件。料金・無料枠内の運用は保証しない。

今回のGit保存は、上記設定/SQLや正式法的文書の本番変更を適用したことを意味しない。公開前は候補ブランチをmainへmergeしない。障害時は新しい入口/書込を止め、保存データと読取互換を保護する。DROP/CASCADE/履歴改変で撤回しない。

## 投稿前同意の追加候補（2026-10-21）

運営者「PiXiEED アルタ」と問い合わせ先 pixieed.arta@gmail.com は確認済み。privacyと新設termsの本文を承認方針へ整合し、本文articleの版/hash/候補日を通常buildで検証する。既存広告/解析の2節は本文を変えない。data/posting-policy.mjsはstate=draft/contactConfirmed=trueのまま、両URL/版/hashを実在候補へ設定。残る停止理由は文書の不足ではなく、本番Auth/RLS/Gateway/Storageの承認・実環境検証。

正式な2文書/版/承認本文SHA256と公開窓口の確認後、同じ設定をクライアントとFunctionへ同時配布して初めて有効化できる構造。ゲスト/登録の双方に未チェックUI、再表示/公開範囲/本人切替でreset。下書きやguest claimへ同意を移さない。画像/パズルcreate-postとSNS文章/音源create/公開editは、欠落・false・旧版を拒否。確認記録が保存できない場合も媒体の保存/公開処理へ進まない。

追加の未適用SQL 20261021140044_posting_consent_receipts.sqlはpublic.posting_consents 1表のみ。RLS有効、PUBLIC/anon/authenticatedの直接権限は撤回、service_roleへSELECT/INSERTだけを明示。本人ID/用途/送信番号/送信digest/2文書の版とhash/サーバー確認時刻のみ。再試行は既存時刻を保持し、同一番号で内容が違う場合は拒否。失敗送信にも確認記録が残り得る。Auth参照FK/guest移管/自動削除は追加せず、保持期間/退会/濫用対策・容量運用は適用前に別途承認・検証が必要。実DB/RLS試験は未確認。本番へ適用しない。

旧pixfind_puzzles等に直接INSERTできる既存の公開Data API権限は今回変更していない。新規Function経路の同意制御が、旧RLS経路全体を保護することを意味しない。本番の全投稿経路へ同意を強制する前に、旧書込経路のcatalog確認と必要な権限制限/互換移行の個別承認が必要。

2026-10-21方針確定追記: 正式候補文書と原則90日の対応記録整理方針を確定。専用台帳のdry-run/新規置換ファイル作成と手動メール整理の手順を追加したが、実メール/DBの削除・運用開始や自動定期実行は行っていない。同意・所有権/再試行安全記録を90日で一律消すものではない。

ジグソー移行案は保存済みcatalogの4関数完全定義へ変更し、署名/MD5と4制約の正確な定義をDDL前に検査する。旧モード検証は逆変換fingerprintで保持を確認。幅/高さはjigsaw専用にJSON数値を要求。独立レビュー済みだが実SQL/DB未検証で、承認mapは空のまま。候補dfc8fbfcへの保存は本番適用ではない。

## 正式な追加許可後のローカル実行結果

以下は上記の初期段階の「実DB/browser未検証」記録を更新する結果であり、本番適用の証拠ではない。

- PostgreSQL 17を専用Unix socket/TCP無効で一時起動。既存の画像投稿・削除・パズルSQL、新SNS、ゲスト移管、同意記録の移行と拒否条件を実行。SNS schema試験7件はskipなしで成功。移管と旧所有者の新規作成を実際に並行実行し、移管後の旧主体書込み拒否とprivate維持を確認した。
- ジグソーは未変更の空mapが停止することを確認した後、独立レビュー済みcatalogだけを使う一時SQLコピーで実行し、旧パズル回帰とJSON数値条件を確認した。配布元migrationの空mapは変更していない。
- Chromeはsandboxを維持し、独立context・loopback限定・カメラ/マイク/位置情報要求なしで実行。320/390/1280pxのSNS操作、実IndexedDB下書き/音源Blobの再読込とbytes同一性、アカウント変更による同意解除、合成API失敗/再試行/連打を確認。発効済みpolicyを返す試験は一時サーバー内だけのfixtureで、通常設定のdraftは維持した。
- カメラ設定も3幅でpreset/比率/slider drag/keyboard/undo/reset/不正値debounce/元PNG同一性/Draw・Audio切替/範囲内表示/Escapeフォーカス復帰を確認。実ハードウェアは使用していない。
- 検証で判明した3点を修正した。同意記録は既存service_roleデフォルト権限を明示撤回してからSELECT/INSERTだけを付与する。同意UIは初回guestセッション生成後の失敗で古い同意表示を解除し、再チェックの本人を描画前に確定する。カメラ設定のEscapeはページの作業終了より先に処理し、作業とフォーカスを保つ。独立レビューと回帰試験を実施した。

実Supabase HTTPのAuth/Storage/Gatewayは上記の合成shim/adapterに含まれない。必要条件は、既存の正当な非本番フルスタック、または別途導入を許可されたローカルDocker API互換ランタイムとSupabaseフルスタック、および対象Auth設定の正当な現在値確認である。新しいソフト導入・cloud環境・認証主体・資格情報の作成、本番SQL/Function配備、広告要求、公開投稿、画像アップロードは実施していない。
