# PiXiEEDraw DEV R1 Startup, Command-Lock, and Mixed-Build Audit

## Scope

This is an audit only. It covers `PiXiEEDrawDEV/`; no runtime behavior,
database schema, import decoder, service worker policy, dialog CSS, or
production files are changed.

The reported combined symptom is significant because it spans startup, recent
projects, new project creation, and sheet-add imports. The current evidence
does not support treating this as a PNG/GIF decoder failure.

## Evidence Collected

| Area | Current code/evidence | R1 assessment |
| --- | --- | --- |
| Running build | `assets/js/build-info.js` is `20260712-002` | Current app identity is newer. |
| Manifest | `version.json` is still `20260712-001` | Stale manifest, therefore mixed-build evidence. |
| Update comparison | `compareBuildId(manifest, current)` returns negative for `001` versus `002` | Comparison direction is correct. |
| Update status | A negative comparison is exposed as `status: "up-to-date", reason: "manifest-older"` | Public status hides the important `current-newer` state. |
| Service worker | Current worker has no `skipWaiting()` or `clients.claim()` and serves `version.json` network-first | Current source does not forcibly replace a live controller. A controller change may still be from an older installed worker, manual activation, or a prior registration. |
| Script cache keys | `build-info.js` has `20260712-002`; update detector remains `20260712-001`; tab/import modules use `2026.07.11-*` keys | Cache key generations are not tied to one build identity. Offline cache fallback can produce a mixed script graph. |
| Sheet add availability | `enabled = hasActiveProject && !openProjectTabBusy` | `no-active-project` and every command are gated by the same global boolean. |
| Lock ownership | Switch/delete use `openProjectTabBusyOwner`; import/new/recent paths directly write the boolean | Ownership is inconsistent; a shared boolean cannot attribute or safely release overlapping commands. |
| Startup binding | `init()` calls `setupStartupScreen()` and `setupProjectHomeScreen()` before restore, then asynchronously refreshes recent data | Listeners are registered, but startup can legitimately start with no active tab. |
| Recent projects | `refreshRecentProjectsUI()` runs asynchronously and first sanitizes the store | An empty list must be distinguished from an unresolved/failed refresh; current add-button state does not make that distinction. |

## Build and Service Worker Flow

`update-detection-utils.js` fetches `version.json` with `cache: "no-store"`.
For equal semantic versions it compares `manifest.buildId` to the running
`build-info.js` build ID. With running `20260712-002` and manifest
`20260712-001`, it correctly chooses `reason: "manifest-older"`.

The defect is diagnostic/state-modeling, not comparison direction: it reports
the state as `"up-to-date"`. This permits UI and logs to describe a stale
manifest as ordinary equality. R2 should introduce a non-actionable explicit
state such as `current-newer` or `manifest-stale`; it must not show an update
action or reload the page.

The current DEV worker deliberately does not call `skipWaiting()` or
`clients.claim()`. Its network-first paths include navigation, JavaScript,
CSS, HTML, webmanifest, and `version.json`. Thus the reported
`controllerchange` cannot be attributed to the current source alone. It can
occur when a previous worker version is activated, a registration changes
outside this code generation, or an already mixed cache is recovered. R2 must
add observability before changing lifecycle policy.

## Command Lock Audit

`openProjectTabBusy` is stored in `app.js` and drives the plus button. It is
not an import-only lock:

| Command family | Lock behavior |
| --- | --- |
| Sheet switch | Acquires a symbol owner, retains per-tab write guards, and releases in `finally`. |
| Sheet delete | Acquires a symbol owner and releases in `finally`. |
| Multi-file/import append | Writes `openProjectTabBusy = true/false` directly in `openDocumentsAsProjectTabs()`. |
| New project | Writes the boolean directly around project creation. |
| Recent project | Writes the boolean directly around loading/appending. |
| Empty sheet | Uses injected boolean setters directly. |

The import path has a `finally` that releases the boolean and redraws tabs, so
the static source alone does not prove an unconditional missing `finally`.
The architectural defect is that these direct writers do not participate in
the workflow module's owner contract. If a command begins while another
owner-based operation is completing, the boolean may be reset by a different
command. Conversely, a mixed script graph can pair a new UI availability
reader with an older command implementation that has a different cleanup
shape.

The existing availability log reports `command-in-flight`, but it cannot say
which command owns the lock. It hardcodes image/GIF/project import locks to
`false`, although they actually share the global boolean. This makes the
reported browser evidence insufficient to identify the retained owner.

## Startup and Recent Project Flow

`init()` binds file commands, then invokes `setupStartupScreen()` and
`setupProjectHomeScreen()`. Both setup functions attach their click handlers.
The startup recent list calls `refreshRecentProjectsUI()` asynchronously; the
recent workflow sanitizes first and only then loads metadata/cache.

At cold startup, `no-active-project` is expected until a project is restored
or created. It must not be conflated with a retained command lock. The new
project confirm route eventually enters `createNewProjectAsTab()`, which
returns early whenever the same `openProjectTabBusy` flag is true. Therefore a
retained busy state plausibly explains the no-op confirmation and unavailable
plus menu together. It does not by itself prove why the recent list is empty;
that requires startup diagnostics for refresh lifecycle and store result.

## R1 Test

`scripts/test-pixiedraw-dev-startup-command-lock-mixed-build-r1-audit.mjs`
checks:

- Build comparisons for newer, older, equal, and invalid manifests.
- The current stale-manifest result is recorded as `up-to-date` plus
  `manifest-older`.
- The current worker has no forced activation and serves `version.json`
  network-first.
- The build/manifest/script query mismatch is present as audit evidence.
- Startup binding, recent refresh, global availability, direct lock writers,
  and owner-based switch/delete cleanup are all present.

It is intentionally a static/pure audit: it does not simulate file picker,
IndexedDB, service worker lifecycle, or a browser controller swap.

## R2 Minimal Fix Plan

1. Create a single command-lock manager with opaque owner tokens. Every
   command family must acquire/release through it, and `finally` must release
   only its own token. Expose DEV diagnostics with active owner kind, sequence,
   start time, and active sheet/tab.
2. Have the plus button derive availability from the lock manager and an
   explicit editor-ready state. Report `no-active-project`, `startup-loading`,
   and each command owner separately.
3. Instrument startup refresh: listener bound, refresh start/end, sanitize
   result, metadata count, cache count, and failure reason. Do not alter the
   recent store in the diagnostic phase.
4. Add an explicit stale-manifest state (`current-newer`/`manifest-stale`) to
   update detection. It is informational and must not offer reload.
5. Add service-worker diagnostics for registration URL, installing/waiting/
   active worker script URLs, controller URL, and controller changes. Do not
   add `skipWaiting`, `clients.claim`, or automatic reload.
6. Only after the above has browser evidence, decide whether script cache
   query values should be generated from one build ID.

## R2 Test Matrix

- Startup with no active project: plus explains `no-active-project`; new
  project is still actionable.
- New project success/failure/cancel: its own lock is released.
- Project, image, GIF, and recent append: each lock is released on success,
  picker cancel, parse/decode/validation/commit/activation failure, and throw.
- Switch/delete/import overlap: no command releases another owner's lock.
- Recent refresh success, empty store, sanitize failure, and metadata failure
  are separately visible.
- Current `002` / manifest `001`: `manifest-stale`, no update action.
- Current `001` / manifest `002`: update available.
- Controller change: diagnostic only, no automatic reload.

## Out of Scope

- PNG/GIF decode and Canonical V2 connection.
- RGB-to-Indexed dependency issue.
- Recent project schema or IndexedDB migration.
- Automatic reload, forced worker activation, or cache deletion.
- Dialog visibility CSS and production `pixiedraw/`.
