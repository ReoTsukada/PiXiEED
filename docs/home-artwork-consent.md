# ホーム掲載の同意と運営確認

この変更は未公開の実装です。本番 migration・Edge deploy・同意取得・作品審査は未実施です。

## 掲載条件

マイページはログインアカウントと端末ゲストの所有者ごとに独立したチェックを表示します。全員初期OFFです。ONは過去・今後の公開投稿、作品名と作者名のホーム表示を許可します。既存の投稿規約同意やチャットでの個別作品許可を、この所有者全体の同意に読み替えません。

公開readerは published・非削除・公開map行・正しいPNG公開path・有効な所有者同意・独立した運営審査を全てJOINします。審査時の画像hash/bytes/path・作品名・作者名が現在値と完全一致しないものは除外します。最大256 KiB、静止PNGだけ。既存の自動approveは運営審査として使用しません。

運営確認は管理室の専用パネルから行います。画像・表示名・作品名・権利と内容を確認し、1作品ずつ承認または見送りを選びます。画像の読込成功と確認項目が揃うまで承認できません。サーバーでも現在の画像サイズ・ハッシュ・静止PNG構造を検査し、書き込み直前の同意と投稿状態を照合します。未確認は常に非表示。既存3作品にも自動seedを行いません。サービスキーは公開クライアントへ渡しません。手順と中断時の扱いは `home-artwork-operations.md` を参照してください。

ゲスト取り込みは設定をコピーしません。取り込まれた作品は、取り込み後の新所有者の明示的な再同意が必要です。チェックを外して保存すると全作品を除外します。既に閲覧者へ渡った画像自体を回収するものではなく、次回reader取得から除外されます。

## API

- GET `/functions/v1/home-artworks`: 匿名、no-store、`{ok:true,artworks:[{id:'map:UUID',title,authorName,imagePath,imageBytes,imageSha256,publishedAt}]}`、全適格作品からランダムに最大24件。imagePathはpost-public bucket相対path。API失敗は503と空配列であり、静的作品へfallbackしません。
- GET `/functions/v1/home-artwork-preference`: Bearer必須。`{ok:true,preference:{enabled,consentVersion:'home-artwork-v1',revision,needsReconfirmation}}`。
- POST 同上: `{enabled,consentVersion:'home-artwork-v1',revision}`。ID入力不可。Auth.getUserで検証した本人だけ更新。revision競合は409、画面で再読込。設定GET/POSTともno-store。

- GET `/functions/v1/home-artwork-review`: 既存管理者のBearer必須。stateとkeyset cursorで対象を最大24件ずつ取得する。公開項目とreviewState/snapshotToken/eligibleを返す。対象外の既存確認は取消専用で、以前の確認タイトル・作者名は返すが画像path/bytes/hash/公開日時は返さない。
- POST 同上: 作品ID・approve/hold・snapshotTokenを送る。approveには静止画像・権利・内容の3確認が必要。運営実施者と時刻は非公開監査に保存し、一般ユーザーへ返さない。競合は409、画像検査失敗は承認しない。

## 公開順序と影響

1. ステージングで既存の全migrationを適用したDBに新migrationを適用して検証する。2本のmigrationで同意・確認・監査の3テーブルとservice-only関数6本を追加し、確認表にはrevisionと実施者列を設ける。既存の投稿や同意設定を自動で変更しない。RLS有効、anon/authenticatedへのtable/RPC権限を全て取消、service_roleだけ使用する。
2. 設定Edge・公開reader Edge・管理者確認Edgeの3本を配備する。必須SUPABASE_URLと既存方式のpublic/service keysをサーバー環境から取得する。verify_jwt=falseは内部getUser検証の代用ではない。
3. ステージングで未認証、非管理者、ゲスト、user_metadataによる権限偽装、古いrevision/snapshot、claim、OFF、削除、確認取消、改変hash/name、APNG、不明な保存結果、管理者ログアウト後の遅延応答を確認する。
4. フロントを配備する。全員OFF・未審査の初期状態では候補0件が正常。本人による設定ONと運営審査の両方が揃った作品だけ掲載される。
5. ロールバック時は公開readerを停止するか審査approvedをOFFにする。読めない場合に固定画像へ戻さない。保存済み同意を削除する必要はない。

## ローカル検証

`node --test tests/home/home-consent-api.test.mjs` と `deno test --allow-env --node-modules-dir=auto tests/home/home-consent-edge.test.ts`。
`tests/home/home-consent.sql` は隔離した空のPostgreSQL専用fixtureです。最小の既存schemaを作成し、新migrationの実際のSQL、RLS/grants、掲載判定、撤回、claimを検証してROLLBACKします。本番や既存DBでは実行しないでください。既存全migrationとの統合試験と実ブラウザーの認証操作は別途必要です。
