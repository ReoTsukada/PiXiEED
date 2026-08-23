# PiXiSYNC Draw2 140 — browser IndexedDB fixture

Status: `LOCAL_CHROMIUM_BROWSER_PASS`

`pixiedraw2/assets/pixisync-indexeddb-browser-harness.html` is a local-only
fixture for the real browser boundary of the existing DRAW2-130 IndexedDB
adapter. It does not change the product UI, `draw2-entry.ts`, or DRAW2-130.

## Browser entry

The HTML fetches the adjacent generated `.js` asset as text, converts the
bundled browser entry to a JavaScript Blob module, and calls
`runPixisyncIndexedDbBrowserHarness`. The bundle is intentionally named `.js`:
it is generated JavaScript rather than TypeScript source and is checked with
the JavaScript parser.

The result is exposed as:

```ts
window.__pixisyncDraw2BrowserResult
```

The fixture reports `phase: INITIAL_SETUP` on the first visit. Reloading the
same URL reports `phase: RELOAD_RECOVERY` and verifies that project A's
outbox survives the browser reload. Use the reset button to remove only the
fixture's databases and marker.

## Checks

- `project-isolation`: project A and B use separate project-scoped records.
- `reload-recovery`: a new journal instance recovers A after the marker says a
  previous page load prepared it.
- `save-failure-surface`: the injected 130 factory boundary rejects a
  synthetic open/save failure with `OPEN_FAILED`. This is deterministic and
  is not a quota or device-failure claim.
- `tamper-rejection`: a raw IndexedDB snapshot hash mutation is rejected by
  journal restore, then the valid fixture snapshot is restored.
- `same-instance-ordering`: concurrent replacements through one adapter
  instance finish in call order and the newest valid snapshot is recoverable.

## Evidence boundary

The Deno test is static/unit qualification of the HTML and bundled entry.
The primary operator additionally ran the fixture at localhost in a Chromium
151 browser on 2026-08-23. The initial setup produced four PASS results and
one reload `UNTESTED`; an actual page reload then produced five PASS results,
including durable recovery. The structured result is recorded in
`docs/inventory/pixisync-draw2-140-browser-evidence.json`.

Safari, multi-tab/process concurrency, device durability, quota failure,
Supabase transport, staging, production, and cross-device behavior remain
`UNTESTED`.

The fixture uses only synthetic IDs and command payloads. It does not access
PiXiEEDraw product state, network, Supabase, user data, or production storage.
