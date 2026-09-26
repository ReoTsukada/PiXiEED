# Camera four-tone palette — 2026-09-25

## Behavior

The camera retains the boundary sampler and adds `four-tone-palette.mjs` after it in `boundary-preview-worker.mjs`. Object ownership, geometry and current-frame sampling are unchanged. It does not load a face model, spatial blur, prior-frame RGB blending or the old surface renderer.

The gray axis is the sRGB-encoded gray corresponding to linear-light relative luminance Y, not an RGB byte average or Oklab L. The four nominal output gray values are **24, 144, 192, 240** (0–255). Color byte rounding can move measured gray slightly; tests allow one byte. Input gray up to **70** becomes a shared neutral dark; gray **220** and above becomes a shared neutral highlight. The middle solid-tone split is **172**. These are deliberate artistic thresholds, not equal-width levels or an automatic exposure adjustment. Dark color differences and highlight hues are intentionally consolidated; some close features can therefore merge.

At palette creation, middle swatches keep source Oklab hue and chroma while their lightness is solved for the target linear Y. Chroma is reduced only when the fitted swatch would leave the sRGB gamut. This avoids the yellow shift caused by adding gray in linear RGB; it does not add red to neutral, green or blue objects. The solve runs only when building the bounded palette, not once per output pixel.

Only the two middle levels carry scene colors. At most 11 scene chroma representatives each have a pair of middle colors, plus one shared dark and one shared highlight: at most 24 RGB colors, often fewer. The palette is seeded from a bounded sample of the current scene and held until the next camera session or tap. An all-dark/all-bright or spatially uniform neutral startup defers seeding until a middle-tone frame with scene detail or chromatic content is available; repeated placeholder frames do not increment the palette revision. AI mask arrival, inference failure, and output-size changes must not rebuild a seeded palette.

Selective fixed-phase 4×4 Bayer dither only uses the same chroma representative's two middle colors, with coverage computed from linear Y. Uniform planes, strong color/owner boundaries, thin details, and dark/highlight tiers do not receive dither. The pattern does not randomly change each frame. Palette stability and deterministic output do not eliminate changes caused by movement, source exposure/noise, or different usable AI masks.

The UI remains the camera view with the existing capture/size/save controls. Tap also refreshes scene colors. PNG export remains opaque, nearest-neighbor, integer-scaled toward a 2048-pixel long edge.

The scene palette now groups nearby Oklab chroma values within a wider 0.055 radius and uses each group's sampled area when assigning its limited color ramps. The chosen RGB swatch is an actual sample nearest the group's center. This favors broad surfaces over tiny, highly saturated accents while allowing distinct smaller hues into unused slots. It only changes scene-palette creation; current-frame geometry, fixed tonal cuts and dither rules are unchanged.

## Verification

### User-selected shared-dark boundary 70 (four-tones-5)

- Moved the shared-dark input cutoff from 80 to 70 as requested. The output grayscale values remain 24, 144, 192 and 240; the 172 middle split and 220 highlight cutoff are unchanged.
- With the actual center sampler at 256px, shared-dark cells changed from 33.26% to 31.11% on astronaut, 26.91% to 23.44% on coffee, and 79.39% to 69.76% on the dark rocket scene. The latter visibly opens part of the blue dusk sky while keeping the bright light points compact.
- Visually checked the 64px astronaut and the 256px rocket. The full street video (15.47s, 134 processed frames) used 18 palette entries, four measured grayscale levels, 0 palette changes and no out-of-tolerance cells; mean worker time was 4.62ms, maximum 8.4ms. No usable AI mask was adopted, so this verifies the current-frame fallback and palette lock.
- `node --test --test-reporter=spec tests/pixel-studio/*.test.mjs`: **317 passed**. The cutoff regression checks 69, 70 and 71 explicitly.

### Lower shared-dark boundary (four-tones-4)

- Moved the input cutoff for the shared dark from 96 to 80. The four output gray values stay 24, 144, 192 and 240; the highlight cutoff remains 220.
- On existing local photos at 256px using the actual center sampler, shared-dark cells changed from 37.08% to 33.26% for astronaut, about 40.34% to 26.91% for coffee, and about 89.99% to 79.39% for rocket. These values compare the cutoff on each source, not a subjective quality score.
- Visually checked astronaut at 256px and 64px and the coffee photo at 256px. The black shapes remain legible while some previously collapsed mid-dark areas gain a middle tone.
- Played the entire local street video (15.47s, 134 processed frames): 18 palette entries, four measured grayscale codes, 0 palette changes, mean worker time 4.63ms and maximum 7.5ms. No usable AI mask was adopted; the run verifies the fallback renderer and fixed palette.
- `node --test --test-reporter=spec tests/pixel-studio/*.test.mjs`: **317 passed**, including the 79/80/81 input cutoff regression.


### Area-dominant color grouping (four-tones-3)

- A synthetic single-material surface with many nearby warm RGB samples used 24 palette entries before grouping and 6 afterward (one neutral ramp, one warm ramp, shared dark/highlight). A 94%-area warm surface with 12 small vivid accents selected the warm color as its first chromatic ramp while retaining distinct accents.
- The local astronaut photo used 16 palette entries at 256px after grouping, versus 24 before; measured gray values remained exactly [24,144,192,240]. A 64px person preview was inspected.
- The street video preview used 18 palette entries, all four gray levels, and 0 palette changes during the observed playback. These color checks do not establish object recognition quality in moving footage.
- `node --test --test-reporter=dot tests/pixel-studio/*.test.mjs`: **317 passed**; palette-focused tests: **14 passed**.

### Dark-range and warm-color adjustment (four-tones-2)

- Lowered the shared-dark input cutoff from 112 to 96; output gray targets remain 24, 144, 192, 240, with one shared dark and one shared highlight.
- `node --test --test-reporter=spec tests/pixel-studio/*.test.mjs`: **315 passed**. Added cutoff-boundary tests and warm/neutral/green/blue palette-fit regressions. Syntax and tracked-file whitespace checks passed.
- Actual astronaut photo, unsegmented center sampling at 256px: shared-dark area fell from 41.43% to 37.08%. This is a photo-specific comparison, not an exposure guarantee for every scene.
- Source warm swatch [228,196,172] now fits the lower middle tone as [168,138,116], instead of [182,135,90] with the old fit; its source hue is retained instead of shifting toward yellow. This is source-color preservation, not learned skin recognition or a global saturation boost.
- In-app Chromium at 64px: inspected the astronaut face; 24 palette entries / 21 observed colors, exactly four measured grayscale codes and zero out-of-tolerance cells. With the same adopted AI mask, all 29 repeated unchanged-input comparisons had 0% changed cells. Mean worker time was 4.72ms / maximum 14.4ms across 31 frames (excluding asynchronous inference). The initial mask transition changed 3.25% of cells and is measured separately.

- Street video, full 15.47 seconds / 133 processed frames: 0 palette changes, four actual grayscale codes, mean worker 4.62ms / maximum 9.8ms. No usable mask was adopted during the moving sequence, so this is a palette/current-frame fallback check, not proof of motion segmentation or flicker-free live camera.

### Initial four-tone integration (four-tones-1)

- Focused sampling, mask, frame-loop, geometry and PNG tests: 30 passed before integration.
- `node --test tests/pixel-studio/*.test.mjs`: **313 passed**, including the final uniform-neutral startup regression; syntax and diff whitespace checks passed.
- In-app Chromium, astronaut at 256px: four actual grayscale codes [24,144,192,240], palette 24 / observed 22 colors, 83 dither-modified cells / 65,536 (~0.13%). Actual local SlimSAM reached 10 instances. After its initial adoption (0.6531% output-cell change), 29 repeated unchanged-input comparisons had 0% changes. Mean worker time over 31 frames was 8.89ms, maximum 20.3ms; this includes initialization and mask-cache work, not asynchronous model inference.
- Switching that photo 256→64 kept the palette revision and colors; the 64px view was visually inspected. Facial features are simplified and close dark features can merge.
- Additional single-frame photo checks at 256px: coffee 11.4ms / 25 dither cells, cat 8.9ms / 328 cells, rocket 7.9ms / 4 cells. All observed gray codes belonged exactly to the four nominal values (cat used only three). Those single frames used the unsegmented fallback; they do not prove semantic mask quality.
- Main camera page ran the four-tone worker, auto-started, and tap refreshed its palette. Its actual panel viewport was 505×962; x/y preview scale matched and there was no horizontal overflow. The comparison page also had no horizontal overflow at an explicit 390×844 viewport. Temporary viewport override was reset.
- Public street video: full 15.47 seconds, 118 processed frames, 0 palette changes, four actual grayscale codes, mean worker 8.57ms / maximum 17.6ms. Leaves video: full 39.18 seconds, 281 processed frames, 0 palette changes, mean worker 10.40ms / maximum 26.8ms. Both moving sequences had **zero frames with a usable AI mask**; this verifies quantized current-frame fallback and palette stability, not successful motion segmentation or absence of all visual flicker. Final leaf check used the final startup-seed fix; that fix does not change rendering once the palette is locked.
- After the startup fix, reopening the main camera seeded 20 colors from its actual scene rather than locking a 4-color neutral placeholder. The tap path previously restored 24 colors in that scene; exact scene palette count depends on current input.

The dedicated local comparison page is `tests/pixel-studio/four-tone-preview.browser.html`; it uses the production worker and existing local photo/video fixtures. These fixtures are not added to the catalog or sold. Synthetic, desktop browser and physical-device evidence must be reported separately.


## Remaining limits

Four tonal levels intentionally remove shadow and highlight color distinctions; dark red objects can become the shared dark, and nearby dark facial features may merge at 64px. Source texture near a hard tonal cutoff can still look grainy even where no dither is used. This change does not promise semantic reconstruction, texture removal or zero live-camera flicker. Physical mobile-device performance, Safari, long-run thermals and production deployment are untested. No dependencies, model files, catalog entries, commits or pushes were added in this change.
