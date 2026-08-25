# Repository Cleanup Policy

```yaml
document_id: PIXIEED-REPOSITORY-CLEANUP-001
status: CANONICAL
version: 1.0.0
verified_at: 2026-08-06
```

## Scope

This policy applies only to files inside the PiXiEED Git repository.

Examples:

- unused PNG, JPEG, WebP, GIF, SVG, ICO, audio, font-reference files;
- obsolete JavaScript/TypeScript/CSS/HTML modules;
- duplicate assets;
- abandoned experiments;
- stale generated files that should not be committed;
- old build artifacts;
- unused fixtures, mocks, snapshots, and test data;
- dead routes and entry files;
- duplicate documentation;
- deprecated compatibility files whose removal has been explicitly proven safe.

This policy does not authorize deletion from:

- production object storage;
- Supabase tables, buckets, or Realtime data;
- Market product media;
- published works;
- purchased files;
- user projects;
- PiXiSYNC checkpoints, operations, or revisions;
- backups;
- external services.

## Principle

A file is not "unused" merely because a simple text search finds no reference.

PiXiEED may load files through:

- dynamic imports;
- generated manifests;
- glob imports;
- route configuration;
- service workers;
- CSS `url(...)`;
- HTML attributes;
- JSON configuration;
- template strings;
- runtime asset IDs;
- build scripts;
- test fixtures;
- migration or compatibility code;
- public URLs and OGP references.

Deletion requires evidence.

## Cleanup workflow

```text
inventory
→ reference graph
→ classify
→ quarantine candidate list
→ targeted deletion in a dedicated branch/worktree
→ build/test/runtime verification
→ diff review
→ commit
```

## Classification

Each candidate must be assigned one status:

- `KEEP_ACTIVE`: currently used.
- `KEEP_COMPATIBILITY`: needed for old URLs, old projects, migrations, or older clients.
- `KEEP_GENERATED_SOURCE`: generated but intentionally committed.
- `REGENERATE_NOT_COMMIT`: should be generated locally and removed from Git.
- `DUPLICATE_REPLACE`: duplicate with a confirmed canonical replacement.
- `UNUSED_SAFE_DELETE`: proven unused and safe to remove.
- `UNKNOWN`: usage cannot yet be disproven.

Only `UNUSED_SAFE_DELETE` and approved `REGENERATE_NOT_COMMIT` files may be removed automatically.

## Required evidence

Before deletion, check at minimum:

- `git grep` / `rg` references;
- import/export graph;
- HTML, CSS, JS, TS, JSON, manifest, route, and build references;
- dynamic path patterns and glob loaders;
- service-worker precache lists;
- public/static directories;
- tests, fixtures, snapshots, and scripts;
- old-project and old-client compatibility;
- case-sensitive path behavior;
- file-name references stored in code-generated registries;
- duplicate file hashes;
- current build output and bundle reports.

For images, additionally inspect:

- CSS backgrounds;
- icons and favicons;
- OGP/Twitter cards;
- PWA manifests;
- loading/splash screens;
- editor tool icons;
- genre templates;
- sample projects;
- empty-state and error-state UI;
- mobile-only and desktop-only assets.

## Safe automatic deletion conditions

Codex may delete a repository file without owner confirmation only when all are true:

1. The file is inside the current task branch/worktree.
2. It is tracked by Git or is an obviously ignored build artifact.
3. No static, dynamic, generated, compatibility, test, route, or manifest reference remains.
4. It is not a public URL compatibility asset.
5. It is not required by an older supported build/project format.
6. Build, type check, lint, relevant tests, and targeted browser smoke tests pass.
7. The deletion is fully recoverable through Git.
8. The cleanup report records why deletion is safe.

## Owner confirmation required

Stop and ask before removing:

- files whose usage remains `UNKNOWN`;
- compatibility assets for old public URLs;
- migration fixtures;
- legal/license/attribution files;
- vendored third-party code;
- large groups of files with unclear ownership;
- files referenced by production configuration not available locally;
- assets that might be loaded by database-stored paths;
- anything outside the repository.

## Duplicate files

Duplicate detection must use content hashes, not names alone.

When exact duplicates exist:

- keep the path that matches current architecture and public compatibility;
- update all repository references to the canonical path;
- preserve redirects/adapters if a public path is involved;
- run case-sensitive path checks;
- delete the duplicate only after tests pass.

Visually similar but non-identical images are not automatically duplicates.

## Generated and build files

Codex should identify files that should be regenerated rather than committed.

For each such file:

- prove the generation command;
- add or confirm `.gitignore`;
- verify a clean checkout can regenerate it;
- ensure CI/build does not depend on an untracked local copy;
- then remove it from Git.

Do not delete source assets merely because a build output exists.

## Cleanup report

Write:

```text
docs/cleanup/repository-cleanup-report.md
```

Required sections:

```yaml
repository_commit:
branch_or_worktree:
scan_scope:
candidate_count:
deleted_count:
kept_active_count:
kept_compatibility_count:
unknown_count:
bytes_removed:
files_deleted:
duplicates_consolidated:
generated_files_untracked:
commands_run:
tests_passed:
tests_failed:
browser_smoke_tests:
compatibility_notes:
rollback:
remaining_candidates:
```

## Completion

Repository cleanup is complete only when:

- deleted files are listed;
- every deletion has evidence;
- Git can restore every deletion;
- current build and tests pass;
- relevant pages/tools open successfully;
- current Market and PiXiSYNC repository code still build and pass their baseline checks;
- no `UNKNOWN` file was deleted;
- the cleanup report is committed with the change.
