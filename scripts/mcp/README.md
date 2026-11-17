# PiXiEED Draw連携とリモートMCP

Draw作業の方法はユーザーとGPTの会話で決めます。固定の制作手順・技法・レビューを要求しません。ガイド、技法、事例、見直し資料は、ユーザーが求めたときや作業上必要なときに参照する任意資料です。

## 入口と機能の境界

- `ai/index.html` は、画素データのプレビューと新しいDraw作品への取り込みを行う受取ページです。
- Draw画面にはGPT連携ボタンがあります。利用者がその場で一時接続を開始した場合に限り、接続した1作品をリモートMCPから直接操作できます。
- MCPには、サイトツール一覧・任意参照資料・prepare_pixel_art・Drawライブ操作を実装しています。ページ/Workerの公開、Cloudflare Durable Objectsのmigration、ChatGPTコネクターのツール更新は別工程です。
- prepare_pixel_art は、渡された画素データを検査し、原寸PNG・比較PNG・preview_only の受取リンクを返します。リンクを開いて新しい作品として取り込むかは利用者が決めます。
- 直接編集は、Drawで接続を開始した1作品だけが対象です。画素・筆線・図形・塗りつぶし・スプレー・セル消去、パレット・色調整、選択変形、キャンバス寸法/倍率、ノーマルマップ生成/設定、文字描画、表示設定、レイヤー・コマ、戻す/やり直す、端末内保存に対応します。公開・クラウド同期・描画以外の全機能を提供するAPIではありません。
- `ai/index.html` の受取プレビューは、新しい作品として取り込む従来機能です。開いている作品のライブ編集とは別の操作です。
- prepare_pixel_artの画素データ契約は1〜64pxの幅・高さ、最大32色と透明です。直接編集にはDrawの実際のサイズ・色数・ロック・履歴の制約を適用します。形式検査の成功は見た目の完成度を意味しません。

## 任意の参考資料

/ai/guide/ と /ai/examples/ はユーザーが必要なときに見る参考ページです。ガイド・技法の参照、初稿との比較、作品の見直しをGPTやユーザーへ必須にしません。

/ai/settings/ は旧URL用の中立的な制作資料案内ページです。Draw・ガイド・制作例へ移動できます。ページから設定の読み書きは行わず、以前端末内に保存されたデータも変更・削除しません。

過去の js/mcp/settings-page.mjs は旧設定ページ用のコードです。旧画面を起動しません。過去の scripts/mcp 内ブラウザー操作ハーネスは現行Draw操作APIではなく、今回の連携確認にも使用しません。

## ケース記録の状態

24件の比較課題のうち、鹿64pxだけがユーザー採用済みです。残る23件は実Draw保存・PXD画素照合・修正前後比較を終えた、ユーザー採用待ちの比較教材です。23件は採用品質例として扱わず、内部判断や比較上の改善を一般的な品質保証へ読み替えません。PXD全画素一致は作品の視覚的な品質やユーザー採用を証明しません。

## MCPツール

- list_pixieed_tools — 公開サイトツールと対応範囲の一覧。
- prepare_pixel_art — 渡された画素の形式検査とプレビュー受取リンクの準備。
- get_pixel_art_guide — 任意の制作参考。
- get_pixel_art_techniques — 任意の条件別技法と比較例。
- get_pixel_art_case — 任意の記録済み事例。
- review_pixel_art — 任意の画素差分と、実際に申告された観察に基づく助言。MCP自体は画像を見て採点しません。
- connect_draw / get_draw_state / edit_draw / save_draw / disconnect_draw — Drawで明示接続した作品の限定ライブ操作。

## 開いているDrawの直接編集

- `connect_draw` — Drawの一度限りの接続コードを交換します。
- `get_draw_state` — 開いている作品の編集版・パレット・レイヤー・コマを読みます。`includePixels:false`で画素配列を省略でき、`region:{x,y,width,height}`で最大65,536画素まで部分取得できます。指定しない画素取得も最大65,536画素です。最大キャンバスは1028×1028pxです。
- `edit_draw` — 現在の `expectedRevision` と一意な `requestId` を指定して編集します。`batch`は最大32操作を1回の履歴更新へまとめ、`$active`はその時点の選択フレーム/レイヤーを参照します。`responseMode:'summary'`は返却結果を小さくします。画素は`pixels.set`で最大512点、`stroke`は最大1024点をまとめて変更できます。選択変形では角度または quarter turn を指定し、必要に応じて3〜256点のpolygonを渡せます。
- `save_draw` — IndexedDBへの書き込み完了を待ち、保存版ID・保存時の編集版・その後の未保存変更を返します。`responseMode:'summary'`で画素配列を省略できます。
- `disconnect_draw` — 一時接続を終了します。

Drawの接続コードは2分、接続自体は15分で期限切れになります。コードは一度だけ交換でき、ブラウザー用とGPT用の資格情報は別です。URLや端末ストレージへ資格情報を保存しません。作品の切り替え、同じ作品の開き直し、ページを離れる操作でも接続を終了します。

最初の状態取得で`capabilities.fastEdits:true`を確認してから、新しいbatch/高速操作を使います。項目がなければDrawタブが古いため、未保存作品を自動再読み込みせずユーザーへ更新を案内します。関連する編集は`batch`にまとめ、適用結果で返ったrevisionを次の操作に使います。成功確認のためだけに状態を毎回読み直す必要はありません。revision conflict時は最新の状態を読み直して編集を組み直してください。`pending`なら同じ引数とrequestIdで同じ編集/保存ツールを再度呼び、キャッシュされた結果を確認できます。`unknown`なら先に状態を読み、適用済みかを確認してください。

手描き途中、変形・プレビュー中、再生中、別の制作モードでは編集を受け付けません。古い編集版の操作は上書きせず拒否します。許可された編集は通常のDraw履歴を使います。`pending` / `unknown` は「未実行」を意味しません。同じ `requestId` で結果を確認し、別IDで無条件に再実行しないでください。

ローカルでは、サイトを `http://127.0.0.1:4289` で起動したうえで次を実行します。

```sh
PORT=4290 SITE_ORIGIN=http://127.0.0.1:4289 node scripts/mcp/dev-server.mjs
```

DrawのローカルURLに `mcpEndpoint=http%3A%2F%2F127.0.0.1%3A4290%2Fmcp` を付けるとローカルMCPを使います。この上書きはループバックのページだけで有効で、同じホスト名に限定します。本番は `js/mcp/connection-config.mjs` の固定接続先を使います。

本番用には `DrawSessionDO` と `DrawAdmissionDO` のSQLite Durable Object binding/migrationがあります。15分の接続時間を上限としてセッションIDを登録し、未登録または期限切れのIDはセッションDOへ到達する前に拒否します。ライブ接続は全体でUTC日あたり20件、同一IPあたりrolling 10分に3件までです（日次枠は日本時間09:00に更新）。接続作成が失敗した場合や応答が失われた場合も枠は返却しません。IPアドレスはサーバー秘密鍵によるHMAC-SHA256の仮名キーに変換してからAdmission DOへ渡し、IP平文はDOに保存しません。`DRAW_ADMISSION_SECRET`（32文字以上）が未設定、binding不備、Cloudflareの接続元IPが得られない場合はライブ接続だけ503で停止し、stateless preview MCPは継続します。Origin検査のみで利用量を制限しているわけではありません。公開前にWorker secret、両DO binding、migration、利用上限を本番環境で確認してください。

ローカルの実動作・テスト・公開後確認は、それぞれのリリース記録で分けて管理してください。テスト通過だけで本番動作やChatGPTコネクター接続を確認したことにはなりません。

## 検証

MCP関連テストは次のコマンドで実行します。

node --test tests/mcp/*.test.mjs

静的ページ、ローカルテスト、ブラウザー操作、本番公開は別々に確認します。ローカル検証を実ChatGPTクライアントや公開環境の確認として扱いません。

## 高速編集の対応範囲（v0.6.0）

- 描画: pixel.set / pixels.set / stroke（ペン・消去）/ shape（線・矩形・楕円）/ spray / fill / cel.clear
- 色: palette.add / palette.replace / color.adjust。通常色とノーマルの方向色は別に保持します。
- 選択範囲: selection.transform（矩形・多角形範囲の移動・コピー・反転・回転・拡大縮小）
- 構成: layer、frameの選択・追加・変更・削除、canvas.resize / canvas.scale
- 文字・凹凸: text.draw / normal.generate / normal.configure
- 表示・履歴: view.configure / undo / redo / save

batchは全ての子操作を検証し、描画内容を1回だけ確定します。save:trueは確定後にブラウザー内保存を行います。保存だけ失敗した場合、描画は適用済みの場合があるためunknown扱いとし、状態を確認して保存のみ再実行します。view.configure/normal.configureは表示設定なのでbatch外で呼びます。これらの設定は描画Undoの対象外です。

任意のDOM操作、OSクリップボード、外部画像の取り込み、投稿や公開、PNG/GIFのダウンロード操作はこのAPIへ含めません。既存のDraw画面で実行できます。多角形の範囲指定・任意角度回転・再現可能なスプレーも対応します。

通信待ちを増やさないため、成功した編集のrevisionを再利用し、通常はresponseMode:summaryにします。最大32操作・リクエスト32KiB・累積処理量の制限はそれぞれ独立して適用されます。500msの接続確認間隔、接続枠、無料枠を守る制限は変更していません。
