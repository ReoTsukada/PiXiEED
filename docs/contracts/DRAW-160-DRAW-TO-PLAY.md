# DRAW-160 Draw-to-Play Contract

## Authority and boundary

Draw-to-play preview is an isolated reference boundary. The caller provides
an asset identity and an explicit reference mode; the `CanonicalPreviewResolver`
is the only authority for revision, content hash, license, permission, review
approval, and fork binding. A caller cannot provide a LIVE revision override.

The preview adapter creates a Runtime dependency snapshot and never writes
Editor state, Project state, PXD, PiXiSYNC, Market, or production data. Runtime
state is mutable for play, while Editor state remains outside the Runtime
bundle. Publish and Build are separate operations and are never implicit in
preview creation or hot reload.

## Reference modes

| Mode | Required authority input | Runtime rule |
| --- | --- | --- |
| `LIVE` | `assetId` | Follow the current canonical revision; caller revision overrides are rejected. |
| `PINNED` | `assetId` + `revisionId` | Keep the canonical revision and hash fixed; mutation during hot reload is rejected. |
| `REVIEW` | `assetId` + `revisionId` | Require canonical `APPROVED` review status. |
| `FORKED` | `assetId` + `forkId` | Require the canonical revision to be bound to the requested fork. |

Every resolved record must be canonical, mode-matched, hash-valid, bounded,
licensed, and permission-granted. Missing, stale, mismatched, unapproved, or
invalid records fail closed with a diagnostic.

## Reload and recovery

LIVE reload uses the existing Runtime `safeHotReload` boundary and preserves
the Runtime world state. Each accepted reload stores both the previous Runtime
session and the matching canonical reference. Rollback restores both together;
it cannot leave the Runtime session pointing at a different asset revision.

## Non-goals and qualification status

This contract does not claim browser/device/full-compositor, native, cloud
build, production Runtime, or real-user PXD qualification. Those remain
`UNTESTED` until their respective gates execute.
