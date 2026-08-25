---
spec_id: CONTRACT-WP090-INTERACTION-A11Y-001
title: WP-090 Interaction, Accessibility, Responsive, and Recovery Contract
status: IMPLEMENTED_ISOLATED
classification: PRIVATE_INTERNAL_ONLY
version: 1.0.0
updated: 2026-08-07
---

# WP-090 Contract

WP-090 extends the isolated `/core-shell/` preview only. It does not connect to current public
Routes, PiXiEEDraw, PXD, PiXiSYNC, Market, Supabase, Storage, or production data.

## Route boundary

Server authorization is evaluated before Account, Resource Permission, Feature Flag, or Lazy
Chunk delivery. Unknown Routes and Flag OFF return a fail-closed `404`; a verified but forbidden
resource returns `403`. Denied responses are private/no-store and set `doNotPrefetch: true`.
The static preview remains server-denied and never requests Tool chunks.

## Interaction contract

- Skip Link and semantic Header/Nav/Main/Aside landmarks are always available.
- Route changes focus the new route heading, with `coreShellMain` as fallback.
- Dialog/Sheet overlays use a stack, Escape close, Tab trap, background `inert`/`aria-hidden`, and
  restore focus to a connected, enabled origin or a deterministic Main fallback.
- Tabs and Menus expose Arrow, Home, and End navigation.
- Shortcuts are registered with descriptions and are remappable. Text inputs, contenteditable,
  and IME composition never trigger Shell shortcuts.
- Pointer ownership is one owner per pointer ID for mouse, touch, and pen, released on pointerup,
  pointercancel, or lostpointercapture.
- Required operations are not hover, right-click, or drag-only.

## Async and recovery contract

The state machine covers `Initial`, `Loading`, `Ready`, `Empty`, `Saving`, `Saved`, `Offline`,
`Reconnecting`, `Degraded`, `Permission Denied`, `Session Expired`, `Conflict`, `Recoverable
Error`, `Fatal Error`, `Unsupported Version`, `Unavailable`, and `Rollback/Recovery Available`.

Recovery preserves local input and unsynced operations. Offline is never labelled Saved. Permission
Denied is not represented as Not Found in the UI. Persistent Error surfaces are required for critical
failures, and Live Region messages are deduplicated.

## Responsive and visual contract

Phone is `<720px`, Tablet `720–1099px`, Desktop `1100–1439px`, Wide `>=1440px`, with Split View as
an explicit layout mode. Safe Area, Mobile Bottom Navigation, text scaling, reduced motion,
orientation change, software keyboard, and no horizontal overflow are tested at the isolated Shell.

Visual baselines are registered under `docs/visual-regression/wp-090/core-shell/` for four
viewports, Light/Dark themes, and deterministic loading/empty/error/permission/offline/dialog/sheet
states. Semantic and interaction tests remain mandatory; image hashes alone are not completion proof.

## Performance and privacy

WP-080's `62,052` source-byte initial value remains the reference. WP-090 records raw, gzip, Brotli,
initial route requests, parse/execute fields when available, and Long Tasks. Draw2, Audio, Game,
and Market chunks remain outside the initial Entry and are not requested while unauthorized.

Telemetry is an allowlist projection. It does not record JWT, Email, Secret, Project content,
Commission content, or raw keyboard/focus input. Offline telemetry is bounded by the existing
in-memory preview boundary and is not placed in an unlimited queue.
