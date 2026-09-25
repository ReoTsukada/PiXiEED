# Camera surface refinement — 2026-09-25

## Scope and diagnosis

Baseline: `ea2757c3` (`fix(camera): suppress sparse surface sampling specks`).

The supplied four street captures are already converted output, not raw camera frames. They demonstrate dense asphalt speckles and abrupt tone transitions, in addition to the sparse specks addressed in the previous change. They were inspected locally and are not included in the repository or catalog. An exact before/after conversion of those original scenes remains untested.

Before this change, the production renderer used a locked palette of up to 24 colors, at most three selected tones per material, and selective canvas-fixed ordered dither. Removing isolated sampling errors did not remove dense, low-contrast surface grain. Adding colors alone preserved that grain and initially increased video color switching.

## Shipped behavior

- Simplify weak granular variation before material classification. A 5×5 window must share the same object owner, contain no protected detail, remain within a 48-channel range and a small chroma range, and avoid a coherent directional step. Select an actual RGB sample nearest the local mean; do not blend different object owners.
- Keep existing source-supported line, face-feature, light-core, and halo protection. Existing light-halo suppression and broad-shadow simplification remain ahead of this stage.
- Preserve every captured base-palette RGB/index. Derive at most two additional same-hue tones per captured prototype, midway toward its neighboring darker/lighter tones. Deduplicate and cap the complete palette at 48 colors. A new material ramp has at most three base plus two extra choices. The extra palette is fixed for the capture revision, not regenerated every frame.
- Select each cell from its own material's ramp. Extra solid tones do not interpolate object boundaries. Do not toggle tone availability using grain/noise thresholds or nearby AI owner IDs: both approaches caused unnecessary color switching. Protected detail cells and compact-face skin use the base palette. Small detected faces still use the existing simplified skin and landmark renderer; this does not force all faces to use more colors.
- Use selective 2×2 nested 25/50/75% dither only for smooth, unprotected material transitions, with canvas-fixed phase. Reject tone pairs more than 48 gray-axis units apart, avoiding high-contrast checkerboards. Flat areas stay solid.
- Stabilize the surface sample against a fixed RGB anchor (5×5, per-channel difference ≤4). Stabilize the final displayed color in a stationary 3×3 source patch separately from changing regional tone rankings. The reference does not advance while held: cumulative exposure changes eventually exceed four and release it. Owner changes, changed protection, movement, palette revision, geometry changes, and current/previous compact-face skin release the output hold. History may retain another already captured palette tone even if the current region's newly ranked five candidates differ.
- Run the same path for preview and capture. No additional UI, remote image service, dependency, model training, or photo upload was added.

Implementation: `js/pixel-studio/surface-texture.mjs`, `surface-tones.mjs`, `object-renderer.mjs`, `selective-dither.mjs`. Production activation and cache revisions: `preview-worker.mjs`, `app.mjs`, `pixel-camera.html`.

Diagnostics: `globalToneLevels`, `globalGrayLevels`, and `maxPaletteGrayError` describe the **base** palette (`paletteGrayReference: base-palette`). `surfaceToneGrayLevels`, `surfaceToneColors`, and `colorLimit` describe the added shades. The complete output is therefore no longer restricted to exactly eight grayscale levels. `maxMaterialColors`/`maxSurfaceColors` count candidate ramp entries, not a semantic guarantee about every retained pixel in a tracked object.

## Compared and rejected

1. Surface cleanup only: reduces grain, but leaves coarse tone gaps.
2. Extra colors only: improves gradual tone changes but exposes more fine texture. Not selected alone.
3. Extra tones at fixed ±16 from the main shade: left large gaps and visibly stronger bands; replaced with midpoints between the actual neighboring captured tones.
4. Enabling extra tones from the per-frame texture mask: increased street-video mean stationary RGB change from 1.483 to 1.763; rejected.
5. Holding only the source light while allowing the region to revoke its old shade: insufficient. The final color hold now requires stationary current-source evidence and unchanged palette revision, rather than a matching regional rank.

The selected combination balances lower grain and less severe temporal changes. It does **not** minimize the number of changed pixels in every scene.

## Verification

Run: `node --test tests/pixel-studio/*.test.mjs`.

Coverage includes bounded input validation, same-owner cleanup, hue/weak-step boundaries, protected lines/light cores, palette-prefix identity, deterministic capture revisions, canvas dither phase, static sensor jitter, cumulative exposure, moving weak edges/lights compared with a fresh renderer, late AI masks, aspect/dimension changes, and compact-face guide appearance/removal. All 286 final tests pass; no third-party photo/video is required by the committed tests.

### Spatial comparisons

The baseline and three candidates shared identical input frames and the same captured palette. Synthetic road, smooth gradient, night source/halo, and four local public test photographs (person, cat, cup, rocket/landscape) were compared at 64, 128, and 256 px. Output remained opaque, palette-indexed, and identical on repeated exact inputs.

At 128 px, the synthetic granular-road luminance residual against a 5×5 mean was:

| Candidate | Local residual RMS | Neighboring 2×2-block difference RMS |
|---|---:|---:|
| Baseline | 14.16 | 12.86 |
| Surface cleanup | 10.69 | 9.96 |
| Extra tones | 10.74 | 10.10 |
| Selected combination | 8.15 | 8.56 |

The selected road residual is about 42% lower. On the smooth-gradient fixture, neighboring-block difference fell from 6.01 to 4.34. These are grain/gradation proxies, not a general image-quality score or measurements of the supplied street photographs. Visual checks included the road, gradient, and person comparisons.

### Video comparisons

Local in-app browser, input 640×360, output 128×72, same source frame delivered to all four variants, locked baseline palette. No AI masks in this renderer-only A/B. A stationary-proxy cell requires all RGB channels of the nine neighboring center source samples to change by no more than three between compared frames. This is not motion-compensated ground truth.

- Street/pedestrians: 15.467 s, 79 frames sampled at 0.2 s plus the final frame; 37,363 stationary-proxy comparisons.
- Leaves: 39.18 s, 110 shared frames during normal playback; 29,625 stationary-proxy comparisons. Seeking this WebM returned the opening frame in this browser, so the nonadvancing seek experiment was discarded and ordinary playback used.

`Mean Δ` is the average maximum RGB channel change per stationary-proxy cell. `Large changes` means a maximum channel change of at least 24; `All changes` counts any RGB change.

| Scene / candidate | Mean Δ | Large changes | All changes |
|---|---:|---:|---:|
| Street baseline | 1.483 | 3.546% | 4.001% |
| Street cleanup | 1.030 | 2.693% | 2.933% |
| Street extra tones | 1.123 | 1.646% | 4.288% |
| Street selected | 1.147 | 1.662% | 4.424% |
| Leaves baseline | 0.648 | 1.262% | 1.367% |
| Leaves cleanup | 0.589 | 1.151% | 1.242% |
| Leaves extra tones | 0.597 | 1.195% | 1.340% |
| Leaves selected | 0.630 | 1.286% | 1.441% |

Street mean change decreased about 23% and large changes about 53%, while small changes became more frequent. Leaves mean change decreased about 3%; large-change frequency was slightly worse (+0.024 percentage points). Palette changes within each run: zero for all variants. Browser console errors/warnings: none in the A/B page.

Renderer-only browser timings in these runs: street baseline 45.5 ms vs selected 54.6 ms; leaves 51.8 ms vs 66.9 ms. These are environment-dependent single runs with other local activity, not a speedup claim or phone-FPS guarantee. The texture stage's redundant scans were removed; 200 deterministic mixed-input comparisons matched the pre-optimization output exactly.

Public video attribution (local verification only):
- [People waiting to cross the street — Amada44, CC BY-SA 3.0](https://commons.wikimedia.org/wiki/File:People_waiting_to_cross_the_street.webm)
- Leaves clip: Undeka11, CC BY-SA 4.0; local source metadata is kept with the existing test media.
- Public photo sources and individual attribution are in the existing local media-test page; these assets were not added to this commit.

### Production-path browser check

The actual preview worker ran the person photo at 256 px and 64 px. At 64 px both face and object recognition reached `ready`: one detected face, seven rendered feature cells, two skin colors, repeated-static output difference 0%. The face and object model resources remained on the localhost origin. This confirms the real worker/recognition/render path for that fixture, not universal face recognition or arbitrary camera scenes.

The camera page also entered `live` with the revised module chain (first processed preview 996 ms). Desktop and 390×844 layouts had no visible control overlap; the narrow viewport had no horizontal overflow. The available live feed was a uniform field, so this is startup/layout evidence, not another photographic quality test.

## Evidence limits

Unverified: exact raw versions of the four supplied scenes, recaptured outdoor footage on the user's phone, iPhone/Safari performance and thermal behavior, every low-contrast feature/material, and zero flicker across all scenes. Strong/high-chroma texture or unrecognized tiny features can remain. The change is bounded image processing around the existing recognition models, not a newly trained semantic asphalt/skin model.

## Research informing the design

[Image Smoothing via L0 Gradient Minimization (Xu et al., 2011)](https://www.cse.cuhk.edu.hk/~leojia/papers/L0smooth_Siggraph_Asia2011.pdf) discusses suppressing low-amplitude details while preserving salient structures. [Domain Transform for Edge-Aware Image and Video Processing (Gastal and Oliveira, 2011)](https://doi.org/10.1145/2010324.1964964) informs the separation of surface smoothing and important edges. These motivate the objective; this implementation is a bounded local representative-sample filter, not an implementation or claimed reproduction of either paper.
