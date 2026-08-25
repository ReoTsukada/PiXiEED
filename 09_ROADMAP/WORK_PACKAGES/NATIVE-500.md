# NATIVE-500 — Cross-platform Host Boundary

status: PLANNED
phase: native
kind: native
depends_on: PLATFORM-450
implementation_model: Luna MAX
implementation_parallelism: max-4-disjoint-tracks
review_model: Sol High
independent_review: true
next_package: NATIVE-510
auto_start_next: false
verification_level: browser-pwa-first+host-boundary+independent-review

## Canonical role

Define one canonical Core/project contract behind Browser/PWA, desktop, and mobile host adapters. This definition is subordinate to `00_START_HERE/WORK_PACKAGE_REGISTRY.json`; the Registry owns status, dependencies, routes, write scope, and handoff truth.

## Required product contract

- Browser/PWA is the first implementation and permanent fallback.
- Browser, desktop, iOS, and Android use the same Core, Project, Asset, Revision, PXD, PiXiSYNC, authorization, and commerce contracts. A host adapter may change capabilities and presentation only.
- Desktop uses a dense creator workspace: compact icon-first toolbar, dockable regions, Canvas/Viewport as the primary area, Inspector on the right, structure/tools on the left, and Timeline/Assets/Console in bounded regions.
- Mobile uses the current PiXiEEDraw portrait Canvas-first pattern. Layers, Timeline, Palette, Properties, Assets, and advanced tools appear on demand in a sheet/drawer; the desktop layout is never merely scaled down.
- Tablet uses an adaptive profile with a persistent Canvas and at most one persistent secondary panel.
- Labels are short and icon-first. Every icon has an accessible name, tooltip, shortcut/help entry, and QA case. A destructive or high-risk action always has visible confirmation text and a non-icon alternative.
- The document/page itself never scrolls: `document.scrollWidth === viewportWidth` and `document.scrollHeight === viewportHeight` for each supported viewport. Only registered Panel, Timeline, Asset list, Help, or sheet content may scroll or virtualize.

## Acceptance and evidence

- `NATIVE500-WORKSPACE-001`: At minimum test 1280x900, 1366x768, 1920x1080, 1024x768 tablet, and 390x844 portrait. Record viewport, safe-area, `document` dimensions, screenshot, focus order, icon accessible names, tooltip, shortcut, Help/Q&A entry, and creation-guide step. Fail on page overflow, clipped critical control, unreachable action, unexplained icon, or a required hover/right-click-only action.
- `NATIVE500-HOST-001`: Run the same Core conformance fixture through Browser fake, native-capability fake, and capability-denied adapters. Record command/revision/hash equivalence and typed Diagnostic on denied capability. No host may create a second Project State or authority model.
- `NATIVE500-BROWSERFIRST-001`: Show a clean Browser/PWA start, offline-safe fallback, and feature-flag-OFF path with no native dependency. Record initial route, bundle boundary, and fallback screenshot; current routes remain untouched.
- `NATIVE500-SECURITY-001`: Attempt caller capability spoofing, adapter replacement, path escape, secret/PII logging, and unauthorized native operation. Each must fail closed with a typed Diagnostic; audit output contains no JWT, email, secret, project contents, or commission contents.
- `NATIVE500-FORK-001`: Compare canonical Project, Asset, Revision, PXD, PiXiSYNC operation, and local UI state. Canonical values must be equal across hosts; zoom, panel arrangement, local tool, scroll, and hover must remain non-canonical and unsynchronized.
- `NATIVE500-ADR-001`: Record a comparison of browser/PWA, Capacitor, Tauri, Electron, and any other candidate by Core reuse, bundle/update granularity, accessibility, filesystem/security, signing, rollback, maintenance, and existing coexistence. No framework is selected by this package.

## Evidence contract

Each item needs a source-traceable evidence file under the bounded scope containing: test command or manual protocol, exact environment, fixture/hash, observed output, screenshot or raw measurement where relevant, PASS/FAIL/PARTIAL/UNTESTED status, reviewer, and timestamp. Synthetic or desktop-only evidence is not device or production evidence. Existing baseline failure identities must remain identical; new failures must be zero for a PASS.

## Bounded write scope

- `native/native-500/**`
- `docs/contracts/NATIVE-500-*.md`
- `docs/inventory/native-500-*.json`
- `docs/decisions/ADR-*-NATIVE-500-*.md`
- Coordinator-owned Queue, Registry, State, Worklog, and generated Context manifests are not package-agent write targets.

## Stop rules

- Preserve current Market, PiXiSYNC, URLs, data, production fallback, and dirty worktree.
- Do not migrate, deploy, publish, commit, push, submit a store build, or start the next package automatically.
- Keep unavailable physical-device, store, signing, native-performance, and production evidence `UNTESTED`.
- Stop on missing dependency, stale Context, write-scope violation, authority ambiguity, page overflow, data-loss risk, or required approval.

## Handoff

Complete only after acceptance evidence, Checkpoint, and independent review are recorded. The next package is `NATIVE-510`; `autoStartNext: false`. Wait for explicit instruction.
