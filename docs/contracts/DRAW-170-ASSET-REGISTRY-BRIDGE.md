# Draw2 Asset Registry Bridge Contract

Status: `IMPLEMENTED_ISOLATED` / `COMPLETE_CANDIDATE`  
Updated: 2026-08-16  
Scope: Draw2 PXD Asset Definition → host-neutral Registry Bridge only

## Ownership boundary

This contract is the smallest bridge between a validated Asset Definition owned by a Draw2 PXD
and an external Registered Asset identity. It does not implement the server Registry, database,
Object Storage, Game, Audio, Market, selling, publishing, or a production route.

| Boundary | Responsibility | Status |
| --- | --- | --- |
| Draw2 PXD | Canvas/Layers/Frames/Timeline and reference-only `AssetDefinitions` | source of truth |
| Registry Bridge | validate promotion, calculate definition digest, call provider, verify returned identity | implemented isolated |
| TEST_ONLY provider | deterministic in-memory source/identity fixture and failure injection | tests only |
| SITE-400 provider | server-authorized persistence and current source resolution | not implemented |
| Game/Audio/Market | registered-consumer integrations | later |

The Bridge does not accept caller-provided `trusted`, `allowed`, or `serverAllow` booleans. The
injected provider is the authority boundary. A future server provider must re-resolve Project,
PXD, definition, owner, tenant, permission, and source revision from its own canonical records.

## Lifecycle and identity

```text
LOCAL_DRAFT
  → VALIDATED_DEFINITION
  → Registry Bridge
  → REGISTERED_ASSET identity
```

Only `VALIDATED_DEFINITION` is accepted by registration. A successful response is a stable,
reference-only identity:

```text
schemaVersion
status = REGISTERED_ASSET
assetId
projectId
sourcePxdId
definitionId
ownerId
sourceRevisionId
definitionDigest
referenceMode = LIVE | PINNED | REVIEW | FORKED
```

The identity contains no pixels, raster, Canvas, Frame, Layer body, Blob, Base64, Data URL, or
whole PXD. The digest covers normalized Asset Definition metadata and stable references only; it
does not hash the complete PXD or run in pointer, render, animation, audio, or runtime loops.

`LIVE` preserves `assetId` and may resolve the current allowed source revision. `PINNED` requires
an exact source revision and definition digest and fails closed when that source is unavailable or
changed. `REVIEW` and `FORKED` retain the existing Core policy meanings; this bridge does not add
a second policy state machine or silently create a fork.

## Failure rules

The bridge rejects local drafts, malformed definitions, unknown or mismatched Project/PXD/
definition/owner context, mismatched reference policy, missing PINNED revision, malformed hashes,
embedded payloads, provider failure, malformed provider success, and conflicting returned identity.
Missing source returns `UNRESOLVED_SOURCE_DEFINITION`; it never guesses a replacement ID.

Only a structurally valid `REGISTERED_ASSET` identity is eligible for future `GAME`, `AUDIO`,
`MARKET`, and `CROSS_PROJECT` consumers. Consumer implementation is outside this contract.

## PXD and Workspace invariants

- PXD remains the editable source container; Registry identity is an external mapping.
- Registration does not copy pixel data or materialize a second Canvas/Project.
- Registration does not regenerate or mutate Canvas, Layer, Frame, Cel, Timeline, Undo/Redo,
  PiXiSYNC state, or Creator Workspace presentation.
- Dirty-region invalidation and lazy materialization remain later consumer/cache concerns; no
  full PXD serialization or unbounded Registry scan is performed by this bridge.
- Current production PiXiEEDraw, current PXD, PiXiSYNC, Market, URLs, database, and Storage are
  untouched.

## Verification

`pixiedraw2/tests/draw-170/registry-bridge.test.ts` covers RB-01 through RB-19, including:
successful TEST_ONLY registration, draft rejection, malformed/payload rejection, ownership and
Project mismatch, stable identity, PXD/definition references, LIVE update, PINNED exactness,
unresolved source, context substitution, consumer eligibility, provider failure, provider identity
conflict, Workspace preservation, and missing PINNED revision.

The real server provider, production auth/tenant context, persistent Registry, real PXD UI save
wiring, Game/Audio/Market consumers, browser/device qualification, and production data remain
`UNTESTED` or `NOT_IMPLEMENTED` by design.
