# WP-096 Search Index Core

## Status

2026-08-07に隔離Pure Coreとして実装・検証済み。WP-000〜WP-095の実装パッケージは再実行せず、
現行Route、PiXiEEDraw、PXD、PiXiSYNC、Market、SNS、既存Project/Asset/Package、商品、購入権、
License、Royalty、本番Database/Storageへ接続していない。

## Contract

- Search Indexは正本・Authorization Authorityではなく、Canonical RegistryとWP-095 Eventから再構築可能なDerived Projection。
- Core対象ResourceはPROJECT、ASSET、PACKAGE、CREATOR。後続Resourceは予約Catalogのみで、未知TypeはFail-Closed。
- Search Document IDとResource IDを分離し、v1 Document、v1 Query、BCP-47 Locale、Unicode-safe normalization、表示値と検索値を分離。
- Public Discovery、Server-filtered Scoped Index、PRIVATE/Member/Creator/Owner Scopeを分離。
- PRIVATE/PROJECT_MEMBERS/CREATOR_PRIVATE/UNLISTEDはPublic Discoveryへ投入しない。検索結果はRead権を付与せず、Exact ID Lookupも再認可する。
- Event ID Idempotency、Aggregate Stale/GAP、Tombstone、Retry/DLQ、Bounded Queue、Batch、Resume Rebuildを実装。
- Full/Resource-type/Single-resource/Incremental/Rebuild Resumeを表現し、Replay/Rebuildに外部Side Effectを許可しない。
- BackendはTyped Search Planを受ける交換可能Adapter。WP-096はIn-memory Referenceのみで、Production検索Backend/Migrationは未実装。
- Market Product/Price/Purchase/Entitlement/Royalty、SNS/DM/Commission、Raw Blob、PXD/PiXiPackage、Journal、PiXiSYNC Operationは検索Documentへ入れない。

## Flags

`search-index-read`、`search-index-write`、`search-index-events`、`search-public-discovery`、
`search-member-scope`、`search-rebuild`を独立させ、初期値をすべてOFFとする。OFF時もCanonical
Writeと既存Routeを停止しない。

## Fixtures and checks

- Public/Private/Member/Unlisted Project
- Asset Head Change without Blob
- PACKAGE_READY candidate without Market Product
- Duplicate/Stale/Gap Event
- Public→Private、Tombstone、Old Event Resurrection拒否
- Full/Type/Single/Rebuild Resume、Stable Cursor、Japanese/English/Mixed/Accent
- Retry/Dead Letter、Flag OFF、Query abuse、private/raw/PII/financial payload rejection

`scripts/test-core-search-index-wp096.mjs` は37 Failure Fixturesを含む。
