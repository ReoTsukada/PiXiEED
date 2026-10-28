# GIFの速度調整と変換画面

## Scope and design decision

The simple converter keeps the established local-media boundary. Imported project IDs and the advanced workspace remain on their existing routes. No account, saved work, payment, database, advertising configuration or provider loader is changed.

Three models were compared: a multi-step wizard (more navigation), an always-expanded editor (too many controls before import), and a contextual preview with a compact settings column. The third is used. The empty state has one file-selection action and a local generated sample. After import, the headline contracts and only compatible controls appear. Desktop separates preview and settings; narrow screens stack them. Details contain ordering, per-frame seconds and technical image/audio controls. The timeline never autoplays. Reduced-motion settings, native keyboard controls, focus indication, pause, and cancellation are retained.

## Behavior

- Single-file conversion still uses the existing service and capability list.
- Multiple images (including the existing minor-format decoders) become a bounded sequence. Selection order is retained; differing dimensions are fitted without cropping by the existing frame fitter.
- Speed is 0.25–4x. Editing uniform seconds resets speed to 1x; editing individual seconds retains the currently shown multiplier. Reset restores imported order, delay and loop count.
- Preview and GIF/APNG encoding use the same `animationPlan`. GIF uses the existing product policy of a 20ms floor and 10ms steps; this is not described as a format-mandated 20ms minimum. Overflow is rejected rather than wrapping.
- One-cycle and total duration are distinguished. Zero total plays means infinite playback. Finite playback stops on the last frame.
- A changed setting marks the previous output explicitly as the previous result. Failed imports/exports do not overwrite that result or the prior source. A successful replacement revokes old Blob URLs.
- Multiple-media video/audio composition remains in the advanced workspace. This update does not claim universal MP4 generation or change audio speed.

## Search

One useful static page at `/output/gif-speed/` explains speed changes, image-to-GIF, per-frame duration, loop counts and actual limitations. It has a descriptive title, self-canonical, visible breadcrumb and matching breadcrumb structured data. The conversion landing page links to it. `output/sitemap.xml` is declared in robots.txt without rewriting the generated event sitemap. Private workspaces remain noindex. No ranking, traffic or revenue guarantee is implied.

## Verification

- 30 Node tests passed: timing/loop bounds, ordering, immutable imports, cancellation, limits, unchanged delegation, real GIF header timing, static guide and route preservation.
- 40 offline Chromium DOM checks passed, using the actual UI, converter modules and common styles. Tested 320–1920px, keyboard speed control, pause, reset, ordering, PNG sequences, failed replacement, GIF/APNG saving and reduced-motion behavior.
- The offline fixture replaces only the entry-ready notification and rewrites module imports for in-memory loading. Shared page JavaScript, real production Worker loading and native GIF decoding were not exercised. The GIF encoder used its existing main-thread fallback. An independent Pillow decode confirmed GIF delays of 40/80/120ms, APNG delays of 160/320/480ms, and GIF loop metadata.
- Full local navigation was blocked by browser administrator policy. That restriction was not altered. Whole-site CI/build and deployed-page checks must be reported separately, as must Safari/iPhone/Android device testing.

## Release and rollback

Preserve the existing URLs and all unrelated files. Cache revisions change for the simple converter entry, page and stylesheet; canonical shared-module URLs stay unchanged. Publish after the repository checks pass. Rollback is a normal revert of this change; there is no stored-data migration.
