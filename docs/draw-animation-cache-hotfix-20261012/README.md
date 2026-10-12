# Drawのアニメーションモジュール読込hotfix

`SyntaxError: Importing binding name 'ensureAnimationMusicLayer' is not found` と同じエラーを、旧HTTPキャッシュと現行Drawの組合せで再現しました。起動時のES moduleリンクが止まるため、パレットが空で静的な下部バーが残りました。これは旧依存との混在を再現した結果で、利用者のブラウザ内キャッシュを直接読み取ったという意味ではありません。

## 原因と変更

`draw-animation-session.mjs?rev=20261011-shared-music-2` が、バージョンなしの `animation-core.mjs` から新しいnamed exportをimportしていました。そのexportが追加される前の応答をHTTPキャッシュに保持すると、現行のimporterと組み合わさってリンクに失敗します。サイトの現在のコードにはservice worker登録処理は見つかりませんでした。

共有コアはmodule-private WeakMap/WeakSetを持ちます。一部のimportだけにqueryを足すと同じ作品を別のコア実体に渡す危険があるため、次の構成にしました。

- `animation-core-v20261012.mjs` は既存実装のバイト単位のコピー。SHA-256は `2a1e6158233a0ab2539dc8de132d5112e179e84aba4fc18eb21a8bf6484d14d3`。アルゴリズムと保存schemaは変更していません。
- `animation-core.mjs` は上の唯一の実体へ再exportする薄い入口です。通常URLとquery付きURLでも同じ関数・WeakMap実体を共有します。
- 共有コアを使用する親モジュールまで、36 JavaScriptファイルと6 HTML入口／preloadの依存URLを `20261012-animation-core-contract-1` にそろえました。HTMLから孫依存まで、古いキャッシュを選ぶ参照を更新しています。
- PXDバックアップのテストはcache revisionの期待文字列だけを更新。直接ダウンロード・出力ページへ移動しない等の動作検査は維持しています。

今後、状態を持つコア実装を更新する場合は新しい実装URLを使い、親importとHTML入口のrevisionも一緒に更新してください。異なるqueryを付けた複数の実装実体を作らないでください。

## 検証

| 検証 | 結果 |
|---|---|
| 全286 Node `.test.mjs` | 1966/1966通過、失敗・skipなし |
| 実HTTPキャッシュの不具合再現 | 旧コアにnamed exportなし、現行旧importerが同じリンクエラー、パレット0件 |
| 修正後の実HTTPキャッシュ | 同じ旧コアを残したまま起動・旧PXD復元・描画・3モード往復・Undo/Redo・保存・再読込が通過 |
| 保存保持 | 旧保存版の読取可、作品ID保持、編集後の画素復元一致。localStorage/IndexedDB消去なし |
| 最終ビルド | 688ファイル、イベント92ページ、共有パズル6ページ。新しい唯一の実装を同梱 |
| ビルド成果物のChromium | 390×844、1280×800、844×390で起動・描画・モード切替・合成作品復元・再読込通過、ページ例外・HTTP失敗0 |
| 独立レビュー | import URL以外の動作変更なし、実装コピー一致、共有実体のidentity確認 |

最終ソース指紋は `fd169aa01bfe4845c40b791dd5abb955e3977765aef2337c305f8189ad6af521`。報告書を除くソースを固定して再検証しました。

再現ハーネスは `scripts/draw-animation-core-cache-browser-harness.mjs`、共有実体・依存URLの回帰検査は `tests/animation/core-module-contract.test.mjs` です。ハーネスはlocalhost限定のHTTPサーバー、隔離browser context、合成作品を使います。Playwright routingを使わずHTTPキャッシュを有効にし、旧コアが実際にキャッシュから返ったことを観測します。外部通信・カメラを遮断し、利用者の保存領域を使用しません。

## 公開と再読み込み

このhotfixはローカル実装・検証済みです。mainへのpushはGitHub Pagesの自動公開を伴い、共有アニメーションを使う描画・音楽・撮影・制作ゲームの依存URLを更新します。実際のcommitと公開結果はGit履歴と対応するGitHub Actionsで確認できます。

公開後はHTMLを再取得するページ再読み込みが必要です。保存データやブラウザの全データを消す方法は使用しません。広告設定・Offerwall・通常の作品構造は変更していません。

報告者のSafari画面・添付はこの報告書や公開repoへ保存していません。実キャッシュ再現はChromiumによるもので、実機Safari／WebKitでの再検証は未完了です。生ログと画面はローカルの検証領域に保持しています。
