# SOCIAL-430 Evidence Contract

Package evidence is emitted by
`pixiedraw2/benchmarks/social-430/generate-evidence.ts` using
`QUALIFICATION_EVIDENCE_V1`. The generator records the exact Context SHA,
artifact hashes, command exit codes, isolated adapter class, inherited baseline
identity, and the three package acceptance IDs:

- `SOCIAL430-SCOPE-001`
- `SOCIAL430-EVIDENCE-001`
- `SOCIAL430-STOP-001`

The targeted suite covers explicit Share/Core Card requirements, visibility and
read-time redaction, tenant/authentication and caller-injection boundary
validation,
Post/Comment/Follow/Reaction/Mention separation, tenant-bound
Community/Creator/Project/My Page projections, Market Card non-mutation,
duplicate/stale/gap/revocation-lifecycle-Event/replay Event handling, bounded
Notification/Search/URL projections, canonical Event payload integrity, flags,
rollback, and deep private/direct-work/PII invalid-input rejection.

The synthetic throughput measurement is a local reference benchmark only. It is
not evidence of real SNS, RLS, moderation, Search, Notification delivery,
device, browser, staging, production, or deployment behavior. Those items remain
`UNTESTED` until a separately authorized gate directly observes them.

Before Terra High completes its independent audit, the generated evidence
document intentionally remains `PARTIAL` with acceptance rows and reviewer
marked `PENDING`; Luna does not self-approve the package. The shared validator
therefore reports a valid document with `qualificationReady: false` until that
independent review is recorded.
