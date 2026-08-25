# ADR-20260810 — FP-003X Cross-Layer Authority Boundary

## Status

Accepted for isolated implementation; FP-004 remains NO-GO pending external re-audit.

## Context

The FP-001〜FP-003 integrated audit found that the individual contracts and attack fixtures were
strong, but a caller could still influence the expected Principal, inject resolver functions,
reuse stale Request objects, or pass an unsealed Payment into financial materialization.

## Decision

Introduce a server-bound `Fp003XService` that captures one `Fp003XServerAuthorityProvider`. Its
command methods accept references and intent only. Raw resolver functions and completed Financial
Authority objects are excluded from the release entry surface.

Canonical record references are checked against a Server Registry result and its canonical hash.
The hash is an integrity check, not an independent trust root. Payment materialization requires
the current revision, a sealed Payment, and the complete Request-rooted graph.

Expected Authorization Principal values are derived from canonical Product owner, Purchase buyer,
or Direct Work requester records. Caller Proof Principal values cannot redefine them.

## Alternatives rejected

- trusting `source: "server"` in a caller object;
- treating a caller-provided resolver as a server boundary;
- treating process-local `WeakMap` seals as persisted authority;
- rebuilding Contributor Snapshot from the Product's included assets;
- using License Snapshot IDs alone for duplicate detection.

## Consequences

The isolated FP-003 unit functions remain available for contract fixtures, while the release
surface uses the server-bound entry. Existing current systems and data are not modified. Durable
event delivery and database transactions remain outside this package and are not implemented here.
