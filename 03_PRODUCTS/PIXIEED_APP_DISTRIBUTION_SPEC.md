# PiXiEED App Distribution Specification

Status: CANONICAL PRODUCT SPEC / DISTRIBUTION CONTRACT
Updated: 2026-08-10
Scope: Browser-first delivery, future Desktop Native distribution, and iOS/Android store delivery

## 1. Purpose and current-state labels

PiXiEED is Browser-first during Core and tool development. The browser/PWA, Desktop Native,
iOS, and Android hosts MUST use the same Canonical Core, Project, Asset, Revision, PXD,
PiXiSYNC, authorization, and compatibility contracts. Only the Host Adapter and presentation
capabilities may differ.

This document does not authorize a build, submission, deployment, migration, publication, or
replacement of a current route.

| Label | Meaning |
| --- | --- |
| `IMPLEMENTED_ISOLATED` | Source or shell exists in an isolated path; production integration is not implied. |
| `CONTRACT_ONLY` | The host behavior is specified but its runtime/evidence gate is incomplete. |
| `PRODUCTION_INTEGRATED` | A production route/provider is explicitly known to invoke the path. |
| `UNTESTED` | Required device, store, provider, security, performance, or recovery evidence is absent. |

Current classification:

- Current browser site and `pixiedraw/`: existing production boundary; preserve it.
- `app-shell/pixieed-capacitor/`: `IMPLEMENTED_ISOLATED` shell scaffold and existing iOS/Android
  projects; store release is `UNTESTED`.
- Desktop Native: `CONTRACT_ONLY`; no framework is selected.
- New Core/Draw2 integration: isolated until Core qualification and later product gates pass.

## 2. Distribution targets

| Host | Primary purpose | Distribution decision | Contract authority |
| --- | --- | --- | --- |
| Browser | Immediate development, public web, PWA fallback | Primary during development and always-supported fallback | Web Host Adapter + Canonical Core |
| Desktop Native | Site-controlled downloadable creator application | Candidate for direct site distribution after a separate framework and release gate | Desktop Host Adapter + Canonical Core |
| iOS | Mobile public distribution | App Store primary; TestFlight for internal/external qualification | Capacitor iOS Adapter + Canonical Core |
| Android | Mobile public distribution | Google Play primary; internal/closed tracks before public | Capacitor Android Adapter + Canonical Core |

Mobile is not a desktop layout shrunk into a phone. Desktop follows a dense creator workspace
inspired by Aseprite, Unity, and Unreal Editor; mobile follows the current PiXiEEDraw portrait,
Canvas-first interaction and reveals Layers, Timeline, Palette, and Tool Options on demand.
The supplied Unity/Unreal/Aseprite screenshots and `menu.gif` are UX references only. They are
not repository assets, and their pixels, icons, branding, or code MUST NOT be copied.

All hosts expose one usable viewport to the Workspace. The Editor document/page does not scroll;
Canvas and critical controls fit inside that viewport, while Timeline, Layer, Asset, Console,
Help, and sheet contents may scroll or virtualize only inside their registered panel. Compact
icon-first commands retain the same command IDs, accessible names, tooltips, shortcut hints,
Help/Q&A entries, and creation guide across Browser and Native hosts.

## 3. Canonical contract invariant

All hosts consume the same logical contracts:

```text
Host Adapter
  -> Core Composition Root
     -> Project / Asset / Package Registry
     -> Command / Revision / Undo / Checkpoint contracts
     -> PXD / PiXiPackage reader and writer adapters
     -> PiXiSYNC adapter
     -> Authorization / Event / Diagnostic contracts
```

Host-specific code MUST NOT create a second Project State, PXD meaning, authority model, or
financial/entitlement model. A host may cache or project the same data differently, but a
canonical change enters through Core commands and revisions.

Required compatibility rules:

- Current PXD remains readable by the current PiXiEEDraw and is handled by an explicit Legacy
  Adapter; it is not rewritten in place.
- Integrated PiXiPackage/PXD is materialized from a selected Revision and Dependency Lock.
- PiXiSYNC transports canonical operations/revisions only; local panel state, zoom, tool, and
  window arrangement are not synchronized.
- Existing URLs, Projects, Assets, Market products, purchases, entitlements, licenses,
  commissions, royalties, and PiXiSYNC data remain outside ordinary host work.
- Store payment policy and PiXiEED Commerce authority remain separate. Store submission or
  billing code MUST NOT silently alter Stripe, entitlement, royalty, or purchase contracts.

## 4. Host Adapter contract

Each host provides capability declarations and a small adapter. Feature detection MUST be used
at runtime; user-agent or platform name alone is insufficient.

```ts
type HostKind = "browser" | "desktop" | "ios" | "android";

type HostCapabilities = {
  kind: HostKind;
  filesystem: "none" | "scoped" | "native";
  secureCredentials: boolean;
  deepLinks: boolean;
  openWith: boolean;
  share: boolean;
  notifications: boolean;
  nativeMenus: boolean;
  backgroundResume: "web" | "native";
  offlineStorage: "indexeddb-opfs" | "native" | "hybrid";
};

interface PiXiEEDHostAdapter {
  capabilities(): HostCapabilities;
  openProject(request: OpenProjectRequest): Promise<OpenProjectResult>;
  saveExport(request: ExportRequest): Promise<ExportResult>;
  openExternal(request: ExternalOpenRequest): Promise<OpenExternalResult>;
  notify(request: NotificationRequest): Promise<NotificationResult>;
  lifecycle(): HostLifecycle;
}
```

The adapter MUST fail closed when a capability is unavailable and return a typed Diagnostic.
Core MUST remain usable with the Browser adapter when all native capabilities are false.
Contract tests MUST run against a browser fake adapter, native-capability fake adapter, and
deliberately failing adapter.

## 5. Host differences that require explicit adapters

| Concern | Browser/PWA | Desktop Native | iOS/Android | Required rule |
| --- | --- | --- | --- | --- |
| Filesystem | File System Access where available; otherwise download/IndexedDB/OPFS | Scoped app files plus user-selected files | App sandbox, scoped picker, Photos/Gallery where permitted | Core receives a locator, never arbitrary paths |
| Local data | IndexedDB + OPFS | IndexedDB/OPFS plus scoped native storage | IndexedDB/OPFS plus native sandbox | Same journal/checkpoint semantics; placement is adapter-owned |
| Credentials | HttpOnly/session mechanisms; no secret in JS | OS credential store through adapter | Keychain/Keystore through adapter | Never place provider secrets in Project/PXD or telemetry |
| Deep link | HTTPS route | HTTPS plus registered custom protocol | Universal/App Links where configured | Allowlist and identity verification before opening a Project |
| Share/open-with | Web Share/download/input | File associations/share bridge | Share sheet/document picker | Imported bytes go through the same PXD validation |
| Notifications | Permissioned Web Notifications | Native notification adapter | APNs/FCM adapter via server contract | Notification authority stays server/Core-owned |
| Menu/shortcut | Browser limits; Command Palette fallback | Native menu plus keyboard registry | System gestures and limited shortcuts | Command Registry remains canonical |
| Window/safe area | Visual viewport and browser UI | Resizable window/minimum canvas | Safe area, keyboard, orientation, text scaling | Presentation only; never changes canonical color/state |
| Lifecycle/network | page freeze/background/online events | suspend/resume/offline | background suspension/termination | Journal before background; recover idempotently |
| Payments | Web Commerce policy | Web/Commerce authority | Store policy may apply to digital goods | Entitlement source is explicit; no host bypass |

## 6. Existing Capacitor shell: reuse, adapt, gap

The existing path `app-shell/pixieed-capacitor/` is the mobile starting point. It is not proof
of store readiness.

| Area | Reuse now | Adapt later | Gap / acceptance evidence |
| --- | --- | --- | --- |
| Capacitor shell | `package.json`, `capacitor.config.json`, `ios/`, `android/`, existing staging scripts | Replace launcher content with approved Core/Tool entry after qualification | Version pinning, clean build, artifact provenance, device matrix are `UNTESTED` |
| Web staging | `scripts/stage-web-assets.mjs`, `dist/web/` boundary | Make source-to-dist manifest and rollback identity explicit | Current staging behavior is being changed by other work; re-audit before release |
| Android | `android/`, `scripts/doctor-android.sh`, build scripts, Play AAB path | Permission/deep-link/share/notification adapters; Play policy review | Signing, Play Console configuration, internal/closed testing, restore and offline tests `UNTESTED` |
| iOS | `ios/`, `scripts/doctor-ios.sh`, archive/export scripts | Info.plist permissions, universal links, share/document adapters | Team/signing, TestFlight, review metadata, device/background tests `UNTESTED` |
| Storage | `@capacitor/filesystem` dependency is present | Map it to scoped StorageLocator and PXD adapter | Security review, cancellation, partial-write recovery `UNTESTED` |
| App identity | `capacitor.config.json` currently uses `jp.pixieed.app` | Final identity only through a release gate | Bundle/package ownership and store identity `UNTESTED` |

The current `app-shell/pixieed-capacitor/package.json` uses `latest` for several Capacitor
packages. This is a reproducibility gap for FP-007 and MUST be pinned and reviewed in that
later work package; this document does not change it.

## 7. Security and privacy contract

- Native bridges expose the minimum typed methods; no general-purpose eval, filesystem root,
  arbitrary URL loader, or unrestricted IPC is allowed.
- WebView navigation uses an allowlist. External URLs open through an explicit external-open
  adapter and are never silently treated as internal Project routes.
- Context isolation, CSP, origin checks, secure transport, and message schema validation are
  release acceptance conditions.
- Telemetry/Audit MUST NOT contain JWTs, emails, secrets, Project content, raw pixels, audio,
  scripts, private commission details, payment credentials, or unredacted provider errors.
- Native credential storage is for credentials/tokens only; canonical Project/PXD data remains
  under Core storage-placement rules.
- Store capability differences never grant authority. AuthorizationProof, entitlement, license,
  royalty, and payment decisions remain server/Core-owned and fail closed.

## 8. Release sequence and evidence

The intended sequence is:

```text
Core qualification
 -> Browser/PWA qualification
 -> Desktop framework comparison gate
 -> Desktop signed canary / rollback rehearsal
 -> iOS/Android adapter qualification
 -> TestFlight + Play internal/closed tracks
 -> limited rollout with monitoring
 -> owner approval
 -> public store release or site-direct release
```

Required evidence is host-specific but must include:

- contract-test report for every adapter and capability permutation;
- browser, desktop, iOS, and Android artifact identity and source manifest;
- PXD legacy round-trip, import validation, cancellation, and crash recovery;
- offline/online, background/foreground, duplicate deep-link, share/open-with, and notification
  tests;
- accessibility, safe-area, text-scaling, keyboard/touch/stylus, and minimum canvas checks;
- CSP/navigation/bridge exposure/security report;
- signing and update-channel verification, rollback artifact, and crash/recovery evidence;
- store policy review and explicit entitlement/commerce compatibility evidence;
- `UNTESTED` list with device/OS/browser/version and reason.

No local shell build, generated AAB, Xcode archive, or existing store checklist changes any
`UNTESTED` item without the corresponding evidence manifest.

## 9. References

- [`02_ARCHITECTURE/PIXIEED_CORE_SYSTEM.md`](../02_ARCHITECTURE/PIXIEED_CORE_SYSTEM.md)
- [`02_ARCHITECTURE/CORE_COMPLETION_BLUEPRINT.md`](../02_ARCHITECTURE/CORE_COMPLETION_BLUEPRINT.md)
- [`02_ARCHITECTURE/STORAGE_PLACEMENT_AND_SYNC.md`](../02_ARCHITECTURE/STORAGE_PLACEMENT_AND_SYNC.md)
- [`03_PRODUCTS/STORE_EXPORT_ADAPTER_SPEC.md`](STORE_EXPORT_ADAPTER_SPEC.md)
- [`app-shell/pixieed-capacitor/README.md`](../app-shell/pixieed-capacitor/README.md)
- [Apple distribution](https://developer.apple.com/distribute/) / [TestFlight](https://developer.apple.com/testflight/)
- [Google Play testing](https://support.google.com/googleplay/android-developer/answer/9845334) / [Play app setup](https://support.google.com/googleplay/android-developer/answer/9859152)
- [Capacitor](https://capacitorjs.com/docs) / [Tauri distribution](https://v2.tauri.app/distribute/)
