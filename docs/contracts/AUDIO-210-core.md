# AUDIO-210 core contract

The isolated core binds each event ID to `projectId`, `assetId`, `revisionId`, revision number, and canonical content hash. Caller claims are assertions and are rejected on mismatch.

`LIVE` resolves the newest canonical revision and defers a hot swap while playback is active until a safe boundary. `PINNED` resolves only its bound revision. Preview state is separate from the graph; commit requires matching project revision and graph hash, while cancel makes the preview terminal. Export requires all bindings to be `PINNED`.

Decode adapters are untrusted: unsupported codecs, offline/failure statuses, and any metadata/hash mismatch fail closed. The core has no DOM, network, filesystem, storage, AudioContext, or production route dependency.
