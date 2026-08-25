---
spec_id: CONTRACT-WP020-CMD-ADAPTER-001
title: WP-020 Core Command Engine Adapter Contract
status: IMPLEMENTED_ISOLATED
classification: PRIVATE_INTERNAL_ONLY
version: 1.0.0
updated: 2026-08-06
---

# WP-020 Core Command Engine Adapter Contract

## Implemented path

`pixiedraw/assets/js/modules/core-command-engine-utils.js` follows the repository's existing
browser module convention (`window.PiXiEEDrawModules`) and implements:

```text
Command Envelope
  → envelope validation
  → registered handler validation
  → structured-clone draft
  → atomic handler apply
  → canonical operation and deterministic ID
  → inverse operation
  → dirty asset/region and build invalidation result
```

The first handler is `raster.setPixel`. It validates project, structure epoch, client sequence,
duplicate command ID, raster dimensions, palette index, and pixel storage before cloning or mutating
state. Failed execution returns the original state reference and diagnostics; successful execution
returns a new state.

## Compatibility boundary

This adapter is intentionally not loaded into the current PiXiEEDraw production page in WP-020.
The existing `app.js` history, PXD archive-v2 storage, local journal/autosave, and PiXiSYNC document
operation paths remain authoritative. WP-030–WP-050 must add explicit adapters and conformance gates
before any Core command is allowed to drive those paths.

## Determinism

Canonical JSON sorts object keys, normalizes `-0`, rejects non-finite values, and encodes
`Uint8Array` values explicitly. Operation IDs use SHA-256 over the operation without its ID. The
command envelope's monotonic timestamp is not included in the operation identity, so the same
logical command produces the same operation ID.

## Test evidence

`scripts/test-core-command-engine-wp020.mjs` covers atomic input preservation, duplicate rejection,
client sequence gaps, structure epoch mismatch, out-of-bounds pixels, inverse restoration,
deterministic IDs, and dirty/build metadata. The module passes `node --check` and `git diff --check`.

