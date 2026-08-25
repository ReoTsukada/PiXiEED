# ADR-20260813-AUDIO-220 — Audio Package / License Compatibility

- Status: Accepted for isolated AUDIO-220 reference implementation
- Scope: Audio package manifest, exact dependency lock, license/provenance snapshot, export/import
  validation, revision/hash binding, and fail-closed diagnostics

## Decision

Add a pure TypeScript AUDIO-220 boundary under `pixiedraw2/src/audio/audio-220`. It consumes the
canonical AUDIO-200 revision and AUDIO-210 event graph, requires `PINNED` edges, and creates a
deterministic manifest with a dependency-lock hash, snapshot hashes, complete license/provenance
snapshots, manifest hash, and envelope hash.

The raw audio is never accepted as package authority. A source or rendered blob is represented by
a safe locator and immutable metadata only. Canonical license/provenance adapters resolve the
snapshots; caller-supplied claims are checked against those values and cannot override them.

Export and import validate schema/version, exact lock fields, hashes, snapshot bindings, duplicate
IDs, cycles, path traversal, malformed JSON, and raw payload absence. `PORTABLE` rejects an
ephemeral memory locator because offline materialization cannot be claimed from a non-persistent
source. Failures return typed diagnostics and do not produce a READY package.

## Consequences

This is an additive isolated contract. It does not publish, sell, upload, migrate, modify current
routes/data, or call Market/PiXiSYNC/Registry/Queue/State/Context. Real Storage, browser/device,
production, commerce, and independent external review remain `UNTESTED` until their separate
authorized gates.

