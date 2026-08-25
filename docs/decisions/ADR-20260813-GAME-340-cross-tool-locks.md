# ADR-20260813-GAME-340 Cross-tool locks

## Decision

GAME-340 は Draw/Audio の raw content をコピーせず、canonical authority が返した asset revision/hash/license/permission を `ResolvedAsset` として lock する。Game package は mode と component identity を保持し、package hash は project、asset、dependency、license の deterministic projection から作る。

Preview 更新は LIVE のみを受け付け、PINNED/REVIEW/FORKED は明示的な新しい package/build input を要求する。イベントは contiguous sequence と duplicate rejection を持ち、rollback は immutable preview state に限定する。

## Alternatives rejected

- caller の revision/hash/license を採用する: stale、wrong project、tamper を authority と誤認するため却下。
- raw pixel/audio bytes を Game package に埋め込む: source ownership と authoring state の境界を壊すため却下。
- production Registry/Runtime/Market に接続する: bounded isolated contract の scope 外であり却下。

## Consequences

Deterministic package identity と fail-closed diagnostics が得られる。一方、canonical resolver、browser/device UI、native/production qualification は後続境界で実施する必要がある。
