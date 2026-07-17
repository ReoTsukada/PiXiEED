-- Secure, repeatable delivery for paid marketplace purchases.
-- Purchase ownership has no lifetime download limit. This table only provides
-- a short-window abuse guard and an audit trail for signed-URL issuance.

create table if not exists public.market_download_events (
  id uuid primary key default gen_random_uuid(),
  purchase_id uuid not null references public.market_purchases(id) on delete restrict,
  asset_id uuid not null references public.market_assets(id) on delete restrict,
  buyer_user_id uuid not null references auth.users(id) on delete restrict,
  delivery_kind text not null check (delivery_kind in ('zip', 'pixieedraw-open')),
  selected_formats text[] not null default array[]::text[],
  delivered_file_count integer not null default 0 check (delivered_file_count between 0 and 100),
  trace_id uuid not null unique default gen_random_uuid(),
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists market_download_events_buyer_asset_recent_idx
  on public.market_download_events(buyer_user_id, asset_id, created_at desc);

alter table public.market_download_events enable row level security;

comment on table public.market_download_events is
  'Service-only audit records for short-lived marketplace delivery URLs. A paid purchase remains downloadable without a lifetime count limit.';

-- Signed-in buyers may inspect their own delivery history, but only the
-- authenticated Edge Function (service role) may create records.
drop policy if exists market_download_events_read_own on public.market_download_events;
create policy market_download_events_read_own
on public.market_download_events for select
to authenticated
using (buyer_user_id = auth.uid());

revoke insert, update, delete on public.market_download_events from public, anon, authenticated;
grant select on public.market_download_events to authenticated;
