# PiXiEED MCP 接続

ユーザー自身のChatGPTがピクセルの配色と配置を作り、PiXiEEDが形式を検査して編集用リンクを返します。生成API、GPU、クラウド保存を使わず、Cloudflare Workers Freeの範囲で運用する構成です。無料枠を超えたら連携を停止し、有料契約へ自動で切り替えません。

## 対応範囲

接続名はPiXiEEDです。サイト共通のツール案内を提供し、初版の制作操作はDrawへの新規画像の取り込みに限定します。

| ツール | 既存の関係 | MCP初版 |
| --- | --- | --- |
| Draw | Camera・Audioと作品のキャンバスを共有 | AIが設計した画像を検査し、プレビュー用リンクを返す |
| Camera | 写真のドット絵化、Drawへの取り込み | 用途・入口・関連ツールの案内 |
| Audio | 共有作品の音楽レイヤーを編集 | 用途・入口・関連ツールの案内 |
| 変換・書き出し | 画像・音声などの形式変換 | 用途・入口・関連ツールの案内 |
| ジグソー・間違い探し・もの探し | 画像を素材として問題を制作 | 用途・入口・関連ツールの案内 |

根拠となる既存実装は `js/tool-start-routes.mjs`、`js/creation/creation-runtime.mjs`、`js/creation/pxd-project.mjs`、`js/creation/tool-project-store.mjs` です。SNS・地図への投稿、撮影、位置情報、既存作品の読み取り・上書き・削除はMCPに公開しません。作品を端末内で開いた後は既存の編集・保存・ツール間連携を利用します。

## データの流れ

1. ChatGPTが `prepare_pixel_art` に作品名、寸法、パレット、行ごとの画素を渡します。
2. MCPが最大64×64ピクセル、32色、色参照、行数・行幅を検査します。自由文からの画像生成API呼び出しは行いません。
3. 画像データをURLのfragmentに入れた `/ai/#art=…` リンクを返します。MCP上に作品を保存しません。
4. 利用者がリンクを開くと、ブラウザが同じ検査をしてプレビューを表示します。fragmentは履歴から外し、タブ内に10分間だけ一時保持して再読み込みに備えます。元リンクを知る人はその画像を読み取れるため、共有時に留意してください。
5. 利用者が「Drawで編集する」を押したときだけ、既存のPXD保存処理で新しい作品を端末に保存します。保存成功後、作品IDと保存版ID、`workspace=1` を付けてDrawの編集画面を開きます。

URL経由で実行コード、任意の保存先、既存作品IDは受け付けません。最大サイズのリンクがChatGPT上で欠けずに扱えるか、生成品質、実際のChatGPTからのツール実行は初回接続の共有同意後に受け入れ確認が必要です。URL以外に、受取ページにはJSON読み込みを用意します。

## ローカル確認

Node.js 22以上とリポジトリに既存の検証環境を使います。新しい実行時依存はありません。

```sh
node --test tests/mcp/*.test.mjs
node scripts/mcp/dev-server.mjs
```

MCPのローカルURLは `http://127.0.0.1:4199/mcp` です。ローカルサーバーは外部インターフェースへ公開しません。返すプレビューURLは既定で `http://127.0.0.1:4198/ai/` を指します（変更時は `SITE_ORIGIN` を指定）。別のターミナルでサイトのローカルサーバーを起動できます。

```sh
node scripts/tool-runtime-local-server.mjs
node scripts/mcp/browser-harness.mjs
```

ブラウザ検証ではネットワークをローカルに限定し、使い捨てのブラウザ保存領域を使います。既存ユーザーの作品には触れません。MCPは単一JSON-RPCメッセージを受けるstateless HTTP方式です。バッチ、SSE通知ストリーム、サーバーからAIへの追加要求は提供しません。

## 公開・運用

PiXiEEDは画像を生成・保存せず、ChatGPTが作成した画素データを検査してリンクを返します。WorkerとPagesは別の公開工程です。

1. 公開先アカウントの **Workers Free** をCloudflare画面で確認します。今回の公開時にFreeプラン（$0）を確認しました。有料プラン上で個別Workerだけ無料になる前提にはしません。
2. `wrangler.jsonc` に保存・AI・課金サービスのbindingを追加せず、観測ログも無効にします。`SITE_ORIGIN` は公開サイトのoriginに限定します。
3. Workerの公開URLは `https://pixieed-mcp.rgaydm03.workers.dev/mcp` です。公開環境でhealth、初期化、2つのツール一覧を確認し、Cloudflareのbindingsとlogs/traces/issuesは無効でした。
4. `/ai/` と共通モジュールはGitHub Pagesのサイトビルドで公開します。Workerのソースは `scripts/` 配下にあり、静的サイトには含めません。接続先URLは `js/mcp/connection-config.mjs` に設定します。
5. ChatGPTでPiXiEEDのカスタムMCPサーバーを作成し、初回接続の同意画面まで進めました。初回接続では関連するチャット・メモリを共有する同意が必要です。本人同意後、ChatGPTからツールを認識・実行してプレビューとDraw取り込みを確認します。2つのツールは直接HTTPのMCP `tools/list` で確認済みですが、GPTからの呼び出しは未確認です。接続手順は [`/ai/`](https://pixieed.jp/ai/) にあります。

Workers Freeにはアカウント合計で1日10万リクエスト、1呼び出しCPU時間10msの制限があります。超過時はエラー停止となります。1回の画像生成は複数リクエストになり得ます。サーバー側で画像を生成・保存せず軽い検査に限定していますが、実WorkerのCPU時間は公開環境で測定します。無料条件が変更された場合は停止または再検討し、費用発生を伴う変更は行いません。

## 参照

- [OpenAI公式 MCPサーバー構築](https://developers.openai.com/plugins/build/mcp-server)
- [MCP Streamable HTTP仕様](https://modelcontextprotocol.io/specification/2025-06-18/basic/transports)
- [Cloudflare Workers料金](https://developers.cloudflare.com/workers/platform/pricing/)
- [Cloudflare Workers制限](https://developers.cloudflare.com/workers/platform/limits/)

ChatGPT自体の利用契約・利用上限はユーザー側です。この接続でPiXiEEDのOpenAI APIキーを要求したり、ChatGPTの契約をPiXiEEDへ移したりはしません。

## ローカル検証結果

2026年11月14日に、追加した単体テスト24件と、公開用ファイルに対するChromiumのブラウザ検証を実施しました。検証対象は390pxと1280px幅、画素の一致、プレビュー時の非保存、重複適用の抑止、DrawでのUndo・Redoと保存後の再読み込み、不正データ、保存失敗、文字としてのタイトル表示、PNG書き出し、一時データの期限です。

WorkerのローカルHTTP接続で初期化・ツール一覧・画像リンクを確認しました。公開用ビルドも成功し、受取ページの配信ファイルにWorker本体や広告・計測用の読込が混入しないことを確認しています。Cloudflare本番Workerのhealth・初期化・ツール一覧・入力上限も確認済みです。ChatGPTではカスタムサーバーの作成と初回同意画面まで進みましたが、本人同意とChatGPTからのツール実行は未確認です。実機Safariと生成品質も未確認です。
