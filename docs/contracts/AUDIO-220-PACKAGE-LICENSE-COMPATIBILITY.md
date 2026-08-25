# AUDIO-220 Package / License Compatibility Contract

Status: isolated reference contract. This package has no DOM, network, filesystem, Storage,
Market, PiXiSYNC, or production route dependency.

## Authority boundary

An AUDIO-200 canonical `AudioRevision` and an AUDIO-210 graph are the only inputs used to bind an
Audio package. Every graph edge must be `PINNED`; `LIVE` or an unlocked revision is rejected. The
raw audio blob is represented only by its `AudioSourceBlobLocator`, content hash, MIME, and byte
length. A locator is not permission or identity authority.

License and provenance are resolved through the injected canonical authority adapter. Caller
claims are comparison-only and cannot replace the resolved revision, license, owner, or locator.
The manifest stores the complete license/provenance snapshots plus their hashes, so a later source
or contributor change does not mutate an existing package input.

## Package form

`THIN` stores immutable references. `PORTABLE` stores the same reference contract and requires a
non-ephemeral locator; this isolated implementation does not transfer raw bytes. Each dependency
is an exact `PINNED` lock containing project, asset, revision, content hash, size, MIME, source
locator, license/provenance snapshot hashes, and bounded dependency edges. Source and optional
rendered locators are validated as safe relative paths.

The canonical manifest hash covers the manifest without `manifestHash`; `packageHash` covers the
complete envelope. Export validates before serialization, and import validates schema, lock hash,
manifest hash, package hash, snapshot arrays, duplicate IDs, dependency cycles, path safety, and
raw-payload exclusion.

## Fail-closed boundary

Unsupported schema/license, ambiguous or missing snapshots, missing or unlocked revisions, hash or
size mismatch, duplicate dependency, dependency cycle, unsafe path, tampered envelope, malformed
JSON, offline ephemeral PORTABLE input, and raw audio payload are rejected. READY/package sale,
publishing, payment, entitlement, Market, Storage upload, and production migration are outside
this contract.

