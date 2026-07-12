# PiXiEEDrawDEV Phase U2: Safe Update Detection

## Build Identity

`PiXiEEDrawDEV/assets/js/build-info.js` is the runtime source of truth.
It publishes `window.__PIXIEEDRAW_BUILD_INFO__` with `edition`, `version`,
`buildId`, and `releasedAt`. `version.json` is the separately fetched release
manifest, not an additional runtime definition.

## Manifest

`version.json` uses schema version 1:

```json
{
  "schemaVersion": 1,
  "edition": "dev",
  "version": "0.9.0-dev.1",
  "buildId": "20260712-001",
  "releasedAt": "2026-07-12T00:00:00+09:00",
  "minimumCompatibleVersion": "0.9.0-dev.1"
}
```

The manifest is fetched with `cache: "no-store"` and a no-cache request
header. The service worker remains network-first for JSON requests.

## Comparison And States

The detector compares semantic major/minor/patch versions, prerelease tokens,
and numeric build-id segments. It rejects a manifest with a different edition
or a higher `minimumCompatibleVersion`.

States are `idle`, `checking`, `up-to-date`, `update-available`, `offline`,
`failed`, and `incompatible`. One request is shared by concurrent callers.
Timeout, HTTP, JSON, schema, abort, and offline failures are recoverable.

## Notification

`#versionUpdateNotice` is a non-modal notice. It displays current and
available version/build IDs, provides a session-scoped `Later` dismissal, and
contains a disabled placeholder for U4 update application. It never changes
the active document, sheet, dirty state, autosave, or project storage.

The first check runs after `load`, then on online recovery and at a 15-minute
interval. A `BroadcastChannel` only shares release metadata; it does not
activate a worker or reload a tab.

## Service Worker Boundary

The DEV service worker no longer calls `skipWaiting()` or `clients.claim()`.
App `controllerchange` no longer schedules a reload. U2 does not call
`registration.update`, checkpoint code, or reload APIs as an update action.

## Verification

`scripts/test-pixiedraw-dev-update-detection-u2.mjs` covers manifest schema,
semver/prerelease/build comparisons, same/new/incompatible states, HTTP and
parse failures, offline handling, concurrent request sharing, and static
guards against `skipWaiting` and controllerchange reload.

Browser confirmation remains required for a live manifest update, dismissal,
offline startup, online recovery, and multi-tab notification behavior.

## U3 Handoff

U3 must create a distinct update checkpoint for every open project, read it
back, and verify project/sheet identity before any future update action can
be offered. U2 deliberately performs no checkpoint, activation, or reload.
