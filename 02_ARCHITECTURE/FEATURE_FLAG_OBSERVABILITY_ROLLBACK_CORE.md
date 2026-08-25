---
spec_id: ARCH-FEATURE-FLAG-ROLLBACK-CORE-001
title: PiXiEED Core Feature Flag, Observability, and Rollback Contract
status: NORMATIVE
classification: PRIVATE_INTERNAL_ONLY
audience: AI_AGENTS, ENGINEERING
version: 1.0.0
updated: 2026-08-07
depends_on:
  - CURRENT_SYSTEM_PRESERVATION_GATE.md
  - 02_ARCHITECTURE/PIXIEED_CORE_SYSTEM.md
  - 02_ARCHITECTURE/ACCOUNT_PERMISSION_CORE.md
  - 02_ARCHITECTURE/STORAGE_PLACEMENT_AND_SYNC.md
---

# PiXiEED Core Feature Flag, Observability, and Rollback Contract

## Decision

Feature Flags control whether a new Core path is selected. They never grant identity, RLS, server,
resource, purchase, entitlement, or commission permission. The current production path remains the
fallback while a flag is off, unknown, killed, rolled back, or not yet authorized.

The mandatory evaluation order is:

```text
Identity / JWT envelope verification
  ↓
Account state
  ↓
Current server / RLS authorization
  ↓
Feature Flag and server cohort
  ↓
Resource-specific permission
  ↓
Command / Operation validation
```

An implementation may perform resource permission checks before the flag for efficiency, but it
must never let a flag result override a failed server or resource authorization. The adapter uses
both `serverAuthorization` and `resourcePermission` inputs and fails closed when either is absent.

## Flag contract

Every flag has:

```yaml
flagId: stable ID
domain: pxd | pixisync | market | commission | subscription | account | core
currentPath: preserved fallback route/adapter
actions: [read, write]
rolloutPercent:
  read: 0..100
  write: 0..100
cohortSalt: server-controlled stable salt
defaultEnabled: false
```

Flags are off by default. Read and write rollout are independent. Market, PiXiSYNC, PXD, purchase,
Commission, Subscription, and Account flags are separate; enabling one domain never enables another.
The browser may request a UI treatment, but client-provided flag overrides, cohorts, actor IDs,
roles, and kill-switch state are ignored for authorization and cannot configure the adapter.

Cohort assignment is deterministic from the server-provided canonical principal, flag ID, and
server salt. It does not use time, random values, a local client ID, email, display name, or a
client-selected bucket. Server configuration and the current Database permission projection remain
authoritative.

## Evaluation results

```yaml
decision: enabled | fallback | deny | unknown
enabled: boolean
useCurrentPath: boolean
flagId: stable ID
action: read | write
phase: identity | account | server-authorization | flag | resource-permission | rollback
clientOverrideIgnored: boolean
diagnostics: structured code/severity/message/metadata
```

`enabled` selects the new path. `fallback` selects the current path without deleting or rewriting
data. `deny` means the request was not authorized and must not be silently routed to a privileged
path. `unknown` means the flag/resource projection is missing and cannot enable a new path.

## Kill switch and rollback

- A kill switch stops new processing for one flag and routes eligible requests to the current path.
- A rollback can be global, domain-scoped, or flag-scoped.
- Rollback never deletes Projects, Assets, PXD/PiXiSYNC data, Market products, purchases,
  entitlements, Commission records, or Subscription records.
- A rollback must stop new writes on the new path while preserving already accepted writes and
  handing recovery to the current Journal/PiXiSYNC/Market transaction boundary.
- Clearing a kill switch or rollback requires an explicit server actor and an audit event.

## Observability and audit

Every rollout configuration, override, kill-switch change, rollback change, and shadow mismatch
requires a caller-supplied `eventId`, `correlationId`, timestamp string, actor, and reason. The
adapter never fabricates time or random IDs. Diagnostics must not contain tokens, secret keys,
payment credentials, or private creative content.

Shadow comparison records expected versus actual decision and the canonical resource reference;
it does not change the selected path or grant access. Observability is a projection and cannot be
used to override RLS or server authorization.

## Preservation and release gate

WP-070 is an isolated adapter only. No feature is enabled in production, no migration is applied,
and no current route or data contract is replaced. Before any later rollout:

1. test flag-off fallback for read and write;
2. test authorization failure before flag evaluation;
3. test deterministic server cohort and client override rejection;
4. test kill-switch and scoped rollback with no data deletion;
5. test audit/correlation/mismatch recovery;
6. run current Market, PiXiSYNC, PXD, purchase, entitlement, Commission, and Subscription
   compatibility tests;
7. prove rollback/reconciliation and obtain owner approval.
