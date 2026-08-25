---
adr_id: ADR-20260807-PIXIEEDRAW2-product-spec-reconstruction
status: ACCEPTED_FOR_CONTEXT
date: 2026-08-07
scope: WP-110 onward Draw2 Context
---

# ADR: Reconstruct the mandatory PiXiEEDraw2 product specification

## Decision

Add `03_PRODUCTS/PIXIEEDRAW2_SPEC.md` as the mandatory product reference for WP-110 and
subsequent Draw2 Work Packages. The file is explicitly marked `RECONSTRUCTED_CANONICAL`.

## Evidence and provenance

The original path was checked in the working tree and with:

```text
git log --all --full-history -- 03_PRODUCTS/PIXIEEDRAW2_SPEC.md
```

No original file or historical blob was found. The specification was reconstructed only
from the approved repository sources listed in its front matter and the detailed mapping
in `docs/inventory/pixiedraw2-product-spec-provenance.json`. No future feature is stated
as implemented; each requirement has an explicit `CURRENT SLICE`, `PLANNED`, `ADVANCED`,
or `FUTURE EXTENSION` status.

## Consequences

- Context generation fails with a Validation Error when this mandatory file is absent;
  it never auto-generates the file to pass.
- WP-110 and later Draw2 contexts include the same product authority.
- The existing current editor, PXD, PiXiSYNC, routes, Market, Projects, Assets, Packages,
  database, and Storage remain unchanged.
- If a later canonical decision supersedes a requirement, that change must be recorded by
  a new ADR and a provenance update.
