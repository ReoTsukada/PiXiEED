# NATIVE-510 — Desktop Native Distribution

status: PLANNED
phase: native
kind: native
depends_on: NATIVE-500
implementation_model: Luna MAX
implementation_parallelism: max-4-disjoint-tracks
review_model: Sol High
independent_review: true
next_package: NATIVE-520
auto_start_next: false
verification_level: browser-pwa-first+host-boundary+independent-review

## Canonical role

Evaluate direct site distribution as a desktop candidate with signing and recovery evidence. This definition is subordinate to `00_START_HERE/WORK_PACKAGE_REGISTRY.json`; the Registry owns status, dependencies, routes, write scope, and handoff truth.

## Desktop candidate boundary

Direct site distribution is only a candidate. A candidate must use the NATIVE-500 Host Adapter and preserve the Browser/PWA fallback. Tauri/Electron adoption requires a comparison ADR before implementation. No signing, notarization, updater, or release execution is authorized here.

The desktop workspace must fit one viewport without document scrolling, use compact icon-first controls, and provide tooltip, accessible name, shortcut/help entry, and a short creation guide for every icon. Long data lists may scroll only inside their registered panel.

## Acceptance and evidence

- `NATIVE510-WORKSPACE-001`: Test 1280x900, 1366x768, and 1920x1080. Record page overflow=0, minimum Canvas region, dock/panel bounds, keyboard focus order, icon/help/shortcut coverage, and screenshot. Fail on clipped Canvas, page scroll, control overlap, or an action available only by hover/right-click.
- `NATIVE510-SIGNING-001`: In an isolated fixture, verify artifact identity, certificate chain, signature mismatch rejection, tamper rejection, and key-handling boundary. Record artifact hash and tool versions; never store private keys or credentials in evidence.
- `NATIVE510-NOTARIZE-001`: If macOS notarization is unavailable, record `UNTESTED`. If measured, record signed artifact hash, notarization/staple result, quarantine/open behavior, and failure path. No real release upload is permitted.
- `NATIVE510-UPDATE-001`: Test same-channel update, interrupted download, wrong-channel artifact, downgrade attempt, signature mismatch, kill switch, and offline launch. Record old/new hashes, state preservation, and user-visible recovery.
- `NATIVE510-ROLLBACK-001`: Prove a previously accepted artifact can be restored without changing canonical Project/PXD/PiXiSYNC data. Record trigger, operator, time, result, and post-rollback hash. A plan without execution is `UNTESTED`.
- `NATIVE510-ASSOC-001`: In an isolated OS fixture, test open-with/file association for PXD/PiXiPackage, invalid path, missing file, duplicate launch, and cancel. The Browser adapter must remain the fallback when native association is unavailable.
- `NATIVE510-OFFLINE-001`: Test launch, open, edit, checkpoint, export, quota/full-disk, resume, and sync-retry offline. Record whether the operation is local-only, queued, or rejected; no silent data loss or false sync success.
- `NATIVE510-ADR-001`: Record measured comparison of candidate frameworks and the site-distribution release path: bundle size, update granularity, signing/notarization, rollback, file association, sandbox/security, accessibility, maintenance, and existing Capacitor coexistence. No framework selection or release is implied.

## Evidence contract

Every item records command/protocol, OS/version, candidate artifact hash, fixture, raw output, screenshots for UI, reviewer, timestamp, and status. Store credentials, private keys, JWT, email, project contents, and payment data are prohibited in logs. Missing signing, notarization, native device, OS, updater, and production evidence remains `UNTESTED`; it cannot be promoted from a design review.

## Bounded write scope

- `native/native-510/**`
- `docs/contracts/NATIVE-510-*.md`
- `docs/inventory/native-510-*.json`
- `docs/decisions/ADR-*-NATIVE-510-*.md`
- Coordinator-owned Queue, Registry, State, Worklog, and generated Context manifests are not package-agent write targets.

## Stop rules

- Preserve current Market, PiXiSYNC, URLs, data, production fallback, and dirty worktree.
- Do not migrate, deploy, publish, commit, push, sign a production artifact, notarize, or start the next package automatically.
- Stop on failed signature/tamper/update/rollback test, stale Context, page overflow, data-loss risk, or required approval.

## Handoff

Complete only after acceptance evidence, Checkpoint, and independent review are recorded. The next package is `NATIVE-520`; `autoStartNext: false`. Wait for explicit instruction.
