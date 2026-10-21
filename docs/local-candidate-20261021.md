# SNS・パズル・カメラ候補の保存と公開前条件

2026-10-21。ユーザーから全変更のcommit/pushとSNSを含む本番公開の依頼を受けた候補。現段階は公開済みd8cb45ccを基準にした候補ブランチへのソース保存であり、本番公開完了ではない。未検証のままmainへmerge/deployしない。

## 保存対象

- 最新のSNSフィード/操作構成/内部ツール紹介カード/広幅の広告レーン余白、元音源Blobの端末内下書き、文章/音楽のサーバー候補、コメントなし。
- ゲスト投稿、新規メール登録時の同ID昇格、既存アカウントへの二者所有権確認による投稿移管、Google PKCE復帰、端末内作品のmetadata関連付け。元の私的作品をログインで公開しない。
- 間違い探し/もの探しの端末内試遊と明示公開の分離。ジグソーは既存公開条件内の自分のDraw固定版のみ投稿候補に対応。写真/端末ファイル/PXD/他人の公開作品/旧分割ジグソーの投稿は未対応のまま、端末内プレイは保持。
- Draw/Camera/Audio出力からSNS下書きへの返却導線。
- カメラ固有PX/比率設定と操作適用コード。既知のブラウザー拒否後の実UIは未確認。
- 地図の段階起動/失敗表示/投稿API準備完了待ち、情報ページの不要なデータ読込抑制、通常buildのapp/home-startup圧縮・内容版付け。
- 自分用を選んだ文章/音楽も新規投稿UIでは端末内保存に留め、サーバー作成へ進まない。

正式ロゴ、Drawの許可済み魔王様作例、Cameraの許可済み風景、ヘッダー64px/24遷移先、イベントUI/情報ページ余白/実験媒体の配信除外は既に公開済みの基準を維持。旧queryや古いSNS実装で上書きしない。

画像・音源ファイルの新規追加/変更、QAキャプチャ、実験生成画像、提供素材原版8枚、古い実験SNSデモ、秘密・ログ・Cookieはこの変更へ含めない。既存媒体のGit履歴を消去したわけではない。元素材の選択UI・作例は未実装。

## 検証境界

通常のNode全体/関連試験、合成Auth/Storage/RPCを使うDeno、通常build2回の一致、依存/cache/画像除外を検証する。これらは実Supabase、実ブラウザー、実機、実広告の証拠ではない。既知browser/listen/MachPort/blocked-clientおよびinitdb shared-memory拒否を別経路で迂回しない。SQL専用試験のskipを成功扱いしない。

`supabase/migrations/20261021121542_jigsaw_publication.sql` の承認mapは空のまま。4制約の正確な定義を独立レビューする前に `jigsaw_constraint_review_required` で停止する。guardを外して適用する候補ではない。

## 本番公開の最小blocking項目

1. **同意対象の正式文書が未確定。** 現行sourceで正式な利用規約URL/本文を確認できず、現行プライバシーの2026-10-02本文は旧画像/地図投稿を中心とする。追加の投稿前同意UI・サーバー版検証は未実装。存在しない規約や草案へ同意した扱いにしない。`posting-policy-review-20261021.md` に不足と草案を分離した。本番公開前の必須要件。
2. 許可された非本番DB/browserで実schema/RLS/Storage/Gateway、複数所有者、ゲスト→登録/既存所有者移管、公開/非公開/削除/通報、音源Range、実IndexedDB/keyboard/320/390/PCを確認する必要がある。既知拒否を回避する目的の別routeは使わない。新環境/契約/credentialsを勝手に作らない。
3. project `kyyiuakrqomzlikfaire` の現在の匿名Auth/manual linking/メール確認・provider/Google redirect値は未確認。設定読取の専用ツールがなく、同条件で失敗済みの操作は繰り返していない。現在値を確認する権限・手段が必要。

## 内容を特定して確認すべき本番変更（未承認・未適用）

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
