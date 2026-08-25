# ADR-20260807-WP092 — Isolated Asset Registry Core

- Status: Accepted for WP-092
- Date: 2026-08-07
- Scope: Asset identity, immutable revisions, verified Blob references, dependencies, provenance, live update, and safe lifecycle

## Decision

Add a pure Core Asset Registry at
`core-shell/assets/core-asset-registry-contracts.js` and keep the existing WP-040
`core-asset-graph-utils.js` host adapter unchanged. The new Registry is not loaded by the Shell or
current production pages. Clock, ID, random, network, Blob verification, permission, retention,
and feature flag behavior are injected.

## Rationale

All PiXiEED tools need a common Asset/Revision/Dependency boundary so Draw2 changes can notify Game
or Audio without mutating another tool's local record. Separating Asset identity from immutable
Revision and verified content-addressed Blob metadata allows LIVE/PINNED/REVIEW/FORKED behavior,
safe package locks, and future cross-device Event adapters without putting bytes in Database rows,
Operations, or Project Registry metadata.

## Rules recorded

1. Unknown Asset Kind, Reference Policy, relation, Tool, Format, typed ID, lifecycle transition,
   or unsafe Storage Locator fails closed.
2. Client Hash/size/MIME are untrusted. A trusted Blob Verifier must produce matching evidence.
3. Same Hash is reusable across Assets; same Asset cannot publish identical content twice. Revision
   records are immutable and HEAD changes are optimistic-concurrency checked.
4. LIVE follows HEAD, PINNED never follows, REVIEW records a candidate, and FORKED creates an
   independent Asset ID with provenance. Forbidden cycles fail; only RUNTIME_BINDS is explicit
   cycle-allowed at this layer.
5. Public Preview and source access are separate. Private guessed existence is hidden. Active
   dependents or retention locks block trash; Hard Delete is not implemented.
6. Events contain bounded IDs/Hash/reason/correlation metadata only. No Blob body, Locator, Post,
   payment, license body, royalty, purchase, entitlement, or Commission content is stored.
7. Read, Write, Revision, Live, Legacy Adapter, and Upload flags are independent and default-off.

## Compatibility and non-application

Current PiXiEEDraw, PXD archive-v2, PiXiSYNC history/transport, camera/PixFind references, Market
products/purchases/rights, SNS routes, Supabase tables, Storage objects, and real Assets remain
unchanged. Legacy resolution uses synthetic mappings only; no real Asset is copied or migrated.
The SNS remnants are inventory-only and are not deleted in WP-092.

## Verification

`node scripts/test-core-asset-registry-wp092.mjs` passed with 11 commands, 12 events, and 36
failure fixtures. Baseline Failure Identity remained 14/14 inherited matches with zero new
identities. No WP-000 through WP-091 implementation package was re-executed.
