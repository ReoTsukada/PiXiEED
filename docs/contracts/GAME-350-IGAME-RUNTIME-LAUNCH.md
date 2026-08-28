# GAME-350 iGAME Runtime Launch Boundary

## 決定事項

iGAMEのPlayerは、次の3段階だけを固定で持つ。

```text
PiXiEED ロゴスプラッシュ → Game設定のスタート画面 → ユーザーGame Runtime
```

PiXiEED側が固定するのは、ブランド表示、Runtimeへの安全な引き渡し、認証・編集権限の境界だけである。

次の要素はPlayer側へ持ち込まない。

- RPG専用のマップ、Player、NPC、カメラ
- 固定キャンバスサイズや固定レイアウト
- 固定の矢印キー、WASD、会話ボタン
- PiXiEED側のHUD、メニュー、ステージ範囲、ゲーム画面説明
- 外部Buildや課金操作の画面

これらはユーザーのGame Project、Runtime Profile、Input Map、UI、Behavior、Build Packageが定義する。

## Runtime package contract

`src/game/game-350/runtime-launch.ts` の `IGamePlayerRuntimeSource` は、認証済みのGame RuntimeがPlayerへ渡す境界である。

- `manifest`: product / project / revision / owner / tenantの固定識別子
- `launch`: タイトル、サブタイトル、開始Scene、開始ボタン文言
- `mount(context)`: ユーザーGameのゲーム画面、入力、HUD、UIをRuntime hostへマウント
- `proof`: Registry商品時のサーバー認証Proof

`mount` は編集権限を持たず、返却できるのはRuntime停止用のdisposeだけである。Draw、Audio、Game Projectの編集はPlayerからできない。

## 現在の接続状態

現在の静的PlayerはRuntime packageが未接続の場合、ロゴ表示後にスタート画面で安全停止する。固定RPG画面へフォールバックしない。

Registry、実際のProject Package、各Runtime Module、Android/iOS/Desktopの生成Buildは別の接続工程である。これらが接続されるまで、Playerは未接続を成功扱いにしない。
