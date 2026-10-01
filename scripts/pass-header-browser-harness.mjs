#!/usr/bin/env node
/** Compatibility entry point: the old pass UI checks now run the free-tools smoke suite. */
await import('./free-tools-browser-harness.mjs');
// Kept under its former name for local scripts and automation that have not been updated yet.
