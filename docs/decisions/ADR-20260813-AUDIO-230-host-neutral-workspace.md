# ADR-20260813-AUDIO-230: Host-neutral workspace projection

## Decision

Implement AUDIO-230 as pure TypeScript contracts and bounded projection functions. Keep layout, panel lifecycle, focus metadata, and device claims separate from AUDIO-200 canonical state and AUDIO-210 playback/event state.

## Rationale

The same workspace semantics can be consumed by browser or native hosts without importing a host API. Fail-closed geometry prevents safe-area/keyboard input from hiding controls. Lazy panel states prevent hidden decode or polling work. Bounded timeline/waveform projection avoids materializing an unbounded project.

## Consequences

This package does not render UI, request permissions, enumerate hardware, play audio, persist state, or alter production routes. Physical devices, real audio hardware, screen readers, Safari/Firefox, and visual/browser baselines remain UNTESTED until a host adapter is separately authorized.
