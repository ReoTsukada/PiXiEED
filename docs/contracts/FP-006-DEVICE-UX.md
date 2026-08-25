# FP-006 Device and UX Contract

## Presentation profiles

`resolveDeviceProfile()` uses pointer, touch, hover, orientation, viewport,
safe-area, text-scale, IME, and host capabilities. Width is only one input; an
ambiguous capability set produces `unknown` and fails closed. Mobile and tablet
profiles are Canvas-first and expose a 44px/36px minimum touch target
respectively. Page-level scroll is always forbidden. A host may scroll only a
bounded Panel or Sheet region.

## Accessibility and discovery

An icon-first action must have an accessible name, tooltip, Help ID, and a
disabled reason when disabled. High-risk actions cannot be icon-only. A
creation guide references action IDs rather than duplicating click handlers.
Shortcuts resolve only when no input, modal, sheet, IME, or disabled boundary is
active. This keeps compact UI discoverable without adding permanent explanatory
text to the Canvas.

## Qualification limits

Synthetic profile and layout evidence can verify contract behavior and
overflow rules. They cannot prove physical touch, stylus pressure/tilt,
Safari/Firefox behavior, native safe areas, or 30-minute memory stability.
Those remain explicitly `UNTESTED` until directly observed.

