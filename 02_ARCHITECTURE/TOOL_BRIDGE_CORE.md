---
spec_id: ARCH-TOOL-BRIDGE-CORE-001
title: PiXiEED Core Versioned Tool Bridge
status: NORMATIVE
classification: PRIVATE_INTERNAL_ONLY
version: 1.0.0
updated: 2026-08-07
depends_on:
  - 02_ARCHITECTURE/PROJECT_REGISTRY_CORE.md
  - 02_ARCHITECTURE/ASSET_REGISTRY_CORE.md
  - 02_ARCHITECTURE/ACCOUNT_PERMISSION_CORE.md
  - 02_ARCHITECTURE/FEATURE_FLAG_OBSERVABILITY_ROLLBACK_CORE.md
---

# Versioned Tool Bridge Core

WP-093 freezes the common connection contract between PiXiEED Core and current/future Tools. It
is a pure, unloaded reference implementation. It does not implement an editor, renderer, player,
converter, Storage client, package builder, Market, SNS, or transport.

**Terminology boundary:** この文書のVersioned Tool Bridgeは、PiXiEED Core内部の参照・能力・
アダプター契約であり、Aseprite／Unity等を接続する別製品のPiXiEED Bridgeネイティブアプリ
ではない。また、この契約はDraw2の同期transportを選択しない。Draw2の標準同期はPiXYNC
（ローカル3モードセッション＋オンラインprovider）が担い、外部PiXiEED Bridgeは任意の
相互運用経路として別に扱う。

## Identity and registration

`toolId` and `toolVersion` are Tool-owned identities. `bridgeApiVersion` is a separate Core-owned
contract version. The initial registered Tool IDs are `pixiedraw`, `pixiedraw2`, `pixieaudio`,
`pixigame`, `pixiruntime`, `pixfind`, `camera-image`, `market-package`, and `social-card`.
Registration accepts only a server trust decision; a client cannot register an Admin or substitute
another Tool ID. Duplicate IDs, unsupported Bridge versions, incompatible Core ranges, and unknown
Capabilities fail closed. Current PiXiEEDraw and PiXiEEDraw2 remain separate Tool IDs.

## Capabilities

Capability negotiation returns only requested capability descriptors and bounded Limits. Examples
include project open/import/export, Asset read/create/revision/live/review/fork, preview, package,
legacy PXD/PiXiSYNC read, and Game/Audio cross-consumption. Tool availability and capability
presence are not inferred from a route or UI label.

## Envelope boundary

Requests contain Request ID, Bridge API Version, Tool ID, opaque Actor Context Reference, Project
and Asset references, Operation, Capability Version, Correlation/Causation IDs, Idempotency Key,
Expected Version, bounded Payload Metadata, trusted server Authorization, and host-provided time
evidence. Results contain status, reference-only result, typed Diagnostic, Retryability,
Compatibility Warnings, updated Project/Asset references, and correlation.

The Bridge never transports raw Pixel/Audio buffers, WAV/MP3/PXD/PiXiPackage/Game Build bytes,
Base64, Data URLs, or unbounded JSON. It may carry Content Hash and an opaque `handle:` Storage
reference. Asset Registry/Storage adapters own Blob retrieval and verification.

## Project and Asset operations

Project operations are reference-level Create/Open/Close/Import/Export/Compatibility/Legacy
Resolve/Copy/Migration-Prepare/Capabilities. Asset operations are reference import/attach/detach,
Revision resolve/create, update subscription, review request/accept, fork, and compatibility.
The Project Registry and Asset Registry remain authoritative; Bridge handlers cannot rewrite the
source Project during Legacy Import. Copy/Migration is an explicit result boundary.

`LIVE`, `PINNED`, `REVIEW`, and `FORKED` remain WP-092 policy values. The Bridge does not create a
second policy state machine: it only forwards bounded invalidation/update/revision events. Tool
rendering, Audio replacement, Game Preview invalidation, and approval are Tool or Registry
responsibilities.

## Events, transports, and cancellation

Events carry Event ID, origin/target Tool, Project/Asset/Revision references, Event Type,
Correlation/Causation IDs, chain depth, visited Tool IDs, and bounded metadata. Duplicate Event IDs,
unknown causation, duplicate chain entries, visited Tool cycles, and excessive depth fail closed.
An injected transport may later be an in-process bus, MessageChannel, Worker, PiXiSYNC, or server
Realtime. The Core contract does not select one.

Begin/Complete/Cancel is host-controlled. Cancellation leaves the source Project unchanged, cannot
promote a partial Revision or temporary Blob, and cannot publish an incomplete Package. Timeout
measurement is an Adapter concern; Core never calls a wall clock directly.

## Compatibility and legacy

Compatibility returns `SUPPORTED`, `SUPPORTED_WITH_ADAPTER`, `READ_ONLY`, `COPY_REQUIRED`,
`REVIEW_REQUIRED`, `UNSUPPORTED`, or `QUARANTINED`, with required Adapter, unsupported features,
warnings, data-loss risk, and copy requirement. Current PXD archive-v2 is represented through the
unloaded `pixiedraw-current-thin-bridge`; it does not modify `pixiedraw/`, current PiXiSYNC, or
current exports.

## Security, flags, and performance

The Authorization object must be a server allow decision and is passed to the WP-060 permission
boundary. Project/Asset substitution, Tool/Capability spoofing, preview-to-source escalation,
private unauthorized references, and untrusted registration fail closed. Bridge flags are
independent and default-off: `tool-bridge-read`, `tool-bridge-write`, `tool-bridge-live-events`,
`tool-bridge-legacy`, `tool-bridge-package`, and `tool-bridge-preview`.

Pointer moves, individual pixels, Audio samples, animation frames, and duplicate revisions are
not Bridge events. Tools batch meaningful committed state changes into Revision/Metadata events.
No WP-093 module is loaded by the current Shell or production route.
