# ADR-20260810: Browser-first and Host-adapter Native Distribution

- Status: Accepted as direction; implementation and release gates remain pending
- Date: 2026-08-10
- Scope: Browser/PWA, Desktop Native candidate, iOS, Android distribution boundaries
- Related: `03_PRODUCTS/PIXIEED_APP_DISTRIBUTION_SPEC.md`, `08_IMPLEMENTATION/NATIVE_APP_SHELL_STRATEGY.md`

## Decision

PiXiEED uses one Browser-first product implementation and one Canonical Core contract. Browser,
PWA, Desktop Native, iOS, and Android are host adapters. Mobile public distribution targets the
App Store and Google Play, with TestFlight and Play internal/closed tracks before limited and
public rollout. Desktop may be distributed directly from the PiXiEED site after a future
framework comparison, signing, update, security, and rollback gate.

The existing `app-shell/pixieed-capacitor/` is reused as the current iOS/Android shell candidate.
No Desktop framework is selected now. No store submission, deployment, migration, route switch,
or native production integration is authorized by this ADR.

## Context

The current repository already has a Capacitor shell, Android and iOS projects, staging scripts,
store checklists, and a `dist/web` boundary. The Core architecture separately defines canonical
Project/Asset/Revision/PXD/PiXiSYNC contracts and protects current PiXiEEDraw, current routes,
Market, purchases, rights, and production data.

The product direction requires:

- browser development and PWA reach;
- a site-controlled Desktop Native application eventually;
- App Store/Google Play mobile delivery;
- current PiXiEEDraw portrait UX as the mobile reference;
- Aseprite pixel-production efficiency with Unity/Unreal-style dense workspace references on PC;
- one Core and no web/native business-logic forks.

## Options considered

| Option | Decision | Reason |
| --- | --- | --- |
| Browser/PWA only | Rejected as final distribution plan | Does not cover native filesystem, lifecycle, store, or site-direct desktop goals |
| Separate product per platform | Rejected | Duplicates Core/PXD/PiXiSYNC and creates compatibility/security drift |
| Capacitor for iOS/Android now | Selected as current shell direction | Existing repository path and web-first fit; still requires qualification |
| Tauri for Desktop now | Deferred | Promising candidate but no measured bundle, memory, signing, updater, or team-fit evidence |
| Electron for Desktop now | Deferred | Mature ecosystem but larger runtime/security/maintenance surface must be measured |
| Capacitor Desktop now | Deferred | Must first verify actual desktop support and release/update maturity |
| Direct APK/ad-hoc iOS as public mobile path | Rejected as primary | Store discovery, review, update, and platform policy path is required |

## Consequences

Positive:

- Core, PXD, PiXiSYNC, authorization, entitlement, and commerce semantics stay authoritative in
  one place.
- Browser work remains fast and inspectable while native capability is added incrementally.
- Store testing can proceed through TestFlight and Play tracks without replacing the web route.
- Desktop distribution can be chosen from evidence rather than framework fashion.

Costs and risks:

- Every adapter needs capability and contract tests.
- Native lifecycle, permissions, deep links, file access, and signed updates add release work.
- Web/PWA/native artifacts need source and version provenance.
- Store policy and web Commerce policy can differ; entitlement authority must be explicit.

## Non-negotiable constraints

1. No host may fork canonical Project/PXD/PiXiSYNC or authorization semantics.
2. No native bridge may expose arbitrary navigation, filesystem roots, eval, or unrestricted IPC.
3. JWT, secrets, email, Project content, raw media, private commission data, and payment data are
   excluded from telemetry/audit.
4. `UNTESTED` stays `UNTESTED` until evidence exists; local archives or generated bundles are not
   store/device acceptance proof.
5. Existing routes and current data remain untouched until a separately approved cutover package.
6. The user-provided Unity, Unreal, and Aseprite images are UX references only; no visual asset
   is copied into the repository.

## Acceptance and rollback

Acceptance requires adapter conformance, PXD round-trip, offline/background recovery,
navigation/bridge security, device/accessibility evidence, artifact provenance, signed update
verification, rollback rehearsal, and store-policy review. A host release can be stopped by its
kill switch without deleting Core records or changing current routes. Update channels must be
able to pause and return to the last verified artifact.

## Follow-up

- `NATIVE-500`: define and test capability/adapter contracts.
- `NATIVE-510`: compare Desktop candidates and produce a signed prototype/rollback report.
- `NATIVE-520`: qualify the existing Capacitor mobile shell through TestFlight and Play tracks.
- Later staging/release packages decide limited rollout and public release. This ADR does not
  authorize those actions.
