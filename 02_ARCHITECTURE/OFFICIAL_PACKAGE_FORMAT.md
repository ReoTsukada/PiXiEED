---
spec_id: ARCH-PACKAGE-001
title: PiXiEED Official Package Formats
status: NORMATIVE
classification: PRIVATE_INTERNAL_ONLY
audience: AI_AGENTS
version: 1.3.0
updated: 2026-08-16
---

# PiXiEED Official Package Formats

## FILE TYPES

### `.pxd`

User-facing editable PiXiEED Project container. In the Draw2 source-container
workflow it owns the Project/Draw state and reference-only `AssetDefinitions`.
It may be materialized from the internal journal/chunk/checkpoint store at save,
backup, transfer, or export time.

```text
application/vnd.pixieed.pxd
```

### `.pxasset`

Internal or delivery-oriented immutable Asset package. It is not required as a
separate user-facing file when an Asset Definition belongs to a `.pxd` Project.

MIME:

```text
application/vnd.pixieed.asset+zip
```

### `.pxproject`

Legacy/internal mutable project exchange container. New Creator Workspace users
do not need to manage it separately; the user-facing source container is `.pxd`.

```text
application/vnd.pixieed.project+zip
```

### `.pxbuild`

Immutable game/application/distribution build package.

```text
application/vnd.pixieed.build+zip
```

### `.pxprov`

Detached provenance and entitlement-safe sidecar for formats that cannot embed credentials.

```text
application/vnd.pixieed.provenance+json
```

## ARCHIVE STRUCTURE

```text
manifest.json
manifest.sig
attestations/
licenses/
assets/
previews/
adapters/
SBOM-or-dependency-summary/
```

The archive is not considered secure merely because it is a ZIP.
Verification signs the canonical manifest and every content digest.

## MANIFEST CONTENT

- format and schema version;
- package ID;
- asset IDs and immutable versions;
- content hashes and sizes;
- creator, seller, and rights-holder references;
- product and offer version;
- required license grants;
- contributor/work-order references;
- dependency graph;
- build/export tool versions;
- C2PA manifest references where applicable;
- revocation and verification endpoints;
- signatures.

## MODIFICATION MODEL

A user can modify an extracted or imported asset, but:

- the original package remains immutable;
- the modified bytes receive a new asset version and hash;
- the original dependency edge is retained;
- the old signature cannot validate the new bytes;
- the new version receives a new edit/build attestation.

This is tamper-evidence and lineage preservation, not DRM that prevents all editing.

## CONTENT ADDRESSING

Objects are stored by cryptographic digest:

```text
sha256/ab/cd/<full-digest>
```

The same immutable bytes are stored once and reused by posts, products, projects, and previews.
