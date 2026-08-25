# PiXiSYNC Draw2 200 — durable transport integration

Status: `LOCAL_SYNTHETIC_PASS`

## Scope

200 composes the internal 190 transport boundary, the 120 durable journal, and
the 100 OrderKeeper. It remains internal and provider-neutral. It does not
connect Supabase, Realtime, authentication, product UI, or migrations.

The fixed send path is:

1. persist the draft in Outbox;
2. acquire a fenced Outbox lease;
3. submit through the authenticated transport;
4. persist the provider's authoritative committed envelope verbatim;
5. persist that envelope in Inbox;
6. apply it through OrderKeeper;
7. persist the apply receipt and completion state.

Remote tail delivery enters at step 5. A self echo and an exact duplicate ACK
converge on the same committed fingerprint and apply once.

## Invariants

- A draft is durable before provider submit.
- ACK persistence retains provider `projectRevision`, `aggregateRevision`,
  `committedAt`, identity, payload, and canonical committed fingerprint.
- The legacy revision-only 120 ACK API remains compatible; the 200 coordinator
  uses only the authoritative ACK API.
- A stale Outbox lease cannot acknowledge or fail another worker's operation.
- Inbox acceptance is durable before aggregate apply.
- Apply failure stays retryable. A held next revision is drained again instead
  of being mistaken for a completed duplicate.
- A persisted ACK without an Inbox row is reconciled from the committed vault
  after restart.
- OrderKeeper restore state is derived only from contiguous durable apply
  receipts. Completed operations are not applied twice; the next revision can
  continue normally.
- The coordinator, transport constructor, and provider interfaces are absent
  from the public PiXiSYNC index.

## Evidence boundary

The deterministic test has 12 cases covering persist-before-submit,
authoritative envelope preservation, server aggregate assignment, ACK crash
recovery, remote persist-before-apply, self echo, duplicate ACK, gap ordering,
stale leases, Outbox resend, apply retry, OrderKeeper restoration, substituted
identity rejection, and every durability failure injector.

This is local synthetic evidence only. IndexedDB browser integration,
multi-process operation, Supabase, Realtime, Safari suspension, staging, and
production remain `UNTESTED`. Semantic acceptance remains separate from the
preflight schema result.

## Artifacts

- `pixiedraw2/src/pixisync/durable-transport.ts`
- `pixiedraw2/src/pixisync/durability.ts`
- `pixiedraw2/src/pixisync/in-memory.ts`
- `pixiedraw2/tests/pixisync/pixisync-draw2-200-durable-transport.test.ts`
- `docs/inventory/pixisync-draw2-200-preflight-*.json`
