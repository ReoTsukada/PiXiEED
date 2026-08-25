# CORE-100 composition contract

Status: `IMPLEMENTED_ISOLATED` / production integration: `UNTESTED`.

`pixiedraw2/src/core/core-100/composition-root.ts` is the sole composition root. `authority-boundary.ts` adds a private runtime brand to the existing FP-003AA server context; its action proof is privately bound by the server context factory, so copied, spread, JSON, Proxy, caller-proof, or caller-shaped wrappers are rejected. Commands cannot supply authority, provider, context, or capability. The root rechecks the current canonical membership record and exact membership revision before any adapter call. FP-004 owns durable commit/inbox/outbox identity, FP-005 owns privacy/storage policy, and FP-007 owns schema/build policy. Finance, Notification, and Search have separate consumer paths and idempotency ownership.

The `core-100` flag is default OFF and any extra flag is rejected. Unknown, OFF, unsupported, malformed-success, missing adapter, invalid input, and invalid/stale/mismatched authority inputs fail closed before side effects. COMMIT, INBOX_ACCEPT, OUTBOX_DISPATCH, and the three consumer boundaries use the same typed command/result/diagnostic path. No DOM, Canvas, UI, provider SDK, route, production, Supabase, Market, or PiXiSYNC module is imported.

CORE-110 remains responsible for durable failure, replay, provider, and crash qualification; browser/device, staging, production, RLS, and real-user compatibility remain `UNTESTED`.
