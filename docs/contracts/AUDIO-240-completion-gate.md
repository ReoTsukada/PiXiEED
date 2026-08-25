# AUDIO-240 Completion Gate Contract

Status: isolated reference implementation, schema `AUDIO-240_V1`.

## Boundary

The gate is pure TypeScript. It aggregates already-canonical AUDIO-200 project/state
evidence, AUDIO-210 event graph/binding evidence, AUDIO-220 package/lock evidence, and
AUDIO-230 workspace evidence. It does not read the DOM, network, filesystem, Storage,
AudioContext, native devices, Market, PiXiSYNC, production routes, or package bytes.

The gate is a decision record, not a publisher. `publishAllowed` is always `false`; no
package, route, license, entitlement, or production state is changed.

## Decision rules

- `PASS` requires valid non-stale evidence, canonical project hash, graph hash and binding
  hashes, coherent project/revision identity, valid package hash/lock, bounded workspace
  geometry with page scroll disabled, complete cross-tool LIVE/PINNED rollback evidence,
  and `PASS` browser/device/production statuses.
- Missing package or any browser/device/production status other than `PASS` yields
  `UNTESTED`, never `PASS`.
- Contradictory identity, stale revision, hash mismatch, unsafe page scroll, or a package
  containing a `LIVE` graph yields `BLOCKED`.
- `LIVE` and `PINNED` are counted and preserved. LIVE is valid for preview/bridge evidence,
  but a package lock is fail-closed because AUDIO-220 package dependencies are `PINNED`.
- The clock is injected through `nowMs` and `maxAgeMs`, so the result is deterministic and
  testable without an ambient clock.

## Evidence boundary

The gate reports static and sanitized fixture evidence only. Browser UI, physical device,
native audio output, screen reader/Safari/Firefox, long-session hardware, production-equivalent
staging, migration, RLS/provider, rollback rehearsal, publish, and cutover remain `UNTESTED` or
out of scope until separately measured.

