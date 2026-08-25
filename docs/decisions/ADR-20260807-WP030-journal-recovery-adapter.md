---
adr_id: ADR-20260807-WP030-JOURNAL-RECOVERY
title: Storage-neutral Core Journal and Checkpoint Adapter
status: ACCEPTED
date: 2026-08-07
---

# ADR-20260807-WP030 — Storage-neutral Core Journal and Checkpoint Adapter

## Context

PiXiEED already has production local journal/autosave, V2 project storage, PXD archive-v2, and
PiXiSYNC checkpoint paths. The new Core needs ordered operations, integrity checks, and recovery
semantics, but replacing current persistence before measuring browser/mobile storage behavior would
violate the preservation gate.

## Decision

Implement WP-030 as a storage-neutral adapter first. Journal records are ordered and hash-chained;
checkpoints contain a cloned, validated state, a state hash, a journal length, and a last-operation
anchor; recovery verifies the complete chain and replays only the tail onto a cloned state. The
adapter does not call IndexedDB, OPFS, network, wall-clock, or random APIs.

## Consequences

- Integrity and failure behavior can be tested without production writes.
- The existing local journal, PXD archive-v2, and PiXiSYNC persistence remain authoritative.
- A future storage adapter must prove durable acknowledgement, interrupted-write recovery,
  migration, and browser/mobile benchmarks before runtime wiring.
- Integrated PiXiPackage work can use Journal/Checkpoint as project-time structures while keeping
  lightweight references and complete embedded exports separate.

## Rejected alternative

Directly writing the new journal into current IndexedDB or changing current PXD/autosave records was
rejected because it would mix a new schema with existing user data before a lossless migration and
rollback gate exists.

