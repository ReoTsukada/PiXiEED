---
spec_id: ARCH-COST-AWARE-REALTIME-001
title: Cost-aware Realtime and Transport Policy
status: NORMATIVE
classification: PRIVATE_INTERNAL_ONLY
version: 1.0.0
updated: 2026-08-07
---

# Cost-aware Realtime and Transport Policy

## Decision

PiXiEED Core separates local editing, active collaboration, platform events, and on-demand
discovery. Realtime is not the default transport for every state change. The Core selects the
lowest-cost transport that preserves correctness, privacy, recovery, and user-visible freshness.

## Four transport classes

| Class | Contract | Network rule |
| --- | --- | --- |
| `LOCAL_ONLY` | Pointer/brush, in-progress pixels, audio sample edits, timeline/UI state, local cache/index mutations | Memory/Worker/IndexedDB/OPFS only; network traffic is `0`. |
| `ACTIVE_SYNC` | Confirmed collaboration operations and minimal active-session presence | PiXiSYNC only for active Project participants; no background subscriptions. |
| `PLATFORM_EVENT` | Confirmed Project state, Asset Revision/Head, Package readiness, Permission changes | Event Core emits small ID/Revision/Hash invalidations; consumers fetch on demand. |
| `ASYNC_ON_DEMAND` | Search, discovery, historical notifications, thumbnails, creator/Market/public reads | HTTP/cache/cursor/conditional refresh; no permanent Realtime subscription. |

The same-device Tool transport is local-first through an in-process bus, `MessageChannel`,
Worker, or another bounded adapter. It does not open a server subscription merely because two
tools share one browser. Cross-device delivery uses the relevant Core adapter only after a
meaningful transition is committed.

## High-frequency and presence rules

Pointer movement, pixel writes, audio sample streams, frame changes, playback position, UI
state, and IndexedDB mutations never become global Realtime messages. Local batching, debounce,
Worker processing, revision boundaries, and meaningful transitions are preferred. Presence is
limited to the collaboration feature flag and active participants; it is not a high-frequency
heartbeat. An active collaboration session may be suspended or downgraded when its policy or
budget requires it.

## LIVE references

`LIVE` means a provider revision was committed, a small invalidation was emitted, the consumer
rechecked permission, and the consumer fetched the new revision on demand. It does not mean that
raw media or every edit is broadcast. `PINNED`, `REVIEW`, and `FORKED` remain Asset Graph policy
decisions and are never replaced by a transport setting.

## Cost observability and budgets

Usage is measured by user, Project, feature, and time window for: Realtime messages, connection
duration/peak, Database reads/writes, Storage, egress, Function invocations, build compute,
Package processing, and AI/paid usage. A budget response may batch, debounce, reduce Realtime,
use an asynchronous fallback, use cache, or delay noncritical work. It must never drop security,
purchase, entitlement, payment, commission, or other canonical rights state to meet a budget.

Audit and Telemetry record bounded operation/feature/cost dimensions only. JWT, email, secrets,
Project bodies, private commission content, raw pixel/audio data, and payment details are not
recorded. Monetization, subscription, and prices remain separate future contracts; Ads do not
occupy Active Studio or recovery surfaces.

## Work Package consequences

- WP-098 URL resolution is `ASYNC_ON_DEMAND` and must not create a permanent Realtime subscription.
- Future Tool bridges start local-first and emit only bounded revision/invalidation transitions.
- Future Site Integration Harness tests network classes, subscription lifetime, batching, cache,
  and cost telemetry without contacting production services.
