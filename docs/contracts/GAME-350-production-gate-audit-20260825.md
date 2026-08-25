# GAME-350 production gate audit — 2026-08-25

## Decision

`QUALIFIED_RELEASE_READY` is `NOT_READY`.

The local iGAME editor and local Market/PXD contracts pass their scoped
checks, but the linked Supabase project has not received the current Draw2,
Market package, or format-capacity migrations. The production authority
boundary therefore remains unqualified.

## Remote migration state

Read-only commands used:

```text
supabase db push --dry-run --linked
supabase migration list --linked
```

The dry run reported these migrations would be pushed:

- `20260824090000_pixync_draw2_aggregate_authority.sql`
- `20260824202450_market_audio_product_composition.sql`
- `20260824214340_market_package_server_verification.sql`
- `20260825090000_market_format_capacity.sql`

The linked migration list ends at `20260805020000_pixisync_room_members_and_titles`.
No migration was applied by this audit.

## Remote function state

The linked project currently has active legacy Market functions, but it does
not list `market-verify-listing-package`. A read-only `pg_proc` query also
found no `pixync_draw2_*` authority functions and no current format-capacity
RPC definitions. The local code cannot be considered the remote source of
truth until the reviewed migrations and Edge Function are deployed together.

## Required release sequence

1. Review the four pending migrations and their dependency order.
2. Apply them to a staging or approved linked environment.
3. Deploy `market-verify-listing-package` with JWT and dependency checks.
4. Run authenticated seller, purchase, PXD delivery, and PiXYNC two-client
   acceptance tests against that environment.
5. Run security/performance advisors and resolve or explicitly accept findings
   relevant to the new Market/PiXYNC tables and functions.
6. Only then promote the web build and call the product release-ready.

This document records an external-state audit only. It does not authorize or
perform database migrations, Edge Function deployments, checkout calls, or
production publishing.

## Coordinator recheck — current workspace state

The read-only Supabase connector still reports the remote migration tail as
`20260805020000_pixisync_room_members_and_titles`. The current Draw2/PXD
migrations remain absent remotely, and the remote function list still has no
`market-verify-listing-package` or `pixync_draw2_*` function. The existing
`market-download` function is active with `verify_jwt=false`, which does not
match the current local release contract.

The local CLI migration dry-run was also retried. Migration-list access
worked, but the dry-run could not authenticate the `cli_login_postgres` role
(`password authentication failed`). No remote mutation occurred. This is an
external credential/deployment gate, not a local iGAME failure.

Native executable checks on the current machine returned:

```text
unity=NOT_FOUND
unity-editor=NOT_FOUND
godot=NOT_FOUND
godot4=NOT_FOUND
UnrealEditor=NOT_FOUND
```

Therefore the local `ENGINE_HANDOFF_V2` ZIP checks remain valid, while native
engine import/compile remains `UNTESTED`.
