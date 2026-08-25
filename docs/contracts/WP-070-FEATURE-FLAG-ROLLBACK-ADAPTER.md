---
spec_id: CONTRACT-WP070-FEATURE-FLAG-ROLLBACK-001
title: WP-070 Core Feature Flag and Rollback Adapter
status: IMPLEMENTED_ISOLATED
classification: PRIVATE_INTERNAL_ONLY
version: 1.0.0
updated: 2026-08-07
---

# WP-070 Core Feature Flag and Rollback Adapter

`core-feature-flag-rollback-utils.js` implements the isolated WP-070 contract without loading the
current production page. It provides default-off flags, independent read/write rollout, stable
server cohorts, trusted server-only overrides, kill switches, scoped rollback, structured audit,
correlation, and shadow mismatch capture.

The evaluator requires active Identity, current server/RLS authorization, and resource permission
before it can select a new path. A client request cannot turn on a flag or configure a cohort. Flag
OFF, unknown, kill-switch, and rollback results select the current path; authorization failures are
denied and are not converted into a fallback that could bypass access control.

The adapter is storage/network/time/random independent. Its audit event IDs, correlation IDs, and
timestamps are supplied by the caller so a later server implementation can use its authoritative
clock and audit store. The adapter does not write Supabase, Market, PiXiSYNC, PXD, purchase,
entitlement, Commission, or Subscription records.
