---
adr_id: ADR-20260807-WP080-APP-SHELL-TECHNOLOGY
title: Isolated App Shell uses native semantic components and tokenized CSS
status: ACCEPTED
date: 2026-08-07
---

# ADR-20260807-WP080 — Isolated App Shell technology

## Context

WP-080 needs a shared Shell and component contract while the current site remains a multi-entry
static web product with existing Draw, Market, PiXiSYNC, PXD, and account boundaries. Introducing a
new framework or external UI library at this point would add an initial dependency and bundle
boundary before the Shell contracts, update granularity, accessibility behavior, and coexistence
strategy are proven.

## Decision

Use native semantic HTML, a small route-local JavaScript controller, and CSS layers/design tokens
for the isolated `/core-shell/` Entry. Do not add a framework or external UI library in WP-080.
Native buttons, inputs, select, `role=tab`, `role=dialog`, `aria-modal`, live regions, and CSS media
queries provide the initial accessibility and responsive contract. A future library may be
considered only through a new ADR comparing bundle size, update granularity, accessibility,
maintenance, and coexistence; PiXiEED tokens and the Accessibility Contract remain authoritative.

## Temporary WP-070 adapter placement

The Shell consumes the existing `pixiedraw/assets/js/modules/core-feature-flag-rollback-utils.js`
only as a shared, unloaded adapter. Its implementation has no DOM, Canvas, network, clock, random,
or Editor State dependency; `window.PiXiEEDrawModules` is only the current host registry. The
adapter is not moved in WP-080. A later Core extraction may move the file while preserving its
factory/export contract and without changing WP-070 behavior.

## Consequences

- Initial Shell bundle remains small and compatible with the current static server.
- Tool/editor code stays out of the initial bundle and out of Shell state.
- The component contract is testable without a framework migration.
- A future framework adoption remains possible but requires evidence and a separate decision.
