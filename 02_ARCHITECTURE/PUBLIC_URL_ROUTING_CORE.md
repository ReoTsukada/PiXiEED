---
spec_id: ARCH-PUBLIC-URL-ROUTING-001
title: Public URL and Routing Core
status: NORMATIVE
classification: PRIVATE_INTERNAL_ONLY
version: 1.0.0
updated: 2026-08-07
depends_on:
  - CURRENT_SYSTEM_PRESERVATION_GATE.md
  - 02_ARCHITECTURE/ACCOUNT_PERMISSION_CORE.md
  - 02_ARCHITECTURE/FEATURE_FLAG_OBSERVABILITY_ROLLBACK_CORE.md
  - 02_ARCHITECTURE/COST_AWARE_REALTIME_POLICY.md
  - 02_ARCHITECTURE/PROJECT_REGISTRY_CORE.md
---

# Public URL and Routing Core

WP-098 defines a separately loaded route registry and compatibility resolver. It is not a
replacement for the current server/site router. The current 50 HTML routes remain the rollback
and public compatibility boundary.

## Resolution order

```text
same-origin URL
  → bounded path/query parse
  → default-off Feature Flag checks
  → current/static or typed legacy/dynamic match
  → server resource and permission resolution
  → canonical path/metadata candidate
  → shadow result or proven redirect
```

Static/current matches use the inventory snapshot. Dynamic Market and PiXFiND compatibility
matches validate typed IDs and call an injected server resolver. A client cannot assert Public,
permission, canonical ownership, or deletion state.

## Compatibility and privacy

Current PiXiEEDraw, project, product, creator, post, purchase, and shared URL paths remain valid
because no current route is removed or redirected by this WP. Existing Market UUID pages and
legacy `/market/item.html?id=` are represented as separate route records. Private, unlisted,
deleted, trashed, or quarantined resources fail closed without a redirect that could disclose
existence. Server-authorized private resolution remains non-public and emits no canonical SEO URL.

## Redirect, metadata, and recovery

Redirect mode defaults to `shadow`. A `PROVEN` redirect requires server permission plus separate
canonical and privacy proof. Redirect targets are registry-derived same-origin paths only. The
rollback operation disables all Public URL flags, keeps the current path, and reports that no
metadata cutover occurred. Canonical metadata uses only bounded server-safe title/description/
image/locale data and returns `noindex,nofollow` for non-public results.

## Transport

Route registry reads are local/static. Public resource and metadata reads are
`ASYNC_ON_DEMAND` under `COST_AWARE_REALTIME_POLICY.md`; no route transition opens a permanent
Realtime connection, and no pointer/pixel/audio/frame/UI update is routed through this Core.
