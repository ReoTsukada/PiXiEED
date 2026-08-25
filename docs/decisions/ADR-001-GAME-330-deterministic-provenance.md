# ADR-001 GAME-330 Deterministic Provenance

- Status: Accepted for isolated reference implementation
- Scope: GAME-330 only

## Decision

Build identity is derived exclusively from canonical JSON values and SHA-256
hashes. No timestamp, random value, host path, compiler side effect, or caller
claimed artifact hash participates in identity. Asset revisions, dependency
locks, licenses, project revision hash, Behavior IR hash, package entry hashes,
and target/profile are explicit provenance inputs.

## Consequences

The implementation can prove reproducibility and detect stale, missing,
tampered, duplicate, traversal, and wrong-claim inputs without a host adapter.
Actual compiler/toolchain execution, signing, Store submission, production
deployment, and publishing remain future bounded work and are `UNTESTED` here.
Failed, cancelled, partial, or quarantined material is never represented as a
`READY` artifact.

## Rejected alternatives

- Trusting a caller-provided artifact hash: cannot detect tampering.
- Using Project ID as artifact identity: collisions across target/package
  inputs and loss of build provenance.
- Including wall-clock build metadata: breaks reproducibility.
