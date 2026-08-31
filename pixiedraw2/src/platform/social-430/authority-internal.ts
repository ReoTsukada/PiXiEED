/**
 * Retired authority module marker.
 *
 * Authority construction now lives inside the server-only closure in
 * `event-adapter.ts`.  This file intentionally exports nothing so a deep
 * import cannot construct a capability or adapter.  It remains as a stable
 * source-path marker for the package Context and for migration audits.
 */
