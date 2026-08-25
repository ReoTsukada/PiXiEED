---
spec_id: CONTRACT-WP030-JOURNAL-RECOVERY-001
title: WP-030 Core Journal, Checkpoint, and Recovery Adapter
status: IMPLEMENTED_ISOLATED
classification: PRIVATE_INTERNAL_ONLY
version: 1.0.0
updated: 2026-08-07
---

# WP-030 Core Journal, Checkpoint, and Recovery Adapter

`pixiedraw/assets/js/modules/core-journal-recovery-utils.js` implements the integrity layer without
owning IndexedDB, OPFS, network, or production persistence. It provides:

- ordered journal records with duplicate operation rejection;
- SHA-256 hash chaining and deterministic verification;
- validated Project State checkpoints with state hash and journal anchor;
- tail replay from a checkpoint onto a cloned state;
- corruption, gap, unsupported-version, invalid-ID/dimension, and apply-failure diagnostics.

The adapter is intentionally storage-neutral. WP-030 does not replace the current
`local-project-journal-utils.js`, V2 autosave, PXD archive-v2, or PiXiSYNC checkpoint storage. A
later integration must add an async IndexedDB/OPFS queue, durable-write acknowledgement, migration,
and feature-flagged compatibility comparison before using this Core path in a runtime.

The placement boundary is explicit: IndexedDB stores the structured Journal record and its
acknowledgement/checkpoint metadata; OPFS stores large tiles, audio, caches, and checkpoint bytes;
Memory stores only the active state. The Journal record contains references, hashes, and status,
not an unbounded image/audio payload.

The integrated PiXiPackage uses the same separation: Project Manifest and Asset Graph references
remain small, immutable Blobs remain content-addressed, Journal records confirmed commands, and
Checkpoints bound recovery cost. Full embedded export is a materialization operation, not a reason
to rewrite the working project on every edit.
