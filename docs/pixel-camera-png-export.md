# Pixel camera PNG export — 2026-09-25

## Behavior

Capture freezes the completed preview frame. PNG preparation scales that frame by an integer factor with smoothing disabled; it does not render a different frame or alter the palette. All supported 64/128/256/512-dot settings export with a 2048-pixel long edge, retaining the exact rounded source aspect ratio. Examples: 256×144 → 2048×1152; 384×512 → 1536×2048; 64×64 → 2048×2048.

The dot-count selector controls artwork density; the existing output summary shows the saved PNG dimensions. Preview canvases remain at their original resolution. The source/export temporary canvases are released after encoding, and existing generation checks discard stale results after retake or navigation. This is lossless pixel replication, not invented photographic detail or super-resolution.

## Verification

- `node --test tests/pixel-studio/*.test.mjs`: 290 passed.
- Serve the repository and open `tests/pixel-studio/png-export.browser.html`, then select **Verify PNG pixels**: 12 real PNG encode/decode round trips passed, across all four dot sizes and square, landscape, and rounded portrait frames. Every decoded RGBA channel exactly matched its source cell; input frames remained unchanged.
- In-app Chromium camera UI: capture/save created a local, decodable RGBA PNG measuring 2048×1152. After retake, old save was disabled and a new 384×512 capture prepared `pixieed-pixel-camera-1536x2048.png`.
- 390×844 viewport: settings and output dimensions fit without horizontal overflow or overlapping controls. Desktop 1280×720 capture also checked.
- Camera test feed was uniform; this verifies export and lifecycle, not scene quality. Physical iOS/Android save destinations and Safari memory behavior remain untested.
