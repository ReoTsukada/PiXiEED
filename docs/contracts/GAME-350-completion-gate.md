# GAME-350 Game Completion Gate Contract

GAME-350 は GAME-300〜340 の canonical evidence を、Project/Owner/Revision/Project Hash に束ねて最終 readiness 判定する純粋な TypeScript gate である。証拠の読込、ビルド実行、Runtime 起動、ブラウザ/デバイス検査、ファイル・ネットワーク・DOM・本番接続は呼び出し側の責務であり、この gate の authority ではない。

## 判定

- `READY`: PROJECT、INPUT、RUNTIME、BUILD、CROSS_TOOL の各証拠が一件ずつ存在し、全て `QUALIFIED_PASS`、未検証項目が空で、canonical identity と証拠 hash が一致する。
- `NOT_READY`: integrity は成立するが、静的/targeted/reference のみ、または browser/device/native/production 等が `UNTESTED` の場合。未検証項目を PASS に昇格しない。
- `BLOCKED`: 欠落、重複、領域/パッケージ不一致、stale identity、hash mismatch、必要 acceptance 欠落、`BLOCKED`/`UNKNOWN` の矛盾を検出した場合。

判定は domain 順と canonical JSON hash により決定論的であり、入力配列の順序には依存しない。`capturedAt` は証拠の追跡用であり、現在時刻を取得して freshness を推測しない。stale は canonical revision/hash/source claim の不一致として明示的に拒否する。

## 境界

Project/Runtime/Build/Cross-tool の内容を再実行・再解釈せず、前段契約の evidence claim を検証する。Registry、Queue、State、Context、current routes/data、Market、PiXiSYNC、Storage、publish、deploy、migration、commit、push へ接続しない。

## Boundary ownership proposal — 2026-08-15

**Status:** `BOUNDARY_OWNERSHIP_APPROVED / COORDINATOR_DECISION_RECORDED`

**Coordinator decision (2026-08-15):** `BOUNDARY_OWNERSHIP = APPROVED`

This approval records ownership only. It does not certify external qualification,
authorize SITE-400 implementation, or promote either package to a production-ready
release state.

### Current rule

The Registry dependency graph is acyclic:

```text
GAME-340 → GAME-350 → SITE-400
```

However, the current qualification matrix treats the real Game Studio route, Core Registry provider, browser/device qualification, and later provider/RLS evidence as `blocksGame350=true`, while those responsibilities are defined in `SITE-400` or later qualification packages. This creates a responsibility deadlock even though the package graph itself has no cycle.

### Proposed ownership

| Responsibility | Owner | GAME-350 meaning |
|---|---|---|
| Game Project / Scene / Entity / Behavior IR and identity checks | GAME-350 | Required; host-neutral contract and isolated evidence |
| GAME-340 Draw / Animation / Audio adapter contract | GAME-350 | Required; no editor-internal state sharing |
| Runtime start validation, LIVE/PINNED, lock/hash/license fail-closed | GAME-350 | Required; validation occurs before the hot loop |
| Game Studio presentation projection | GAME-350 | Contract/projection only |
| Core Shell Game route, lazy entry, App Shell navigation | SITE-400 | Shared integration gate; not duplicated in GAME-350 |
| Server-authorized Project/Asset Registry provider | SITE-400 | Shared integration gate; GAME-350 owns no Registry client |
| Real Storage/provider artifact materialization | SITE-400 + later qualification | Not implemented in GAME-350; resolver boundary remains typed and fail-closed |
| Browser Shell flow | SITE-400 | Shared integration evidence |
| Safari/Firefox/device/long-session/performance | WP-920/WP-930 and later gates | Later qualification; never promoted from synthetic evidence |
| RLS/provider/staging/rollback/production | WP-950..WP-980 | Later qualification; outside GAME-350 implementation |

### Why this is not scope laundering

The proposal does not move GAME-350-native validation out of GAME-350. It only prevents the Shell route, server Registry provider, Storage materializer, and formal device/provider qualification from being reimplemented inside a host-neutral Game Core gate. Existing synthetic tests remain isolated evidence, and the shared integration gate must later prove the real product flow.

### Evidence and compatibility

The current GAME-340/GAME-350 contracts, LIVE/PINNED semantics, bounded cache, lifecycle cleanup, and 41/41 targeted tests remain unchanged. The existing `SITE-400` dependency remains `GAME-350`; only the qualification matrix ownership labels are synchronized. No Registry ID, route, data, migration, or production boundary is changed by this proposal.

### Resulting governance state

- `GAME-350 = COMPLETE_CANDIDATE` for its native contract and isolated evidence scope.
- `SITE-400 = READY_TO_START_CANDIDATE`; implementation remains separately authorized and is not started by this decision.
- `ARTIFACT_AUTHENTICITY = PARTIAL`: typed metadata/reference validation is proven; actual Object Storage bytes and digest verification remain later provider/storage work.
- `QUALIFICATION_READY = false`: browser/device/native/provider/staging/production and other explicitly untested evidence remain untested.
- `GATE_DEADLOCK = RESOLVED`; the dependency graph remains `GAME-340 → GAME-350 → SITE-400`.

The machine package statuses remain unchanged (`GAME-350=IN_PROGRESS`, `SITE-400=PLANNED`); the candidate labels above are governance states, not an implementation-start command. No package status is silently promoted, and the next action is a fresh read-only gate review rather than SITE-400 implementation.
