# WP-190 Audio Core Bridge Contract

Status: `ISOLATED_IMPLEMENTATION / EXTERNAL_AUDIT_PENDING`

## Boundary

`pixiedraw2/src/wp190-audio-core.ts` is a DOM-, Canvas-, AudioContext-, Network-, Supabase-,
IndexedDB-, OPFS-, Object Storage-, Market-, and Runtime-independent contract. It carries only
stable IDs, immutable Audio Revision metadata, content hashes, bounded storage locators, event
bindings, package/license references, and deterministic plans.

Raw WAV/OGG/MP3/FLAC/MIDI bytes, PCM samples, Blob objects, Base64/Data URLs, JWT, Email, Secret,
Project body, purchase, entitlement, royalty, or Commission content is rejected at the boundary.

## Canonical records

- `AudioProject`: Project ID, tempo/time signature, track IDs, Audio Revision IDs, schema version.
- `AudioRevision`: Asset/Revision ID, kind, format, MIME, duration, sample rate, channels, byte
  length, SHA-256, immutable storage locator, and verified status.
- `AudioEventBinding`: BGM/SFX/Voice track, trigger, event key, Revision, LIVE/PINNED/REVIEW/FORKED
  mode, gain, and optional License Snapshot reference.
- `AudioPackageCompatibility`: Dependency hash/size/mode/license validation and deterministic
  Dependency Lock hash. Preview may use LIVE; Export/Runtime/Market Preparation requires PINNED.
- `AudioPreviewPlan`: local-only plan with safe playhead replacement.
- `AudioExportPlan`: on-demand plan with compatible PINNED dependencies; actual encoding is an
  injected adapter responsibility.

## Storage and transport

Audio bytes belong to `OPFS` during local editing or `OBJECT_STORAGE` after authorized upload. The
Core stores only `MEMORY_PREVIEW`/OPFS/Object Storage locators and hashes. Audio sample streams and
playback ticks are `LOCAL_ONLY`; only bounded Revision/Binding reference events may cross a later
platform event adapter. No current PiXiSYNC transport is changed.

## Feature flags and recovery

`audio-core-read`, `audio-core-write`, `audio-preview`, `audio-export`, `audio-sync`, and
`audio-publish` default OFF. Unknown flags fail closed and the kill switch wins. Preview/export
adapters are injected, cancellable, and do not mutate current Project, Market, Package, License,
Purchase, or Entitlement records.

## Unsupported and failure behavior

Unsupported AAC/WMA/AIFF/unknown formats, MIME mismatch, invalid hash, unsafe locator, missing or
stale dependency, missing license, unpinned export dependency, duplicate IDs, raw payloads, and
feature-off requests return typed diagnostics. They never substitute silence or an empty asset.
