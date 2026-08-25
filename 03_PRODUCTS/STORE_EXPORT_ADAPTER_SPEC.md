---
document_id: PIXIEED-STORE-EXPORT-ADAPTERS-001
status: CANONICAL
version: 1.9.0
verified_at: 2026-08-10
---

# ストア提出・Export Adapter仕様 {#store-export-adapter}

## 基本契約と価格

`PXD Project / Release Revision → Adapter選択 → 情報入力 → 検証 → 提出Package生成 → 利用者本人の外部アカウントから提出` の順とする。PiXiEEDは外部審査通過を保証しない。

初期価格は提出先Adapterごとに500円の買い切り、license scopeはuser accountとする。Google Play、Apple、Steam、Microsoft、Epic、itch.io、BOOTH、Unity、Godot、Unreal等を対象候補とし、Web/PWAは普及のため無料候補。価格変更は可能だが、購入済み買い切り権を後から失効させない。

## Adapterの範囲

含めるものは対象形式変換、App/Package ID、Version/Build Number、Orientation/Device、Permission/Capability、Icon/Splash/Store image、Description/Update template、Privacy/Data Safety補助、Dependency検証、File/Folder生成、Pre-submit check、Error diagnosis、再出力、Update Build、提出ガイド、要件更新。

含めないものは外部Developer登録料・販売手数料、審査・通過保証、外部アカウント代理、署名証明書、無制限Cloud Build、法律/税務/Privacy専門家保証、外部規約責任、人手申請代行。購入・出力画面で明示する。

## 提出先

### Google Play

Android App Bundle、App ID、Version Code/Name、Orientation、Manifest、Permissions、Adaptive Icon、Splash、API/Device、Listing画像、Data Safety、Signing設定、Release Notes、Checklistを生成候補とし、本人のPlay Consoleから提出する。

### Apple App Store

Xcode Projectまたは安全なBuild入力Package、Bundle ID、Version/Build、iPhone/iPad、Icon、Launch Screen、Store image、Privacy Manifest補助、Capability、TestFlight/App Store Checklist、Signing手順を生成する。Apple認証情報・証明書・秘密鍵は本人管理を基本とする。

### Steamとその他

SteamはWindows/macOS/Linux構成、Depot、Launch、Store image、Cloud、Achievement/Overlay、Controller/Steam Deck確認を扱う。その他は独立Adapterとして、Web/PWA、Google、Apple、Steam、Microsoft、Epic、itch.io、BOOTH、Unity、Godot、Unreal等へ分ける。提出先要件の更新でPXDやProject本体を変更せず、Adapterだけ更新できる。

## App Template、Build、Secret

作品ギャラリー、画集、動く壁紙、時計、音楽Player、Soundboard、図鑑、Novel、Portfolio等のApplication Templateは別買い切り商品候補（初期候補500円）。PiXiGame完成品はTemplateなしでAdapterからBuildできる。

Adapter買い切り後のLocal Buildは原則追加従量課金なし。ただし外部SDK、Xcode、OS、Certificateは利用者が準備する。Cloud BuildはAdapter価格と分離し、候補価格は別途正式検証する。入力エラーは事前診断、PiXiEED障害は消費しない/返還、同一Operation IDを二重請求せず、Build Logを提供し、期限後に一時データを削除する。

外部Store Passwordを保存せず、秘密鍵・証明書を平文保存しない。Android keyを本人同意なく変更せず、一時Secretは暗号化・使用後破棄、Workerを通常Web Runtimeから分離、Log/Analytics/Error ReportへSecretを出さず、PiXiEEDが外部Store所有権を持たない。

## Submission ReleaseとPXD

外部提出に使った内容は不変Releaseとして `source Project Revision、Adapter ID/Version、Runtime Version、Build Configuration、Dependency Lock、Package Hash、Store Metadata Snapshot、Signing Metadata Reference、generated_at、submission status` を記録する。後続編集で提出済みReleaseを黙って変更せず、更新は新Project Revision→新Release→Version/Build更新とする。

`.pxd`は編集可能な正本・持ち運びPackage、AAB/Xcode/Platform Buildは提出・配布成果物であり、出力成果物をPXDへ改名しない。AdapterはPXD/Cloud Projectの選択Revisionから再現可能なPackageを生成する。

購入権はAccount Entitlementへ記録し、複数端末で再購入させず、Version更新で失効させない。別製品級の追加機能は別商品化可能。返金、Chargeback、不正購入を反映し、登録料・Cloud Build従量費と混同しない。

## UI、収益、完了条件

購入前に生成物、外部Account、別費用、審査非保証、Local/Cloud差、OS/SDK、更新方針を表示する。UIはWeb/PWA無料候補、各Adapter500円買い切り、購入済みなら `[設定して出力]`、未購入なら内容確認を経た購入表示とする。

単なる変換料ではなく、完成・公開・販売・配布の障壁を下げ、制作面の広告依存より利用者の成功を優先する。

- 500円範囲、外部費用、審査非保証を明示できる。
- 同じAdapterを再購入させず、PXD Revisionから再現可能なHash固定Releaseを作れる。
- Adapter更新がPXD本体を壊さず、秘密・署名を安全に扱える。
- PiXiEED障害の返還、再試行の二重請求防止、Local/Cloud選択が機能する。
- 提出済みReleaseを不変に保ち、更新を新Releaseにできる。
- Adapter購入がDraw/Audio/Gameの制作性能を低下させない。
