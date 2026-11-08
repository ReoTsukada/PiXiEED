# Current-work manager clarity review

Status: local implementation and verification complete. Publication is tracked by the release pull request and Pages deployment, rather than inferred from local tests.

## Scope

- Group the current artwork preview, title, save state, dimensions, Continue editing, and name change in one card.
- Make Continue editing the primary action. It closes the manager without saving, cloning, resetting, or replacing the project.
- Keep New as a separate secondary action and image-file import in its own row.
- Describe transfer behavior accurately: integrated drawing/music share a project, while the game tools receive a copy.
- Fold the general save/history explanation. Keep changing camera warnings about an unapplied capture visible outside that folded help.
- Keep the existing library, search, selection, delete confirmation, and irreversible deletion flow unchanged.

The preview adapter renders the artwork poster without calling the save/capture pipeline. The music mode uses the same artwork poster rather than a selected music cel. Neither the preview nor Continue editing creates a stored project.

## Inline gallery advertisements

Both the startup chooser and the saved-work manager place an ordinary Display unit after artwork 1, then after artworks 7, 13, 19, and so on. The first artwork is shown at 192 px on phones / 240 px on desktop. The following artwork groups keep their existing responsive thumbnail grid. Advertisements occupy separate labelled normal-flow blocks, not artwork tiles, overlays or sticky positions.

- A real complete thumbnail is required; empty or corrupt galleries do not request ads. The first unit no longer requires six artworks.
- Fixed sizes are 468×60, 320×50, 300×50 or 250×50, selected before requesting according to actual container width. The last two are custom sizes subject to inventory. A served creative is never resized or cropped to force it into a smaller container.
- Current-work, search, selection, import, busy, dirty, restoration, error, hidden, embedded and private contexts are excluded. Committed controls retire the series before operations, retaining empty reservations until close to prevent jumping targets. Touch swipes and keyboard navigation over artwork do not retire the series.
- Each logical screen/position has one irreversible request reservation per document. Startup and manager are distinct placements. Scrolling back, reopening, filtering, resizing and rerendering do not refresh already-requested positions. No timer refresh or unfilled retry is implemented.
- Controllers are activated lazily when their reserved position enters view. The shared SDK is loaded once. Each `ins` is created immediately before its own push, so a late SDK cannot initialize a different offscreen slot.
- Only exact production origins, known tool paths and explicitly allowed workspace/runtime/mode/social query values qualify. Project-pointer URLs (`pxd`, `pxdRevision`, etc.), arbitrary query data and hashes do not. No URL or history values are removed for advertising. A normally resumed saved project can therefore remain ad-free; a clean new-work entry with an existing saved library qualifies.
- Configuration contains the existing verified publisher/Display-unit identifiers. Distinct DOM units reuse that unit; no account settings or new advertising IDs were created. The controller receives boolean gallery state and artwork count, not project names or pixels, and makes no project storage calls. Save/restore/delete stay independent of ad loading.
- Google SDK executes in the same document. Removing a placement does not unload it or prevent ambient access to DOM and same-origin storage. No SDK isolation or absence-of-transmission guarantee is made. No evidence of actual artwork transmission was collected.
- Actual Google approval, fill, account-side size optimization, revenue and real-device behavior remain unverified. Local checks request neither Google nor production URLs.

### Policy references and limits

Google allows multiple ad units, provided advertising does not exceed publisher content. Its policy includes images and publisher-managed user content, but does not define a six-artwork minimum or a universal pixel-area formula. The layout's 48 px interaction gap and visible-artwork check are site heuristics, not approval. One small artwork with a disproportionately large ad must still be avoided; the first image is enlarged and units are shallow for that reason.

- Content density: https://support.google.com/publisherpolicies/answer/11169917
- Multiple units: https://support.google.com/adsense/answer/187698
- Fixed/custom dimensions: https://support.google.com/adsense/answer/9185043
- Placement and refresh: https://support.google.com/adsense/answer/1346295
- Code modification: https://support.google.com/adsense/answer/1354736

Google can withhold serving when it cannot evaluate device-local content. Neither the artwork count nor this implementation guarantees serving or policy acceptance.

The shared source/importer closure uses cache revision `20261108-inline-gallery-ad-1`.

## Validation

- Complete Node suite: 3310 tests passed, zero failures. Five new manager-ad tests cover eligibility, thumbnail requirements, shared request budget and storage/history isolation.
- Local production build succeeds and fingerprints the changed runtime bundle.
- The 19-case ad mock browser suite covers both one-work screens at 320/390/1280 px, repeated 1/7/13 positions, no refresh on scroll/reopen, empty/private URLs, selection/import/search retirement, delayed/error SDK, optimized fill, responsive retirement, privacy transitions, touch scrolling, and unseen-slot retirement.
- Full publication build succeeds: `20261020-staged-startup-1-623959c4ef93` (1051 public files).
- The renderer's isolated Chromium review covers both screens with 12,001 artworks and 2,001 breaks: only 13 canvases are mounted near the viewport. It also checks 320 px / 1 artwork, desktop hero size, keyboard/Tab order, filtering, retained ad-node identity, clear/re-add and disposal.
- `scripts/project-manager-browser-harness.mjs` passes at 390 × 844, 320 × 568, 844 × 390, and 1280 × 900.
- The browser test checks grouped preview, continuation without a new project, same-project rename, folded general help, canceled image import, exact pixel preservation before New, delete cancel/confirm, and horizontal fit.
- At 390 px, the browser test also checks the same project ID and artwork preview in music mode, and exact drawing pixels after returning to drawing.
- Tests use a fresh isolated browser context and disposable synthetic artwork only. Nonlocal requests are blocked. No real user storage, production pages, or actual advertising SDK is used.
- Mobile emulation is not physical phone validation.

## Repeat the browser review

Build a new output directory using `node scripts/build-conversion-site.mjs --output <absolute-new-build-directory>`.
Set `PIXIEED_BUILD_ROOT` to that directory and run `node scripts/project-manager-browser-harness.mjs`.
Optional variables: `PIXIEED_PLAYWRIGHT_MODULE`, `PIXIEED_CHROME_EXECUTABLE`, and `PIXIEED_WORK_MANAGER_OUTPUT`.

For the ad lifecycle review, run `node scripts/project-manager-ad-browser-harness.mjs` against the same build. `PIXIEED_MANAGER_AD_OUTPUT` selects its report folder. The harness modifies only the two built ad modules' origin/protocol guards for localhost and substitutes a local mock SDK. Nonlocal requests are still blocked. The screenshot visibly says it is a test ad.

Review screenshots and reports are under the untracked `output/work-manager-review/` and `output/work-manager-ad-review/` folders. Do not publish either folder or the attached source reference photograph with the site sources.
