# GAME-330 Build / Artifact Provenance Contract

## Boundary

GAME-330 is an isolated pure TypeScript value layer. It receives a validated
GAME-300 `GameProject` and caller-supplied, immutable lock claims; it does not
run a compiler, access DOM/network/filesystem/storage, mutate authoring or
runtime state, or publish an artifact.

## Canonical identity

`BuildPlan` is canonicalized with sorted capabilities and lock collections.
`planHash` covers the project revision hash, Behavior IR hash, target/profile,
module, capabilities, dependency locks, asset locks, and license grants.
`cacheIdentity` covers the plan identity and target/profile/module. The
`reproducibleBuildIdentity` additionally covers the sorted package entries and
their content hashes. An artifact identity is never a Project ID.

## Lock and package rules

- Every referenced Draw/Audio asset is pinned by asset ID, revision ID, kind,
  and SHA-256 content hash.
- Dependency IDs must exactly match the project dependency set; dependency lock
  cycles, duplicate IDs, missing licenses, and owner/revision mismatches fail
  closed.
- Package paths are relative, slash-separated, and cannot contain `.`, `..`,
  backslashes, NUL, absolute roots, or drive prefixes.
- Caller-provided hashes are claims only. Content and manifest hashes are
  recomputed; mismatch, duplicate paths, empty/partial packages, stale plans,
  and wrong caller/project claims do not produce `READY`.
- Cancellation has no artifact result. Quarantine and rollback preserve the
  original provenance while changing status away from `READY`.

## State separation

No field in the build plan or artifact manifest contains GAME-320 Runtime Save
State/world values. Project revision and runtime state remain separate; the
artifact references project provenance rather than replacing it.
