# ADR-20260813-AUDIO-240 — Isolated Audio Completion Gate

## Decision

Implement AUDIO-240 as a host-neutral, read-only evidence gate under
`pixiedraw2/src/audio/audio-240/**`. The gate consumes the canonical contracts from
AUDIO-200/210/220/230 and returns a deterministic decision with explicit `PASS`, `UNTESTED`,
`PARTIAL`, or `BLOCKED` semantics. It never publishes packages and always returns
`publishAllowed: false`.

## Rationale

Completion evidence must not be inferred from a successful unit test or from caller metadata.
Recomputing project, graph, binding, and package hashes catches tampering and stale evidence;
checking the injected evidence clock prevents expired proof from becoming a false PASS. The
environment statuses make browser/device/production gaps visible rather than silently promoting
an isolated fixture to release readiness.

## Consequences

- LIVE remains a valid bridge/preview mode and is surfaced in `referenceModes`.
- A package with LIVE bindings is rejected because package dependencies are PINNED by AUDIO-220.
- Browser, physical-device, native-audio, accessibility, production, Market, PiXiSYNC, route,
  Registry, Queue, State, Context, deploy, commit, and push work remains outside this ADR.
- The current result is isolated reference evidence, not a production or cutover approval.

## Review status

Coordinator review covered the allowed diff, positive/negative fixtures, scope, and static
contracts. An independent external/browser/device/production review was not run and is recorded
as `UNTESTED` in the AUDIO-240 evidence inventory.

