# ADR-20260807-WP094 — Package Registry Core

- Status: Accepted for WP-094
- Date: 2026-08-07
- Scope: Package identity, Manifest, Dependency Lock, THIN/PORTABLE materialization, security,
  lifecycle, legacy PXD boundary, Market projection, and streaming adapter

## Decision

Add an unloaded pure Package Registry contract at
`core-shell/assets/core-package-registry-contracts.js`. It owns Package metadata and verified
materialization results, while Project Registry, Asset Registry, Permission, Storage, current PXD,
PiXiSYNC, and Market remain separate adapter/authority boundaries.

## Rationale

The site is being reconstructed as a global Creator Platform, so Draw2, Audio, Game/Runtime, Market,
Community, Commission, Subscription, and Creator Economy need a common package boundary. A Registry
that stores only references and verified metadata lets tools share complete works without moving
large Pixel/Audio/Game bytes, purchase data, or private content into a single mutable record.

Current PXD and existing products must survive the transition. Therefore current PXD remains an
unchanged legacy format, and the integrated PiXiPackage is a separate versioned materialization with
lossless Adapter/Unsupported Report behavior.

## Rules recorded

1. Package Kind is not Market product classification. Market receives only package identity,
   version, kind, manifest, hashes, size, compatibility, license, and provenance references.
2. Project-time LIVE references are resolved to exact Revision/Hash/Size locks during materialization;
   READY content never follows LIVE silently.
3. THIN may reference authorized immutable content. PORTABLE may embed only authorized content; missing
   permission is a typed failure or explicit locked dependency.
4. Manifest/Artifact verification and final Registry commit are atomic. Failed, cancelled, crashed,
   uploaded-but-unverified, or tampered output is never READY.
5. ZIP/path/MIME/active-content/sandbox/recursion/size/file-count/hash safety is fail closed.
6. Deduplication reuses content hashes but never grants Package or License access across owners.
7. All Package flags default OFF. Current routes, PXD, PiXiSYNC, Market, data, migration, deploy,
   publish, commit, and push are out of scope.

## Non-application

No Package Registry code is imported by a current public route. No package body, raw media, JWT,
payment, royalty, or commission body is created or uploaded by WP-094.
