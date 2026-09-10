# ADR-20260807-WP093 — Versioned Tool Bridge API

- Status: Accepted for WP-093
- Date: 2026-08-07
- Scope: Tool registration, capability negotiation, versioned envelopes, compatibility, events,
  cancellation, transport boundary, and legacy Draw adapter

> **Terminology boundary:** このADRのTool Bridge／Legacy BridgeはCore内部の参照・互換アダプター
> 契約である。外部のPiXiEED Bridgeネイティブアプリでも、Draw2のPiXYNC同期transportでもない。

## Decision

Add an unloaded pure Tool Bridge contract at
`core-shell/assets/core-tool-bridge-contracts.js` and a separate thin legacy contract at
`core-shell/assets/core-legacy-draw-bridge-contract.js`. Keep current PiXiEEDraw, PXD,
PiXiSYNC, Market, SNS, Project, Asset, and production routes unchanged.

## Rationale

Every Tool needs the same Core connection boundary while retaining its own editor, renderer,
player, and state. Separating Tool Version from Bridge API Version permits Tool upgrades without
breaking the Core envelope. Reference-only requests prevent large Blob copies and keep Storage and
Asset Registry authority outside the Bridge. Event causation and visited Tool chains prevent
cross-tool live-update loops.

## Rules recorded

1. Tool registration is server-trusted; unknown, duplicate, unavailable, quarantined, or version-
   incompatible Tools fail closed. Current Draw and Draw2 remain distinct IDs.
2. Capability negotiation is explicit, versioned, bounded, and limit-aware. Tool/Capability spoof,
   unsupported versions, and missing capabilities are rejected.
3. Bridge Request/Result/Event envelopes carry references and bounded metadata only. Raw media,
   package bodies, Base64/Data URLs, and full Editor State never cross this boundary.
4. Project Registry, Asset Registry, WP-060 Permission, and WP-070 Feature Flag contracts remain
   authoritative. Bridge does not duplicate Reference Policy or mutate source Project/Asset state.
5. Event chains have duplicate/cycle/depth guards. Cancellation cannot publish partial Revision,
   incomplete Package, or temporary Blob. Transport and timeout are injected host concerns.
6. Legacy PXD/PiXiSYNC compatibility uses a thin reference adapter with Copy/Adapter/Review/
   Quarantine results; it never rewrites the current project.

## Non-application

No current HTML/JS route imports the Bridge. No Supabase/RLS/Auth/Storage/PiXiSYNC/Market action,
SNS deletion, migration, upload, deploy, publish, commit, or push is included. Future WP-170+
Tool-specific adapters consume this contract after their own compatibility gates.
