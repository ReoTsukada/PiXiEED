# Qualification Evidence Contract V1

This is the shared evidence contract for every PiXiEED Work Package after
CORE-120 and for every gate that consumes predecessor evidence. A package is
not qualified by a prose report or a test count alone. Each acceptance ID must
emit one stable row and the row must be reproducible from the same Context and
source snapshot.

## Required document shape

```json
{
  "evidenceVersion": "QUALIFICATION_EVIDENCE_V1",
  "packageId": "DRAW-110",
  "contextSha256": "...",
  "status": "PASS|PARTIAL|BLOCKED|UNTESTED",
  "acceptance": [{
    "id": "DRAW110-...",
    "status": "PASS|PARTIAL|BLOCKED|UNTESTED",
    "source": ["..."],
    "contract": ["..."],
    "schema": ["..."],
    "build": ["..."],
    "commands": [{"command": "...", "exitCode": 0}],
    "artifactHashes": ["..."],
    "adapterClass": "IN_MEMORY|PRODUCTION_EQUIVALENT|PRODUCTION_INTEGRATED|UNTESTED",
    "classification": "IMPLEMENTED_ISOLATED|PRODUCTION_EQUIVALENT|PRODUCTION_INTEGRATED|UNTESTED",
    "reviewer": "...",
    "findingIdentity": null
  }],
  "untested": ["..."],
  "noProductionClaims": true
}
```

The package-level reviewer may not silently fill a missing acceptance reviewer.
If a legacy package has only package-level review, the adapter must record
`reviewerSource: PACKAGE_LEVEL_LEGACY_ADAPTER` and keep the row `PARTIAL` until
the acceptance-level review is recorded. A legacy adapter may map package-level
review to rows only when the source document explicitly lists the covered
acceptance IDs in `reviewScope.acceptanceIds`; the mapping source must be kept
in the normalized row. No fallback may turn missing exit codes, hashes, or
reviewers into PASS.

## Required validator

Before a package is reviewed, run:

```bash
node scripts/validate-qualification-evidence.mjs docs/inventory/<package>-evidence.json
```

The validator is intentionally independent of package test counts. It fails
closed on a missing Context hash, trace path, command exit code, artifact hash,
or acceptance-level reviewer. A `BLOCKED` or `PARTIAL` report is valid evidence
of an incomplete gate, but it is never promoted to `PASS` by the validator.

## Freshness and identity

Every evidence document stores the Context SHA-256. Before qualification,
`scripts/verify_work_package_context.py` must verify the Context, sidecar
manifest, Registry SHA-256, and every manifest source file's current SHA-256 and
byte count. A changed source with an old Context is `BLOCKED`.

Baseline values are read from their inventory files; they are never copied as
constants into a package report. The report must retain the baseline identity,
test name, target file, and major error signature. A new failure identity is a
failure even when the total count is unchanged.

## Status rules

- `PASS`: all required acceptance rows and commands are complete and reviewed.
- `PARTIAL`: implementation evidence exists, but an acceptance row or review is incomplete.
- `BLOCKED`: a dependency, authority, context, scope, or required qualification prevents the gate.
- `UNTESTED`: the check was not executable or is outside the current environment.

`PRODUCTION_INTEGRATED` is never inferred from `IN_MEMORY` or
`PRODUCTION_EQUIVALENT`. Device, provider, staging, store, migration, and
production results remain `UNTESTED` until directly observed.
