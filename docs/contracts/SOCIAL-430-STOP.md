# SOCIAL-430 Stop Conditions

Stop the package and classify the evidence as `BLOCKED` if any of the following
is observed:

1. A Post can be created without an explicit Share Command or approved Core Card.
2. A caller-provided tenant, producer, recipient, visibility, moderation, role,
   or lifecycle value bypasses the server proof and current-state checks.
3. Private, unlisted, deleted, trashed, quarantined, unpublished, or blocked
   content returns stale body, media, or URL presentation.
4. Duplicate, stale, out-of-order, or replayed Events cause reposting,
   renotification, re-publication, or any external side effect.
5. Comment, Mention, or Social text mutates Agreement, Delivery, Acceptance,
   Payment, Rights, Product, Purchase, Entitlement, License, Royalty, Payout, or
   Ledger state.
6. Raw media, private body, PII, JWT, payment, license, royalty, or Direct Work
   data crosses Social, Search, Notification, Audit, or Telemetry boundaries.
7. Any file outside the SOCIAL-430 bounded write scope, current route, migration,
   production database/storage, or production data is changed.

Real Social providers, moderation, Search backend, Notification delivery,
Production Auth/RLS, current route compatibility, physical devices, and
production performance are deliberately `UNTESTED`; they must not be promoted
to a production PASS by this isolated package.

`OPS-440` is not started automatically. Its registry/state transition remains a
coordinator-owned handoff.
