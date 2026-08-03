-- PiXiSYNC project-slot purchases.
--
-- Every account keeps one included slot. Owners that already exceed that limit
-- retain their current allowance, and each completed Stripe purchase adds one
-- permanent slot. Refunds/disputes reduce the allowance without deleting rooms.

create table collab_v1.project_slot_entitlements (
  user_id uuid primary key references auth.users(id) on delete cascade,
  included_slots smallint not null default 1 check (included_slots between 1 and 32767),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

insert into collab_v1.project_slot_entitlements (user_id, included_slots)
select room.owner_user_id, count(*)::smallint
from collab_v1.rooms as room
where room.status in ('initializing', 'active')
group by room.owner_user_id
having count(*) > 1
on conflict (user_id) do update
set included_slots = greatest(
      collab_v1.project_slot_entitlements.included_slots,
      excluded.included_slots
    ),
    updated_at = timezone('utc', now());

create table collab_v1.project_slot_purchases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'paid', 'cancelled', 'refunded', 'disputed')),
  quantity smallint not null default 1 check (quantity = 1),
  unit_amount_yen integer not null default 100 check (unit_amount_yen = 100),
  gross_amount_yen integer not null default 100 check (gross_amount_yen = quantity * unit_amount_yen),
  stripe_checkout_session_id text unique,
  stripe_payment_intent_id text unique,
  stripe_charge_id text unique,
  stripe_refund_id text,
  provider_last_event_id text,
  expires_at timestamptz not null default (timezone('utc', now()) + interval '30 minutes'),
  paid_at timestamptz,
  refunded_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index project_slot_purchases_user_status_idx
  on collab_v1.project_slot_purchases (user_id, status, created_at desc);

create table collab_v1.project_slot_payment_events (
  event_id text primary key,
  event_type text not null,
  object_id text not null default '',
  processing_status text not null default 'processing'
    check (processing_status in ('processing', 'processed', 'ignored', 'failed')),
  attempt_count integer not null default 1 check (attempt_count > 0),
  error_message text not null default '',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

alter table collab_v1.project_slot_entitlements enable row level security;
alter table collab_v1.project_slot_purchases enable row level security;
alter table collab_v1.project_slot_payment_events enable row level security;

revoke all on table collab_v1.project_slot_entitlements from public, anon, authenticated;
revoke all on table collab_v1.project_slot_purchases from public, anon, authenticated;
revoke all on table collab_v1.project_slot_payment_events from public, anon, authenticated;

create function public.pixisync_get_project_slot_status()
returns table (
  included_slots integer,
  purchased_slots integer,
  allowed_slots integer,
  open_owned_projects integer,
  available_slots integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_included integer;
  v_purchased integer;
  v_open integer;
begin
  if v_user_id is null then raise exception 'authentication_required'; end if;

  select coalesce(entitlement.included_slots, 1)
  into v_included
  from (select v_user_id as user_id) as account
  left join collab_v1.project_slot_entitlements as entitlement
    on entitlement.user_id = account.user_id;

  select coalesce(sum(purchase.quantity), 0)::integer
  into v_purchased
  from collab_v1.project_slot_purchases as purchase
  where purchase.user_id = v_user_id
    and purchase.status = 'paid';

  select count(*)::integer
  into v_open
  from collab_v1.rooms as room
  where room.owner_user_id = v_user_id
    and room.status in ('initializing', 'active');

  return query select
    v_included,
    v_purchased,
    v_included + v_purchased,
    v_open,
    greatest(0, v_included + v_purchased - v_open);
end
$$;

revoke all on function public.pixisync_get_project_slot_status() from public, anon;
grant execute on function public.pixisync_get_project_slot_status() to authenticated;

create function public.pixisync_create_slot_purchase_intent_v1(input_user_id uuid)
returns table (purchase_id uuid, expires_at timestamptz, checkout_session_id text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_purchase collab_v1.project_slot_purchases%rowtype;
begin
  if input_user_id is null then raise exception 'user_required'; end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(input_user_id::text, 20260804)
  );

  select * into v_purchase
  from collab_v1.project_slot_purchases as purchase
  where purchase.user_id = input_user_id
    and purchase.status = 'pending'
    and purchase.expires_at > timezone('utc', now())
  order by purchase.created_at desc
  limit 1
  for update;

  if not found then
    insert into collab_v1.project_slot_purchases (user_id)
    values (input_user_id)
    returning * into v_purchase;
  end if;

  return query select v_purchase.id, v_purchase.expires_at, v_purchase.stripe_checkout_session_id;
end
$$;

create function public.pixisync_bind_slot_checkout_v1(
  input_purchase_id uuid,
  input_user_id uuid,
  input_checkout_session_id text,
  input_expires_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare v_purchase_id uuid;
begin
  if length(btrim(coalesce(input_checkout_session_id, ''))) < 8 then
    raise exception 'invalid_checkout_session';
  end if;
  update collab_v1.project_slot_purchases
  set stripe_checkout_session_id = btrim(input_checkout_session_id),
      expires_at = input_expires_at,
      updated_at = timezone('utc', now())
  where id = input_purchase_id
    and user_id = input_user_id
    and status = 'pending'
    and stripe_checkout_session_id is null
  returning id into v_purchase_id;
  if v_purchase_id is null then raise exception 'slot_purchase_not_bindable'; end if;
  return v_purchase_id;
end
$$;

create function public.pixisync_complete_slot_purchase_v1(
  input_purchase_id uuid,
  input_user_id uuid,
  input_checkout_session_id text,
  input_payment_intent_id text,
  input_charge_id text,
  input_gross_amount_yen integer,
  input_event_id text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare v_purchase collab_v1.project_slot_purchases%rowtype;
begin
  select * into v_purchase
  from collab_v1.project_slot_purchases
  where id = input_purchase_id
  for update;

  if not found
     or v_purchase.user_id <> input_user_id
     or v_purchase.stripe_checkout_session_id <> btrim(input_checkout_session_id)
     or length(btrim(coalesce(input_payment_intent_id, ''))) < 8
     or v_purchase.gross_amount_yen <> input_gross_amount_yen
     or input_gross_amount_yen <> 100 then
    raise exception 'slot_purchase_mismatch';
  end if;
  if v_purchase.status = 'paid' then return v_purchase.id; end if;
  if v_purchase.status <> 'pending' then raise exception 'slot_purchase_not_payable'; end if;

  update collab_v1.project_slot_purchases
  set status = 'paid',
      stripe_payment_intent_id = btrim(input_payment_intent_id),
      stripe_charge_id = nullif(btrim(coalesce(input_charge_id, '')), ''),
      provider_last_event_id = nullif(btrim(coalesce(input_event_id, '')), ''),
      paid_at = timezone('utc', now()),
      updated_at = timezone('utc', now())
  where id = v_purchase.id;
  return v_purchase.id;
end
$$;

create function public.pixisync_reverse_slot_purchase_v1(
  input_charge_id text,
  input_event_id text,
  input_reason text,
  input_refund_id text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare v_purchase_id uuid;
begin
  if input_reason not in ('refund', 'dispute') then raise exception 'invalid_reversal_reason'; end if;
  update collab_v1.project_slot_purchases
  set status = case when input_reason = 'refund' then 'refunded' else 'disputed' end,
      stripe_refund_id = coalesce(nullif(btrim(coalesce(input_refund_id, '')), ''), stripe_refund_id),
      provider_last_event_id = btrim(input_event_id),
      refunded_at = case when input_reason = 'refund' then timezone('utc', now()) else refunded_at end,
      updated_at = timezone('utc', now())
  where stripe_charge_id = btrim(input_charge_id)
    and status in ('paid', 'disputed')
  returning id into v_purchase_id;
  return v_purchase_id;
end
$$;

create function public.pixisync_restore_slot_purchase_v1(input_charge_id text, input_event_id text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare v_purchase_id uuid;
begin
  update collab_v1.project_slot_purchases
  set status = 'paid',
      provider_last_event_id = btrim(input_event_id),
      updated_at = timezone('utc', now())
  where stripe_charge_id = btrim(input_charge_id)
    and status = 'disputed'
  returning id into v_purchase_id;
  return v_purchase_id;
end
$$;

create function public.pixisync_cancel_slot_checkout_v1(input_checkout_session_id text, input_event_id text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare v_purchase_id uuid;
begin
  update collab_v1.project_slot_purchases
  set status = 'cancelled',
      provider_last_event_id = nullif(btrim(coalesce(input_event_id, '')), ''),
      updated_at = timezone('utc', now())
  where stripe_checkout_session_id = btrim(input_checkout_session_id)
    and status = 'pending'
  returning id into v_purchase_id;
  return v_purchase_id;
end
$$;

create function public.pixisync_find_slot_purchase_by_charge_v1(input_charge_id text)
returns uuid
language sql
security definer
set search_path = ''
stable
as $$
  select purchase.id
  from collab_v1.project_slot_purchases as purchase
  where purchase.stripe_charge_id = btrim(input_charge_id)
  limit 1
$$;

create function public.pixisync_claim_slot_payment_event_v1(
  input_event_id text,
  input_event_type text,
  input_object_id text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare v_existing collab_v1.project_slot_payment_events%rowtype;
begin
  select * into v_existing
  from collab_v1.project_slot_payment_events
  where event_id = btrim(input_event_id)
  for update;
  if found and v_existing.processing_status in ('processed', 'ignored') then return false; end if;
  if found
     and v_existing.processing_status = 'processing'
     and v_existing.updated_at > timezone('utc', now()) - interval '10 minutes' then
    return false;
  end if;
  if found then
    update collab_v1.project_slot_payment_events
    set processing_status = 'processing',
        attempt_count = attempt_count + 1,
        event_type = btrim(input_event_type),
        object_id = left(coalesce(input_object_id, ''), 255),
        error_message = '',
        updated_at = timezone('utc', now())
    where event_id = btrim(input_event_id);
  else
    insert into collab_v1.project_slot_payment_events (event_id, event_type, object_id)
    values (btrim(input_event_id), btrim(input_event_type), left(coalesce(input_object_id, ''), 255));
  end if;
  return true;
end
$$;

create function public.pixisync_finish_slot_payment_event_v1(
  input_event_id text,
  input_status text,
  input_error_message text default ''
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if input_status not in ('processed', 'ignored', 'failed') then raise exception 'invalid_event_status'; end if;
  update collab_v1.project_slot_payment_events
  set processing_status = input_status,
      error_message = left(coalesce(input_error_message, ''), 1000),
      updated_at = timezone('utc', now())
  where event_id = btrim(input_event_id);
end
$$;

revoke all on function public.pixisync_create_slot_purchase_intent_v1(uuid) from public, anon, authenticated;
revoke all on function public.pixisync_bind_slot_checkout_v1(uuid, uuid, text, timestamptz) from public, anon, authenticated;
revoke all on function public.pixisync_complete_slot_purchase_v1(uuid, uuid, text, text, text, integer, text) from public, anon, authenticated;
revoke all on function public.pixisync_reverse_slot_purchase_v1(text, text, text, text) from public, anon, authenticated;
revoke all on function public.pixisync_restore_slot_purchase_v1(text, text) from public, anon, authenticated;
revoke all on function public.pixisync_cancel_slot_checkout_v1(text, text) from public, anon, authenticated;
revoke all on function public.pixisync_find_slot_purchase_by_charge_v1(text) from public, anon, authenticated;
revoke all on function public.pixisync_claim_slot_payment_event_v1(text, text, text) from public, anon, authenticated;
revoke all on function public.pixisync_finish_slot_payment_event_v1(text, text, text) from public, anon, authenticated;

grant execute on function public.pixisync_create_slot_purchase_intent_v1(uuid) to service_role;
grant execute on function public.pixisync_bind_slot_checkout_v1(uuid, uuid, text, timestamptz) to service_role;
grant execute on function public.pixisync_complete_slot_purchase_v1(uuid, uuid, text, text, text, integer, text) to service_role;
grant execute on function public.pixisync_reverse_slot_purchase_v1(text, text, text, text) to service_role;
grant execute on function public.pixisync_restore_slot_purchase_v1(text, text) to service_role;
grant execute on function public.pixisync_cancel_slot_checkout_v1(text, text) to service_role;
grant execute on function public.pixisync_find_slot_purchase_by_charge_v1(text) to service_role;
grant execute on function public.pixisync_claim_slot_payment_event_v1(text, text, text) to service_role;
grant execute on function public.pixisync_finish_slot_payment_event_v1(text, text, text) to service_role;

create or replace function collab_v1.enforce_single_owned_open_room()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_included_slots integer;
  v_purchased_slots integer;
  v_allowed_slots integer;
  v_existing_open integer;
begin
  if new.status in ('initializing', 'active')
    and (
      tg_op = 'INSERT'
      or old.status not in ('initializing', 'active')
      or new.owner_user_id is distinct from old.owner_user_id
    )
  then
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(new.owner_user_id::text, 20260803)
    );

    select coalesce(entitlement.included_slots, 1)
    into v_included_slots
    from (select new.owner_user_id as user_id) as account
    left join collab_v1.project_slot_entitlements as entitlement
      on entitlement.user_id = account.user_id;

    select coalesce(sum(purchase.quantity), 0)::integer
    into v_purchased_slots
    from collab_v1.project_slot_purchases as purchase
    where purchase.user_id = new.owner_user_id
      and purchase.status = 'paid';

    v_allowed_slots := v_included_slots + v_purchased_slots;
    select count(*)::integer
    into v_existing_open
    from collab_v1.rooms as room
    where room.owner_user_id = new.owner_user_id
      and room.status in ('initializing', 'active')
      and room.id <> new.id;

    if v_existing_open >= v_allowed_slots then
      raise exception using
        errcode = 'P0001',
        message = 'pixisync_owner_room_limit_reached';
    end if;
  end if;
  return new;
end
$$;
