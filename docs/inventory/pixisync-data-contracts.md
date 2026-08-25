# PiXiSYNC data contracts — WP-000

調査日: 2026-08-06 / local migration source: 158 SQL files

## Database schema

The current V1 collaboration schema is `collab_v1`. Observed tables are:

`rooms`, `room_members`, `operations`, `checkpoints`, `checkpoint_attestations`, `rate_windows`, `writer_state`, `operation_guard_audits`, `session_initializations`, `checkpoint_uploads`, `room_invites`, `document_checkpoint_uploads`, `raster_region_uploads`, `project_slot_entitlements`, `project_slot_purchases`, `project_slot_payment_events`, `room_localizations`, and `room_localization_members`.

The exhaustive declaration source/line map is in [`supabase-schema-inventory.json`](supabase-schema-inventory.json). Legacy public `shared_projects`, `shared_project_members`, and related tables are also present in the repository migrations; they are a separate historical compatibility surface and must not be silently conflated with `collab_v1`.

## Session and operation RPCs

Source-backed current names include:

- session/access: `pixisync_begin_session`, `pixisync_open_session`, `pixisync_join_session`, `pixisync_leave_session`, `pixisync_archive_session`, `pixisync_can_access_realtime_topic`;
- operation/revision: `pixisync_commit_operation`, `pixisync_commit_document_operation`, `pixisync_get_ops_since`;
- checkpoint: `pixisync_prepare_checkpoint`, `pixisync_register_checkpoint`, `pixisync_attest_checkpoint`, `pixisync_activate_initial_checkpoint`, `pixisync_activate_verified_checkpoint`, `pixisync_promote_document_checkpoint`;
- document/raster upload: `pixisync_prepare_document_checkpoint_upload`, `pixisync_finalize_document_checkpoint_upload_cleanup`, `pixisync_abort_document_checkpoint_upload`, `pixisync_prepare_raster_region_upload`, `pixisync_finalize_raster_region_upload_cleanup`, `pixisync_abort_raster_region_upload`;
- cleanup/localization: `pixisync_begin_room_localization`, `pixisync_open_localization_snapshot`, `pixisync_ack_room_localized`, `pixisync_claim_localized_room_cleanup_v1`, `pixisync_finalize_localized_room_cleanup_v1`.

These are contracts found in migrations, functions, and client references. Their full signatures and all historical declarations remain in the JSON inventory.

## Storage and Realtime

- Checkpoint object lifecycle uses the private `pixisync-checkpoints` bucket with database-side read/write/delete authorization functions and policies.
- Raster-region uploads have their own `raster_region_uploads` table and object authorization functions; a raster object is not a generic public upload.
- Realtime publication additions found in the migrations include `public.shared_project_ops` and other public plaza/notification tables. The client topic authorization path is `pixisync_can_access_realtime_topic`; a live channel subscription was not created during WP-000.
- `operations` and checkpoint metadata are revision-bound contracts. A future implementation must retain duplicate/reorder/delay handling and confirmed-revision semantics before any switch.

## Local contracts

| Local state | Contract |
| --- | --- |
| Pending operation journal | IndexedDB `pixieed-pixisync-v1`, store `pendingOperations`. |
| Reload recovery | Session/local storage keys from `reload-session-workflow-utils.js`; enabled by `RELOAD_SNAPSHOT_ENABLED`. |
| Project card | Recent project snapshot and room/project binding in project storage utilities; explicit leave/archive is required to close the shared binding. |
| Synthetic convergence | `fixtures/pixisync-convergence.synthetic.json`, deterministic IDs only. |

## Required compatibility checks and unknowns

Existing tests cover codec/order, document operations, project switch/delete, checkpoint references, and raster assets. Missing from this repository-only baseline are a complete old-client/new-client coexistence run, live duplicate/reorder/delay over Supabase Realtime, live checkpoint object authorization, and production row/object counts. Those remain unknown rather than being marked complete.
