# ADR WP-190 — Isolated PiXiAudio Core Bridge and Final Draw2 Integration Gate

Status: `Accepted for isolated implementation; external audit pending`  
Date: `2026-08-09`

## Decision

Build PiXiAudio as a separate, lazy, DOM-free Core bridge. Reuse the existing Asset Graph,
immutable Revision, Package/License Snapshot, Storage Placement, Event, Feature Flag, and Runtime
contracts. Keep Audio Editor/Preview/Export adapters injected and separate from raw Audio bytes.

Add deterministic populated Draw2 fixtures and final UX/performance gap evidence in WP-190 so a
blank Workspace cannot be mistaken for a production-ready Pixel Editor.

## Alternatives rejected

- Put PCM/WAV/MP3 bytes in the Core or Project Registry: rejected due to storage, privacy, and
  synchronization boundaries.
- Add Audio directly to Draw2 Initial Editor: rejected; Audio is a lazy on-demand capability.
- Modify current Audio/Market/PiXiSYNC/PXD paths: rejected until compatibility and release gates.
- Treat Chromium responsive screenshots as Physical Mobile/Stylus/Screen Reader or full
  compositor proof: rejected; those statuses remain UNTESTED/PARTIAL.

## Consequences

Audio encoding, decoding, playback, OPFS/Object Storage, and Realtime implementations remain
replaceable adapters. Preview can swap at a safe playhead boundary, Export requires a validated
PINNED dependency set, and Market/Runtime receive only explicit package references. WP-190 can be
audited locally without changing existing user data or public routes.
