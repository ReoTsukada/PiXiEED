---
spec_id: STRATEGY-PIXIEED-GLOBAL-CREATOR-PLATFORM-001
title: PiXiEED Global Creator Platform Product Strategy
status: CANONICAL
classification: PRIVATE_INTERNAL_ONLY
version: 1.0.0
updated: 2026-08-07
---

# PiXiEED Global Creator Platform Product Strategy

## Product decision

PiXiEEDは、既存サイトへ機能を足し続けるだけの計画ではない。**PiXiEED全体を新しい
PiXiEED Coreで接続するGlobal Creator Platformとして再構築する**。Core、Draw2、Audio、
Game/Runtime、Market、SNS/Community、Commission、Subscription、Creator Economyを主軸にし、
作品制作、共有、依頼、販売、購入、権利、収益化を一つのProject/Asset/Revision/Package契約で
接続する。

```text
PiXiEED Core
├─ Project / Asset / Revision / Package / Tool Bridge
├─ Draw2        ─┐
├─ Audio         ├─ Asset Graph + Revision + Event
├─ Game/Runtime ─┘
├─ Market / Purchase / License / Royalty
├─ SNS / Community / Search / Notification
├─ Commission / Subscription / Creator Economy
└─ Account / Permission / Audit / Rollback
```

## Existing product preservation

現行PiXiEEDraw、現行PXD、現行PiXiSYNC、既存Market商品、既存URL、Project、販売・購入・権利・
Royalty・Commissionデータは、置換ゲートが通るまで現行境界として維持する。新Coreは現行実装へ
直接侵入せず、Legacy Adapter、Versioned Tool Bridge、Package/Asset/Project Registryを通じて
互換性を検証する。

PiXiEEDrawは最終的にPiXiEEDraw2へ置き換える。ただしDraw2は別Module/Route/Entryとして作り、
現行Drawの実績あるPXD Reader/Writer、画像処理、Export、テスト、PiXiSYNC契約を選別再利用する。
現行PXDは後から統合形式へ破壊的に変更せず、Integrated PiXiPackageとの間に明示的なAdapterを置く。
既存Market商品は新Package/License/Entitlementへ投影できるようにし、履歴と購入権を作り直さない。

## Tool classification

今後の各Toolは、依存関係、利用者、データ形式、Core Bridge適合性、維持費を監査して次のいずれか
に分類する。

1. Coreへ機能を抽出し、主Toolとして統合する。
2. 新Toolへ移植し、Classicとして互換維持する。
3. Labs/Mini Toolとして隔離し、Core契約に接続する。
4. 依存元、URL、保存形式、利用実績、Rollbackを証明した後にだけ廃止する。

不明な小Toolや古いファイルを、見た目の整理だけで削除しない。WP-005で用途不明の完全重複を
残した判断と同様に、既存URL・動的参照・旧Project互換を優先する。

## Shared data model

各Toolは同じ巨大ファイルを直接書き換えず、CoreのAsset Graphとimmutable Revisionを共有する。

```text
Draw2/Audio/Game edit
→ new Asset Revision
→ Project reference update
→ Core Event
→ Preview/Game/Timeline/Market candidate refresh
```

Project-timeの`LIVE`、承認待ちの`REVIEW`、固定公開の`PINNED`、派生制作の`FORKED`を使い分ける。
公開済み・販売済み・購入済みの内容はPINNED LockとLicense Snapshotで保護する。

BrowserではMemory、IndexedDB、OPFSを性質ごとに使い、Server DatabaseにはAuthority/Metadata/
Permission/Revision/Event/Commerceの参照を置く。大きな画像、音声、Game Build、Packageは
Object Storageへ置き、Package Manifestはその参照とHashだけを持つ。

## Surface roadmap

### Foundation

WP-080のApp Shellは初期OFFで隔離されたFoundationであり、現在の公開Navigationを置換する最終UI
ではない。WP-090〜WP-099でInteraction、Project/Asset/Package/Event/Search/Notification、
Bridge、Routing、Performance gateを確定する。

### Creation

Draw2、PiXiAudio、PiXiGame/RuntimeをCore Asset Graphに接続する。元Assetの編集は所有Toolで行い、
Game側の表示設定とsource Pixel/Audioの変更を分離する。

### Economy and community

Marketでは素材、完成系、Package、License、Purchaseを分離し、直接依頼はCommission、定期課金は
Subscription、売上配分はCreator Economy/Financeの境界へ置く。SNS/Community、Search、Notification
は作品参照と権限を通じて接続し、個人依頼本文、課金情報、権利台帳を共通UI/Eventへ漏らさない。

## Replacement gates

現行RouteまたはCurrent Draw/Marketを置換できるのは、少なくとも次を満たした後とする。

- Legacy PXD/PiXiSYNC/URL/Project/Productの互換Fixtureが通る。
- 新旧Shellを即時に戻せるKill Switch、Rollback、運用Runbookがある。
- Permission/RLS/Entitlement/License/Royalty/Commission境界を監査済み。
- 既存Baseline Failure Identityが一致し、新規回帰が0件。
- Mobile/desktop/accessibility/performance/visual regressionが検証済み。
- 本番Migration、Deploy、Publishは所有者の明示承認後に別作業として実行する。

この文書は、Implementation StateとProgram Decisionが参照する製品戦略の正規文書である。
