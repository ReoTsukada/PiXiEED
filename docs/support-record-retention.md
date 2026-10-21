# Manual support-record retention aid

**Status:** offline operator aid only. It is not connected to a mailbox, database, identity service, storage bucket, or production scheduler, and it does not perform account or media deletion.

The helper supports the approved policy of organizing the *minimal closed support-case record* after 90 days. Its scope is limited to case-ledger rows for deletion requests, account-removal requests, and reports. It does not cover user works, authentication or ownership-safety data, claim/retry identities, consent receipts, statutory records, database rows, or email messages and attachments.

Keep real case ledgers outside the repository in an access-controlled private directory. Never place message text, names, email addresses, user IDs, credentials, IP addresses, attachments, or other case details in the ledger. This tool rejects all fields except the allowlisted fields below. It cannot prove that an opaque ID is random, so operators must generate case IDs with a cryptographically secure random source containing at least 128 bits, encode them as URL-safe text, and keep any mapping to an existing case system separately under its normal access controls.

## Ledger format

```json
{
  "schemaVersion": 1,
  "records": [
    {
      "caseId": "Q4z7pA9bC2dE5fG8hJ1kLm",
      "category": "deletion",
      "closedAt": "2026-07-23T12:00:00.000Z"
    },
    {
      "caseId": "R5z8qB0cD3eF6gH9jK2mNp",
      "category": "report",
      "closedAt": null
    },
    {
      "caseId": "S6a9rC1dE4fG7hJ0kL3nPq",
      "category": "account",
      "closedAt": "2026-07-01T09:30:00Z",
      "legalHold": {
        "lawReference": "EXAMPLE-LEGAL-REFERENCE",
        "reviewUntil": "2026-11-01T00:00:00Z"
      }
    }
  ]
}
```

Only `schemaVersion` and `records` are accepted at the top level. Each record requires a 22–80 character URL-safe opaque `caseId`, a `category` of `deletion`, `account`, or `report`, and `closedAt` as either `null` or a strict UTC instant. The only optional field is `legalHold`, containing a controlled law-reference token and a finite UTC `reviewUntil` date. The sample `EXAMPLE-LEGAL-REFERENCE` value is synthetic and is not a legal basis or a claim about any statute. Do not put legal explanations or case facts in that token. A real token should point to a separately controlled legal reference.

A `closedAt: null` record is pending and has no 90-day timer yet. Set `closedAt` only when the support case is actually closed. The 90-day interval is exactly 90 × 24 hours from the UTC instant; eligibility begins at that exact instant. Invalid dates, future closure dates, duplicate IDs, unknown fields, non-regular files, and symlink input/output paths stop processing.

A hold with a `reviewUntil` later than the run time is deferred. At or after `reviewUntil`, it appears in the expired-hold review list and remains in the replacement ledger. The helper never removes or extends a held record automatically. A human must review the legal reference. Only after the hold is formally cleared through the operator’s approved process should the ledger be updated and re-planned; do not silently roll the review date forward.

## Daily/manual operating procedure

Run the helper daily as a manual check around the 90-day point. The helper marks records eligible at exactly 90 × 24 hours, but a manual daily process cannot guarantee processing at that exact instant; it is not a scheduled job. If a run is missed or a case is already overdue, resume immediately and escalate it to the responsible operator. Pending cases remain until closed; an expired hold requires human review and is not automatically eligible for removal.

1. Open the private ledger from its approved location. Do not copy it into the repository, a shared scratch folder, chat, or a ticket body.
2. Run a dry-run with an explicit UTC `--now` value:

   ```sh
   node scripts/support-record-retention.mjs \
     --input /private/support/case-ledger.json \
     --now 2026-10-21T12:00:00Z
   ```

   The command prints eligible opaque IDs and due instants, pending IDs, aggregate counts, and legal-hold review dates. It does not write a report or modify the ledger. Do not capture the output in a durable terminal log; close the session after the review.
3. The responsible operator checks each eligible case in the existing approved case/mail process: confirm it is closed, the request has been handled, the hold is absent, and no separately approved retention requirement applies. Double-check the due list and planned cleanup; an independent review may be used when available. Review expired holds with the responsible operator and any appropriate legal contact available through the approved process; do not delete or re-extend them automatically.
4. Handle the corresponding messages, attachments, and other known operational copies using the existing permitted mailbox and case-system procedures. This helper cannot access or purge them. Confirm the requested account/media work has been handled using the approved operations. Record completion in the existing access-controlled accountability log using only the date, responsible operator, optional reviewer, and aggregate counts; do not preserve deleted case IDs or case contents in a new archive.
5. Before writing a replacement, compute a digest of the exact input bytes using the local system’s SHA-256 utility, for example `shasum -a 256 /private/support/case-ledger.json`. Use the digest only to bind the replacement to the file reviewed. The output path must be new and private:

   ```sh
   node scripts/support-record-retention.mjs \
     --input /private/support/case-ledger.json \
     --now 2026-10-21T12:00:00Z \
     --output /private/support/case-ledger-replacement-20261021.json \
     --expect-sha256 REPLACE_WITH_REVIEWED_INPUT_DIGEST
   ```

   The helper refuses a digest mismatch, an existing output, the same input/output path, and symlinks. It creates a fresh file with owner-only `0600` permissions. The replacement retains pending, not-yet-due, active-hold, and expired-hold records. It does not list the removed IDs in its output.
6. The responsible operator inspects the replacement and counts, with an independent reviewer when available. After the check, use the existing approved process to replace the original ledger with the replacement and dispose of the old file and any approved working copies. Do not keep a backup or save the dry-run output as a second case archive. Record only aggregate completion details in the existing accountability log.

The replacement file alone is not full erasure: it does not delete mail, attachments, case-system copies, storage records, device copies, provider backups, or filesystem snapshots. Do not claim permanent or third-party-copy deletion from this tool. Follow existing approved deletion procedures and describe their limits accurately.

## CLI behavior and limits

- The default mode is dry-run. `--input` and explicit `--now` are required.
- `--output` requires `--expect-sha256`; both must be supplied together. Output is exclusive-create only; the tool never overwrites or deletes the input and never writes a backup.
- The ledger is bounded to 1 MiB and 10,000 records. No network or third-party package is used. The CLI does not print ledger contents or persist an execution log.
- Synthetic tests cover the 90-day boundary, holds, input validation, hash mismatch, output collisions, symlinks, permissions, source preservation, and safe retry.
- The helper has not been connected to production email, database, authentication, or storage systems. No production cleanup, mailbox deletion, or recurring automation is configured. Any later server-side retention integration requires separate security review and approval.
