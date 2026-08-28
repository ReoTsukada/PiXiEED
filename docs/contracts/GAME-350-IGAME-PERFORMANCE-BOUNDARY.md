# GAME-350 iGAME Runtime Performance Boundary

## 目的

iGAME は、ゲーム制作画面全体や全SceneをPlay開始時に読み込まず、実行するRuntimeと選択中Sceneに必要なアセットだけを解決する。Draw／iAUDIOのアセットはGameから参照できるが、Game Runtimeから編集しない。

## Profile

| Profile | 判定に使う条件 | Startup | Scene load | First frame | Steady frame | Asset bytes | Decoded bytes | Memory |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 2D Browser | 標準ブラウザ | 1200ms | 800ms | 500ms | 16.67ms | 32MiB | 96MiB | 256MiB |
| 2D Mobile | 幅768px未満、またはタッチ対応かつ幅900px未満 | 1800ms | 1200ms | 800ms | 20ms | 12MiB | 48MiB | 128MiB |

これらは出荷実測値ではなく、計測結果を判定するための初期ガードレールである。計測値が不足している場合は `INCOMPLETE`、いずれかの予算を超えた場合は `OVER_BUDGET` とし、合格扱いにしない。

## 遅延ロード

- `gameAssetRequestsForScene(project, sceneId)` は対象SceneのSprite／Animation／Audio参照だけを返す。
- `loadGameRuntimeSceneAssets(session, sceneId, resolver)` は対象Scene以外のアセットを解決しない。
- 同じRevision／HashのアセットはRuntimeセッション内で再解決しない。
- Dependency SnapshotのRevision／Hash／隔離状態の検証は従来どおりRuntime境界で行う。

## 現在の検証範囲

- Denoの型チェック・ユニットテストでProfile判定、未計測判定、予算超過、Scene遅延ロード、再解決抑制を確認済み。
- ローカルブラウザではPiXiEEDロゴSplash → Start Screen → Runtime未接続時の安全停止を確認済み。
- 実機、公開環境、実プロバイダ、3D／オンライン／ネイティブビルドの性能受入れは未実施。
