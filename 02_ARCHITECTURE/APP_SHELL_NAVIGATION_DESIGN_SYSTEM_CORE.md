---
spec_id: ARCH-APP-SHELL-080-001
title: PiXiEED Core App Shell, Navigation, and Design System Contract
status: NORMATIVE_ISOLATED
classification: PRIVATE_INTERNAL_ONLY
version: 1.0.0
updated: 2026-08-07
depends_on:
  - 02_ARCHITECTURE/PIXIEED_CORE_SYSTEM.md
  - 02_ARCHITECTURE/ACCOUNT_PERMISSION_CORE.md
  - 02_ARCHITECTURE/FEATURE_FLAG_OBSERVABILITY_ROLLBACK_CORE.md
---

# PiXiEED Core App Shell, Navigation, and Design System

## Scope and isolation

WP-080 builds a new App Shell under the isolated `/core-shell/` Entry. It is a private,
`noindex,nofollow` preview and is not added to the current public navigation, sitemap, or existing
routes. It does not import the current Draw runtime, PXD reader/writer, PiXiSYNC client, Market
client, Supabase client, Storage, Stripe, or account data.

The current website remains authoritative. No current route is removed, redirected, replaced, or
rewritten. The Shell is a host for future Tool Bridges; Draw, Audio, Game, Market, Search,
Notification, Account, Project, Asset, and Community implementations remain separate contracts.

## Route and permission boundary

```text
Server Route authorization
  ↓
Identity / JWT envelope
  ↓
Account state
  ↓
Current server/RLS authorization
  ↓
Feature Flag (default OFF)
  ↓
Resource permission
  ↓
Lazy Tool Route
```

The isolated static Entry renders an explicit Unavailable/Coming Later preview when the server
Route boundary is absent. A client query, local flag, role, email, or UI state cannot enable a
protected Route. Future server delivery MUST enforce the same boundary before returning private
Shell data or Tool chunks.

`core-shell-server-route-contract.js` is the server-adapter-neutral contract for verified session,
active account, resource permission, and flag selection. It is not deployed or connected in this
WP; the static Entry defaults to denied preview mode.

## Navigation Map

| ID | Entry | Contract | Initial state |
| --- | --- | --- | --- |
| `home` | Home | Core status and slots | Isolated preview |
| `projects` | Projects | Project Registry / switcher | Coming Later |
| `assets` | Assets | Asset Registry / provenance | Coming Later |
| `tools` | Tools | Tool Bridge catalog | Coming Later |
| `search` | Search | Search contract | Coming Later |
| `notifications` | Notification | Notification Center | Coming Later |
| `market` | Market | Product / purchase / entitlement | Coming Later |
| `sns` | Community | SNS / Creator / My Page | Coming Later |
| `account` | Account | Account / permission projection | Coming Later |
| `help` | Help | Help / recovery | Coming Later |

Navigation uses buttons and route IDs inside the isolated Entry. It does not redirect to a current
public URL. Future route adapters may map these IDs only after their own compatibility and rollback
gates pass.

## Component and state contract

The first component layer uses native semantic HTML and CSS classes, with no new framework or
external UI library. The base set is:

```text
Button, IconButton, Input, Select, Toggle, Tabs, Menu, Popover,
Dialog, Sheet, Toast, Error, Loading, Empty, Card, Status
```

Each component MUST expose default, hover, focus, active, disabled, loading, error, empty,
permission-denied, offline, and unavailable states where applicable. Disabled controls provide a
visible or assistive `Disabled Reason`; required actions are not hover-only or context-menu-only.
Dialogs and Sheets use `role=dialog`, `aria-modal`, labelled headings, Escape close, Tab focus trap,
and focus restoration. Icon-only controls have an accessible name. Touch targets are at least
44x44 CSS pixels.

## Semantic tokens and visual invariants

Tokens are defined in `core-shell.css` and are the only component-level source for color, spacing,
radii, typography, focus, elevation, and safe-area values. Components do not introduce arbitrary
hex/RGB colors or spacing values. Light, Dark, and System themes change UI surfaces and text only.

Canonical pixel/canvas/preview/thumbnail colors are separate tokens and are not derived from theme
tokens. Theme changes MUST NOT mutate Canvas pixels, Preview pixels, Thumbnail pixels, or PXD color
data. The isolated Shell itself does not create or own an editor Canvas.

## Responsive contract

```text
Phone:   < 720px   — mobile bottom navigation, safe-area padding, collapsible sidebar
Tablet:  720–1099px — compact sidebar, two-column content
Desktop: 1100–1439px — full sidebar, multi-column content
Wide:    >= 1440px  — full content width and optional Split View inspector
Split:   data-layout="split" — optional inspector slot, no Editor state ownership
```

Layout uses `dvh`, `env(safe-area-inset-*)`, rem/clamp typography, and content wrapping. Browser UI
and text scaling are treated as variable viewport conditions. Reduced motion disables nonessential
animation and transition. Horizontal overflow is prohibited at the tested phone, tablet, desktop,
and wide fixtures.

## State and performance boundaries

The Shell store has small slices for active route, theme, layout, and mobile navigation. Route view
updates are isolated from theme/layout changes; an Editor Canvas is never a global Shell subscriber.
Draw, Audio, Game, and Market chunks are route-local dynamic imports and are absent from the
initial HTML script list. An OFF, unknown, denied, or unavailable flag does not import a Tool chunk.

Active Studio, Checkout, Entitlement, and Commission are private surfaces and do not reserve or
render advertising slots.

## WP-090 interaction and recovery extension

`core-shell-interaction-contracts.js` defines route focus, shortcut/IME, pointer ownership, and
deterministic focus fallback without depending on DOM, Canvas, or Editor State. The DOM adapter
provides Skip Link, landmark naming, roving Tabs/Menus, overlay stacking, background inertness,
Escape close, focus trap, and restore.

`core-shell-async-contracts.js` defines the shared Loading/Saving/Offline/Conflict/Error/Recovery
state machine. It preserves local input and unsynced operations, does not present Offline as Saved,
and deduplicates Live Region announcements. `core-shell-server-route-contract.js` maps unknown and
Flag-OFF routes to fail-closed `404`, and forbidden resources to `403`, before any chunk delivery.

The visual baseline matrix is deterministic and includes four viewports, Light/Dark themes, and
Loading/Empty/Error/Permission Denied/Offline/Dialog/Mobile Sheet states. Image comparison remains
secondary to semantic and interaction tests. WP-080's 62,052 source-byte value remains the reference
while WP-090 records raw, gzip, Brotli, parse/execute, route-request, and Long Task fields when
available.

## Audit, rollback, and telemetry

UI telemetry is an allowlist projection containing only event name, route ID, component, state,
correlation ID, viewport class, and theme. JWTs, email addresses, secrets, Project content, and
personal Commission content are excluded. The Shell relies on the existing Core Feature Flag
kill-switch and scoped rollback contract; rollback returns to the current path and does not delete
or rewrite current data.

WP-080 remains isolated until owner approval, server Route enforcement, compatibility tests, and a
staged rollout gate are complete.
