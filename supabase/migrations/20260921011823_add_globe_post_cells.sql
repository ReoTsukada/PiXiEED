-- Add the geographic globe-cell contract without invalidating existing Japan cells.
-- Exact coordinates remain private; the public table receives only the stable cell identity.

alter table public.post_locations_private
  add column if not exists projection_version text,
  add column if not exists globe_cell_id text,
  add column if not exists globe_band integer,
  add column if not exists globe_column integer;

alter table public.post_locations_private
  drop constraint if exists post_locations_globe_cell_valid;

alter table public.post_locations_private
  add constraint post_locations_globe_cell_valid check (
    (globe_cell_id is null and projection_version is null and globe_band is null and globe_column is null)
    or (
      map_space = 'globe'
      and projection_version = 'v11-meridian-parallel-quarter-degree'
      and globe_cell_id = 'globe:' || projection_version || ':' || globe_band || ':' || globe_column
      and globe_band between 0 and 719
      and globe_column between 0 and 1439
    )
  );

alter table public.post_map_points
  alter column cell_grid drop not null,
  alter column cell_x drop not null,
  alter column cell_y drop not null,
  alter column prefecture_code drop not null,
  add column if not exists globe_cell_id text,
  add column if not exists globe_band integer,
  add column if not exists globe_column integer;

alter table public.post_map_points
  drop constraint if exists post_map_points_cell_valid;

alter table public.post_map_points
  add constraint post_map_points_cell_valid check (
    (
      map_space = 'japan'
      and projection_version = 'japan-cell-v1'
      and cell_grid in (64, 128, 256, 512)
      and cell_x between 0 and cell_grid - 1
      and cell_y between 0 and cell_grid - 1
      and prefecture_code ~ '^(0[1-9]|[1-4][0-9])$'
      and globe_cell_id is null and globe_band is null and globe_column is null
    )
    or (
      map_space = 'globe'
      and projection_version = 'v11-meridian-parallel-quarter-degree'
      and cell_grid is null and cell_x is null and cell_y is null and prefecture_code is null
      and globe_cell_id = 'globe:' || projection_version || ':' || globe_band || ':' || globe_column
      and globe_band between 0 and 719
      and globe_column between 0 and 1439
    )
  );

create index if not exists post_map_points_globe_cell_idx
  on public.post_map_points (projection_version, globe_band, globe_column)
  where map_space = 'globe';

-- Keep the public surface read-only. Edge Functions using the secret key own writes.
revoke insert, update, delete on table public.post_map_points from anon, authenticated;
grant select on table public.post_map_points to anon, authenticated;
