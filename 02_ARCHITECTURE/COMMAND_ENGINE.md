---
spec_id: ARCH-CMD-001
title: Command Engine Contract
status: NORMATIVE
classification: PRIVATE_INTERNAL_ONLY
audience: AI_AGENTS
normative_language: MUST_SHOULD_MAY
depends_on:
  - ARCH-ASSET-001
tags:
version: 0.1.0
updated: 2026-08-06
---

# Command Engine Contract

## COMMAND LIFECYCLE

```text
Intent → Validate → Plan → Apply Atomically → Emit Canonical Operation
       → Journal → History → Optional PiXiSYNC transport → Derived rebuild
```

## COMMAND ENVELOPE

```ts
interface CommandEnvelope<TPayload> {
  commandId: string;
  commandType: string;
  schemaVersion: number;
  projectId: string;
  assetId: string;
  actorId: string;
  clientId: string;
  clientSequence: number;
  baseStructureEpoch: number;
  createdAtMonotonicMs: number;
  payload: TPayload;
}
```

## REQUIRED COMMAND RESULTS

```ts
interface CommandResult {
  operation: CanonicalOperation;
  inverse?: CanonicalOperation;
  dirtyAssets: string[];
  dirtyRegions: DirtyRegion[];
  buildInvalidations: BuildInvalidation[];
  memoryDeltaBytes: number;
  warnings: Diagnostic[];
}
```

## FORBIDDEN

- Reading DOM inside a command.
- Depending on wall-clock time for deterministic output.
- Unseeded randomness.
- Network access inside command application.
- Partial mutation after validation failure.
- Direct third-party extension access to mutable buffers.

