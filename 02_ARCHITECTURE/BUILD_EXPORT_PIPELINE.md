---
spec_id: ARCH-BUILD-EXPORT-001
title: PiXiEED Build and Export Pipeline
status: RECONSTRUCTED_CANONICAL
classification: PRIVATE_INTERNAL_ONLY
audience: AI_AGENTS, PRODUCT, ENGINEERING
version: 1.0.0
updated: 2026-08-08
source_status: RECONSTRUCTED_FROM_APPROVED_SOURCES
---

# Build and Export Pipeline

## Reconstruction boundary

The original `BUILD_EXPORT_PIPELINE.md` was not found in the working tree or Git history. This
document is reconstructed from the approved Master Context, Integrated PiXiPackage, Package
Registry, Asset Graph, Core, Cost-aware Realtime, Storage, performance, external-adapter, and
roadmap materials. It defines an architecture and acceptance boundary; it does not claim that a
production Build service, exporter, cloud billing flow, or Store adapter exists.

## Package and Build are different

| Concept | Authority | Meaning |
| --- | --- | --- |
| Project State | Core Project/Command/Revision boundaries | Editable canonical authoring state. |
| Package | Package Registry | Portable/reference representation with Manifest, Dependency Lock, Hash, License, and Provenance. |
| Build | Build Pipeline | Target-specific transformation of a validated Package. |
| Runtime Artifact | PiXiRuntime target | Verified executable/embeddable output for one Runtime/Target configuration. |
| Distribution/Release | Release/Market/Store adapter | Immutable delivery/release record with rights and metadata. |

```text
Canonical Project State
  → Package Registry / Dependency Lock
  → Build Plan
  → target Runtime Artifact
  → Distribution / Release
```

Build Artifact is never the canonical Project State. A successful Build does not grant a Market
Entitlement, change a License, or replace an existing Product/URL.

## Canonical pipeline

```text
Project
↓
Validation
↓
Asset Dependency Resolution
↓
Revision Lock
↓
Compatibility Check
↓
License / Permission Check boundary
↓
Build Plan
↓
Asset Processing
↓
Runtime Packaging
↓
Hash / Integrity
↓
Verification
↓
Artifact
```

Each stage has a typed input/output and an idempotent request identity. A failed, cancelled,
timed-out, partial, or unverified result is `FAILED`, `QUARANTINED`, or an intermediate record;
it cannot be promoted to `READY`, published, sold, or executed.

## Stage contracts

### 1. Project snapshot

Read a declared Project Revision and Build Configuration. Do not build directly from mutable
LIVE editor state. Unsaved preview may be used only when explicitly labelled and must not become a
release source without confirmation.

### 2. Validation

Validate Project/Package schema versions, Typed IDs, commands/checkpoints, Scene/Entity/Component
structure, asset references, scripts/extensions, target profile, and required Runtime version.
Malformed or unknown versions fail closed.

### 3. Dependency resolution

Resolve Asset ID, Revision ID, Content Hash, size, MIME, provenance, license, and dependency graph.
Apply `LIVE` only during authoring resolution; convert Build inputs to exact locked revisions.
Reject missing, unauthorized, trashed, quarantined, unsupported, circular, or owner-conflicting
dependencies.

### 4. Revision Lock

Create an immutable Dependency Lock containing exact Package/Asset/Revision/Hash/Size references.
The lock is a Build input and is included in the Runtime Artifact manifest. Later source edits
create new Revisions and do not mutate an existing lock.

### 5. Compatibility and permission boundary

Check target Runtime version, tool/format versions, capabilities, package limits, License Snapshot,
owner permission, and permitted distribution mode. The Build worker receives a scoped decision or
opaque capability—not JWTs, secrets, or unrestricted account state.

### 6. Build Plan

Produce a deterministic plan of asset processing, code/behavior compilation, scene packaging,
runtime modules, optional compression, and output files. The plan records target, toolchain,
configuration, estimated bytes/compute, and cache candidates before heavy work starts.

### 7. Asset processing

Process only locked inputs. Raster, animation, audio, UI, Scene, Script, and optional extension
processors have explicit format/version limits and worker/sandbox boundaries. Preserve canonical
source hashes and record generated hashes. Do not silently rewrite source Assets.

### 8. Runtime packaging

Create a target-specific artifact for PiXiRuntime. Include only required Runtime modules and locked
dependencies. Do not include Draw2 Editor, PiXiAudio Editor, unused Creator Workspace, or the full
Asset Registry client. External Engine output is a separate versioned Adapter result.

### 9. Integrity

Calculate Package, Dependency Lock, input, output, Manifest, and Artifact hashes. Verify lengths,
MIME, paths, archive structure, signatures where applicable, and deterministic ordering. Hash
mismatch is a hard failure.

### 10. Verification

Load the artifact through the target Runtime compatibility checker, validate Scene/Asset/Script
resolution, run declared smoke/fixture tests, record metrics, and retain the raw result. A Build
is `READY` only after all mandatory checks pass.

## Build target contract

The first planned target is `PIXIEED_NATIVE_WEB_RUNTIME`. Future targets are adapters:

- generic web package;
- engine-friendly asset/export package;
- Unity data export;
- Blender or other external workflow;
- additional supported target adapters.

No target exporter is considered implemented because its format is listed. Each adapter must have
its own version, capability negotiation, license/security boundary, fixtures, output verification,
and rollback/retirement policy. Independent external edits are not promised to reverse-sync into
the PiXiEED Project.

## Determinism and cache

Build Configuration must be canonical and include Runtime version, target, toolchain, optimization,
compression, feature capabilities, and relevant environment declarations. Future cache identity:

```text
BuildCacheKey =
  PackageHash
  + DependencyLockHash
  + BuildConfigurationHash
  + RuntimeVersion
  + Target
  + ToolchainVersion
```

Cache hits may reuse verified immutable artifacts only after key, hash, permission, and retention
checks. Cache reuse never shares ownership, purchase rights, License Snapshot, royalty, or release
records.

## Cost and observability

Build must measure, by Build ID and without secrets or private raw content in telemetry:

- CPU time and queue time;
- peak/component memory;
- generated bytes and artifact count;
- input/output egress and storage;
- cache hit/miss and reused artifact bytes;
- worker/sandbox failures;
- verification duration and result.

Local Build may be repeatedly run where the target supports it. Cloud Build pricing, quotas, and
commercial plans are separate decisions and are not fixed by this specification. Idempotent
Operation/Build IDs prevent duplicate charge or duplicate artifact publication on retry.

## Security boundary

Reject or quarantine malicious packages, path traversal/absolute paths, symlinks, decompression
bombs, oversized files/counts, active HTML/SVG/script/Wasm content where not explicitly supported,
untrusted extensions, external URLs, unsupported formats, dependency cycles, hash/Manifest tamper,
missing or unauthorized dependencies, and unsafe archive entries.

Build workers must not execute User Script with host-process privileges. Script/extension builds
use sandboxed or isolated execution with explicit capabilities, limits, network policy, and output
allowlists. Secrets and signing materials are temporary, scoped, encrypted, never logged, and
never placed in source fixtures or analytics.

## Storage and lifecycle

Project edits remain split across Core state, Journal/Checkpoint, Asset Revisions, and local/cloud
storage responsibilities. Build artifacts are immutable Object Storage/package outputs referenced
by Registry metadata; they are not stored as canonical editor state. Intermediate files have a
retention/cleanup policy and may be removed only after verification, rollback, and audit rules
allow it.

## Status and non-scope

| Area | Status | Truthful state |
| --- | --- | --- |
| Package/Manifest/Dependency Lock contract | CURRENT | WP-094 isolated contract exists. |
| Draw2 local PXD/PNG export | CURRENT SLICE | WP-140 isolated implementation exists. |
| PiXiRuntime Build target | PLANNED | Contract only; no Runtime artifact service is claimed. |
| Cloud Build / billing | PLANNED | Cost boundary exists; prices and service are undecided. |
| Unity/Blender/external exporters | FUTURE EXTENSION | Versioned adapter boundary only. |
| Store submission | FUTURE EXTENSION | Requires separate adapter, credentials, review, and release approval. |

No current Route, PiXiEEDraw, existing PXD, PiXiSYNC, Market, Project/Asset/Package data,
Purchase/Entitlement, License/Royalty, production Database/Storage, migration, deployment,
publication, commit, or push is changed by this specification.
