---
spec_id: ARCH-LEGACY-COMPAT-001
title: Existing Data Compatibility Architecture
status: NORMATIVE
classification: PRIVATE_INTERNAL_ONLY
audience: AI_AGENTS
version: 1.2.0
updated: 2026-08-06
---

# Existing Data Compatibility Architecture

## COMPATIBILITY LAYERS

```text
New Web / Native UI
        ↓
Canonical Domain API
        ↓
Compatibility Facade
   ├─ New canonical model
   └─ Legacy read adapter
        ↓
Legacy database / Storage / Stripe
```

A user-facing feature MUST NOT know whether a record is legacy or canonical.

## IDENTIFIER POLICY

### Preserve directly when safe

Reuse an existing immutable UUID as the canonical ID when:

- it is globally unique;
- its semantics match;
- it has no collision;
- it is not an external provider secret;
- changing it provides no clear safety benefit.

### Map permanently when replacement is required

```text
legacy_system
legacy_entity_type
legacy_id
canonical_id
migration_batch_id
source_hash
mapped_at
```

The map is permanent and unique in both directions for one-to-one entities.

## URL COMPATIBILITY

Existing product, creator, post, and project URLs remain valid.

Allowed methods:

- retain the same route and ID;
- resolve a legacy slug/ID through the compatibility map;
- issue a permanent redirect only after canonical resolution is proven.

A redirect must not expose a private or deleted object.

## API COMPATIBILITY

During migration:

- new APIs expose canonical response models;
- legacy fields can remain through versioned compatibility projections;
- client rollout is independent from database cutover;
- old clients remain supported for a declared window;
- native applications use server capability/version negotiation.

## STORAGE COMPATIBILITY

Do not move source objects in place as the first step.

1. Inventory object metadata and path.
2. Record size, content hash, MIME type, owner, bucket, and access policy.
3. Preserve the old object.
4. Copy to the new immutable/content-addressed path if needed.
5. Verify byte equality.
6. Add an alias/map.
7. Switch reads.
8. Retire the old path only after the retention and rollback period.

Database backups do not automatically prove Storage objects are recoverable. Storage requires a separate
inventory, export/replication, and restore test.

## PROJECT REGISTRY COMPATIBILITY

The Project Registry is a metadata/identity projection, not a content migration. Existing project
IDs, PXD archive-v2 bindings, current PiXiSYNC room/project references, public URLs, and Market or
rights relationships remain authoritative until a read-only compatibility gate passes. A legacy
binding is permanent and one-to-one for each legacy system/entity type and contains the legacy
system/project ID, format version, adapter version, migration state, and verification hash.

Forward/reverse collisions, circular mappings, cross-user ID substitution, owner mismatch, or
ambiguous PXD conversion are quarantined. The source record is retained; no last-writer-wins merge,
ID reuse, silent conversion, reinterpretation of PiXiSYNC history, or production registration is
allowed in WP-091. Project ownership transfer is separate from Market Product ownership, purchase/
entitlement, subscription, license, royalty, and direct-work commission state.

## ACCOUNT COMPATIBILITY

- preserve `auth.users.id`;
- preserve provider identity links;
- do not recreate users;
- preserve email verification and account status through supported Auth mechanisms;
- invalidate or rotate sessions only for security reasons;
- separately migrate public creator identity and legal seller identity.

## WRITE OWNERSHIP

Only one canonical service may accept a financial or entitlement mutation.

Dual writes, where required, are performed through:

```text
validated command
→ canonical transaction
→ transactional outbox
→ legacy/new projection worker
→ reconciliation
```

Browsers and two unrelated Edge Functions must not independently write both models.


---
