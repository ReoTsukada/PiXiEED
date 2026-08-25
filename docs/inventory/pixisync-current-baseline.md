# PiXiSYNC current baseline — WP-000

調査日: 2026-08-06

対象 commit: `76e01b24c7f4f4ae3b75c0727f1e3612a133d970`

## Entry points and flags

| Area | Current source | Observed behavior |
| --- | --- | --- |
| Production editor entry | `pixiedraw/index.html`, `pixiedraw/assets/js/app.js` | The HTML currently loads split `assets/js/modules/*.js` plus `app.js`; this contradicts the older claim in `docs/project-file-map.md`, which is recorded as documentation drift. |
| Operation/realtime | `pixiedraw/assets/js/modules/pixisync-operation-codec.js`, `pixisync-realtime-client.js`, `pixisync-order-keeper.js` | Encodes operations, tracks confirmed ordering, and connects to the current realtime/RPC boundary. |
| Local recovery | `pixisync-journal-utils.js`, `local-project-journal-utils.js`, `reload-session-workflow-utils.js` | Persists pending/local recovery state without claiming that remote confirmation has happened. |
| Checkpoint/raster | `pixisync-checkpoint-*`, `pixisync-document-*`, `pixisync-raster-*` modules | Separates checkpoint/upload/reference handling from operation delivery. |

Current source flags:

- `PIXISYNC_V1_ENABLED = true` in `pixiedraw/assets/js/app.js`;
- `SHARED_PROJECTS_ENABLED = false` in the same file, so the retired legacy shared-project path is disabled;
- `window.__PIXISYNC_V1_CONFIG__` can provide the runtime config and otherwise defaults to the V1 flag;
- `RELOAD_SNAPSHOT_ENABLED = true` and `IOS_SNAPSHOT_SUPPORTED = false` in `ui-static-config.js`;
- `MULTI_CANVAS_FEATURE_ENABLED = false` in `state-normalizers.js`.

## Current lifecycle

The source and existing lifecycle tests describe this sequence:

```text
authenticate
  -> confirmed local autosave / project snapshot
  -> create or resolve a separate shared project binding
  -> begin/open PiXiSYNC session
  -> join/confirm session
  -> receive and order operations
  -> checkpoint/reference recovery when required
  -> preserve local card and room binding until explicit leave/archive
```

Focus recovery preserves an already-active, non-suspended realtime client (`active -> active`). Reconnection is reserved for actual suspension/transport loss or a revision/session mismatch. The repository tests cover project switching, delete behavior, operation codec/order, checkpoints, raster assets, and typed autosave runtime wiring.

## Revision and convergence behavior

The current protocol distinguishes local pending operations from confirmed remote revision. Operation codecs and order-keeper tests cover encoding, decoding, order, duplicate handling, and server/RPC shapes. Checkpoint and raster-region paths use separate upload/reference lifecycle code, so a checkpoint object is not treated as an arbitrary public file.

The synthetic convergence fixture in `fixtures/pixisync-convergence.synthetic.json` uses no user data and records the expected final revision/hash behavior for future adapter tests.

## Persistence and project cards

PiXiSYNC journal state is stored in IndexedDB `pixieed-pixisync-v1` (`pendingOperations`). PiXiEEDraw project/autosave state is separately inventoried in `storage-and-formats.json`. Recent shared cards retain their room/project binding until an explicit leave/archive path; local cards are not given the shared badge.

## Verification status

Passed during WP-000: operation codec, document operation, project delete/switch, checkpoint reference, raster asset/region asset, typed autosave runtime, production app syntax, and PXD index8 round-trip. The isolated browser smoke lifecycle was not rerun in this WP; live production project data was not touched. Full command results and the 14 unresolved baseline failures are in `.codex/PIXIEED_TEST_RESULTS.md`.
