# WP-093 Versioned Tool Bridge API

## Status

Completed as an isolated Core contract on 2026-08-07. WP-000 through WP-092 were preserved and
not re-executed. No current route, PiXiEEDraw, PXD, PiXiSYNC, Market, SNS, Project, Asset,
Purchase, License, Royalty, database, Storage, production migration, upload, deploy, publish,
commit, or push was performed.

## Canonical contract

- `bridgeApiVersion` is independent from `toolVersion`.
- Trusted Tool Descriptor registration requires a server decision; Current Draw and Draw2 have
  separate Tool IDs.
- Capability negotiation returns bounded versions and limits, not a giant descriptor per request.
- Request/Result envelopes carry typed IDs, hashes, opaque Handle references, and bounded metadata;
  raw bytes, Base64, Data URLs, PXD/package bodies, and full Editor State are forbidden.
- Project/Asset/Revision authority remains in WP-091/WP-092; Bridge handlers are adapters.
- Authorization is a server decision passed to the WP-060 permission boundary. Client Actor/Tool/
  Capability claims cannot override it.

## Operations and results

The v1 contract covers Project open/create/close/import/export/compatibility/legacy resolve/copy/
migration/capability operations, Asset reference attach/detach/import, Revision resolve/create,
update subscription, Review request/accept, Fork, Asset compatibility, Preview, Package, and
Market preparation boundaries. Results contain typed status, Diagnostic, Retryability, Compatibility
Warnings, and updated references. No operation executes a real Tool.

## Event and cancellation contract

`INVALIDATE`, `UPDATE_AVAILABLE`, and `REVISION_CHANGED` use Event/Causation/Correlation IDs,
origin/target Tool IDs, Asset/Revision references, visited Tool chain, and bounded depth. Duplicate
events, unknown causation, and event loops fail closed. In-memory subscription and injected
transport are synthetic adapters only. Begin/Complete/Cancel prevents partial Revision or Package
promotion.

## Compatibility and Legacy Draw

Compatibility supports `SUPPORTED`, `SUPPORTED_WITH_ADAPTER`, `READ_ONLY`, `COPY_REQUIRED`,
`REVIEW_REQUIRED`, `UNSUPPORTED`, and `QUARANTINED`, with Adapter, warning, data-loss, and copy
fields. `core-legacy-draw-bridge-contract.js` carries current PXD/Project/PiXiSYNC/Asset/Export
references only. It is not imported by the current Draw page.

## Feature Flags

The independent default-off flags are `tool-bridge-read`, `tool-bridge-write`,
`tool-bridge-live-events`, `tool-bridge-legacy`, `tool-bridge-package`, and
`tool-bridge-preview`. Kill switch returns a typed fallback diagnostic without changing existing
Project, Asset, PXD, PiXiSYNC, Market, Purchase, License, Royalty, or SNS data.

## Related files

- `02_ARCHITECTURE/TOOL_BRIDGE_CORE.md`
- `core-shell/assets/core-tool-bridge-contracts.js`
- `core-shell/assets/core-legacy-draw-bridge-contract.js`
- `core-shell/schemas/tool-bridge-v1.schema.json`
- `core-shell/fixtures/tool-bridge-v1.valid.json`
- `scripts/test-core-tool-bridge-wp093.mjs`
- `docs/decisions/ADR-20260807-WP093-tool-bridge.md`
- `docs/inventory/wp093-tool-bridge-boundary.json`
