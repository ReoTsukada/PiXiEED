/**
 * Static composition-root marker for the repository-bound preflight.
 *
 * The first Draw2 package has no server or provider composition root. Keeping
 * this file export-free makes that boundary explicit and prevents a caller
 * from treating an in-memory test authority as a production authority.
 */

const PIXISYNC_DRAW2_SERVER_ONLY_COMPOSITION_ROOT = true;
void PIXISYNC_DRAW2_SERVER_ONLY_COMPOSITION_ROOT;
