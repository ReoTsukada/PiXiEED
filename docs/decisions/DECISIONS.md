# WP-000 decisions

## WP-900 — 2026-08-09

45. Define WP-900 as the PiXiEED Staged Release Readiness Gate across the platform completed
    through WP-250. It is a G0–G9 evidence and Owner-decision Gate, not a Production Cutover task.
46. Directly depend on WP-150, WP-160, WP-170, WP-180, WP-190, WP-200, WP-210, WP-220, WP-230,
    WP-240, and WP-250 while preserving their transitive Core dependencies and without rerunning
    predecessor implementations.
47. Preserve all predecessor `PARTIAL`, `UNTESTED`, `DECISION_PENDING`, `UNKNOWN`, and `BLOCKED`
    results in a deterministic aggregate. WebGPU, Wasm, SAB, and a particular renderer/Worker are
    optional candidates; measured outcome, safe fallback, security, compatibility, and rollback
    evidence are the Gate requirements.
48. WP-900 may request but never grant Owner approval. Production migration, cutover, current
    PiXiEEDraw/Market replacement, provider activation, deploy, publish, commit, and push remain
    separate explicitly authorized actions.

## WP-250 — 2026-08-09

41. Reconstruct WP-250 from approved sources because no dedicated package existed; keep the
    provenance and scope in an ADR rather than guessing a broader integration.
42. Keep consent/region/age/provider policy server-resolved and keep Ad consent separate from
    Analytics consent. Public Ads use reserved lazy slots only; editors, private areas, Direct Work,
    Checkout, Account Security, and Admin remain ad-free.
43. Treat Revenue/Cost as shadow unit-economics projections with staged Ad uncertainty. Never
    mutate Ledger or Payout. Keep Organic Search separate from explicitly labelled Sponsored Search.
44. Keep Moderation Case/Decision and Admin Audit as versioned references, not Analytics replay or
    automatic canonical mutation. All WP-250 flags default OFF and rollback is local shadow-only.

## WP-230 content finalization and WP-240 — 2026-08-09

37. Social posts may contain bounded plain text and approved Core Card references only. Core Cards
    retain resource identity, safe presentation reference, and explicit LIVE/SNAPSHOT/OMITTED
    policy; current visibility, moderation, and permission always win at read time.
38. WP-230 finalization rejects raw media, Base64/Data URL, markup, private/financial/commerce
    fields, and stale presentation leaks. Duplicate explicit Share is idempotent, while public
    Search requires published/public/moderation-approved/server-allowed state.
39. Reconstruct WP-240 as an isolated read/shadow projection. Admin capability is server-resolved;
    Analytics is privacy-safe metadata; Ads exclude active creation/private commerce surfaces;
    Moderation is reference-only; Revenue comparison cannot mutate Ledger or Payout.
40. Keep WP-240 domain flags default-off and rollback local shadow-only. Existing Admin RPC, Ads,
    Market, Account, financial, current routes, and production data remain untouched until a later
    separately authorized rollout gate.

## 2026-08-06

1. Treat the current repository and migration text as the preservation baseline. Live production state is reported only where read-only evidence exists.
2. Keep Market and PiXiSYNC boundaries separate: Market uses its current RPC/Edge/Stripe/private-Storage flow, while PiXiSYNC uses `collab_v1`, revision/order contracts, checkpoint lifecycle, and `pixisync-checkpoints`.
3. Use synthetic fixtures only. No real user creative content, credentials, payment identifiers, or production Storage objects are copied into the repository.
4. Do not fix existing baseline failures as part of WP-000. They are documented for a later scoped compatibility/test task.
5. Record the `docs/project-file-map.md` versus current `pixiedraw/index.html` module-loading mismatch without changing either runtime code or deployment state.

## WP-005 — 2026-08-06

6. Keep exact duplicate asset groups until canonical path, public URL, dynamic-loading, native-resource, and compatibility evidence is complete.
7. Treat `UNKNOWN` as a preservation outcome, not as permission to delete.
8. Preserve the WP-000 result of 63 successful and 14 pre-existing failing baseline scripts as the no-regression comparison point.

## WP-010 — 2026-08-06

9. Treat the v4.2 reference-core contracts as an isolated comparison baseline; do not replace the
   current PiXiEEDDraw, PXD archive-v2, PiXiSYNC, or Market contracts in this Work Package.
10. Preserve current IDs and transport fields at the compatibility boundary. Any mapping from the
    reference operation ID or PXD manifest to current UUID/RPC/archive fields requires a later
    adapter and conformance gate.
11. Keep `schemaVersion` independent from PXD archive `version`; unsupported versions fail
   explicitly and migration retains the source while writing a new destination.

## Site-wide PiXiEED Core scope correction — 2026-08-06

12. Treat PiXiEED Core as the implementation center for the entire site, not only as a
    PiXiEEDraw2 foundation. The queue now explicitly includes Account/Permission, Feature
    Flag/Rollback, App Shell, Accessibility, Project/Asset/Package registries, Tool Bridges,
    Events, Search, Notifications, Public Routing, and the Site-wide Integration Harness.
13. Keep the current PiXiEEDraw, `.pxd`, PiXiSYNC, Market products, purchases, licenses, rights,
    payouts, and public URLs active behind compatibility adapters. PiXiEEDraw2 becomes the default
    only after lossless import, recovery, sync, URL, and Market gates pass.
14. Model Market content as exactly `completed work` or `material`; model exhibition/free/paid/
    limited as publication methods and derivative/commercial/embedding/resale as license/provenance
    properties. Keep direct work requests, quotes, agreements, delivery, acceptance, rights, and
    billing separate from general DM and from the Product catalog.
15. Treat tool bridges and site projections as versioned Core contracts. Do not create a parallel
    incompatible ID/type system, recalculate historical financial records, or apply production
    migration/deploy/publish as part of these Work Packages.

## Integrated package and WP-030/WP-040 scope — 2026-08-07

16. Keep current PXD as a Draw-project format and add the integrated PiXiPackage as a separate,
    versioned Core materialization. Project-time state remains split across Manifest, Asset Graph,
    immutable Blobs, Journal, and Checkpoints; export may produce a lightweight reference package
    or a complete embedded package.
17. Require every consuming Asset edge to declare `LIVE`, `PINNED`, `REVIEW`, or `FORKED`. Published
    and purchased Products use pinned revisions, Dependency Lock, and License Snapshot. A source
    Asset deletion never invalidates a purchased package; tombstone and locked dependency behavior
    preserve recovery.
18. Complete WP-030 and WP-040 as isolated, storage-neutral adapters. Do not wire them into the
    current production PXD, IndexedDB, PiXiSYNC, Market, or real project data until WP-050 and the
    later compatibility/convergence gates pass.

19. Separate storage by responsibility: Memory for active editing/playback state, IndexedDB for
    structured Journal/index/checkpoint-location/Offline Queue metadata, OPFS for large local
    tiles/chunks/audio/cache/checkpoint bytes, server Database for confirmed authority, and Object
    Storage for immutable Blobs/packages/exports. Do not place large media or unbounded Base64 inside
    IndexedDB records or PiXiSYNC Operations.
20. Complete WP-050 as an isolated convergence adapter that synchronizes Command/Operation,
    Revision, structure metadata, content hash, and Blob transfer intent. Preserve the current
    `collab_v1` RPC/Realtime and IndexedDB pending-operation path until a later feature-flagged bridge
    passes the full compatibility and rollback gates.

## WP-060 Account and Permission Core — 2026-08-07

21. Preserve the existing `auth.users.id` and provider/session continuity. Model Core User, public
    Creator, and legal Seller as separate projections; do not use display fields or untrusted client
    profile metadata as authorization input.
22. Use resource-scoped capabilities with default-deny diagnostics. Preserve role labels for legacy
    UI and mapping, but require explicit capabilities for project/asset/package, Market seller,
    purchase/entitlement, direct-work commission, SNS, and Admin actions.
23. Keep current Supabase Auth/RLS/RPC, Market seller/MFA/staff/purchase/entitlement, and PiXiSYNC
    membership/editor checks as server authority. WP-060 adds no migration and does not wire the
    isolated adapter into the production page.
24. Require permanent legacy identity mappings to reject conflicting forward or reverse mappings;
    unknown identities/resources and inactive accounts fail closed. Direct work remains separate
    from general DM and from the Market Product catalog.

## WP-060 security supplement — 2026-08-07

25. Treat verified JWT envelope fields and current server-side account/session state as separate
    checks; an unexpired token alone does not authorize a revoked or inactive current grant.
26. Never use `user_metadata` or browser-provided profile fields for authorization, and never expose
    Supabase service-role credentials to browser roots. Server-only financial, entitlement, and
    review actions require explicit scoped capabilities.
27. Classify forward or reverse legacy identity conflicts as `QUARANTINED`; do not auto-merge,
    transfer ownership, or move entitlements. Only an explicit Admin resolution with an audit event
    may remove the quarantine after conflicts are cleared.
28. Keep Subscription access separate from purchased Market entitlement. Subscription cancellation
    may revoke current-plan access but must not revoke an already purchased entitlement.

## WP-070 Feature Flag, Observability, and Rollback Core — 2026-08-07

29. Feature flags are additive routing controls and never authorization. Identity/JWT, current
    account state, current server/RLS authorization, and resource permission remain mandatory.
30. Keep flags default-off with independent read/write actions, domain isolation, deterministic
    server-controlled cohorts, and no client override/configuration authority.
31. Require caller-supplied event ID, correlation ID, timestamp, reason, and trusted server actor
    for rollout, override, kill-switch, rollback, and shadow-mismatch audit events.
32. Kill switches and global/domain/flag rollback select the preserved current path without deleting
    or rewriting current PXD, PiXiSYNC, Market, project, purchase, entitlement, commission,
    subscription, URL, or financial/rights data. WP-070 remains an isolated adapter; no production
    flag is enabled.

## WP-080 App Shell and Design System — 2026-08-07

33. Keep WP-060 and WP-070 complete and do not re-run their implementation packages. For the small
    pre-WP-080 check, compare only the recorded 14 baseline failures by test, target, and major
    Error Signature; all 14 matched and no new failure identity appeared.
34. Build the new Shell only under an isolated `/core-shell/` noindex Entry. It must not be added to
    public navigation, current routes, sitemap, redirects, or existing Draw/PXD/PiXiSYNC/Market
    loading paths.
35. Use the existing generic WP-070 factory as an unchanged temporary adapter. Its current host
    registry placement is documented, and future Core extraction must preserve its export contract.
36. Use native semantic components and tokenized CSS in WP-080 rather than adding a UI framework or
    external library. Any future library must pass a separate bundle, update-granularity,
    accessibility, maintenance, and coexistence ADR.
37. Keep Server Route authorization ahead of Account/Flag/Resource access. Default-off, unknown,
    denied, or unavailable states show explicit Unavailable/Coming Later UI and do not load Draw,
    Audio, Game, or Market chunks.
38. Keep Shell store slices separate from Editor Canvas state, keep private Studio/Checkout/
    Entitlement/Commission surfaces free of advertising slots, preserve canonical pixel colors across
    themes, and allowlist UI telemetry without JWT/email/secret/Project/Commission content.

## WP-090 Interaction, Accessibility, Responsive, and Recovery — 2026-08-07

39. Treat `noindex` as discoverability only. Server Route delivery must fail closed before private
    HTML/data or Lazy Chunk delivery: unknown and Flag-OFF Routes use `404`, while verified but
    forbidden resources use `403`; denied responses do not prefetch.
40. Keep Interaction and Accessibility contracts framework-neutral. Route changes focus the new
    heading, overlays use deterministic stack/focus fallback with background inertness, Tabs/Menus
    support Arrow/Home/End, and text entry/IME composition suppresses Shell shortcuts.
41. Model Async and Recovery explicitly. Offline is never Saved; local input and unsynced operations
    survive Error/Session/Conflict paths; critical errors use persistent surfaces; Live Region output
    is deduplicated; UI telemetry is bounded and privacy-redacted.
42. Register deterministic Visual Regression baselines for four viewports, Light/Dark, and eight
    states, but keep semantic/interaction tests authoritative. Real VoiceOver/TalkBack/NVDA and
    physical-device lifecycle checks remain manual gates and are not claimed as executed here.

## WP-091 Project Registry Core — 2026-08-07

43. Make `projectId` the canonical Project identity; names remain non-global labels unless a future
    scoped product rule says otherwise. Registered tool/kind/format/version values are the only
    accepted combinations, and the current PXD archive-v2/PiXiSYNC identifiers remain adapter-owned.
44. Keep Project Registry metadata separate from Pixel/Audio/Game Blobs, Tiles, Journal, Checkpoint,
    PXD/package body, full Editor State, JWT/email/secret, Commission body, and Market/Payment/
    Entitlement/Royalty data. The isolated contract is not loaded by the current App Shell or routes.
45. Enforce server-side visibility and membership decisions: private guessed existence can be 404,
    known denied access can be 403, public read is not write, and unlisted projects are excluded from
    listing/search projections. Project ownership and member roles never imply Market or entitlement rights.
46. Use explicit lifecycle transitions with no hard delete. Retain trashed relationships and quarantine
    legacy mapping conflicts instead of merging, reusing IDs, silently converting PXD, or rewriting
    current PiXiSYNC history. Transfer ownership is request-only in WP-091.
47. Require command idempotency, expected recordVersion, server permission decision, stable cursor,
    deterministic pagination, and independent default-off read/write/legacy/migration/ownership flags.
    Kill switch and rollback preserve existing current-path data and references.

## WP-092 Asset Registry Core — 2026-08-07

48. Keep Asset identity/metadata, immutable AssetRevision, verified content-addressed Blob metadata,
    Dependency, Provenance, and Reference Policy in a separate Asset Registry boundary. Project
    Registry retains only Project identity and root/reference metadata; it does not own Asset bytes.
49. Keep large bytes out of Registry records, Operations, and Database rows. Memory owns active
    decoded state, IndexedDB owns indexes/queues, OPFS owns local large bytes/cache, Database owns
    confirmed metadata/authority, and Object Storage owns immutable bytes/packages/previews.
50. Require trusted server/injected Blob verification for Hash, byte length, and MIME. Same verified
    Hash may be reused across Assets, but duplicate content cannot create a second Revision for the
    same Asset; client Hash/size/MIME, Base64, Data URLs, external URLs, and traversal are rejected.
51. Enforce LIVE/PINNED/REVIEW/FORKED semantics and fail closed on forbidden dependency cycles. A
    fork receives a new Asset ID and preserves source lineage; caller-supplied owner substitution is
    rejected at this boundary until a separate audited ownership-transfer contract exists.
52. Keep Asset Registry separate from Market Product, Purchase, Entitlement, License, Royalty,
    Payout, Commission, SNS, and package materialization. Sold or published revisions remain a
    future package/product boundary and are not mutated by WP-092.
53. Keep the implementation unloaded and transport-neutral. Asset events carry bounded IDs/Hash/
    reason/correlation metadata only; current Draw/PXD/PiXiSYNC/Market/SNS routes and data remain
    untouched. Legacy SNS remnants are inventory-only and are not deleted.

## WP-093 Versioned Tool Bridge API — 2026-08-07

54. Separate `bridgeApiVersion` from `toolVersion`. Tool registration requires a trusted server
    decision, Current Draw and Draw2 remain distinct Tool IDs, and unknown/duplicate/unavailable/
    incompatible Tool registrations fail closed.
55. Use one reference-only Bridge envelope for Project, Asset, Revision, Package, and compatibility
    operations. Do not create Draw-, Audio-, Game-, Camera-, Market-, or SNS-specific incompatible
    API families. Capability versions and bounded Limits are negotiated explicitly.
56. Never transport raw Pixel/Audio/PXD/PiXiPackage/Game Build bytes, Base64, Data URLs, or full
    Editor State through Bridge. Asset Registry/Storage owns Blob retrieval; Bridge may carry only
    typed IDs, Hashes, and opaque Storage Handle references.
57. Keep WP-060 server authorization, WP-070 independent default-off flags, WP-091 Project Registry,
    and WP-092 Asset Registry authoritative. Bridge does not duplicate LIVE/PINNED/REVIEW/FORKED or
    mutate source Project/Asset state.
58. Require Event ID, Origin/Target Tool, Correlation/Causation chain, visited Tool IDs, and bounded
    depth. Duplicate, cyclic, unknown-causation, and loop events fail closed. Host adapters own
    transport, timeout measurement, Tool rendering, playback, and Blob conversion.
59. Keep the current PiXiEEDraw/PXD/PiXiSYNC path behind an unloaded thin Legacy Bridge. Future
    WP-100+ performance specifications are a mandatory pre-WP-100 gate: High Performance Contract,
    Technology Selection Gate, Device/Workload Matrix, and Bundle/Memory/Worker Budgets, with
    external audit required before WP-100 starts.

## WP-094 Package Registry Core — 2026-08-07

60. Make the Global Creator Platform reconstruction the canonical product strategy. Core, Draw2,
    Audio, Game/Runtime, Market, SNS/Community, Commission, Subscription, and Creator Economy are
    the main surfaces; small Tools require dependency proof before extraction, Classic/Labs/Mini
    retention, or retirement. Current Draw/Market and WP-080 Shell boundaries remain as recorded.
61. Keep Package Kind separate from Market material/finished-product classification. Package Registry
    owns Package identity, Manifest, exact Revision/Hash/Size Dependency Lock, lifecycle, and verified
    artifact references; it must not own prices, purchases, Entitlements, Royalties, Payouts, or
    Commission bodies.
62. Materialize Project-time references through THIN/PORTABLE modes and convert LIVE to exact PINNED
    Revision locks. Reject unknown kinds/versions, unsafe paths, active content, missing or unauthorized
    dependencies, cycles, tampered hashes, and unverified output without committing READY.
63. Preserve current PXD as an unchanged Legacy Adapter boundary. Integrated PiXiPackage is a separate
    versioned model; unsupported sections return an explicit report. All Package flags remain default-off
    and no current route, data, Storage, migration, deploy, publish, commit, or push is changed.

## WP-095 Event and Activity Core — 2026-08-07

64. Treat Event as a trusted post-commit fact, not a Command or Request. State Commit and Transactional
    Outbox insertion share one adapter boundary; an uncommitted or pre-authorization intent is never
    published as a canonical Event.
65. Use one versioned 27-entry Event Catalog and bounded Envelope with Typed IDs, Aggregate Version,
    Actor/Correlation/Causation, Visibility, and small reference payloads. Reject raw media/package data,
    Blob/Base64/Data URL/JWT/Secret/PII/financial/project/commission/royalty bodies and high-frequency
    editor operations at this boundary.
66. Require Server-trusted Producers, at-least-once delivery, Consumer-local Event ID idempotency,
    aggregate ordering with stale/gap detection, and fail-closed Unknown Type/Version, Producer Spoof,
    Causation Unknown/Cycle/Depth, oversized/deep payload, and duplicate conditions.
67. Keep Retry/Poison/Dead Letter and projection-only Replay explicit. Event, Activity, Audit, and
    Telemetry are separate responsibilities; replay cannot send notifications, payments, webhooks, or
    other external side effects, and private payloads are not copied into DLQ/telemetry.
68. Activity uses localized `presentationKey` and cannot widen Event visibility. SNS Share, Market
    publication/commerce, Finance Ledger, Search, Notification, and PiXiSYNC high-frequency operations
    remain separate future contracts. All six Event flags are default-off and current paths remain
    unchanged.

## WP-096 Search Index Core — 2026-08-07

69. Search Index is a rebuildable derived projection, not canonical state or an authorization
    authority. Canonical Registry/Market/Creator state remains authoritative, and Index failure or
    loss must not fail Canonical Write or change existing URL, purchase, entitlement, rights, or data.
70. Freeze v1 Search Document and Typed Query contracts with separate Search Document/Resource IDs,
    bounded localized display/search values, BCP-47-compatible Locale, Public Discovery/Scoped
    visibility, stable Cursor, and registered Resource/Facet/Sort fields. Unknown Resource Types,
    unsupported Document/Query versions, arbitrary SQL/Regex/Wildcard/Index fields fail closed.
71. Public Discovery may contain only PUBLIC non-Trashed/non-Quarantined projections. PRIVATE,
    PROJECT_MEMBERS, CREATOR_PRIVATE, UNLISTED, Trashed, and Quarantined data is not globally exposed;
    scoped queries and Exact ID Lookup require server-side authorization, and Search results never grant
    Resource Read access. Unlisted is not Public Discovery.
72. Project Search from WP-095 trusted Event Envelopes with Event ID idempotency and Aggregate Version
    ordering. Stale Events never roll back, gaps remain resumable, and Tombstones block old Event
    resurrection. PACKAGE_READY is only a Search candidate and never creates a Market Product.
73. Keep Search Documents reference-only and bounded. Reject Pixel/Audio/PXD/PiXiPackage/Game bytes,
    Blob/Base64/Data URL, JWT/Secret/PII, Project/Chat/Commission body, Journal/PiXiSYNC Operation,
    Payment/Purchase/Entitlement/License/Royalty content. Keep tokenizer/backend vendor choice behind
    an adapter and outside Core Shell/Editor Main Thread.
74. Implement Full/Resource-type/Single Resource/Incremental/Resume Rebuild with bounded queue,
    batch, Retry/DLQ, and zero external Side Effects. All six Search flags default OFF; no production
    Search service, migration, upload, deploy, publish, commit, push, or current-route connection is
    part of WP-096.

## WP-097 Notification Core — 2026-08-07

75. Treat Notification as a durable projection of a trusted WP-095 Event, never as an Event,
    Activity, Audit, Telemetry, Search, Finance, Rights, SNS, Market, or Commission authority. Event
    eligibility is catalog-driven and unknown/high-frequency/unsupported inputs fail closed.
76. Resolve recipients only through a server Permission/Core adapter at the WP-060 boundary. Client
    recipient selection, cross-user Inbox reads/mutations, and Event visibility broadening are denied;
    private Project names are limited to authorized in-app presentation and sanitized before external delivery.
77. Freeze v1 Notification Record, Preference, Inbox, Delivery Attempt, and Presentation contracts with
    separate Typed IDs/Versions, five Visibility Classes, four server-owned Priorities, stable cursor,
    UNREAD/READ/ARCHIVED state, idempotent read/archive commands, and bounded metadata/queue/batch/retry.
78. Deduplicate Event→Notification and Notification→Delivery. Group only non-Critical notifications by
    actor/object/Project/type within an injected clock window; Critical/Security/Future Finance cannot be
    silently grouped or rate-dropped. Rate limits return typed SUPPRESS/DELAY/GROUP results.
79. Keep creation and delivery separate. Implement only a synthetic IN_APP adapter; external Push/Mobile
    Push/Email/Digest are exchangeable default-off adapters. Delivery failure does not delete the record or
    roll back canonical state; bounded retry, canonical diagnostics, cancellation-before-delivery, and DLQ are explicit.
80. Security/Mandatory policy cannot be fully muted. Quiet Hours delays external delivery through a scheduler
    boundary without a Core timer. Projection Replay has zero external resend, Event Outbox rows are not moved,
    and Search does not index Notification.
81. Keep all six Notification flags default OFF with unknown/off/Kill Switch fail-closed behavior and current
    paths as rollback. WP-097 does not change current routes, Draw, PXD, PiXiSYNC, Market, SNS, notification
    data, database, Storage, migration, deploy, publish, commit, or push.

## WP-098 Public URL and Routing Core

82. Adopt the Cost-aware Realtime Policy as canonical transport architecture: `LOCAL_ONLY`, `ACTIVE_SYNC`,
    `PLATFORM_EVENT`, and `ASYNC_ON_DEMAND`. URL registry reads are local and URL resource/metadata reads
    are bounded on-demand requests; route transitions do not create a permanent Realtime subscription.
83. Freeze the WP-000 50-route snapshot as the current compatibility boundary. Keep `/pixiedraw/` public;
    private Account/Market management routes require server permission. Represent Market UUID, legacy
    Market query, and PiXFiND puzzle paths as typed compatibility records without changing current files.
84. Default redirects to shadow candidates and preserve the current path. Apply only a same-origin,
    registry-derived redirect after server permission and canonical/privacy proof. Unknown, malformed,
    cross-origin, private, unlisted, missing, deleted, trashed, or quarantined resources fail closed.
85. Produce canonical metadata only for Public server-resolved routes. Non-public routes return
    `noindex,nofollow` with no canonical/Open Graph URL. Unknown, client-sourced, disabled, or killed
    Public URL flags fail closed; rollback is `KEEP_CURRENT_ROUTE` with no metadata cutover.

## WP-099 — Draw2 High-Performance Gate

86. Treat the Draw2 High Performance Implementation Contract, Technology Selection Gate,
    Device/Workload Matrix, and Bundle/Memory/Worker Budgets as mandatory gates before WP-100.
    The contract preserves current Draw/PXD/PiXiSYNC/Market compatibility and does not claim that
    Draw2 implementation has begun.
87. Require the Benchmark Result Schema to record actual device/browser evidence, measurement
    conditions, p50/p95/max, component memory, Long Tasks, raw references, timestamps, and status.
    Missing real-device/browser evidence is `UNTESTED`; arbitrary byte budgets and average-only
    evidence are invalid. A regression over 10% requires review and over 20% blocks release.
88. Keep Storage Placement and Cost-aware Realtime canonical: local editor state is local-first,
    Journal/Checkpoint durability is separate from server authority, large bytes use OPFS/Object
    Storage, and high-frequency pointer/pixel/UI changes never open global Realtime subscriptions.
89. WP-110 and WP-180 cannot complete without the performance, memory, Long Task, lazy-load,
    fallback, accessibility, lifecycle, and evidence gates. WP-099 stops at `EXTERNAL_AUDIT_REQUIRED`;
    WP-100 Context may be generated for audit preparation, but implementation does not start.

## WP-100 — PiXiEEDraw2 Vertical Slice

90. Treat the external WP-099 approval as permission to implement the isolated WP-100 vertical
    slice, not as evidence that Draw2 performance has passed. Keep missing device/browser results
    `UNTESTED` and keep tile, renderer, Worker, WebGPU, Wasm, SharedArrayBuffer, and topology
    choices `DECISION_PENDING` until benchmark evidence and an ADR.
91. Place Canonical Editor Core in `pixiedraw2/src/draw2-core.ts` with strict TypeScript and no
    DOM, Canvas, UI-framework, Network, or storage implementation dependency. Browser Canvas is a
    Projection in `draw2-entry.ts`; the Reference Renderer is exchangeable.
92. Use sparse indexed `Uint8Array` pixels with transparent index `0`, palette indices `1..255`,
    shared immutable Tile buffers, affected-Tile COW, typed bounded deterministic Commands, and
    Dirty Tile/Region invalidation. A one-pixel edit must not require full raster/frame/layer/
    timeline traversal.
93. Keep Project open/create and autosave readiness local-only through repository, Journal, dirty
    Tile, and periodic Checkpoint seams. No PXD migration, PiXiSYNC, Market, Route, Production DB,
    Storage, or existing Project/Asset/Package data is connected. WP-101/next Work Package waits
    for external audit and is not auto-started.
94. Require WP-110's Reference Performance Checkpoint before adding substantial Draw2 feature
    volume. Measure the isolated Core path with identical 40-sample Node/Browser fixtures, record
    p50/p95/max and component evidence, and keep formal device/p95 status UNTESTED when identity or
    real mobile evidence is unavailable.
95. Keep full raster reads and canonical full hashes as explicit Golden/reference operations only;
    active dirty presentation must use bounded `readRegion()` output. Do not select Tile size,
    Renderer, Worker, OffscreenCanvas, WebGPU, Wasm, or SharedArrayBuffer from this checkpoint.
96. Complete WP-110's Pen/Eraser/Palette/bounded-cancellable-Fill slice only inside the existing
    isolated Draw2 Core boundary. Reuse the repository's RRGGBAA palette packing; Palette commands
    must not rewrite indexed pixels, and Fill must fail closed before canonical mutation on cancellation
    or pixel-limit errors.
97. Keep WP-110's formal real-device/p95, long-session memory, full compositor, backend equivalence,
    and production compatibility evidence `UNTESTED`/`DECISION_PENDING`. Do not begin WP-120 until
    the next explicit external approval; current Routes, Draw, PXD, PiXiSYNC, Market, and data remain
    unchanged.

98. Finalize WP-110 with a truthful reconstructed `03_PRODUCTS/PIXIEEDRAW2_SPEC.md`, explicit
    provenance, mandatory Context validation, canonical transparency regression, and a separate
    actual-browser smoke artifact. Keep formal performance `PARTIAL_UNTESTED` when the available
    browser measures only the 1/1 Core slice; classify the 256×256 browser run as
    `DESKTOP_BROWSER_MOBILE_VIEWPORT`, not real mobile, and regenerate WP-120 Context without
    starting WP-120.
