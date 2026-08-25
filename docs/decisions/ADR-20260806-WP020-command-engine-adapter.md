---
adr_id: ADR-20260806-WP020-CMD-ADAPTER
title: Isolated Core Command Engine Adapter Before Runtime Wiring
status: ACCEPTED
date: 2026-08-06
---

# ADR-20260806-WP020 — Isolated Core Command Engine Adapter Before Runtime Wiring

## Context

WP-010 established the canonical reference contracts, but the repository already has live
PiXiEEDraw history/undo, PXD archive-v2, local journal/autosave, and PiXiSYNC document-operation
boundaries. Replacing those paths while implementing the first command engine would make it
impossible to distinguish a Core defect from a compatibility regression.

## Decision

Implement the WP-020 command path as a repository-native, browser-module-compatible adapter with a
dependency-free test harness, but keep it unloaded from the current production page. Use
structured-clone copy-on-write, strict validation, SHA-256 canonical operation IDs, inverse
operations, and dirty/build metadata. Defer runtime wiring to the later journal, Asset Graph, and
PiXiSYNC compatibility Work Packages.

## Consequences

- WP-020 has executable code and failure evidence without changing the current editor behavior.
- The current PXD, PiXiSYNC, Market, URL, and project data paths remain unchanged.
- WP-030–WP-050 must prove journal/recovery, Asset Graph, and convergence adapters before a Core
  command can be enabled behind a feature flag.
- The new module is a compatibility seam, not a claim that the whole PiXiEEDraw2 editor is complete.

## Rejected alternative

Directly replacing `app.js` history or PiXiSYNC operation application was rejected because the
preservation gate requires current project opening, confirmed revisions, recovery, and existing
PXD/PiXiSYNC behavior to remain usable during the staged rebuild.

