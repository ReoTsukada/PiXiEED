# Current Native Shell Readiness Inventory

Date: 2026-08-10
Status: Inventory only; no build, deploy, publish, submission, migration, commit, or push performed

## 1. Executive result

`app-shell/pixieed-capacitor/` is an existing iOS/Android shell scaffold and the current mobile
reuse candidate. It is not evidence of a released or store-approved application. Desktop Native
has no selected implementation. Browser/PWA remains the reference host.

| Area | Current status | Evidence / path | Remaining status |
| --- | --- | --- | --- |
| Current browser site | Existing production boundary | `pixiedraw/`, current routes | Preserve; new host integration not claimed |
| Capacitor shell | `IMPLEMENTED_ISOLATED` scaffold | `app-shell/pixieed-capacitor/` | Device/store/security qualification `UNTESTED` |
| Android project | Present | `app-shell/pixieed-capacitor/android/` | Play identity/signing/policy/track evidence `UNTESTED` |
| iOS project | Present | `app-shell/pixieed-capacitor/ios/` | Team/signing/TestFlight/device evidence `UNTESTED` |
| Web staging | Present | `app-shell/pixieed-capacitor/scripts/stage-web-assets.mjs`, `dist/web/` | Reproducible provenance and rollback identity `UNTESTED` |
| Desktop Native | Not selected | No approved Desktop host path | Framework comparison gate required |
| Shared Core/native adapter | Contract direction only | Core docs and strategy | Runtime conformance `UNTESTED` |
| Public mobile release | Not started | No submission claim | TestFlight/Play internal/closed first |

> Note: The repository path is `app-shell/pixied-capacitor/`. The table intentionally spells the
> path out again below; the abbreviated label above is only a status label and not a filesystem
> path.

## 2. Existing Capacitor files

- `app-shell/pixied-capacitor/package.json`: scripts for web staging, Capacitor copy/sync, Android
  debug/release/AAB, iOS simulator/archive/export, and doctor helpers.
- `app-shell/pixied-capacitor/package-lock.json`: lockfile exists, but package ranges in
  `package.json` include `latest` for `@capacitor/core`, `@capacitor/android`, `@capacitor/cli`,
  and `@capacitor/ios`; reproducibility is not yet accepted.
- `app-shell/pixied-capacitor/capacitor.config.json`: `appId` is currently `jp.pixieed.app`,
  `webDir` is `dist/web`, and Android uses an HTTPS scheme.
- `app-shell/pixied-capacitor/scripts/stage-web-assets.mjs`: current web staging boundary;
  source-to-dist identity must be formalized before release.
- `app-shell/pixied-capacitor/android/`: native Android project, Gradle configuration, and build
  helper scripts exist.
- `app-shell/pixied-capacitor/ios/`: native iOS project, archive/export helpers, and app
  configuration exist.
- `app-shell/pixied-capacitor/store/`: App Store/Google Play copy and checklist material exists;
  it is planning material, not store approval evidence.

The repository also contains generated/build and local signing-related material under the shell
tree. It was not changed or inspected for secret values in this inventory. Before any release,
perform a dedicated secret/artifact audit and ensure upload keys, provisioning data, and generated
archives are handled outside source control policy.

## 3. Reuse / adapt / gap classification

### REUSE

- Browser-first `dist/web` staging boundary as an isolated input to the shell.
- Existing Capacitor iOS/Android project structure and doctor scripts.
- Existing store checklist/documentation locations.
- Core Project/PXD/PiXiSYNC contracts and current-route preservation rules.

### ADAPT

- Replace the launcher-only assumption with an approved Core/Tool entry after Core qualification.
- Add typed capability detection and Host Adapter contracts.
- Map `@capacitor/filesystem` to validated scoped `StorageLocator` operations.
- Add deep-link, share/open-with, notifications, backgrounding, safe-area, keyboard, and
  permission adapters.
- Add source-to-dist manifest, artifact hash, update channel, kill switch, and rollback record.
- Pin dependency versions under the later reproducibility work package.

### GAP / UNTESTED

- No physical Android/iOS device matrix recorded here.
- No TestFlight internal/external or Google Play internal/closed track evidence.
- No public store submission/review/rollback evidence.
- No Desktop Native framework decision, signed installer, notarization, Windows signing, updater,
  file association, custom protocol, or desktop crash recovery evidence.
- No native bridge threat-model/conformance report.
- No PXD import/export failure-injection report through native file pickers.
- No offline/online, background/termination, low-storage, permission-denial, or interrupted
  write qualification.
- No native memory/long-session/performance qualification.
- No verified Core/adapter integration in the current production route.
- No authority to modify Market, Stripe, entitlement, license, royalty, purchase, or PiXiSYNC
  production behavior.

## 4. Required acceptance evidence

Before a mobile limited rollout:

1. Clean, pinned dependency install and source-to-artifact manifest.
2. Browser/native adapter contract suite, including unsupported capability failures.
3. PXD legacy round-trip and malformed/truncated/path traversal rejection.
4. Journal/checkpoint recovery across background, termination, offline, and low storage.
5. Deep-link/open-with/share allowlist and identity checks.
6. Bridge/CSP/context-isolation/telemetry privacy review.
7. Accessibility and safe-area checks on supported device classes.
8. TestFlight and Play internal/closed track evidence, then limited rollout rollback rehearsal.

Before a Desktop site-direct release:

1. Tauri/Electron/Capacitor/other comparison with measured bundle, memory, security, update,
   filesystem, and maintenance results.
2. Signed macOS notarized artifact and signed Windows artifact.
3. Verified update channels, signature mismatch rejection, pause/kill switch, and rollback.
4. File association/custom protocol allowlist, offline recovery, and crash-safe Project writes.

## 5. Non-intrusion statement

This inventory did not change `pixiedraw/`, current URLs, current PXD, PiXiSYNC, Market,
production projects/assets/packages, purchases, entitlements, licenses, royalties, Stripe, the
production database, or production storage. The four documentation files listed in the task are
the only intended write scope.
