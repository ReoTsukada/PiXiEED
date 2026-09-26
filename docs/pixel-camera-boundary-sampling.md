# Camera boundary sampling — 2026-09-25

## Source sampling stage (color output superseded)

The sampling geometry below is retained. The camera now applies the four-tone palette described in [pixel-camera-four-tones.md](pixel-camera-four-tones.md) after sampling; unrestricted source RGB is only the sampling-stage output. The verification figures below describe the earlier boundaries-only version.

This replaces the former surface/palette processing in the camera entry point. Each grid cell uses a real pixel from the current input frame. Inside an object it is the center sample. Only a cell crossed by object IDs votes for its owner (background ID 0 participates equally; ties prefer the center ID) and selects the nearest actual source pixel belonging to that owner. No output RGB averaging, palette restriction, saturation/exposure/shadow adjustment, dither, face drawing, or previous-frame RGB retention is performed. Source shadows, sensor texture, and optical blur remain present. Alpha is opaque and display/export scaling remains nearest-neighbor.

Production: `app.mjs` starts `boundary-preview-worker.mjs`, importing only `boundary-sampler.mjs` and `mask-cache.mjs`. The optional existing SlimSAM worker provides object labels asynchronously. No face worker or old renderer is loaded through this path. Old color-processing modules remain as inactive reference/test code; this is not a repository-wide deletion.

The first preview does not wait for segmentation. Valid masks are reused without rerunning the model; every frame still samples its current RGB. Source changes, cache expiry, geometry changes, or a tap invalidate recognition. The wire field `paletteEpoch` now acts as a recognition refresh revision for this worker, retaining compatibility with the existing app pump. Failed/missing recognition falls back to ordinary source sampling. Session/job/refresh checks reject late results, and only one inference may run at once. The prior 2048px PNG export is retained.

## Verification

- `node --test tests/pixel-studio/*.test.mjs`: 302 tests passed. New coverage verifies exact interior source pixels, same-owner boundary colors, no color limit, background/tie handling, moving-frame equality to a fresh sampler, opaque output, invalid inputs, immediate worker responses, valid-mask reuse with current color updates, mask invalidation, stale jobs, busy/idle, black frames, recoverable inference failure, and cancellation.
- In-app Chromium static photograph: astronaut at 256px; actual SlimSAM reached ready with 10 instances and 1,861 mixed boundary cells. 100 repeated frames started one object job and zero face jobs. Loaded model resource origins were localhost only. Reported final worker processing time was 24.8ms, including cache checks. This is one observed sample, not a device guarantee.
- Side-by-side visual inspection: astronaut and rocket/landscape retained original source colors instead of the former tone bands and dither. Their pure unsegmented renderer medians (5 repeats after warmup) were 313.5→0.9ms and 250→0.5ms in the local browser.
- Shared synthetic boundary map on four real 512px input fixtures, 256px output, one warmup and five repeated frames per renderer (Node, local machine):

| Source | Previous render median | New render median |
|---|---:|---:|
| Astronaut | 592.13 ms | 10.02 ms |
| Coffee | 281.39 ms | 7.12 ms |
| Cat | 205.41 ms | 5.97 ms |
| Rocket | 279.85 ms | 5.78 ms |

These measurements exclude AI inference and use a synthetic two-object boundary; they demonstrate lower rendering cost, not faster semantic model inference or phone FPS.

- Local public street video, first 12.86 seconds: 120 processed frames, 4,423,680 output cells checked, zero source-membership/opacity mismatches, zero face jobs, mean worker processing 0.94ms. No frame received a valid AI mask during this moving sequence: this verifies the live source-sampling fallback, not successful moving-object segmentation. Each checked unsegmented cell exactly matched its center pixel in the corresponding current input; no history RGB was substituted.
- Production camera page: auto-start/live, source-sampled mode, dither none, face disabled, initial completed preview 260ms on a uniform local camera feed. Tap, capture, and local PNG download exercised. Saved PNG decoded as RGBA 2048×1152. At 390×844 the captured 256×144 frame displayed as 390×219.375 with equal scaling and no horizontal overflow.

## Limits

AI recognition may miss objects or arrive too late for motion; until a valid mask exists, only regular source sampling applies. Very thin features below the selected grid resolution can be lost. Source noise/optical blur/exposure changes are not suppressed by this deliberately unmodified-color path. No new flicker-free, all-object, or hand-drawn pixel-art guarantee is made. Physical iOS/Android/Safari performance, thermal behavior, and camera-photo-library saving remain untested. Test photos/video were reused locally and are not added to the repository/catalog.

Public fixtures: NASA public-domain astronaut; Rachel Michetti CC0 coffee; Stefan van der Walt CC0 cat; SpaceX public-domain rocket. Street video: Amada44, CC BY-SA 3.0, https://commons.wikimedia.org/wiki/File:People_waiting_to_cross_the_street.webm.
