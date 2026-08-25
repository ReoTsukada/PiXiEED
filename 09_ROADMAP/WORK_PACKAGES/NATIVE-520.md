# NATIVE-520 — Mobile Store Distribution

status: PLANNED
phase: native
kind: native
depends_on: NATIVE-510
implementation_model: Luna MAX
implementation_parallelism: max-4-disjoint-tracks
review_model: Sol High
independent_review: true
next_package: WP-900
auto_start_next: false
verification_level: browser-pwa-first+host-boundary+independent-review

## Canonical role

Evaluate the existing Capacitor shell for staged Google Play/App Store distribution with PWA fallback. This definition is subordinate to `00_START_HERE/WORK_PACKAGE_REGISTRY.json`; the Registry owns status, dependencies, routes, write scope, and handoff truth.

## Mobile candidate boundary

Use `app-shell/pixieed-capacitor`. App Store and Google Play are the intended public channels; TestFlight and Play internal/closed tracks are qualification channels; Browser/PWA remains the fallback. Mobile remains Canvas-first and portrait-oriented, with on-demand sheets for Layers, Timeline, Palette, Properties, Assets, Help, and advanced tools. The page never scrolls; only a registered panel or sheet body may scroll.

## Acceptance and evidence

- `NATIVE520-WORKSPACE-001`: Test 390x844 and at least one tablet portrait/landscape profile. Record document overflow=0, safe-area inset, Canvas usable bounds, reachable essential toolbar, sheet open/close, text scaling, keyboard/IME case, icon accessible names, tooltip/help/shortcut coverage, and screenshots. Fail on page scroll, hidden critical control, or clipped bottom navigation.
- `NATIVE520-CAPACITOR-001`: Verify web asset provenance, source-to-dist hash, Core/Host Adapter conformance, lifecycle resume, offline queue, deep-link denial/handling, and capability-denied diagnostics in an isolated shell. `cap sync` or a build is evidence only when its command, hash, and environment are recorded; no store upload.
- `NATIVE520-PLAY-001`: Record package identity, manifest, permissions, signing boundary, privacy/data-safety inputs, device/OS matrix, and Play internal/closed-track procedure. Actual track evidence is `UNTESTED` unless independently observed; no public submission.
- `NATIVE520-APPSTORE-001`: Record bundle identity, entitlements, privacy declarations, signing boundary, device/OS matrix, and TestFlight internal/external procedure. Actual TestFlight/review evidence is `UNTESTED` unless independently observed; no App Store submission.
- `NATIVE520-STAGED-001`: Test Browser/PWA fallback, Play internal/closed and TestFlight staged artifacts when available, old/new artifact coexistence, feature-flag default-OFF, kill switch, uninstall/reinstall recovery, and rollback to the previous artifact. Store availability alone is not a PASS.
- `NATIVE520-PWA-001`: Verify Browser/PWA remains usable with native APIs absent, including project open/save/export, checkpoint, offline queue, and typed capability diagnostics. Record page overflow and initial/lazy bundle boundaries.
- `NATIVE520-NODEPLOY-001`: Independent review confirms no store submission, deploy, publish, production route switch, production data change, migration, real payment, or signing credential exposure occurred.

## Evidence contract

Each item records device/OS/browser or shell version, artifact/source hash, fixture, command/protocol, raw output, screenshot/video where relevant, reviewer, timestamp, and status. Physical device, TestFlight, Play, signing, store policy, native performance, and production evidence not actually observed remains `UNTESTED`. Audit/telemetry excludes JWT, email, secrets, project contents, commission contents, and payment data.

## Bounded write scope

- `native/native-520/**`
- `app-shell/pixieed-capacitor/src/pixieed-host/**`
- `app-shell/pixieed-capacitor/tests/pixieed-host/**`
- `app-shell/pixieed-capacitor/scripts/pixieed-host/**`
- `docs/contracts/NATIVE-520-*.md`
- `docs/inventory/native-520-*.json`
- `docs/decisions/ADR-*-NATIVE-520-*.md`
- Coordinator-owned Queue, Registry, State, Worklog, and generated Context manifests are not package-agent write targets.

## Stop rules

- Preserve current Market, PiXiSYNC, URLs, data, production fallback, and dirty worktree.
- Do not migrate, deploy, publish, submit to a store, commit, push, or start the next package automatically.
- Stop on page overflow, failed fallback, capability spoofing, artifact mismatch, data-loss risk, stale Context, or required approval.

## Handoff

Complete only after acceptance evidence, Checkpoint, and independent review are recorded. The next package is `WP-900`; `autoStartNext: false`. Wait for explicit instruction.
