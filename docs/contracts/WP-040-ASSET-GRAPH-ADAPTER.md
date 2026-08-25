---
spec_id: CONTRACT-WP040-ASSET-GRAPH-001
title: WP-040 Core Asset Graph Adapter
status: IMPLEMENTED_ISOLATED
classification: PRIVATE_INTERNAL_ONLY
version: 1.0.0
updated: 2026-08-07
---

# WP-040 Core Asset Graph Adapter

`core-asset-graph-utils.js` provides a storage-neutral graph for immutable Blob records, Asset
nodes, Asset Revisions, and consuming references. The adapter enforces content-hash Blob reuse,
copy-on-write revisions, stable Asset/Revision IDs, and explicit `LIVE`, `PINNED`, `REVIEW`, and
`FORKED` modes.

Published or purchased references are fixed to a Revision and approval actor through `PINNED`.
Development references may follow the latest compatible revision through `LIVE`. `REVIEW` records a
candidate without silently changing the consumer. `FORKED` records a derived lineage. Asset
tombstones preserve graph and revision history instead of deleting data needed by dependents.

This is not yet the Package Registry or production Asset database. WP-094 adds reference/embedded
package materialization and Dependency Lock; later Core Registry work adds persistence and
authorization adapters.

