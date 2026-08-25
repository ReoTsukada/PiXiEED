# WP-010 Canonical Contract Register

## Scope and status

This register freezes the minimum reference contracts for the future Command Engine, Journal,
PXD, PiXiSYNC, and PiXiEEDraw2 work. The reference core is isolated; it is not production
integration and it does not change current Market, PiXiSYNC, URLs, projects, or data.

## Typed IDs

The reference core uses stable non-empty strings for `ProjectId`, `AssetId`, `RevisionId`,
`CommandId`, `OperationId`, `ActorId`, and `ClientId` positions. The current repository retains
its existing identifiers at runtime: local autosave IDs (`local-*`), shared room/project IDs,
UUID operation IDs, and existing canvas/frame/layer IDs. Compatibility adapters map these fields
without rewriting stored values or public identifiers.

The reference Asset Graph requires stable UUID asset IDs for new canonical assets. Existing IDs are
not silently converted; an adapter or explicit migration map is required where an existing ID does
not meet that rule.

## Project State

The reference state is the smallest deterministic state required by the Command Engine:
`schemaVersion`, `projectId`, `structureEpoch`, raster `assets`, applied command IDs, and
per-client sequence tracking. Device-local viewport, UI, advertisement, and network session state
are excluded. Existing PiXiEEDraw document/autosave state remains authoritative until a later
adapter proves a lossless mapping.

## Command Envelope and Canonical Operation

The envelope carries the command identity, type, schema version, project/asset/actor/client
identities, client sequence, base structure epoch, monotonic creation time, and payload. A
Canonical Operation carries a deterministic `operationId`, command identity, the same project and
target scope, structure epoch, payload, and optional inverse reference. The reference schemas
reject missing required fields, unsupported schema versions, extra top-level fields, invalid
operation hashes, and invalid raster bytes.

Current PiXiSYNC transport remains the adapter owner of server revision ordering,
`operation_id`, `structure_epoch`, payload codec, payload SHA-256, undo references, pending queue,
RPCs, and checkpoint recovery. WP-010 does not introduce a second live transport contract.

## Diagnostic / Result / Error

Diagnostics use `code`, `severity`, `message`, optional `path`, and optional metadata. Command
execution returns either a successful result with the new state and CommandResult, or a failed
result with the original state and diagnostics. Validation failure is atomic. Stable error codes
remain implementation-facing until a later public API contract is approved; existing repository
`ERR_*` codes are preserved by adapters.

## PXD manifest and package boundary

The reference PXD manifest schema describes a portable `pxd` package with package/project IDs,
creator metadata, immutable asset entries, SHA-256 and byte-size evidence, and dependency edges.
The current repository also has an existing `.pxd`/ZIP writer with `manifest.json` archive version
2 and `pxd-v2-zip`; it is not rewritten to the starter manifest in WP-010. The compatibility ADR
records this deliberate two-stage mapping.

## Schema versioning and migration

- `schemaVersion: 1` is a contract version and is independent from the current PXD archive
  `version: 2`.
- Unsupported versions fail explicitly; they are not coerced into version 1.
- Additive fields require a schema decision and fixture coverage.
- Breaking changes receive a new schema and an adapter.
- Migration is read/validate/normalize/write to a new destination, with source retention,
  byte/hash checks, reconciliation, and rollback evidence.
- No Supabase migration, Storage mutation, production write, or public cutover is part of WP-010.

## Generated versus handwritten boundary

The JSON Schemas and reference TypeScript are handwritten specifications. The targeted Context
bundle is generated from repository files and is not authoritative over those files. Production
adapters and generated build artifacts must not be copied into the reference core without a
comparison and ADR.
