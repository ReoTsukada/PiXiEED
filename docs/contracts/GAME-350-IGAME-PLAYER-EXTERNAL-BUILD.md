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

- `pixiedraw2/igame-player.html` は編集UIを持たないローカルPlayerである
- `?source=registry` はProof未接続のため安全停止する
- PXD保存・PiXiEED内Playはこの外部ビルドゲートでブロックしない
- 本番Registry/Auth/課金プロバイダ、Android/iOS Build worker、署名鍵、実機インストール、正式配布は未接続（UNTESTED）

したがって、現在確認できるのは「課金済みサーバーProofがない外部ビルドを拒否する契約」と「PiXiEED内の編集不可Player」のローカル動作までである。実際にAndroidビルドを販売・配布可能にするには、別途サーバー側のCheckout → Entitlement → Build → Artifact Deliveryを接続する。
