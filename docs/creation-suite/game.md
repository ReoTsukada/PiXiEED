# キャラクターからゲーム

## 現状と履歴

現行 `tools/index.html` にゲーム制作アプリはありません。Studio iGAME は ref `905d34b0ae152280c06ae9b94b5e4c26f8fdbdf5`（2026-09-15）に統合エディターとして存在しました。確認できる主要部品は `pixiedraw2/src/game/game-300/core.ts`、`game-350/authoring-model.ts`、`editor-adapter.ts`、`scene-graph.ts`、`runtime-core.ts`、`template-registry.ts`、`playable-slice.ts`、`unity-asset-export.ts` です。`pixiedraw2/tests/game-300..350/`、`docs/contracts/GAME-300-game-project-core.md`、`docs/inventory/game-300..350-evidence.json` と browser audit 資料も残ります。従って「何もなかった」わけではありませんが、一般向け汎用エンジンや現在の公開サービスの証明ではありません。ブラウザー監査JSONも実機や現行mainの検証結果へ読み替えません。

## 最小 UX

1画面に固定の「歩いて集める」テンプレート、キャラクター選択、背景選択、短いルール設定、キャンバス上のプレビュー、プレイ、保存状態を置きます。開始時にテンプレートの初期プロジェクトを複製し、絵や音は固定版を参照します。自由配置や任意スクリプトは初版に設けず、移動速度、集める数、ゴール位置など限られた項目だけを編集します。

## データ境界

ゲームプロジェクトは `gameId/revisionId`、templateId/version、オブジェクト配置、限られたルール設定、固定参照するキャラクター/背景/音の `assetId/revisionId/contentHash`、schemaVersionを保存します。テンプレートを適用するとゲーム所有の値を新規複製します。参照アセットの編集や新しい公開版で既存ゲームが変化しないようrevisionを固定します。オリジナルの絵・音を埋め込んで書き換えず、ゲーム編集を別プロジェクトとして端末内保存します。初版では公開・共有・クラウド同期・Unity出力を含めません。

## 初版と後回し

初版は一つの固定テンプレート、キャラクター/背景の少数選択、歩行・収集・ゴール、プレビュー、保存/再開までです。衝突・移動・勝敗は決定的なローカルruntimeで実行します。汎用スクリプト、物理編集、複数ジャンル、マーケット、マルチプレイ、ユーザーコード実行、Unity書出し/Editor取込、オンライン公開は後回しです。本格版 iGAME の編集画面・保存形式・役割を変えず、簡易ゲームは固定テンプレートの独立した製品とします。

## ハーネス設計

- `template-copy`: 固定 `walk-collect-v1` fixtureと空プロジェクトから適用し、初期オブジェクト/ルールが期待値に一致し、テンプレート原本は変更されないことを確認。未知template/version、壊れたblueprintは失敗する。
- `asset-revision-pinning`: キャラクターfixture revision Aを参照するゲームを作成後、カタログにrevision Bを追加しても、既存ゲームの参照/hashがAのままであることを確認。欠落asset/hash不一致はプレイ前に明示エラーとする。
- `runtime-determinism`: 固定入力列（右へ一定時間、アイテム接触、ゴール）と固定seedのfixtureで毎回同じ位置、収集数、最終状態を得る。無効速度、NaN座標、負カウントを拒む。再起動時に意図しない実行中状態を復元しない。
- `save-resume`: プロジェクトfixtureを保存→ロードし、template/version、設定、配置、asset revisionが一致する。未知schema、途中書き込み、容量不足時に既存保存を壊さず、未保存状態を表示する。
- `boundary-security`: 不明なイベント名、過大なオブジェクト数、壊れた座標、想定外script文字列が入ったfixtureで拒否し、任意コードを実行しない。
- `source-immutability`: ゲーム編集/プレイの前後で参照アセットbytes/hashが不変、ゲームが別ID/版であることを確認。

これらは将来のハーネス設計であり、過去の iGAME テストが新アプリを保証するわけではありません。

## 手動ゲート

スマートフォン320〜390px、タブレット、デスクトップでテンプレート選択、キャラクター変更、プレビュー、プレイ、停止、保存/再開の導線が見切れず届くことを確認します。プレビュー操作とページスクロールが競合しないこと、タップ/キーボード双方で移動できること、停止後にループや音が残らないことを確認します。各端末で同じ固定seed/inputを使い、開始位置・収集・ゴールが一致すること、再読み込み後の保存状態を確認します。ブラウザー履歴や戻る操作で誤って保存を失わないことも試します。

## 状態

- **IMPLEMENTED（履歴）**: Studio iGAME のscene/editor/runtime/template/asset-exportコードと関連テスト・監査資料が ref `905d34b0…` に存在。
- **IMPLEMENTED（現行）**: 公開ツールとしてカメラと望遠鏡がある。
- **UNIMPLEMENTED（現行）**: 公開ゲーム制作、固定テンプレートのこの簡易UX、ローカルゲームの保存/再開。
- **UNTESTED**: 現行ブラウザー/実機/本番での歴史的 iGAME、将来設計のテンプレート・runtime・端末保存。Git上のソース・テスト資料の存在を動作確認と混同しない。
