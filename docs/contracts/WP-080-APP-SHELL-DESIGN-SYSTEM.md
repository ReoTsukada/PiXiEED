---
spec_id: CONTRACT-WP080-APP-SHELL-001
title: WP-080 Isolated App Shell and Design System Adapter
status: IMPLEMENTED_ISOLATED
classification: PRIVATE_INTERNAL_ONLY
version: 1.0.0
updated: 2026-08-07
---

# WP-080 Isolated App Shell and Design System Adapter

Implemented files under `core-shell/` provide a new App Shell preview without modifying current
site Entry files. The Entry is `core-shell/index.html` and is explicitly `noindex,nofollow`.

## Implemented boundaries

- Navigation map: Home, Projects, Assets, Tools, Search, Notifications, Market, Community, Account,
  and Help.
- Contract-only slots for Project, Asset, Tool, Search, Notification, Market, SNS, and Account
  entrances.
- Native semantic component layer with accessible names, focus behavior, disabled reasons, and
  unavailable/Coming Later states.
- Semantic Light/Dark/System tokens with canonical pixel color invariants.
- Phone/Tablet/Desktop/Wide/Split View layout, mobile bottom navigation, safe-area padding, reduced
  motion, text-scaling-friendly rem typography, and no horizontal overflow.
- Route-local dynamic imports for Draw2, Audio, Game, and Market. These chunks are not loaded while
  the default-off or server-route-denied state is active.
- Sanitized UI telemetry allowlist. No JWT, email, secret, Project content, or Commission content.
- Existing WP-070 Feature Flag adapter remains unchanged and is used only as a shared Core contract.
- Server Route authorization is represented by the adapter-neutral `core-shell-server-route-contract.js`;
  the static preview defaults to denied when no verified server decision is injected.

## Server-side note

The static preview cannot enforce a real server Route. It therefore defaults to
`CORE_SHELL_SERVER_ROUTE_UNAVAILABLE` and does not enable a Tool. Future server integration must
perform Route authorization and current permission checks before serving private Shell data or
enabling a flag. Client-controlled query parameters and UI state are not authorization inputs.
