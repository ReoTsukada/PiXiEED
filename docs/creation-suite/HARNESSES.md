# 制作ツール群の検証ハーネス設計

この文書は検証環境の契約。`scripts/creation-suite-harness.mjs` と `tests/creation-suite/` は Step 01 で作成済み。未実装の suite やテストが無い場合は PASS と表示してはいけない。現行の `scripts/globe-harness.mjs` と同様に Node 標準テストを使い、依存追加なしで純粋な判定を検証する。ブラウザー・端末・本番 DB は別ゲートにする。

## 提案する実行面

```text
node scripts/creation-suite-harness.mjs --suite baseline
node scripts/creation-suite-harness.mjs --suite legacy-posts
node scripts/creation-suite-harness.mjs --suite draw
node scripts/creation-suite-harness.mjs --suite audio
node scripts/creation-suite-harness.mjs --suite game
node scripts/creation-suite-harness.mjs --suite jigsaw
node scripts/creation-suite-harness.mjs --suite spot-difference
node scripts/creation-suite-harness.mjs --suite hidden-object
node scripts/creation-suite-harness.mjs --suite puzzle-definition
node scripts/creation-suite-harness.mjs --suite pixfind
node scripts/creation-suite-harness.mjs --suite seo
node scripts/seo-http-harness.mjs
node scripts/creation-suite-harness.mjs --all --json
```

実装時は各 suite が実在するテストファイルを明示し、欠損ファイル・0テスト・skip だけ・失敗を非ゼロ終了にする。`--json` には Git SHA、suite、実行したファイル、実テスト件数、失敗数、fixture の版、`unit/browser/device/liveData/production` ごとの `PASS/FAIL/UNTESTED` と根拠を出す。`UNTESTED` を `PASS` に丸めない。ベースラインは現行画面の主要リンク・公開投稿の読取契約・既存のテストを守るための回帰枠で、新規ツールのテストが通っても既存が壊れたら全体は未合格にする。

## fixture と判定（詳細は各 MD）

| suite | 最小 fixture | 主な合格条件 | 実画面ゲート |
| --- | --- | --- | --- |
| baseline / UX | 実行時5項目ナビと中央操作、地球儀、カメラ/望遠鏡、旧公開 ID と URL | 地球儀が作品の公開先、旧 `/works/` は転送、未完成入口なし | 320/390/768/1280px、短い縦画面、スクロール後の操作 |
| asset-contract | 固定版、派生版、許可の違う所有者、旧投稿 locator | 元作品非破壊、版の固定、未知権限の拒否、遅延読込 | 素材を各ツールへ渡して戻る導線 |
| legacy-posts | SNS画像1・PiXFiND参照6・保存のみ行うMarket参照4、公開/非公開、画像欠損 | 無料画像の二重計上なし、旧問題ID/URL互換、Market有償文脈と権限外編集の維持。位置なし作品を地球儀へ勝手に置かない | 地球儀の位置付き公開投稿と旧問題を読取専用で照合。独立作品一覧と販売・購入導線が公開画面にないことを確認 |
| eligibility | 偽装申告値、手描き/カメラ、旧列欠落、閲覧のみの作品 | ブラウザーと受付側の説明一致、閲覧/改変の分離、旧権限の拒否 | 拒否理由が利用者に理解できるか |
| camera | 手描き投稿、カメラ投稿、異なる縦横比 | 元寸法・出自・画像版と投稿 ID 維持 | 実機撮影、速度と保存品質 |
| draw | 16×16 と 512×512、透明色、連続タッチ、保存途中の更新 | 塗る/戻す/保存/再開と PNG 一致、元作品非破壊 | タッチ・ペン・ズーム・ナビ重なり |
| audio | 少数色、同率色、透明、多色、同一版再生成 | 同じ入力は同じ初期音、音量制限、再開時の音符/拍位置一致 | 再生・停止、モバイルの音声開始制約、遅延 |
| game | 16px キャラ、空背景、壁/収集物/ゴール、途中保存 | 移動/衝突/勝利と固定版参照が決定的 | タッチ/キー操作、端末速度、音との同期 |
| jigsaw | 非正方形、透明、異なる寸法、公開/非公開投稿、端末画像、旧保存版 | ピース再組立てで元画素一致、誤配置は不正解。公開画像は保存データへ複製せず、再開時に元画像を照合 | ピース操作、投稿一覧のページング、画像取得失敗、表示倍率、短い画面 |
| spot-difference | 1px線、離れた点、透明変化、同一絵の固定2版、候補上限 | 変更画素を落とさず、作者が確定した候補だけを正解として保存。未確定は公開不可 | 作者の統合/分割/除外、表示倍率・DPRとタップ位置、短い画面 |
| hidden-object | 1画素対象、離れた複数対象、空/重複/画面外マスク、固定版 | 作者が名前とマスクを指定し、最小画面幅でも押せる正解範囲を保存。未確定は公開不可 | 指/キーでの塗り、画面倍率と当たり判定、短い画面 |
| puzzle-definition | 受付実PNG、Spot差分、Hidden対象、親投稿/公開地図/審査済みパズルのsnapshot | 申告と実画像の一致、親hidden・ID不一致・非公開添付の拒否、公開プレイ応答からprivate列を除外 | 受付→公開読取部品→プレイヤーの契約一致。実DB・Function/RLSの確認とは分ける |
| pixfind | 1px 線、離れた点、透明 RGB、接する差、重複マスク | 作者の確定領域だけを正解、画面倍率で正解がずれない | 作者プレビュー、タップ/キー/ズーム |
| seo | 公開18ページ、内部/旧18ページ、ブランドPNG/ICO、サイトマップ | 最初のHTMLに固有説明・正規URL・OGPがあり、内部画面はheadでnoindex。画像サイズと割当が一致 | PNG復号、SNSカードとホーム画面は本番・実機で別確認 |

## 段階的な証拠

2026-09-28追加: `puzzle-definition` suiteに実PNGの受け渡し/再送契約を追加。`scripts/puzzle-db-harness.mjs --integration` は独立した実PostgreSQLの移行・RLS・旧配置・実handler結合を検査する。`scripts/puzzle-browser-harness.mjs` は投稿失敗後の復元、`scripts/puzzle-public-browser-harness.mjs` は実DB/Functionが返した試験応答による公開プレイと管理者プレビューを検査する。いずれも本番接続・実機検査の代わりにはしない。環境指定・最新件数・再実行手順は [FINAL-VERIFICATION.md](FINAL-VERIFICATION.md)。

1. **純粋関数:** 入力 fixture → 出力の判定、保存形式、非破壊性、権限の拒否を Node で検査。テストが実装をそのまま写しただけにならないよう、手作りの期待画像/領域/音符/操作列を用意する。
2. **ブラウザー:** 実際に提供する HTML を読み、DOM とスクリーンショットでスマホ/デスクトップの主操作・重なり・表示画素を確認。Playwright 等を後から使う場合、既存依存にあるかを確認し、追加は別判断にする。
3. **端末:** カメラ、音声、タッチ/ペン、低性能端末の保存・再開を確認。純粋関数 PASS で代用しない。
4. **実データ:** 投稿 ID、状態別件数、画像到達、旧共有 URL、権限、一覧のページングを読み取り専用で照合。旧行を直す処理は別段階・バックアップ・差分レビュー後。
5. **公開:** URL、権限、モデレーション、既存作品の表示と新ツールの作成→保存→再開→公開を本番と同等の経路で確認。実際の公開・配備はこの設計には含まない。

合否の報告はツールごとに `IMPLEMENTED` / `UNIMPLEMENTED` / `UNTESTED` を分け、変更したファイル、実行コマンド、結果、ブラウザー/端末/本番の未確認点を記録する。修正ごとに全サイトを手動で眺める代わりに影響範囲の suite を走らせ、公開前には baseline と全関連 suite を再実行する。
