# CORE-120 predecessor evidence normalization

Status: `REQUIRED_BEFORE_APPROVAL`

This document is the one-time handoff for legacy predecessor evidence. It is
not an approval and it does not waive CORE-120's fail-closed rules.

## Current blockers

The current generated report is `BLOCKED` / `NO_GO` for evidence shape, not
because the CORE-120 implementation or its isolated tests failed.

| predecessor | missing material | required action |
|---|---|---|
| CORE-100 | synthetic CORE100 rows have no acceptance-level exit/reviewer | record an explicit acceptance coverage map and independent review for the three rows, or keep them `PARTIAL` |
| CORE-110 | package has row exits but reviewers are `PENDING`; synthetic scope/stop rows are absent | record acceptance-level review and explicit scope/stop rows, or keep them `PARTIAL` |
| FP-004 | all seven acceptance rows have null exit/reviewer/artifact fields | bind the already-run commands to each acceptance ID, rerun where the command is a placeholder, and record independent review per acceptance |
| FP-005 | acceptance rows are complete in isolated scope | retain as-is; do not upgrade its classification |
| FP-007 | DEP/BUILD are isolated/real-repository evidence; schema/dist/provenance contain explicit `UNTESTED` and external blockers | record the exact review scope for the two passing rows and retain the three `UNTESTED` rows; do not promote external qualification |

## Prohibited normalization

- Never copy a package-level reviewer into a row unless the source document
  explicitly lists the covered acceptance IDs in `reviewScope.acceptanceIds`.
- Never replace a null exit code with the package's aggregate test count.
- Never use a source hash as a substitute for an unexecuted command artifact.
- Never convert `PENDING`, `UNTESTED`, `BLOCKED`, or external blockers into
  `PASS` by changing names or status strings.
- Never use CORE-120's own generated report as an input artifact for its gate.

## Completion condition

The normalization is complete only when every required non-UNTESTED acceptance
row has source, contract, schema, build, command/exit, artifact identity, and
acceptance-level review. Then run the same sequence again:

```text
Context freshness → command manifest → evidence generator → V1 validator
→ baseline identity → baseline suite → canonical alignment → diff check
→ independent audit
```

If any row remains incomplete, the correct result is still `BLOCKED` or
`PARTIAL`; FP-006 must not start automatically.
