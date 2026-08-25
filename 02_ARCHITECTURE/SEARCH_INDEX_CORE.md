---
spec_id: ARCH-SEARCH-INDEX-CORE-001
title: PiXiEED Canonical Search Index Core
status: NORMATIVE
classification: PRIVATE_INTERNAL_ONLY
version: 1.0.0
updated: 2026-08-07
depends_on:
  - 02_ARCHITECTURE/PROJECT_REGISTRY_CORE.md
  - 02_ARCHITECTURE/ASSET_REGISTRY_CORE.md
  - 02_ARCHITECTURE/PACKAGE_REGISTRY_CORE.md
  - 02_ARCHITECTURE/EVENT_ACTIVITY_CORE.md
  - 02_ARCHITECTURE/ACCOUNT_PERMISSION_CORE.md
  - 02_ARCHITECTURE/FEATURE_FLAG_OBSERVABILITY_ROLLBACK_CORE.md
---

# Search Index Core

WP-096は、Project、Asset、Package、CreatorのCanonical StateとWP-095 Eventから、交換可能な
Search Backend向けの小さなDerived Projectionを作る。Search Indexは正本でもAuthorizationの
権威でもない。Indexが消失・破損しても、Canonical Registryと必要なEvent/Snapshotから再構築する。

```text
Canonical Registry / Market / Creator State
              ↓ trusted post-commit Event
       Search Projection Consumer
              ↓
       Scoped Index / Public Discovery Index
              ↓
Search discovery → Server Authorization → Resource Read
```

## Search Document

v1 Documentは`searchDocumentId`と`resourceId`を別の値として持つ。Documentは小さく、参照・
表示・検索・Sort用の値だけを保持する。

- `searchDocumentId`, `documentVersion`, `schemaVersion`
- `resourceType`, `resourceId`, `sourceAggregateVersion`, `sourceEventId`
- `ownerReference`, `creatorReference`, `projectReference`
- `visibilityClass`, `lifecycleState`
- `title`, `summary`（`displayValue`と`normalizedSearchValue`を分離）
- `tags`, `locale`, `facets`, `sortKeys`
- `previewReference`, `createdAt`, `updatedAt`, `indexedAt`

Raw Pixel/Audio/PXD/PiXiPackage/Game Build/Blob、Base64/Data URL、JWT、Secret、Password、Email、
Phone、Address、Payment、Commission本文、Private Chat、Raw Project、Journal、PiXiSYNC Operation、
License/Royalty/Purchase/Entitlement本文は拒否する。Title、Summary、Tag、Facet、Document総量、
Metadata深度には上限を設け、巨大Descriptionを全文コピーしない。

## Resource Catalog

初期Core対象は`PROJECT`、`ASSET`、`PACKAGE`、`CREATOR`。Market Product、Game、Audio、Draw Work、
Collection、Social Post、Community、Board Thread、Commission Requestは予約Catalogとして登録可能だが、
WP-096では未対応・Fail-Closedとする。Catalog追加はVersioned契約とする。

## Event Projection

WP-095のEnvelope検証とServer-trusted Event評価を通過したEventだけを受け付ける。対象Eventは
Project、Asset、PackageのCanonical metadata/reference projectionであり、Event payloadへ巨大な
Resource本文やBlobを渡さない。

- Project Created/Metadata/Visibility/Member/Lifecycle → Project Document
- Asset Created/Revision/Head/Dependency/Lifecycle → Asset Document
- Package Ready → Package Search Candidate（Market Productを生成しない）
- Package Archived/Quarantined/Failed → removeまたはTombstone
- Account/Tool Event → Searchでは無害な非対象Eventとして処理
- Pointer、Pixel、Stroke、Audio Sample、Frame Tick、PiXiSYNC Operation → Event Core以前に拒否

同一Event IDはIdempotentに処理する。Aggregate単位でStale Eventは無視し、Version Gapは保持・
報告してResume/Reindex候補とする。古いEventはTombstoneを復活させない。

## Visibility and Authorization

`PRIVATE`、`PROJECT_MEMBERS`、`CREATOR_PRIVATE`はPublic Discoveryへ入れない。Member/Creator/Owner
Scoped QueryではServer Authorization Evaluatorを必須とし、Client Filterを権限判断に使わない。
`UNLISTED`は明示URL/参照用で、Global Search、Trending、Recommendation、Sitemapへ既定では入れない。
`PUBLIC`だけがDiscovery対象になり得る。

検索結果はRead権を与えない。Exact ID LookupもServer Authorizationを再検証し、Indexにない場合は
Canonical Registryへ安全にFallbackできる。Unauthorizedまたは存在を隠すべきResourceは、Public ID、
Title、Creator関係を推測できる差分を返さない。

Public→Private、Member→Private、Unlisted、Trashed、QuarantinedはPublic IndexからHigh Priorityで
除外する。Resource本体はSearch Coreから削除せず、Search側はPrivate payloadを持たないTombstoneだけを
保持する。Private→Publicは新しいCanonical StateとVersionを確認したEvent後にのみ再投入する。

## Query Contract

QueryはVersioned Typed Queryとして、Text、Resource Types、Locale、Visibility Scope、Owner/Creator/
Project Reference、Tags、Facets、Lifecycle、登録Sort、Stable Cursor、Page Sizeを持つ。Page Size、
Filter数、Sort field、Query長にHard Limitを設ける。Regex、Wildcard、任意SQL、任意Index field、
深いNested Filter、無制限Facetは受け付けない。

Exact ID LookupとHuman Full-text Searchは別Operationとする。Backendへは`literal-token`等のTyped
Search Planだけを渡し、SQL文字列連結をしない。CursorはQuery FingerprintとSort Tupleを含むOpaque
Stable Cursorで、Offsetだけに依存しない。

Japanese、English、Mixed Japanese/English、CJK、Emoji、Accent/Diacritic、Case Foldingを扱う。
BCP-47互換LocaleとUnicode normalizationを使うが、表示文字列は破壊しない。Tokenizer、N-gram、
Morphological Analyzer、External Engineは後続Adapterで交換可能とする。

RankingはText Relevance、Exact/Prefix、Freshness、Creator/Locale/Relevance、Resource Type等の
Canonical Featuresまでとする。Popularity、Revenue、Advertisement、Recommendationは無条件に
Full-text Relevanceへ混ぜず、Sponsored Resultは将来別Projectionにする。

## Rebuild, Queue, and Backend

Full Rebuild、Resource-type Rebuild、Single Resource Reindex、Incremental Event Projection、Resume
Cursorを提供する。RebuildはProjectionだけを再生成し、Email、Notification、Market Publish、Payment、
Webhook等のSide Effectを実行しない。Event QueueはBounded、Batch、Retry、Dead Letter、Gap Resumeを
持ち、Search Consumerの遅延でCanonical Writeを失敗させない。

Backendは`apply`、`query`、`clear`、`snapshot`の交換可能Adapterとし、WP-096はIn-memory Reference
Adapterだけを実装する。Public Discovery IndexとServer-filtered Scoped Indexを分離する。Production
PostgreSQL、Trigram、Dedicated Search Engine、Hosted Searchの選定・接続・Migrationは後続ADRへ延期する。

## Flags and Preservation

次のFlagsはすべて初期OFFで独立させる。

`search-index-read`, `search-index-write`, `search-index-events`, `search-public-discovery`,
`search-member-scope`, `search-rebuild`

Search OFF、Public Discovery OFF、Member Scope OFF、Rebuild OFFでも、Project/Asset/Package本体、
既存URL、PXD、PiXiSYNC、Market、SNS、購入権、License、Royaltyを停止・変更しない。Search Consumer
OFF時もCanonical Eventを破棄しない。Search BackendはCore Shell initial bundle、Editor Main Thread、
Draw2 rendering pathへ接続しない。

## Implementation

- `core-shell/assets/core-search-index-contracts.js`
- `core-shell/schemas/search-index-v1.schema.json`
- `core-shell/fixtures/search-index-v1.valid.json`
- `scripts/test-core-search-index-wp096.mjs`
