# AUDIO-230 Workspace / Device UX Contract

Status: isolated host-neutral reference implementation, schema `AUDIO-230_V1`.

## Boundary

The package projects canonical Audio-200/210/220 metadata into a responsive workspace intent. It has no DOM, page router, network, filesystem, Storage, AudioContext, native device access, Market, PiXiSYNC, or production route dependency. Device values are opaque `CLAIM_ONLY` metadata; they never grant permission or prove hardware capability.

## Workspace profiles

- Desktop: dense project/track rail, Canvas/audio timeline center, Inspector/Mixer rail, and output/diagnostic bottom region.
- Tablet: Canvas/Timeline priority with one contextual panel.
- Mobile: preview-first Canvas with lazy contextual bottom-sheet/drawer regions.

Page-level horizontal and vertical scrolling are always false. Long content belongs only to bounded internal panel owners. A hidden panel is `LAZY`, does not permit work or decode, and has `networkAllowed:false`.

## Geometry and interaction

Viewport dimensions, safe-area insets, keyboard inset, and text scale are finite and bounded. Insufficient usable geometry fails closed. The metadata includes keyboard alternatives, touch action, role/name, live region, and explicit focus restoration. Invalid or unavailable focus targets fail closed instead of guessing.

Timeline items and waveform bins are projected with explicit maximums. Projection counters record calls, item/bin bounds, mounted panels, hidden heavy work, and long-task samples; they are measurements supplied by a host, not claims of device performance.
