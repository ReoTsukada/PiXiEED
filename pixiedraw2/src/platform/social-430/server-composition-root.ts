/**
 * SOCIAL-430 server-only composition-root marker.
 *
 * This module deliberately has no public exports.  The executable server
 * composition entry is kept in `event-adapter.ts` and is loaded only by the
 * server composition layer and test fixtures.  The public contract barrel
 * does not import this root or the adapter.  Keeping this marker export-free
 * gives the repository-bound preflight a stable import-graph boundary to
 * inspect without making a capability/factory part of the caller API.
 */

// The server entry is intentionally side-effect free in this isolated
// package; the import documents the one-way direction of the composition
// graph without exporting a constructor, factory, or authority object.
import "./event-adapter.ts";
