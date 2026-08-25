---
spec_id: ARCH-PACKAGE-REGISTRY-CORE-001
title: PiXiEED Package Registry Core
status: NORMATIVE
classification: PRIVATE_INTERNAL_ONLY
version: 1.0.0
updated: 2026-08-07
depends_on:
  - 02_ARCHITECTURE/PROJECT_REGISTRY_CORE.md
  - 02_ARCHITECTURE/ASSET_REGISTRY_CORE.md
  - 02_ARCHITECTURE/INTEGRATED_PACKAGE_FORMAT.md
  - 02_ARCHITECTURE/TOOL_BRIDGE_CORE.md
  - CURRENT_SYSTEM_PRESERVATION_GATE.md
---

# Package Registry Core

WP-094は、Project/Asset/Revisionの参照を、検証済みで再現可能なPackage Metadata、Manifest、
Dependency Lockへ materialize する、未接続のFramework-free Core契約を確定する。現行
PiXiEEDraw、現行PXD、PiXiSYNC、Market、SNS、Auth、Storage、公開Routeへ直接接続しない。

Draw2のユーザー向け原本は、Projectとその参照定義を保持する一つの`.pxd` source container
である。Package RegistryはPXD内部のAsset Definitionを別の原本へ移すのではなく、明示的な
`Asset ID + Revision ID + Hash`の外部参照と、検証済みのmaterialized Packageを管理する。
旧`.pxasset`／`.pxproject`は内部・互換・配布境界で必要な場合に限って materialize され、
Creator Workspaceのユーザーへ個別管理を要求しない。

## 製品戦略との位置付け

PiXiEEDは小さなツール群の追加ではなく、Draw2、Audio、Game/Runtime、Market、SNS/Community、
Commission、Subscription、Creator Economyを含むGlobal Creator Platformへ再構築する。その中心は
共通CoreとProject/Asset/Package/Tool Bridgeであり、個別ToolはこのRegistryを通じて作品と
Revisionを共有する。

既存の小さなToolは、依存関係と利用実績を監査したうえで、Coreへ抽出、Classic/Labs/Mini Tool
として維持、または安全に廃止する。現行DrawとMarketは、互換性、Rollback、データ保全、公開切替
ゲートが通るまでProduction境界として維持する。WP-080のShellは隔離された基盤であり、最終公開UI
への即時切替ではない。

## Package Record

Registryが所有するのはPackageの識別、Version、Lifecycle、Manifest Hash、Artifact Hash、サイズ、
Storage Locator、Dependency Snapshot Hash、License/Provenance参照である。`packageKind`はRegistry
上の保存・材料化種別であり、Marketの`MATERIAL`/`FINISHED_PRODUCT`の販売分類とは別である。

必須のPackage Kindは次の9種とする。

`PROJECT_PACKAGE`, `MATERIAL_PACKAGE`, `FINISHED_PRODUCT_PACKAGE`, `GAME_PACKAGE`,
`AUDIO_PACKAGE`, `DRAW_PACKAGE`, `BACKUP_PACKAGE`, `EXPORT_PACKAGE`, `TEMPLATE_PACKAGE`

未知のKind、未知のSchema、壊れたTyped ID、Hash、Locator、Lifecycleはfail closedする。

Recordの状態は`BUILDING` → `VERIFYING` → `READY`、または`FAILED`/`QUARANTINED`とする。
`READY`の内容Hash、Manifest、Dependency Lock、Artifact参照は不変であり、更新は新しい
`packageVersion`を作成する。廃止は内容変更ではなく`ARCHIVED`へのLifecycle操作とする。

## ManifestとDependency Lock

ManifestにはPackage/Version/Tool/Format/Root Project/Root Asset、含まれるAsset Revision、
Dependency Graph Snapshot、Required/Optional Package依存、Compatibility、License/Provenance、
Hash、Size、Manifest Version、Security、Streaming契約を記録する。

ManifestはIndexであり、raw Pixel/Audio/Game bytes、Base64/Data URL、JWT、Secret、Payment、
Royalty、Commission本文を含めない。大きな実体はAsset RegistryのContent HashとOpaque Handle、
またはObject StorageのArtifactへ分離する。

Package materialization時は、Graph Snapshotに存在する正確な`Asset ID + Revision ID + Hash + Size`
をDependency Lockへ固定する。Project編集中の`LIVE`参照は許可するが、生成済みPackageへLIVEを
持ち越さない。Portableの場合も、埋込み権限を証明できるAssetだけを含め、権限がないものは
失敗させるか明示的な外部依存として残す。

## THINとPORTABLE

```text
THIN
  Manifest + ID/Revision/Hash/Size + Dependency Lock + License/Provenance参照

PORTABLE
  THINの全要素 + 承認済みImmutable Blobの内包または固定されたArtifact参照
```

どちらもManifestとLockが正規であり、単一の巨大な編集ファイルを通常操作の保存先にしない。
編集時はMemory、IndexedDB、OPFS、Server Database、Object Storageの責務分離を維持し、Export/
Backup/販売時に統合Packageを生成する。

## Materialize Pipeline

```text
Graph Snapshot
→ Dependency Resolution
→ Permission / License check
→ exact Revision Lock
→ Blob existence / Hash / Size / MIME verification
→ Manifest creation
→ streamed build
→ Package Hash verification
→ final Manifest / Artifact verification
→ atomic Registry commit
```

各段階で失敗、Cancellation、Crash、Storage Upload failureが起きた場合、Package Recordを
`READY`へ昇格させない。再試行はIdempotency KeyとRequest Fingerprintで重複生成を防ぐ。
Assemblerは実体をCoreへ返さず、Hash、サイズ、File Count、Locator、Verified状態、Dedup Hash
のみを返す。Main ThreadでPackage全体をBufferしないWorker/Streaming境界を契約化する。

## 安全境界

拒否するものはZIP Slip/Path Traversal、絶対Path、External URL、Symlink、MIME Spoof、HTML/SVGの
Active Content、SandboxなしScript、Decompression Bomb、過大File Count/Size、Nested Recursion、
Hash/Manifest Tamper、Missing/Unauthorized/Quarantined/Trashed依存、Circular Dependency、
Unsupported Versionである。PackageをOpenしただけでScript/HTMLを実行しない。

Content HashのDedupは容量効率のための参照共有であり、Package間の閲覧権限やLicense権を共有する
ものではない。

## Legacy PXDとMarket境界

現行PXDは変更しない。Legacy PXD Reader/Adapterが現行情報を新Project/Asset Revisionへコピーし、
元ファイルを保持する。Integrated PiXiPackageから現行PXDへ戻す場合はDrawの対応部分だけをExportし、
Audio/Game/Video/Input/License/Dependencyを暗黙に捨てず、Unsupported Reportを返す。

Marketへ渡すのはPackage ID、Package Version、Package Kind、Manifest、Hash、Size、Compatibility、
License/Provenance参照だけである。価格、購入、Entitlement、Royalty、Payout、Commission本文は
Market/Account/Permissionの契約に残し、Package Registryへ移さない。購入済みPackageはSource Asset
の削除・非公開後も、固定された内包または権限付きDependency Lockで復元可能にする。

## Feature FlagsとEvents

初期値はすべてOFFの次の独立Flagとする。

`package-registry-read`, `package-registry-write`, `package-materialize`, `package-portable`,
`package-legacy-pxd`, `package-storage-upload`

Eventsは`PACKAGE_BUILD_STARTED`, `PACKAGE_MATERIALIZED`, `PACKAGE_VERIFIED`, `PACKAGE_FAILED`,
`PACKAGE_QUARANTINED`, `PACKAGE_ARCHIVED`とする。Event MetadataにもBlob本文、Credentials、
Payment/Royalty/Commission本文を入れない。

## 実装ファイル

- `core-shell/assets/core-package-registry-contracts.js`
- `core-shell/schemas/package-registry-v1.schema.json`
- `core-shell/fixtures/package-registry-v1.valid.json`
- `scripts/test-core-package-registry-wp094.mjs`
