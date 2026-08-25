# ADR: FP-007 Reproducible-build boundary

Status: `ACCEPTED_FOR_ISOLATED_REFERENCE`

## Context

FP-007 needs to connect schema identity, dependency resolution, build inputs,
distribution topology, source mapping, and artifact provenance without turning
an isolated fixture result into a release claim. The current repository contains
known floating dependencies, incomplete lock evidence, a dirty worktree, and an
existing staging path with ambient build values.

## Decision

Keep FP-007 as a read-only, offline, coordinator-owned evidence boundary. Use
exact schema identity, dependency/lock/toolchain/environment digests, canonical
repository-relative manifests, explicit initial/lazy artifact roles, and a
source-to-dist provenance chain. Report analyzer, isolated fixture, current
repository qualification, and independent review separately.

The isolated reference is allowed to pass its deterministic attack fixtures.
Current-repository findings remain `FAIL`, `BLOCKED`, `UNKNOWN`, or `UNTESTED`
as observed. No package, lockfile, Deno config, build script, migration, route,
or production data is changed to make the evidence pass.

## Rejected alternatives

- Treating a passing synthetic fixture as a clean-repository or production build
  would hide dirty inputs and nondeterministic staging behavior.
- Automatically normalizing `latest`, caret, tilde, local, or missing-lock
  dependencies would change dependency authority outside this package.
- Recording timestamps, host paths, user identity, secrets, or project content
  would make evidence nondeterministic and violate the privacy boundary.
- Starting CORE-100 immediately after local tests would bypass independent review
  and current-repository qualification.

## Consequences

FP-007 can prove the reference contracts and negative cases now, while release
qualification remains blocked until separately owned remediation and clean
qualification are performed. The evidence is deterministic and safe to retain,
but it intentionally does not claim production, browser, device, staging, or
legacy-user-data compatibility.

## Ownership and next gate

Dependency/build owners remediate floating declarations, lock evidence, review
dispositions, and staging nondeterminism. The release qualification owner runs
clean-checkout repeat builds and real distribution/provenance checks. The FP-007
coordinator maintains the cross-track evidence contract. An independent reviewer
must review the actual diff, negative cases, evidence, and residual findings.

CORE-100 remains blocked by the FP-007 completion gate and `autoStartNext: false`.
It may begin only after a fresh Context/Registry check and explicit authorization.

No current route, PiXiEEDraw, PXD, PiXiSYNC, Market, production data, migration,
deployment, publish, commit, or push is part of this decision.
