---
spec_id: IMPL-LEGACY-MIGRATION-001
title: Safe Existing-Data Migration Runbook
status: NORMATIVE
classification: PRIVATE_INTERNAL_ONLY
audience: AI_AGENTS
version: 1.2.0
verified_at: 2026-08-06
expires_at: 2026-11-06
---

# Safe Existing-Data Migration Runbook

## PHASE 0 — STOP GUESSING

Before SQL changes:

- capture repository commit;
- capture Supabase CLI version;
- capture migration list;
- capture Postgres version and extensions;
- capture Data API exposure/grants;
- capture Edge Function deployments;
- capture Storage buckets and policies;
- capture Stripe API version and webhook destinations;
- capture current application build;
- identify all financial single writers.

## PHASE 1 — BACKUP AND RESTORE PROOF

Required:

1. database logical export;
2. platform backup/PITR as available;
3. separate Storage object inventory and copy;
4. Stripe object/report exports;
5. checksums;
6. restore into an isolated project;
7. execute real read/reconciliation tests against the restored copy.

A backup is not accepted until restore is proven.

## PHASE 2 — INVENTORY

Generate:

- schemas, tables, columns, types, defaults, constraints;
- indexes and triggers;
- functions and SECURITY DEFINER usage;
- RLS state, policies, grants;
- row counts;
- distinct status/currency values;
- min/max timestamps;
- null and orphan statistics;
- Storage paths/hashes;
- Stripe object ID coverage.

## PHASE 3 — DEFINE MAPPING

For every source field, choose exactly one:

- copied unchanged;
- normalized;
- split into multiple fields;
- merged;
- derived with an explicit formula;
- stored as legacy metadata;
- intentionally not migrated with a documented reason.

No field can be silently omitted.

## PHASE 4 — CREATE COMPATIBILITY SCHEMA

Create without changing legacy behavior:

- identity map;
- entity map;
- migration batch;
- source row hash;
- reconciliation result;
- migration exception;
- canonical tables;
- compatibility read views;
- outbox/idempotency tables.

New tables are explicitly granted only when needed and protected with RLS.
Do not assume new `public` tables are exposed through Supabase Data API.

## PHASE 5 — BACKFILL

Backfill in dependency order:

1. accounts and identities;
2. creator/seller profiles;
3. assets/files;
4. products/listings/options;
5. purchases and complimentary entitlements;
6. payment/Stripe references;
7. refunds/disputes;
8. royalties and legacy rewards;
9. balances and payout requests/batches;
10. social/discovery/notifications.

Use bounded batches with resumable checkpoints.

## PHASE 6 — SHADOW READ

The production UI still uses legacy data.
The new service reads both models and compares:

- existence;
- ownership;
- status;
- money;
- file access;
- API response;
- permissions.

Mismatches create exceptions and do not affect users.

## PHASE 7 — SINGLE-WRITER / DUAL-PROJECTION

All new mutations enter one service.

Recommended:

```text
canonical write
+ transactional outbox in one database transaction
→ asynchronous legacy projection if required
```

If the legacy service must remain the writer initially, reverse the direction temporarily but keep only
one authoritative writer.

## PHASE 8 — CUTOVER

- announce maintenance only if required;
- pause high-risk financial writes if single-writer fencing cannot otherwise be proven;
- drain queues;
- record cutover sequence/time;
- run final delta backfill;
- reconcile;
- switch read feature flags gradually;
- switch writes;
- monitor.

## PHASE 9 — OBSERVATION

Minimum:

- two complete payout/reconciliation cycles;
- 90 days for legacy read fallback unless a longer legal/accounting period applies;
- continuous mismatch and access monitoring.

## PHASE 10 — RETIREMENT

Do not drop legacy tables solely because the new UI works.

Before retirement:

- legal/accounting retention decision;
- full archive;
- restore test;
- no active old clients;
- no unresolved mismatch;
- no rollback dependency;
- owner and independent reviewer approval.

Prefer revoking writes and archiving before deletion.


---
