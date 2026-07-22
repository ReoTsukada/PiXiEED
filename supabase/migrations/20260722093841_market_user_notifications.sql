-- Personal market notifications.  The browser can only read and mark its own
-- notifications; all creation happens from database triggers.
create table if not exists public.market_user_notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('favorite', 'sale', 'lineage_royalty')),
  asset_id uuid references public.market_assets(id) on delete cascade,
  title text not null default '',
  count integer not null default 1 check (count > 0),
  read_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  expires_at timestamptz not null default (timezone('utc', now()) + interval '1 month')
);

create index if not exists market_user_notifications_recipient_recent_idx
  on public.market_user_notifications(recipient_user_id, expires_at desc, created_at desc);
create unique index if not exists market_user_notifications_active_favorite_unique
  on public.market_user_notifications(recipient_user_id, kind, asset_id)
  where kind = 'favorite';

alter table public.market_user_notifications enable row level security;

drop policy if exists market_user_notifications_read_own on public.market_user_notifications;
create policy market_user_notifications_read_own
on public.market_user_notifications for select
to authenticated
using (recipient_user_id = (select auth.uid()) and expires_at > timezone('utc', now()));

drop policy if exists market_user_notifications_mark_read_own on public.market_user_notifications;
create policy market_user_notifications_mark_read_own
on public.market_user_notifications for update
to authenticated
using (recipient_user_id = (select auth.uid()) and expires_at > timezone('utc', now()))
with check (recipient_user_id = (select auth.uid()));

revoke all on table public.market_user_notifications from public, anon, authenticated;
grant select, update on table public.market_user_notifications to authenticated;

create or replace function public.market_guard_user_notification_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if pg_trigger_depth() > 1 then
    return new;
  end if;
  if new.recipient_user_id is distinct from old.recipient_user_id
     or new.kind is distinct from old.kind
     or new.asset_id is distinct from old.asset_id
     or new.title is distinct from old.title
     or new.count is distinct from old.count
     or new.created_at is distinct from old.created_at
     or new.updated_at is distinct from old.updated_at
     or new.expires_at is distinct from old.expires_at then
    raise exception 'notifications may only be marked read';
  end if;
  return new;
end;
$$;

drop trigger if exists market_user_notifications_guard_update on public.market_user_notifications;
create trigger market_user_notifications_guard_update
before update on public.market_user_notifications
for each row execute function public.market_guard_user_notification_update();
revoke all on function public.market_guard_user_notification_update() from public, anon, authenticated;

create or replace function public.market_prune_expired_user_notifications()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.market_user_notifications
  where expires_at <= timezone('utc', now());
  return null;
end;
$$;

drop trigger if exists market_user_notifications_prune_expired on public.market_user_notifications;
create trigger market_user_notifications_prune_expired
after insert on public.market_user_notifications
for each statement execute function public.market_prune_expired_user_notifications();
revoke all on function public.market_prune_expired_user_notifications() from public, anon, authenticated;

create or replace function public.market_notify_asset_favorited()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_asset public.market_assets%rowtype;
begin
  select * into v_asset from public.market_assets where id = new.asset_id;
  if not found or v_asset.creator_user_id = new.user_id then
    return new;
  end if;

  insert into public.market_user_notifications (
    recipient_user_id, kind, asset_id, title, count, read_at, created_at, updated_at, expires_at
  ) values (
    v_asset.creator_user_id, 'favorite', v_asset.id, v_asset.title, 1, null,
    timezone('utc', now()), timezone('utc', now()), timezone('utc', now()) + interval '1 month'
  )
  on conflict (recipient_user_id, kind, asset_id) where kind = 'favorite'
  do update set
    title = excluded.title,
    count = case when public.market_user_notifications.expires_at > timezone('utc', now())
      then public.market_user_notifications.count + 1 else 1 end,
    read_at = null,
    created_at = case when public.market_user_notifications.expires_at > timezone('utc', now())
      then public.market_user_notifications.created_at else timezone('utc', now()) end,
    updated_at = timezone('utc', now()),
    expires_at = timezone('utc', now()) + interval '1 month';
  return new;
end;
$$;

drop trigger if exists market_asset_favorites_notify_creator on public.market_asset_favorites;
create trigger market_asset_favorites_notify_creator
after insert on public.market_asset_favorites
for each row execute function public.market_notify_asset_favorited();
revoke all on function public.market_notify_asset_favorited() from public, anon, authenticated;

create or replace function public.market_notify_royalty_ledger_created()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_asset_title text;
  v_kind text;
begin
  select title into v_asset_title from public.market_assets where id = new.asset_id;
  v_kind := case when new.lineage_depth = 0 then 'sale' else 'lineage_royalty' end;
  insert into public.market_user_notifications (
    recipient_user_id, kind, asset_id, title, count, expires_at
  ) values (
    new.recipient_user_id, v_kind, new.asset_id, coalesce(v_asset_title, '作品'), 1,
    timezone('utc', now()) + interval '1 month'
  );
  return new;
end;
$$;

drop trigger if exists market_royalty_ledger_notify_recipient on public.market_royalty_ledger;
create trigger market_royalty_ledger_notify_recipient
after insert on public.market_royalty_ledger
for each row execute function public.market_notify_royalty_ledger_created();
revoke all on function public.market_notify_royalty_ledger_created() from public, anon, authenticated;

do $$
begin
  alter publication supabase_realtime add table public.market_user_notifications;
exception when duplicate_object then null;
end;
$$;
