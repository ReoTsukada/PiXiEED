# ADR-001: AUDIO-200 canonical metadata and journal

## Decision

Keep raw audio outside canonical Project/Revision state. Recompute source metadata and SHA-256 at the verifier boundary, then persist only typed metadata plus a safe relative locator. Use immutable state hashes, a hash-chained local journal, checkpoints, and explicit undo/redo/recovery transitions.

## Rationale

This prevents caller metadata or mutable Blob bytes from becoming authority, makes stale/duplicate edits rejectable, and permits offline recovery after source/cache loss while preserving a diagnostic. The implementation remains additive and isolated from WP-190, Registry/Queue/State/Context, AUDIO-210, production, and physical devices.

## Consequences

The current reference codec scope is WAV PCM/IEEE float. Browser/native decode, device output, production Storage, and deployment are intentionally unimplemented and remain `UNTESTED`.

