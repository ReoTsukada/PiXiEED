# AUDIO-200 Contract

Status: isolated reference implementation, schema `AUDIO-200_V1`.

## Canonical boundary

`AudioProject` is metadata-only and contains typed Project, Revision, Track, Clip, Note, Automation, Mixer, Effect, source locator, and SHA-256 hash references. Raw audio bytes are accepted only by `canonicalizeSourceBlob()` for verification; they are never returned in a Revision or Project.

Source metadata is derived from WAV bytes. Caller-provided duration, sample rate, channels, byte length, codec, and hash are assertions and any mismatch, non-finite number, unsupported codec, unsafe relative path, or raw-payload field fails closed.

## State and recovery

Commands require the current `baseProjectRevision`; stale revisions and duplicate command/idempotency keys are rejected. Canonical state hashes, a chained journal, immutable checkpoint state, undo/redo transitions, and offline replay are implemented in `state.ts` and `journal.ts`. Missing source bytes do not rewrite canonical metadata; recovery returns a recoverable `AUDIO_SOURCE_UNAVAILABLE` diagnostic.

This package is host-neutral and does not access DOM, AudioContext, Storage, Network, Supabase, PiXiSYNC, Market, production routes, or native audio devices.

