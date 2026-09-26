# Recognized-background smoothing — 2026-09-25

The production worker now smooths low-contrast RGB texture only in label-0 background returned by the existing object segmenter. It does this on the downsampled current frame before four-tone palette assignment. A second palette-color mode pass removes small isolated islands in the recognized background. Both passes keep object pixels and the first background rim around objects unchanged; the color pass also protects the shared highlight. No new model, dependency or user control was added.

When no usable object mask exists, the worker leaves background smoothing inactive. It cannot reliably infer which part is background from color alone, and the public video fixtures have previously produced no usable mask. The camera remains responsive because model inference is asynchronous; smoothing happens only when a valid cached mask is applied.

The local comparison page includes an additional “背景だけ平坦化” image. It shows the original sampled RGB after background smoothing, before the four-tone palette, so the photo-oriented result can be compared directly with the current product rendering. This extra RGBA image is sent only when the local diagnostic flag is set; the production camera does not request it.

Verification:
- Unit tests preserve foreground RGB, one-pixel object rim, strong background steps and bright isolated palette highlights; they also check maskless fallback and immutable inputs.
- Worker integration checks that a black background speck is removed after recognition while a foreground detail keeps its color.
- Local Chromium astronaut photo at 256px: about 7,981 of 65,536 cells had source RGB texture smoothed; 322 palette cells were changed by the final background cleanup. The palette stayed at 16 entries and all output gray values stayed in [24,144,192,240]. After the mask transition, 59 repeated same-input comparisons had 0% output difference. The mean worker processing time over these repeated frames was about 19ms, max 64ms, excluding asynchronous AI inference.
- Cat photo at 256px: 936 of 43,520 cells smoothed, 69 palette cells cleaned in the first-pass browser check; the subject occupies most of the frame, so the background effect is much smaller.
- Street video, full 15.47s / 117 processed frames: 0 usable mask frames and therefore 0 background-smoothed cells. The four-tone fallback retained a fixed 18-color palette; mean worker time was 9.79ms, maximum 18.1ms. This confirms the current video path cannot yet meet a background-only promise.
- `node --test --test-reporter=spec tests/pixel-studio/*.test.mjs`: 323 passed.

The mask labels are instance proposals, not a guaranteed semantic “background” classification; label 0 means no proposed object owns the pixel. Mobile Safari, physical-device speed, moving-scene mask availability and perceptual preference between the two preview outputs remain unverified.
