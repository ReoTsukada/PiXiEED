---
spec_id: ROADMAP-CORE-SITE-001
title: PiXiEED Core Site-wide Integration Program
status: CANONICAL_ROADMAP
classification: PRIVATE_INTERNAL_ONLY
version: 1.1.0
updated: 2026-08-07
---

# PiXiEED Core Site-wide Integration Program

## Purpose

This is the complete implementation line for rebuilding PiXiEED around one Core. The first
foundation Work Packages are necessary but are not the user-visible completion of the program.
The queue must continue through the Core registries, common site shell, compatibility bridges,
commerce/direct-work flows, and all connected tools.

## Ordered Core program

| Work Package | Scope | Completion gate |
| --- | --- | --- |
| WP-010 | Core IDs, schemas, diagnostics, versioning | Contracts, fixtures, and compatibility ADR pass. |
| WP-020 | Command and operation engine | Validation, atomic apply, deterministic serialization, undo guards, tests. |
| WP-030 | Journal, checkpoint, recovery | Replay, corruption handling, crash recovery, storage decision. |
| WP-040 | Asset Graph and immutable blobs | Revision/provenance/hash/copy-on-write and package tests. |
| WP-050 | PiXiSYNC convergence | Two-client, offline, reorder/gap, reconnect, malicious-payload, Blob-hash boundary, and local queue gates. |
| WP-060 | Account and Permission Core | Identity mapping, resource capabilities, Market/commission/admin scope separation, legacy session compatibility, and server-authority boundary. |
| WP-070 | Feature Flag, Observability, Rollback Core | Default-off domain/read-write flags, identity/server authorization ordering, deterministic cohorts, correlation/shadow audit, kill switch, and current-path rollback. |
| WP-080 | App Shell, Navigation, Design System | Isolated App Shell, semantic tokens/components, responsive/accessibility states, lazy Tool routes, and rollback-safe flag boundary without changing current routes or data. |
| WP-090 | Accessibility, Responsive, Interaction Core | Implemented isolated Interaction/Accessibility/Responsive/Async-Recovery contracts, 403/404 Route boundary, 64 visual baselines, and browser/semantic gates; device screen-reader gates remain manual. |
| WP-091 | Project Registry | Completed isolated canonical project record, switcher, ownership/member, visibility/existence, lifecycle, legacy binding, pagination, flags, and failure contract. URL resolution remains WP-098. |
| WP-092 | Asset Registry | Completed isolated Asset/Revision/verified Blob reference registry, provenance, dependency graph, LIVE/PINNED/REVIEW/FORKED policies, live Events, safe lifecycle, and transport-neutral failure contract. |
| WP-093 | Tool Bridge API | Completed isolated Versioned bridge envelope, capability negotiation, compatibility, cancellation, and cross-tool event contract. |
| WP-094 | Package Registry | Completed isolated Package Registry/Manifest/Dependency Lock Core with THIN/PORTABLE materialization, security/lifecycle/idempotency guards, legacy PXD and Market projection boundaries, and canonical Global Creator Platform strategy update. |
| WP-095 | Event and Activity Core | Completed isolated Canonical Event/Activity Core with Trusted Producer Registry, Transactional Outbox, at-least-once/idempotent delivery, Aggregate ordering/gaps, Causation, Retry/DLQ, Replay, Activity visibility, and no Market/SNS/Finance implementation. |
| WP-096 | Search Index Core | Completed isolated derived Search Document/Query/Backend Core with Event projection, privacy scopes, stale/gap/Tombstone recovery, multilingual normalization, stable cursor, rebuild, retry/DLQ, and no production search connection. |
| WP-097 | Notification Core | Completed isolated durable Notification Record/Inbox/Delivery projection with server recipient filtering, preferences, mandatory security, Dedup/Grouping, stable cursor, Retry/DLQ, Quiet Hours, Replay no resend, and default-off flags. No provider, Market, SNS, Finance, or current-route connection. |
| WP-098 | Public URL and Routing Core | Completed isolated 50-route registry, typed legacy compatibility, server-proven shadow redirects, canonical metadata, privacy checks, Cost-aware transport policy, rollback, and no current-route cutover. |
| WP-099 | Site-wide Integration Harness | Cross-domain fixture, browser, compatibility, rollback, no-regression, and mandatory Draw2 performance gates; artifacts prepared, external audit required before WP-100. |

## Product and service connection program

After the Core integration line is ready, the existing Draw2 vertical slice is expanded and
connected as follows. These are implementation scopes, not placeholders for future planning:

| Work Package | Scope | Required compatibility |
| --- | --- | --- |
| WP-100 | PiXiEEDraw2 project open/create vertical slice | Approved isolated strict-TypeScript Core, sparse indexed raster, Tile/COW/dirty path, Reference Renderer, local autosave seam, and noindex Preview Entry. |
| WP-110 | Reference Performance Checkpoint, then palette raster/pen/eraser | Checkpoint recorded before expansion; isolated Pen/Eraser/Palette/ bounded-cancellable Fill, dirty presentation, autosave, and renderer fallback implemented. Formal device/p95 remains UNTESTED and no production connection exists. |
| WP-110–150 | PiXiEEDraw2 raster/timeline, recovery, PXD, and Legacy import | Current PiXiEEDraw, `.pxd`, PiXiSYNC, project URLs, and autosave remain usable; real Legacy binary compatibility remains a release-time UNTESTED gate. |
| WP-160 | Draw-to-play preview foundation | Reconstructed PiXiGame/PiXiRuntime/Build Export specifications are mandatory context; Asset Revision binding, preview, input, safe hot reload, and Runtime state preservation remain implementation scope. |
| WP-170 | PiXiEEDraw/PiXiEEDraw2 Bridge and Asset Browser | Existing Draw assets and revisions open losslessly. |
| WP-180 | PiXiEELENS, camera, image intake, PixFind Bridge | Provenance and content-hash reuse; no accidental duplicate Blob/Asset. |
| WP-190 | PiXiAudio Bridge and audio project flow | Versioned WAV/audio references, package/license compatibility. |
| WP-200 | PiXiGame and PiXiRuntime Bridge | Draw assets, audio, controls, runtime builds, and project references converge. |
| WP-210 | Market, Package, Rights, Purchase, Entitlement, Royalty, Ledger | Existing products, purchases, licenses, prices, URLs, downloads, and payouts remain valid. |
| WP-220 | Direct work requests, quotes, agreements, milestones, delivery, and payment | Separate from general DM; no unverified entitlement or historical financial rewrite. |
| WP-230 | SNS, Community, Creator Page, My Page, and Market Cards | Posts reference Core entities; raw media is not directly uploaded to public SNS. |
| WP-240 | Admin, moderation, analytics, ads, and revenue projections | Read-only/shadow first; production and financial actions remain gated. |

## Full-site completion definition

The site-wide rebuild is not complete at WP-010. It is complete only when:

1. every listed product surface uses the Core identity/project/asset/package boundaries;
2. current PiXiEEDraw, PXD, PiXiSYNC, Market products, purchases, rights, URLs, and account data
   remain usable through compatibility adapters;
3. material and completed-work sales, direct work, and billing have separate auditable contracts;
4. App Shell, navigation, responsive/accessibility behavior, search, notifications, and public
   routing work across the site;
5. the integration harness proves cross-tool create → revise → package → use → publish → purchase
   or deliver → notify → recover flows with synthetic fixtures;
6. feature flags, shadow comparison, reconciliation, and rollback are proven before any owner
   approval request for production.

The package contract also requires a lossless current-PXD adapter and a new integrated PiXiPackage
model. Project-time edits remain split across immutable revisions, the Asset Graph, Journal, and
Checkpoint; export/distribution materializes either a lightweight reference package or a complete
embedded package. Published and purchased packages use locked revisions and dependencies.

Storage placement is also part of the completion contract: Memory is transient editing/playback
state, IndexedDB is structured Journal/index/queue metadata, OPFS is large local bytes and caches,
the server Database is confirmed authority, and Object Storage is immutable Blob/package/export
data. PiXiSYNC carries Commands/Operations/Revisions/Hashes/metadata and explicit Blob transfer
intent, not unbounded whole-file payloads.

## Non-negotiable preservation

The current production path is additive and remains the fallback. No Work Package in this program
may deploy, publish, apply production migrations, change real Market/PiXiSYNC data, replace a
public URL, or commit/push without an explicit separate authorization.
