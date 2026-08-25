# ADR-20260813 — DRAW-160 Draw-to-Play Boundary

## Status

Accepted for isolated reference implementation.

## Decision

Keep Draw2 authoring and PiXiRuntime execution as separate ownership domains.
Expose a small Draw2 adapter at
`pixiedraw2/src/draw2/draw-160/preview-boundary.ts` rather than adding editor
UI or authoring state to the Runtime bundle. Canonical Registry resolution is
the authority seam for all asset revisions and entitlements.

The four modes are explicit: `LIVE`, `PINNED`, `REVIEW`, and `FORKED`. The
adapter rejects caller substitution, invalid license/permission, unapproved
review, fork mismatch, and mode mismatch. Hot reload is allowed only after a
new canonical dependency snapshot is accepted. Rollback stores and restores
the matching reference and Runtime session as one unit.

## Protected systems

Current PiXiEEDraw routes, existing PXD, PiXiSYNC, Market, rights/commerce
data, database/storage, Runtime production, deploy, publish, commit, and push
are outside this package and were not changed.

## Qualification note

The implementation is an isolated reference checkpoint. Browser UI, physical
device, full compositor, native packaging, cloud build, production Runtime,
and real user PXD compatibility are not promoted from synthetic tests.
