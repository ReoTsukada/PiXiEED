# ADR-210: bounded AUDIO-210 event binding and preview

## Decision

Keep AUDIO-210 as a pure asynchronous TypeScript boundary over AUDIO-200 canonical metadata. Hashes are computed from canonical JSON, and every bridge or adapter result is verified against the canonical project/revision before it can produce a playback or export plan.

## Consequences

Preview can be cancelled or committed only from an active, non-stale base. LIVE updates are boundary-deferred; PINNED updates never follow a different revision. Production playback, persistence, UI, and network integration remain outside this package.
