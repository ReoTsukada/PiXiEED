---
spec_id: ARCH-CORE-SITE-001
title: PiXiEED Core and Site-wide Integration Architecture
status: NORMATIVE
classification: PRIVATE_INTERNAL_ONLY
audience: AI_AGENTS, ENGINEERING
version: 1.0.0
updated: 2026-08-07
depends_on:
  - CURRENT_SYSTEM_PRESERVATION_GATE.md
  - 02_ARCHITECTURE/EXISTING_PLATFORM_PRESERVATION.md
  - 02_ARCHITECTURE/LEGACY_DATA_COMPATIBILITY.md
  - 02_ARCHITECTURE/COMMAND_ENGINE.md
  - 02_ARCHITECTURE/ASSET_GRAPH.md
  - 02_ARCHITECTURE/OFFICIAL_PACKAGE_FORMAT.md
  - 02_ARCHITECTURE/ACCOUNT_PERMISSION_CORE.md
  - 02_ARCHITECTURE/FEATURE_FLAG_OBSERVABILITY_ROLLBACK_CORE.md
  - 02_ARCHITECTURE/COST_AWARE_REALTIME_POLICY.md
  - 02_ARCHITECTURE/APP_SHELL_NAVIGATION_DESIGN_SYSTEM_CORE.md
  - 02_ARCHITECTURE/PROJECT_REGISTRY_CORE.md
  - 02_ARCHITECTURE/ASSET_REGISTRY_CORE.md
  - 02_ARCHITECTURE/PACKAGE_REGISTRY_CORE.md
  - 02_ARCHITECTURE/EVENT_ACTIVITY_CORE.md
  - 02_ARCHITECTURE/SEARCH_INDEX_CORE.md
  - 02_ARCHITECTURE/PIXIEED_PRODUCT_STRATEGY.md
---

# PiXiEED Core and Site-wide Integration Architecture

## Decision

PiXiEED is being rebuilt as one site-wide product system centered on **PiXiEED Core**. The
individual tools are not independent islands. They share identity, projects, assets, revisions,
commands, packages, rights, events, search, notifications, navigation, billing references, and
rollback controls through Core contracts.

This document is the scope correction for the implementation queue. WP-010 is the contract
foundation; it is not the completion of the site-wide rebuild.

`02_ARCHITECTURE/PIXIEED_PRODUCT_STRATEGY.md` is the canonical product decision: PiXiEED is a
Global Creator Platform reconstruction, with Core, Draw2, Audio, Game/Runtime, Market,
SNS/Community, Commission, Subscription, and Creator Economy as the main surfaces. Existing
small tools are classified by dependency proof as extracted Core capability, Classic/Labs/Mini
Tool, or later-safe retirement. Current Draw/Market remain until replacement and rollback gates
pass; WP-080 Shell remains an isolated foundation rather than an immediate public UI replacement.

## Core boundary

```text
PiXiEED Core
├── Identity, account, creator, permission
├── Project, asset, revision, dependency, provenance
├── Command, operation, journal, checkpoint, recovery
├── PiXiSYNC compatibility and future versioned sync
├── Package, manifest, hash, license, import/export
├── Event, activity, search, notification
├── Market, product, purchase, entitlement, license, royalty, ledger
├── App Shell, routing, navigation, design system, accessibility
├── Public URL registry, canonical metadata, legacy compatibility, rollback
└── Feature flag, observability, shadow validation, rollback
```

Core connects to PiXiEEDraw (current), PiXiEEDraw2 (replacement), PiXiEELENS and camera/image
tools, PiXiGame, PiXiRuntime, PiXiAudio, PiXFiND, Market, SNS/Community, Creator Page, My Page,
and Admin. A tool may have specialized UI and runtime behavior, but it MUST use the shared Core
identity and persistence boundaries for durable data.

Account and authorization use the dedicated `ACCOUNT_PERMISSION_CORE.md` contract: existing
`auth.users.id` is preserved, public Creator identity and legal Seller identity remain separate,
and resource-scoped capabilities fail closed. The Core adapter may explain a decision, but current
Supabase RLS/RPC, Market seller/purchase/entitlement checks, and PiXiSYNC membership checks remain
server-authoritative until a later shadow and rollback gate passes.

Feature flags and rollback are also additive Core controls, not authorization. Identity/JWT
verification, account state, current server/RLS authorization, and resource capability checks
remain mandatory; a client cannot enable a flag, change its cohort, or bypass a denied request.
When a new path is off, unknown, killed, or rolled back, Core selects the preserved current path
without deleting or rewriting current PXD, PiXiSYNC, Market, purchase, entitlement, commission,
subscription, or public URL data.

## Canonical identity and graph

WP-010 typed IDs are the canonical identity layer. The initial identity set is:

```text
User, Creator, Project, Asset, AssetRevision, Package, Game, Audio,
Product, Post, Community, Purchase, Entitlement, License
```

Every durable record MUST carry its owning scope and provenance. A typical graph is:

```text
Draw Project
  → Character Asset
  → Asset Revision 1 / 2
  → Game Project reference
  → Package and Market Product
  → SNS Market Card
```

The graph MUST retain origin, current revision, consumers, dependencies, licenses, derivatives,
royalty relationships, and deletion/update safety. Removing a source MUST NOT silently break a
published product, an already-purchased entitlement, a public URL, or a current project.

## Project and tool contracts

Core Project is the durable container for project type, owner, members, visibility, assets,
dependencies, versions, save state, sync state, Market state, and public links. Draw, Game,
Audio, and other project types share this container while retaining specialized editors.

WP-091 freezes the Project Registry portion of this container. The Registry stores typed Project
identity, registered tool/format metadata, ownership/member/visibility/lifecycle state, head/root
references, legacy bindings, and optimistic record versions. It does not store Pixel/Audio/Game
Blobs, Tiles, Journal, Checkpoint, PXD/package bodies, full Editor State, or Market/Payment/
Entitlement/Commission data. See `02_ARCHITECTURE/PROJECT_REGISTRY_CORE.md` for the canonical
record, commands, events, privacy policy, pagination, and default-off flags.

The Project Switcher is a Core identity selection boundary. It returns a Project ID and record
version after server-side permission filtering; it does not mutate an Editor State or transfer a
Blob. Search indexing remains a separate WP-096 projection.

WP-092 freezes the Asset Registry beneath that Project boundary. Project Registry keeps only root
Asset references; Asset Registry owns Asset/Revision identity, verified Hash/size/MIME and relative
Storage locator metadata, Dependency/Provenance, and transport-neutral live update Events. Asset
Registry does not own Market rights, License/Royalty, Purchase/Entitlement, Commission, Post
content, or Blob bytes.

Required bridge families are:

```text
PiXiEEDraw Bridge       PiXiEEDraw2 Bridge       PiXiAudio Bridge
PiXiGame Bridge         PiXiRuntime Bridge      PixFind/Camera Bridge
Market Bridge           SNS Card Bridge         Account/Admin Bridge
```

Examples of canonical bridge operations:

- Draw2 `use in game` adds an Asset Revision reference to the Game Asset Browser.
- Audio creation attaches a versioned BGM/SFX asset and an event binding to a project.
- Game `list on Market` validates a Package, rights, compatible tools, and creates a Product draft.
- Market `share on SNS` creates a Post/Card reference; it does not upload arbitrary raw media to SNS.
- Camera/PixFind intake creates or reuses an Asset/Blob by content hash and records provenance.

WP-093 freezes the Versioned Tool Bridge boundary. Tool IDs and Tool Versions are separate from
Bridge API Version, and Tool Descriptor registration is trusted only through a server decision.
Capability negotiation returns bounded capability versions/limits; every Request/Result carries
references and metadata rather than Blob bytes. The Bridge accepts Project/Asset/Revision/Package
references, delegates authorization to the WP-060 server capability boundary, and delegates
Project/Asset state to the WP-091/WP-092 registries. It emits only bounded `INVALIDATE`,
`UPDATE_AVAILABLE`, and `REVISION_CHANGED` events; Tool rendering, playback, conversion, and Blob
fetch remain Tool/Storage Adapter responsibilities.

The Bridge is transport-neutral and can later use an in-process bus, MessageChannel, Worker,
PiXiSYNC, or server Realtime adapter. Causation chains, visited Tool IDs, duplicate Event IDs,
and bounded depth prevent event loops. Cancellation finalizes only a request record; it cannot
promote a partial Revision, incomplete Package, or temporary Blob. The current PiXiEEDraw/PXD/
PiXiSYNC boundary is represented by an unloaded thin adapter and is not wired into production.

## Legacy compatibility and replacement

The current production path remains active while the new path is developed:

| Current boundary | New Core behavior | Required rule |
| --- | --- | --- |
| Current PiXiEEDraw | PiXiEEDraw2 project/editor path | Existing `.pxd`, projects, URLs, and PiXiSYNC remain readable through adapters. |
| Current PXD archive-v2 | Versioned Core Package/PXD manifest | Preserve the current reader/writer; add lossless adapters before any replacement. |
| Current PiXiSYNC RPC/Realtime | Core sync boundary and later version-separated sync | Do not replace or disable current sync until convergence and rollback gates pass. |
| Current Market products/orders/licenses | Core Product/Purchase/Entitlement projection | Existing products, purchases, rights, payouts, URLs, and downloads remain usable. |
| Current account/auth | Core Identity/Permission projection | Reuse stable IDs where semantics match; maintain permanent mappings otherwise. |

PiXiEEDraw2 becomes the default creation path only after the legacy import, PXD round-trip,
PiXiSYNC, project recovery, URL, and Market compatibility gates pass. The final product name
may become PiXiEEDraw, but `PXD2` MUST NOT be introduced as a product or file-format name.

## Content, commerce, and direct work boundaries

The content classification has exactly two values:

```text
完成作品 / completed work
素材 / material
```

Exhibition, free distribution, paid sale, and limited visibility are publication methods. A
derivative, modification, commercial use, embedding, resale, or royalty relationship is a license
or provenance property, not a third content class.

The Market supports both material and completed-work products. Product migration MUST preserve
the old product record and map it to the new canonical Product/Package/License projection.

Direct work is a separate Core workflow, not an informal DM and not an automatic Market product:

```text
Request → scope/quote → agreement → milestones → delivery → acceptance
        → rights/license decision → payment/ledger reconciliation
```

Billing integrations MUST be adapters around the existing payment, entitlement, royalty, payout,
and ledger contracts. New UI or APIs MUST NOT recalculate historical financial records, grant an
entitlement before verified payment, or promise payout assistance. Stripe/provider references and
secrets remain outside source control and are never copied into fixtures.

## Common App Shell

The new site uses a shared App Shell with:

- global header, desktop sidebar, mobile navigation, route-safe links;
- Project Switcher, Asset Browser, save/sync status, and Command Palette;
- Search, Notification Center, Account Menu, Help, Settings, and Admin entry points;
- shared loading, empty, error, recovery, dialog, sheet, purchase, and permission primitives;
- responsive, keyboard, touch, screen-reader, reduced-motion, safe-area, and focus behavior;
- feature-flag and rollback-aware error presentation.

Tool-specific studio surfaces remain specialized. The App Shell MUST NOT force one editor layout
onto Draw, Game, Audio, Market, Community, or Account pages.

## Public URL and transport policy

WP-098 adds an unloaded Public URL and Routing Core. It snapshots the 50 existing HTML routes,
resolves typed Market/PiXFiND compatibility paths, and requires server permission plus canonical/
privacy proof before a redirect. Current route files, PiXiEEDraw, PXD, PiXiSYNC, Market, Projects,
Purchases, Entitlements, and production Database/Storage remain the fallback and are not cut over.
Non-public resources receive no canonical SEO URL. See `02_ARCHITECTURE/PUBLIC_URL_ROUTING_CORE.md`
and `docs/contracts/WP-098-PUBLIC-URL-ROUTING.md`.

Transport is selected by state class, not by convenience. The canonical policy in
`02_ARCHITECTURE/COST_AWARE_REALTIME_POLICY.md` defines `LOCAL_ONLY`, `ACTIVE_SYNC`,
`PLATFORM_EVENT`, and `ASYNC_ON_DEMAND`. High-frequency pointer/pixel/audio/frame/UI state never
uses global Realtime. URL registry reads are local and public resource/metadata reads are bounded
`ASYNC_ON_DEMAND` requests; route transitions do not create permanent subscriptions.

## Storage placement

Core storage is split by responsibility. Memory owns the active editing/playback state; IndexedDB
owns structured Journal, index, checkpoint-location, and Offline Queue records; OPFS owns large
local tiles/chunks, Audio, caches, and checkpoints; the server database owns confirmed metadata,
permissions, Revision, Asset Graph, rights, commerce, and projections; Object Storage owns
immutable Blobs, packages, exports, previews, and backups. See
`02_ARCHITECTURE/STORAGE_PLACEMENT_AND_SYNC.md` for the normative placement and PiXiSYNC payload
boundary. A Core event may notify another tool, but no tool edits another tool's local record in
place.

## Events, search, and notifications

Core events are append-only facts with versioned payloads. Initial event families include project or
asset creation, revision publication, project linking, package/product publication, purchase and
entitlement grant, game/audio/card view, royalty generation, notification creation, and moderation
or system alerts.

Search indexes canonical references to Creator, Project, Asset, Package, and later Game, Audio,
Product, Market Card, Post, Community, Collection, and Tag. WP-096 freezes a derived Search Document,
Typed Query, Public Discovery/Scoped visibility, stable cursor, and rebuildable Backend Adapter
boundary. Notifications reference durable entities and MUST survive a new UI rollout. Search and
notifications are projections; they are not the source of financial or rights truth.

WP-095 freezes the canonical Event/Activity boundary. State Commit and Trusted Event are separated
from Command/Request; Aggregate Version, Correlation/Causation, Transactional Outbox, Consumer
Idempotency, Replay, and Activity Visibility are Core contracts. Event, Audit, Activity, and
Telemetry remain separate responsibilities. High-frequency Draw2/PiXiSYNC operations, raw media,
private content, Market financial data, and automatic SNS/Market publication are excluded. See
`02_ARCHITECTURE/EVENT_ACTIVITY_CORE.md`.
Search-specific privacy, Query, Backend, Rebuild, and Tombstone rules are defined in
`02_ARCHITECTURE/SEARCH_INDEX_CORE.md`.

WP-097 freezes Notification as a separate durable projection of trusted Events. Server recipient
resolution, visibility, preference/mandatory policy, Deduplication, bounded Delivery Attempts,
Retry/DLQ, Quiet Hours, and projection-only Replay are independent of Activity, Search, Finance,
Rights, SNS, Market, and Commission. Notification never becomes an authorization or financial
authority and its external delivery adapters remain default-off. See
`02_ARCHITECTURE/NOTIFICATION_CORE.md`.

## Rollout and stop conditions

```text
current production path
  → isolated Core implementation
  → compatibility adapter
  → read-only/shadow comparison
  → synthetic and non-private fixture tests
  → staged feature flag (default off)
  → owner approval
  → production cutover only after rollback proof
```

No Core Work Package may apply a production migration, deploy, publish, redirect, change current
Market/PiXiSYNC behavior, or alter real purchase/rights data as part of ordinary implementation.
Any mismatch in legacy project opening, PXD round-trip, PiXiSYNC convergence, purchase entitlement,
public URL resolution, or financial reconciliation is a stop condition and requires rollback or
adapter correction.
