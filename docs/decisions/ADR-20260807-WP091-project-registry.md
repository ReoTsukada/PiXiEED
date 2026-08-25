# ADR-20260807-WP091 — Isolated Project Registry Core

- Status: Accepted for WP-091
- Date: 2026-08-07
- Scope: Project identity, metadata, ownership, visibility, lifecycle, legacy binding, listing, and switcher contract

## Decision

Implement the canonical Project Registry as an unloaded, framework-neutral ESM contract with an
in-memory reference adapter. Keep the implementation at
`core-shell/assets/core-project-registry-contracts.js` for the current isolated Core work area;
do not load it from the App Shell or current production PiXiEEDDraw. Inject clock, ID, random,
network, feature-flag, and permission adapters so the contract can later move to PiXiEED Core
without acquiring DOM, Canvas, browser-storage, or editor-State dependencies.

## Rationale

The Registry is the shared identity boundary for Draw, Draw2, Audio, Game, PixFind, camera/image,
and future registered tools. It must preserve current project IDs, owner/member semantics, legacy
PXD/PiXiSYNC bindings, public/private URL behavior, and Market/rights references without becoming a
content store. A separate contract prevents a future Project Switcher or Editor integration from
silently coupling project metadata to pixel/audio/game bytes.

## Constraints recorded

1. `projectId` is canonical; project names are not globally unique by default.
2. Unknown project/tool/format/version values fail closed and new tools require registration.
3. Registry metadata excludes Blob/PXD/package bodies, Journal, Checkpoint, Operations, full Editor
   State, Base64/Data URLs, JWT/email/secret, Commission body, and Market/Payment/Entitlement data.
4. Server permission is authoritative. Private guessed existence may be concealed with 404; known
   denied access may return 403. Public read never grants write.
5. Lifecycle has no hard delete. Trashed records retain restore and relationship references;
   legacy conflicts are quarantined and originals remain preserved.
6. Commands are idempotent and optimistic-concurrency checked. Events are bounded metadata facts.
7. Listing is server-filtered, cursor-based, deterministic, and bounded. Search indexing is WP-096.
8. Five Project Registry flags are default-off. Read/write are separate and rollback selects the
   preserved current path without mutating existing data.

## Compatibility and non-application

The current PXD archive-v2 reader/writer, current PiXiSYNC RPC/Realtime/history, existing routes,
Market products/purchases/rights, account/auth, Supabase tables, Storage objects, and real Projects
remain authoritative. WP-091 uses only synthetic fixtures and an in-memory adapter. No database
schema, RLS policy, migration, URL redirect, production registration, or current-project mutation
is part of this ADR.

## Verification

`node scripts/test-core-project-registry-wp091.mjs` passed with 14 commands, 11 events, and 22
failure cases. `node --check` passed for the contract and test. Baseline Failure Identity remains
the inherited 14/14 match with zero new identities; the WP-000–WP-090 implementation packages were
not re-executed.
