# PiXiEEDrawDEV split guardrails

This note exists to reduce breakage while moving `PiXiEEDrawDEV/assets/js/app.js` into modules.

## 1. Classify every outside dependency before moving code

For each target function block, list every outside identifier and put it into one of these buckets.

- Immutable constant:
  Example: `DEFAULT_CANVAS_SIZE`, `SHARED_PROJECT_ID_PREFIX`
- Mutable object reference:
  Example: `openProjectTabs`, `recentProjectsCache`, `openProjectTabLongPressState`
- Mutable primitive that can be reassigned:
  Example: `openProjectTabSequence`, `projectTabViewportResetToken`, `activeOpenProjectTabId`, `voxelExtensionState`
- Private singleton state owned by the target block:
  Example: `internalClipboard`
- Callback / side-effect bridge:
  Example: `renderOpenProjectTabs`, `resetOpenedDocumentViewport`, `renameOpenProjectTab`

## 2. Injection rules

- Immutable constant:
  Pass by value into the factory.
- Mutable object reference:
  Pass the object itself.
- Mutable primitive that can be reassigned later:
  Do not pass the raw value.
  Pass `getX()` / `setX()` accessors instead.
- Private singleton state that app.js still reads directly:
  Export the singleton object itself or export explicit `get` / `set` helpers.
- Callback / side-effect bridge:
  Pass the callback explicitly.
- If the callee factory is wired before the moved function is initialized as a `const`:
  Pass a wrapper like `(...args) => movedFn(...args)` instead of the raw identifier.

## 3. Before deleting code from app.js

- Run `rg -n "<moved_identifier>" PiXiEEDrawDEV/assets/js/app.js`
- Confirm the remaining references are either:
  - the new destructured import from the module, or
  - intentional direct access to an exported singleton / bridge object

## 4. After wiring the module

- `node --check PiXiEEDrawDEV/assets/js/app.js`
- `node --check PiXiEEDrawDEV/assets/js/modules/<new-module>.js`
- `node scripts/check-pixiedraw-dev-tdz.mjs`
- If the module owns mutable state or injected constants, run a focused Node `vm` smoke test
- Bump both:
  - `APP_BUILD_VERSION`
  - the `?v=` query string in `PiXiEEDrawDEV/index.html`

## 5. Known failure patterns already hit

- Missing injected constant:
  `BRUSH_SHAPE_CUSTOM`
- Missing injected layout constant:
  `LEFT_PALETTE_COMPACT_WIDTH` caused `normalizeRailWidth()` to return `NaN`, which wrote `--left-width: NaNpx` and broke the left rail / bottom timeline layout.
  Keep critical layout constants in `scripts/check-pixiedraw-dev-tdz.mjs` as injected-getter checks.
- Missing injected timeline constant:
  `TIMELINE_CELL_SIZE` caused `--timeline-cell-size: undefinedpx`, shrinking bottom timeline frame/layer cells.
  Compare timeline matrix CSS variables against `pixiedraw/` after timeline-related splits.
- Private singleton moved into module but still read from app:
  `internalClipboard`
- Boot-time TDZ after splitting a function into a later destructured module binding:
  `encodeTypedArray`, `decodeBase64`, `validateBoundsObject`, `isCoarsePointerDevice`, `recentProjectsCache`, `normalizeExportFormat`, `normalizeExportGridTileSize`
  These must be function declarations or initialized before the startup call that uses them.
- Browser API illegal invocation inside `with(scope)` modules:
  Use `window.requestAnimationFrame` / `window.cancelAnimationFrame`.
  Do not call `requestAnimationFrame` or `cancelAnimationFrame` as bare identifiers from split modules.
- Floating draw controls split:
  Keep startup-time scale helpers such as `normalizeFloatingDrawButtonScale` in `app.js` unless their factory is moved before `restoreSessionState()`.
  `floating-draw-controls-utils.js` owns only Move Pad / keyboard nudge helpers for now.
- Dialog setup split:
  Keep shared-project-specific dialog setup in `app.js` for now.
  For export dialog toggles, pass mutable primitives with getter/setter pairs so checkbox handlers update app state.
- Static content split:
  `static-content.js` should contain only immutable display data such as help guide entries and built-in update history.
  Runtime capability flags such as `canUseSessionStorage` must stay in `app.js`.
- Startup orchestration accidentally moved into a feature module:
  `init` and `runStartupTaskWithTimeout` must stay in `app.js`.
  Feature modules such as `layout-viewport.js` must not own the final app boot sequence.

## 6. Current preferred pattern

- Use `window.PiXiEEDrawModules.<name>.create...(...)`
- Keep module boundaries narrow
- Prefer helper blocks with clear ownership
- When in doubt, move less

## 7. Current extracted ownership notes

- `document-model.js`
  - Inject missing brush and document constants explicitly.
  - Export private singleton state if `app.js` still reads it directly.
- `open-project-tab-helpers.js`
  - `openProjectTabSequence` and `projectTabViewportResetToken` are mutable primitives.
    Keep them behind `getX()` / `setX()` accessors.
  - `activeOpenProjectTabId` and `openProjectTabBusy` are read-late values.
    Use getters, not snapshot values.
  - `openProjectTabs`, `recentProjectsCache`, `openProjectTabProjectWriteGuards`, and `openProjectTabLongPressState` are shared mutable objects.
    Inject by reference.
- `open-project-tab-model.js`
  - Shared project session values are mutable primitives.
    Inject `activeSharedProjectKey`, `activeSharedProjectId`, and revision values through getters.
  - `recentProjectsCache` remains a shared mutable object reference.
- `open-project-tab-view.js`
  - Render cache signatures are mutable primitives.
    Keep `openProjectTabsLastRenderSignature` and `openProjectTabsLastStructureSignature` behind getter/setter accessors.
  - View state reads `activeOpenProjectTabId`, `projectHomeVisible`, and `openProjectTabBusy` late.
    Use getters.
- `qr-edit-panel-utils.js`
  - UI wrapper state is split between `qrEditModeState` and `qrEditPanelDragState`.
    Inject both objects by reference.
  - Cross-module actions such as `activateQrEditMode`, `deactivateQrEditMode`, `scheduleQrEditReadabilityCheck`, and `renderOpenProjectTabs` stay as explicit callbacks.
- `open-project-tab-lifecycle.js`
  - `activeOpenProjectTabId`, `suppressOpenProjectTabAutoInitialize`, and `projectHomeVisible` are mutable primitives.
    Keep them behind getter/setter accessors.
  - Late-defined app functions such as `readReloadTargetProjectId`, `writeAutosaveSnapshot`, and recent-project refresh helpers should be injected as wrappers.
- `open-project-tab-sheet-actions.js`
  - `openProjectTabBusy` is a mutable primitive.
    Use getter/setter accessors.
  - `loadDocumentFromProjectPayload` is defined later in `app.js`.
    Inject it as a wrapper callback.
  - Event binding must remain one-time via `list.dataset.bound`.
- `qr-edit-core-utils.js`
  - `qrEditBarcodeDetector`, `qrEditBarcodeSupport`, and `autosaveProjectId` are late-read mutable values.
    Inject them through getter/setter callbacks.
  - Panel update callbacks cross the QR panel/core split.
    Inject them as wrappers to avoid initialization-order failures.
- `pixel-patch-history-utils.js`
  - `history` and `multiState` stay shared mutable object references.
  - `activeSharedProjectKey` is a mutable primitive.
    Inject it through a getter.
  - This module reads shared-project mode only to disable pixel-patch history.
    Do not move shared-project sync/recovery code with it.
- `memory-utils.js`
  - `historyTrimmedRecently`, `historyTrimmedAt`, and `memoryMonitorHandle` are private to the memory monitor.
    Keep them inside the module.
  - `isPixelPatchHistoryEntry` and `finalizePixelPatchHistoryEntry` are wired before the pixel-patch module is initialized in `app.js`.
    Inject them as wrapper callbacks, not raw identifiers.
- `clipboard-utils.js`
  - `writeTextToClipboard` is a utility only.
    It should depend on `localizeText` and browser clipboard/DOM APIs, not shared-project state.
- `viewport-zoom-utils.js`
  - `viewportZoomRatio` is a mutable primitive.
    Keep it behind getter/setter accessors.
  - Initialize this module before `documentModel`.
    `documentModel` receives `getDefaultCanvasViewportScale` / `normalizeProjectCanvasViewScale` and may call them while creating initial state.
- `local-layer-preferences-utils.js`
  - `localLayerVisibilityById` and `localLayerPreviewOpacityById` are mutable Map references that can be reassigned during restore/sync.
    Use getter/setter accessors rather than passing a snapshot Map.
  - Initialize this module before the startup `restoreSessionState()` call.
    Session restore deserializes layer visibility/preview opacity immediately during boot.
  - Keep broad personal preference apply/capture logic in `app.js` until its viewport, tool, palette, and selection dependencies are split further.
- `playback-cache-utils.js`
  - `playbackFrameCache` is a shared mutable object reference.
    Pass the object itself; do not replace it in the module.
  - Initialize after local layer visibility/opacity helpers are available.
    Playback image generation reads `getDisplayedLayerVisibility` and `getDisplayedLayerPreviewOpacity`.
  - `compositeFramePixels` is a function declaration in `app.js`, so passing it before its source location is safe.
  - Any earlier factory that needs `clearPlaybackFrameCache` must receive a wrapper callback.
    The playback cache functions are destructured later than `pixelPatchHistoryUtils`.
- `multi-history-utils.js`
  - This module owns only history scope/key/bucket helpers and history label predicates.
    Keep `commitHistory`, `undo`, `redo`, global history confirm dialogs, and shared sync/recovery in `app.js`.
  - `multiHistory`, `history`, and `multiState` are shared mutable object references.
    Pass the objects themselves.
  - `curveBuilder` is a mutable primitive that can be reassigned.
    Pass it through `getCurveBuilder`, not as a snapshot value.
  - `pointerState` is currently initialized before the module factory, but keep it behind `getPointerState` for consistency with late-read state.
- `reload-snapshot-utils.js`
  - This module owns only typed-array serialization, reload snapshot payload encode/decode, and reload history list validation.
    Keep reload snapshot build/persist/restore sequencing in `app.js`.
  - Inject `encodeTypedArray`, `decodeBase64`, `textCompression`, `decompressHistorySnapshot`, and history limit normalizers explicitly.
  - Do not move shared-project reload resume variables or startup restore order with this module.
- `geometry-utils.js`
  - This module owns only pure geometry helpers such as `bresenhamLine` and `pointInPolygon`.
  - Initialize the destructured helpers near the top of `app.js`.
    The original functions were declarations and are referenced by earlier function bodies before their source location.
- `color-codec-utils.js`
  - This module owns GIF encode/decode helpers, RGBA quantization, LZ string compression, and `normalizeColorValue`.
  - Initialize immediately after `MAX_IMPORTED_PALETTE_COLORS`.
    `normalizeColorValue` and `createTextCompression` are used by earlier startup logic and must be available before session/state helpers run.
  - Keep `encodeTypedArray` / `decodeBase64` in `app.js` while they are thin aliases over `binary-codecs.js`.
  - Do not extract functions by name alone if duplicate names exist elsewhere in the file.
    Use source ranges or verified line anchors for export/delivery helpers.
- `export-delivery-utils.js`
  - This module owns canvas/blob conversion, native file/gallery delivery, Web Share delivery, export-directory delivery, and `triggerDownloadFromBlob`.
  - Extract this block by the contiguous range from `canvasToBlob` through `triggerDownloadFromBlob`.
    The name `dataUrlToBlob` exists elsewhere for import flow and must not be destructured back into `app.js`.
  - Initialize after `SHARE_HASHTAG` so `isLightweightPersistenceMode` is available before autosave constants are computed.
  - Inject later-defined export helpers as wrapper callbacks, and pass `exportDirectoryHandle` through `getExportDirectoryHandle`.
- `palette-panel-utils.js`
  - This module owns palette conversion/editing UI, palette sorting/reindexing helpers, palette preset apply logic, and the color wheel.
  - Keep `normalizeColorMode`, `isRgbColorMode`, `isIndexColorMode`, `colorsMatchRgba`, project layer iteration helpers, `getTransparentPaletteIndex`, and `normalizePaletteIndex` in `app.js` for now.
    These are used by startup restore, document model initialization, or broad drawing paths before the palette panel factory is initialized.
  - `currentPalettePresetId`, `newProjectPalettePresetId`, and `layoutMode` are mutable primitives.
    Use getter callbacks; do not pass snapshot values.
  - Palette wheel context/render-key/resize-observer state is private to the module because setup and drawing moved together.
  - If `setupPaletteEditor` moves, include utility callbacks such as `debounce`; missing callback injection surfaces as a startup `ReferenceError`.
- `image-import-decode-utils.js`
  - This module owns image import decode/resize helpers, GIF decode helpers, and indexed palette extraction from frame pixel data.
  - Keep `loadDocumentFromImageFile`, Lens/QR import orchestration, and document state replacement in `app.js`.
    Those functions mutate project state, autosave state, shared/import flow, and UI.
  - `buildIndexedPaletteFromFrameDataList` depends on palette helpers that are initialized later.
    Inject those references as wrapper callbacks so factory wiring does not trip TDZ.
  - Verify this split through the Lens localStorage import path with a tiny PNG payload, since the visible file-open button can be layout-dependent in headless checks.
- `ui-localization-utils.js`
  - This module owns tab/tool/top-action localization and broad static UI text refresh.
  - `uiLanguage`, `currentPalettePresetId`, and `newProjectPalettePresetId` are mutable primitives.
    Use getter/setter callbacks; do not pass snapshot values.
  - Keep `getDefaultLayerName` and `getDefaultFrameName` in `app.js` for now because document/layer creation uses them broadly.
  - Verify by switching language and checking visible labels, export dialog labels, and startup/project-home labels on device.
- `sprite-scale-utils.js`
  - This module owns sprite scale option calculation and the sprite scale control limit sync.
  - It still calls back to `updateSettingsSizeApplyButtonState`; keep that as a wrapper because settings UI functions live in `app.js`.
- `export-planning-utils.js`
  - This module owns SpriteMAP/color-sprite layout planning and export scale candidate calculation.
  - `exportColorSpritesEnabled` is a mutable primitive.
    Read it through a getter callback.
  - Keep actual export execution, preview drawing, download/save delivery, and contest redirect in `app.js`.
  - Verify by opening Save / Export and changing export formats such as PNG/GIF/SpriteMAP where available.
- `voxel-glb-utils.js`
  - This module owns GLB voxel volume creation, mesh packing, GLB JSON/BIN alignment, and `buildVoxelGlbBinaryFromCanvases`.
  - Keep voxel preview raster generation, voxel workspace setup, and canvas/document mutation in `app.js`.
  - Initialize before `export-rendering.js` wiring in `app.js`, because export rendering receives `buildVoxelGlbBinaryFromCanvases`.
  - Inject voxel source readers and bounds helpers as callbacks; do not move the canvas/document accessors with the GLB binary writer.
- `voxel-preview-utils.js`
  - This module owns voxel preview raster generation math, projection helpers, polygon fill, preview scaling, and `buildVoxelPreviewPixels`.
  - Keep voxel workspace setup, mode toggling, canvas/document mutation, preview canvas compositing, and UI status rendering in `app.js`.
  - Initialize before `voxel-glb-utils.js` and `export-rendering.js` wiring in `app.js`, because export rendering receives `buildVoxelPreviewPixels` and `scaleVoxelPreviewPixels`.
  - Inject voxel constants and `voxelExtensionState` through getters.
    These are covered by `scripts/check-pixiedraw-dev-tdz.mjs` to catch missing constants before browser boot.
  - Inject voxel source readers, bounds helpers, orientation normalizers, projection origin, and face shade helpers as callbacks.
- `voxel-mode-utils.js`
  - This module owns disabled voxel-mode workspace helpers, role labels, voxel navigator/gizmo rendering, voxel source pixel readers, preview sync, workspace setup, and voxel mode toggle orchestration.
  - Keep `isVoxelExtensionModeEnabled()` and `canUseVoxelExtensionMode()` in `app.js` while voxel mode is disabled.
    They are startup-safe fixed guards and are used by early local-viewport helpers before voxel modules initialize.
  - Initialize before `voxel-preview-utils.js`, `voxel-glb-utils.js`, and `export-rendering.js`.
    Preview and GLB modules receive voxel source readers exported from this module.
  - Inject `voxelExtensionState`, preview buffers, restore snapshot, and `floatingPreviewGizmoCtx` through getters/setters.
    These are covered by `scripts/check-pixiedraw-dev-tdz.mjs`.
- `voxel-interaction-utils.js`
  - This module owns voxel preview rotation drag helpers only.
  - Keep the general pointer event loop in `app.js`; it should call the exported voxel helpers only when `pointerState.tool === 'voxelPreviewRotate'`.
  - Inject `pointerState`, `hoverPixel`, voxel drag constants, and `voxelExtensionState` through getters/setters.
- `floating-preview-panel-utils.js`
  - This module owns the Floating Preview panel UI, reference media slots, media zoom/pan, playback buttons, panel drag/resize, and setup binding.
  - Keep IndexedDB/autosave storage primitives in `app.js`.
    The panel module calls `persistFloatingPreviewReferenceMediaForProject` and `loadFloatingPreviewReferenceMediaForProject` through wrappers.
  - Inject `floatingPreviewPanelState`, `floatingPreviewReferenceState`, `floatingPreviewViewportState`, `floatingPreviewCtx`, and the restore token through getters/setters.
  - Keep the virtual cursor floating draw button / move pad separate from this module.
- PWA reload guard
  - `controllerchange` can fire immediately after a manual reload or app-triggered reload.
    Suppress the automatic `scheduleAppReload('pwa-controllerchange')` during the short reload-navigation window to avoid a second reload.
