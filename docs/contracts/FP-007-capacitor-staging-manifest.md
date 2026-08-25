# FP-007 Capacitor staging manifest

`app-shell/pixieed-capacitor/scripts/stage-web-assets.mjs` writes `dist/build-manifest.json` after staging the existing web entry list.

## Schema v1

The manifest contains only deterministic, repository-relative values:

```json
{
  "schemaVersion": 1,
  "sourceRoot": ".",
  "outputRoot": "app-shell/pixieed-capacitor/dist/web",
  "entries": ["index.html"]
}
```

`sourceRoot` and `outputRoot` are canonical POSIX-style repository-relative paths. Absolute application, repository, or web roots are internal filesystem paths only and are never serialized.

The manifest deliberately excludes timestamps, host names, usernames, locale values, random values, cache state, and network state. The existing `entries` list and copy order remain the staging authority.

## Compatibility

Repository search found no consumer or reader of `build-manifest.json`; the file is an output/provenance artifact of the staging script. Therefore no reader adapter or migration is required for this change. A future reader must reject unknown `schemaVersion` values and must not infer absolute paths from v1.

## Verification boundary

`node scripts/test-capacitor-stage-manifest.mjs` verifies the exact entry list, copy-plan mapping, forbidden ambient fields, and identical canonical bytes/SHA-256 for identical fixture input. It does not run `build:web`, delete `dist`, invoke native sync, or qualify a clean repository build.
