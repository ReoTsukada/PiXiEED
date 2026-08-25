# ADR-20260807 — WP-090 Interaction, Accessibility, and Recovery Boundaries

## Status

Accepted for isolated Core Shell; production routes remain unchanged.

## Decision

Keep Interaction, Accessibility, Responsive, Async State, Recovery, and performance contracts as
framework-neutral modules under `core-shell/assets/`. Use native semantic HTML/CSS runtime behavior
for the current preview. A future framework or external UI library must preserve these contracts and
requires a separate bundle, accessibility, update-granularity, and coexistence ADR.

The server adapter must decide Route delivery before client Feature Flag evaluation. Unknown or
Flag-OFF Routes are concealed with `404`; authenticated but unauthorized resources return `403`.
Neither response may cause a Lazy Chunk request, prefetch, or preload.

## Rationale

The Core Shell must be reusable by Draw2, Audio, Game, Market, and future site surfaces without
owning Editor Canvas state. Pure contracts allow conformance tests without DOM, Canvas, Supabase,
or production data. The DOM runtime is an adapter that owns focus and presentation only.

## Rejected alternatives

- Treating `noindex` as access control: rejected because it does not prevent direct URL access.
- Global `document.activeElement` restoration: rejected because the origin can be deleted or disabled.
- Toast-only critical errors: rejected because they are transient and inaccessible as the sole channel.
- Unbounded telemetry/offline queues: rejected because raw focus/input and private content must not be retained.
