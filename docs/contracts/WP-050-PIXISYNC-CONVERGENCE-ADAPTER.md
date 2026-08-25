---
spec_id: CONTRACT-WP050-PIXISYNC-CONVERGENCE-001
title: WP-050 Core PiXiSYNC Convergence Adapter
status: IMPLEMENTED_ISOLATED
classification: PRIVATE_INTERNAL_ONLY
version: 1.0.0
updated: 2026-08-07
---

# WP-050 Core PiXiSYNC Convergence Adapter

`core-pixisync-convergence-utils.js` is a storage-neutral convergence harness. It models confirmed
revision ordering, duplicate-idempotent delivery, gap detection, structure-epoch guards, offline
pending Operations, guarded undo conflicts, and rejection of unbounded Blob payloads.

The adapter synchronizes Command/Canonical Operation, revision, structure metadata, content hash,
Asset Revision references, and explicit Blob transfer intent. It does not put image/audio/game bytes
inside an Operation and does not replace the current `collab_v1` RPC/Realtime or IndexedDB pending
queue. The current PiXiSYNC path remains authoritative until a later bridge passes two-client,
offline, lifecycle, authorization, storage, and rollback gates.

