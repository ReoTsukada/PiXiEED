# WP-094 Package Registry Core

## Supplemental failure-coverage audit

WP-094の補足監査では、必須Asset/Revision、権限、Trash/Quarantine、Hash/Manifest、循環・再帰、
ZIP Slip、外部URL、Blob混入、取消・Crash・Storage失敗、THIN依存欠落、重複Materialize、
Feature Flag/Kill Switch、Market/権利データ混入を29件のfail-closed Fixtureへ分類した。
Coverageの機械可読な対応表は
`docs/inventory/wp094-failure-coverage-matrix.json` に固定している。

補足監査の基準結果は、既存Baseline Failure Identity 14/14一致、新規Failure Identity 0件、
現在Route・PXD・PiXiSYNC・Market・本番Database/Storageへの変更なしである。

## Status

2026-08-07に隔離された純粋Core契約として完了。WP-000〜WP-093を再実行せず、既存dirty
worktree、現行Route、現行PiXiEEDraw、PXD、PiXiSYNC、Market、SNS、Project/Asset dataを変更していない。

## Canonical contract

- Package RegistryはProject/Asset/Revision参照をManifest、Dependency Lock、検証済みArtifact
  Metadataへ材料化する。Raw Blobは受け取らず、Opaque Handle、Hash、Size、Locatorだけを扱う。
- Package Kind（保存形式）とMarketの商品分類（素材/完成系）を分離する。
- `THIN`は参照型、`PORTABLE`は埋込み権限が確認されたImmutable Blobだけを含める。
- Package内の依存は exact Revision/Hash/SizeをPINNED Lockへ固定する。LIVEはProject-timeだけである。
- `READY`はHash、Manifest、Lock、Artifact参照が不変。変更は新Package Version、廃止はARCHIVED。
- 不明Kind/Version、権限不足、Missing/Quarantine/Trash、Hash/MIME/Manifest不一致、Cycle、
  Security violationはfail closedする。

## Materialization result

AssemblerとStorageは注入Adapterであり、Coreは次のMetadataだけで最終検証する。

`contentHash`, `manifestHash`, `byteLength`, `uncompressedByteLength`, `fileCount`,
`storageLocator`, `verified`, `deduplicatedContentHashes`

Main ThreadでPackage全体をBufferせず、Streaming/Worker契約を使用する。Cancellation、Crash、
Upload失敗時はRegistryへCommitしない。Idempotency Key再送は同じ結果を返し、異なる内容の再利用は
Conflictとする。

## Compatibility

現行PXDはLegacy Adapter境界で読み込み、元データを保持する。新Integrated PiXiPackageのExportで
非対応のAudio/Game/Video/Input/License/Dependencyを黙って削除しない。Market projectionは
Package参照だけを渡し、購入・課金・権利・Royalty台帳は既存境界に残す。

## Verification

- 9 Package Kinds、THIN/PORTABLE、6 Lifecycle、4 Reference Policy、6 Eventを確認。
- Draw raster、Animation、BGM、SFX、Game Scene/UI、Sandboxed Scriptを含むSynthetic Game Package。
- Manifest/Lock/Hash/MIME/Size/Locator、Permission、Idempotency、Dedup、Archiveを確認。
- Unsupported Kind、Unknown Field、Client Permission、Cycle、Unauthorized Portable、Missing/Hash/
  Size/MIME、Manifest Tamper、Unsafe Locator、Raw Assembly、Cancellation、Active Content、Nested
  Unauthorized、Trashed/Quarantined Asset、Legacy Flag Offを失敗Fixtureとして確認。
- Blob payload transferは0件。Package Registry moduleはDOM/Canvas/Browser Storage/Networkへ依存しない。

## Related files

- `02_ARCHITECTURE/PACKAGE_REGISTRY_CORE.md`
- `02_ARCHITECTURE/INTEGRATED_PACKAGE_FORMAT.md`
- `02_ARCHITECTURE/OFFICIAL_PACKAGE_FORMAT.md`
- `core-shell/assets/core-package-registry-contracts.js`
- `core-shell/schemas/package-registry-v1.schema.json`
- `core-shell/fixtures/package-registry-v1.valid.json`
- `scripts/test-core-package-registry-wp094.mjs`
- `docs/decisions/ADR-20260807-WP094-package-registry.md`
- `docs/inventory/wp094-package-registry-boundary.json`
