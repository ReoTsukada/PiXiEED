# GAME-350 iGAME Player / 外部ビルド境界

## 目的

iGAMEには、次の2つを混ぜない。

1. **PiXiEED内のPlayer** — 購入またはローカルプレビューでゲームを遊ぶ再生専用面
2. **外部ビルド** — Android APK/AAB、iOS IPA、デスクトップ等をPiXiEEDの外へ出す処理

PXDプロジェクトの保存と、PiXiEED内でのPlayは外部ビルド課金の対象ではない。外部ビルドだけが、Registry認証・対象Revision固定・課金済みBuild権限・サーバーBuildを必要とする。

## Playerの権限

`src/game/game-350/igame-player-contract.ts` の `IGamePlayerManifest` は、再生時の固定境界を表す。

- `productId / projectId / revisionId / ownerId / tenantId` を固定する
- Game・Draw・Audioの編集権限は `NONE`
- 参照アセットの権限は `READ_ONLY`
- ローカルプレビューは `LOCAL_PREVIEW` のManifestだけを開く
- Registry商品は、`game.play` のサーバー発行 `AuthorizationProofV1` がない場合に安全停止する

Playerは実行状態を更新するだけで、Gameの編集履歴・Draw素材・Audio素材を変更しない。

## 外部ビルドの課金ゲート

`admitIGameExternalBuild()` はAPK/AAB等を生成する関数ではなく、サーバーBuildへ渡してよいかを判定する受付境界である。

受付には次の全てが必要。

- `game-build.external` feature flagが有効で、kill switchがOFF
- Registry由来のProduct Manifest
- Product / Project / Revision / Owner / Tenant / Packageの一致
- `game.build.external` capabilityに対するサーバー発行Proof
- Proofの `grantId` が存在すること（課金済みBuild権限）
- Android APK/AAB等の明示されたBuild target

判定が通っても `artifactMaterialized: false` であり、APK/AABはまだ存在しない。サーバー側のBuild workerが同じRevision・Owner・Tenant・Entitlementを再検証し、署名・AAB/APK生成・配布を行う。

## 現在の実装範囲

- `pixiedraw2/igame-player.html` は編集UIを持たないPlayer Hostである。`?product=<Market Asset ID>` では、Server Bootstrapから取得した公開PXDをCanvas Runtimeへ渡す
- `/igame/?product=<Market Asset ID>` は公開Playerの正規入口で、Market Entitlement、immutable Revision、署名URL、Package Hashを同一経路で検証する
- `?source=registry` による外部注入は従来どおりProofがない場合に安全停止し、公開Playerは外部注入ではなくServer Bootstrapを使う
- PXD保存・PiXiEED内Playはこの外部ビルドゲートでブロックしない
- SupabaseへのMigration／Edge Function適用、Market実データ、Android/iOS Build worker、署名鍵、実機インストール、正式配布は未接続（UNTESTED）

したがって、ローカルで確認できるのは「公開PlayerのBootstrap契約、PXD Hash検証、Canvas Runtime、課金済みサーバーProofがない外部ビルドの拒否」である。実際の公開Gameを本番で再生するには、対象Supabaseへの適用と実データ縦断確認が必要で、Android等の販売・配布には別途Checkout → Entitlement → Build → Artifact Deliveryを接続する。
