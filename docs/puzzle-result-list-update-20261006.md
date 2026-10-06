# ゲーム結果から一覧へ戻る・プレイ初期化（2026-10-06）

最新の依頼に従い、間違い探し/もの探しの結果から「もう一度遊ぶ」「ゲームに戻る」を除き、「共有する」と「問題一覧に戻る」に整理した。端末内の制作試遊は共有しないので一覧リンクだけとなる。この記録が前段の制作/プレイ整理記録の再挑戦仕様を更新する。ローカル実装・検証までで、Gitのコミット/プッシュ、デプロイ、実ユーザー作品の公開や送信は実施していない。

## 結果の一覧リンク

- 間違い探し：`/play/spot-difference/`、もの探し：`/play/hidden-object/`。公開問題、一覧経由、直リンク、制作プレビュー、端末内下書きの結果も、それぞれのゲームの問題一覧へ進む。browser.backに依存しない。
- 親担当が追加した共通Result APIの `returnHref` と `onReturn` を利用する。結果の実リンク、Enter、中央ナビ、Escapeは明示的な一覧戻りとして動作し、内部 `close()` は遷移しない。修飾クリックはhrefの標準動作を保つ。
- Web Share成功・キャンセル・非対応時のコピー、Clipboard拒否時の手動URL選択を維持。これら共有操作で結果/進行は維持され、一覧へ勝手に遷移しない。実OS共有は試さず合成APIで検証した。

## 間違い探し・もの探しの新規プレイ

`start(puzzle)` の既存の発見/進捗/位置/画像比較状態リセットに加え、毎回のrun IDを発行する。ヒントは端末の使用歴を読まず、同一ページ内でも新しいrunの使用状態へ切り替える。正解定義や作品、設定は削除しない。古い非同期画像読み込みが新しい問題へ上書きしないようrunと選択問題を確認する。

親担当のArcade修正により、この2ゲームだけタイマーをメモリで管理し、時間をlocalStorageから復元せず、永続化のlistener/intervalも作らない。新規プレイイベントは進捗が新しい状態へ同期された後に発火し、時間・旧クリアの内部状態を初期化する。この2ゲームに保存スコアの機構はない。ジグソーなど他ツールの保存時間/再開状態は変更しない。

BFCacheへ入るpagehideではローカル画像のblobURLを保持し、予約した結果/ヒント/サイズ更新を解除する。`pageshow.persisted` では寸法監視を再接続し、選択中の問題を新しいプレイとして開始する。履歴のpopstateも公開/端末内の直リンクを一覧へ誤転送せず再初期化する。

WebKitのResizeObserver通知エラーを統合試験で再現した。個別のプレイ面2つではなく、寸法を決める共通画像コンテナを1つ監視し、contentRectで読み、描画は次のrAFへまとめる。結果表示中/ゲーム非表示時は描画しない。補正後の共通WebKit実フローは25/25 PASS、pageerror 0。

## ジグソー

結果は `/jigsaw/` の実リンク「問題一覧に戻る」へ統一。通常操作ではページ内の絵/問題選択へ戻り、ゲームとPXDのdirty状態を保持する。入口の「直前のパズルを開く」から同じ未保存配置へ戻れる。一覧移動は画像・配置を保存/破棄せず、新しいシャッフルも行わない。修飾クリックで新規タブを開いた場合も元タブを保つ。

上部のヒント・回転・トレー戻しをアイコン化。完成図窓は結果の表示前と一覧へ戻る際に閉じる。ヘッダー移動後の空操作行と重複HUD/旧お祝いを外し、盤面へ高さを戻した。横向きは右トレー列を維持して旧named gridの空tools行だけを除く。844×390で盤面が旧干渉の48pxから263.6pxへ広がった。320では344px、390では620px、PCでは576pxを確保。

未保存保持の実保存検証で既存の `PXD_PROJECT_INVALID` を再現した。`getProject` が非同期 `putPxdSharedImage` のPromiseを次のPXD処理へ渡していたため、awaitを1行追加。保持した同じゲームID/グループを実際に保存できることを4画面で確認した。

## 検証・画像

全試験は生成した画像/合成公開問題を新規コンテキストで使用し、外部通信を遮断または合成応答へ置換した。既存ブラウザーの未保存作品・タブ・実ユーザーの保存領域を操作していない。

- `scripts/puzzle-player-layout-browser-harness.mjs`：Chromium、2ゲーム×320×568 / 390×844 / 844×390 / 1280×800、8条件PASS。共有4経路、共有後の進捗維持、実hrefとクリック/Enter/Escape/中央ナビから一覧への移動を検証。
- `scripts/puzzle-fresh-play-browser-harness.mjs`：Chromium/WebKit、各8条件、計16条件PASS。同問題再開始、再読込、別問題、一覧から選択、合成persisted未完了/結果復元、実goBack/goForwardを検証。発見数・対象の発見状態・ヒント使用・時間00:00・旧結果/旧クリア不在を確認。両エンジンの実履歴操作では `pageshow.persisted=false` だったため、実BFCacheヒットは主張しない。persisted=true経路は合成イベントによる別検証。
- 制作の専用2ハーネス：各4画面、計8条件PASS。間違い探しの端末内試遊で合成BFCache経路後もblob画像を読み込めること、両ゲームの非公開結果に共有がないこと、一覧へ戻っても制作下書き目印を保持することを確認。
- `scripts/jigsaw-result-list-browser-harness.mjs`：4画面PASS。href、各戻り操作、完成図の閉鎖、一覧→直前パズルで同じ未保存ゲームID/完成グループを保持し、その後の保存まで検証。
- 既存ジグソーfeedback：Chromium/WebKit各4、計8条件PASS。実ドラッグ、キャンセル/ピンチ復元、idle、輪郭、操作範囲。
- 関連ジグソー/pixfind/hint単体70/70 PASS。親の最終全単体716/716、共通結果実フローChromium30/30・WebKit25/25、共通一覧リンクAPIブラウザー56項目もPASS。

結果/画像のディレクトリ：

- `/tmp/pixieed-game-results-list-20261006/`：ゲーム結果とプレイ8画面、results.json。
- `/tmp/pixieed-game-fresh-play-20261006/` と `/tmp/pixieed-game-fresh-play-webkit-20261006/`：各8画面初期化、results.json（nativeBackPersistedを記録）。
- `/tmp/pixieed-jigsaw-result-list-20261006/`：jigsaw-{320,390,844,1280}-{play,result,list}.png、results.json。
- 制作ログ `/tmp/pixieed-spot-result-list-20261006.log`・`/tmp/pixieed-hidden-result-list-20261006.log`。その他ログは対応するディレクトリ名の `.log`、既存feedbackは `/tmp/pixieed-jigsaw-feedback-result-list-{chromium,webkit}.log`。

親が保存した現行Library画像：間違い探し844結果 `libfile_8163ba4c177c8191a109d3cff34a6a2d` version 1、ジグソー390結果 `libfile_f2bb9970b5d08191a7095001c4314248` version 0。今回の最終結果画像は同じ仕様のまま。ジグソー横向きプレイは新配置の画像を上記ローカルディレクトリへ準備した。

未検証は物理端末Safari/iOS/Androidの実タッチ/OS共有、実BFCacheヒット、実作品の公開環境。WebKitのネイティブブラウザー操作とOS共有スタブは区別して記録している。

追加のジグソー完成図・難易度・操作メニュー更新は [jigsaw-preview-controls-update-20261006.md](jigsaw-preview-controls-update-20261006.md) を参照。
