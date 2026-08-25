# ADR-20260813 — DRAW-170 Advanced Workspace Boundary

## Status

Accepted as a completed isolated implementation checkpoint; device and release
qualification remain separate gates.

## Decision

Keep Advanced Tools in a pure module with no DOM, Canvas, Network, Storage, or
provider dependency. Use a separate lazy Editor adapter and submit exactly one
canonical `raster.writeSet` for a committed operation. Preview and overlay
state remain outside the canonical raster and are never sent as PiXiSYNC
operations.

Use the existing PiXiEED Core and typed Asset/Revision/Package contracts. Do
not create a parallel raster, layer, frame, cel, or package authority. Market
integration stops at preparation, and Runtime/UI/current-site boundaries remain
separate.

The initial editor entry must not statically include PNG/PXD export and import.
Those operations are loaded through the isolated `draw2-export.js` chunk on the
first export/import action. This is an entry-boundary correction only; it does
not change the canonical PXD authority or export contract.

## Performance decision

The Dither planner may skip redundant canonicalization only when its generator
proves row-major unique writes. Operation identity uses a deterministic ordered
WriteSet fingerprint rather than serializing the entire write array. This is a
behavior-preserving optimization measured against the local synthetic suite.
The local advanced Stress fixture has no observed Long Task candidate after the
measured deterministic write-deduplication optimization. Worker topology is not
selected without a benchmark showing a net gain.

## Qualification decision

Desktop/Mobile browser observations are recorded as local reference evidence.
Physical devices, stylus, full compositor/GPU, Safari/Firefox, long-session
memory, native shell, cloud build, production performance, and real user data
remain `UNTESTED`. Existing routes, PXD, PiXiSYNC, Market, and production data
are protected.
