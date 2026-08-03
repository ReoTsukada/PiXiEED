-- Allow purchasing several permanent slots in one Stripe Checkout session.
-- One slot remains 100 JPY; quantity is bounded to keep checkout and refunds explicit.

alter table collab_v1.project_slot_purchases
  drop constraint if exists project_slot_purchases_quantity_check;
alter table collab_v1.project_slot_purchases
  add constraint project_slot_purchases_quantity_check check (quantity between 1 and 20);

alter table collab_v1.project_slot_purchases
  drop constraint if exists project_slot_purchases_gross_amount_yen_check;
alter table collab_v1.project_slot_purchases
  add constraint project_slot_purchases_gross_amount_yen_check
  check (gross_amount_yen = quantity * unit_amount_yen);

drop function if exists public.pixisync_create_slot_purchase_intent_v1(uuid, smallint);
create function public.pixisync_create_slot_purchase_intent_v1(
  input_user_id uuid,
  input_quantity smallint
)
returns table (
  purchase_id uuid,
  expires_at timestamptz,
  checkout_session_id text,
  quantity smallint,
  gross_amount_yen integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_purchase collab_v1.project_slot_purchases%rowtype;
begin
  if input_user_id is null then raise exception 'user_required'; end if;
  if input_quantity is null or input_quantity < 1 or input_quantity > 20 then
    raise exception 'invalid_slot_quantity';
  end if;
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
    insert into collab_v1.project_slot_purchases (
      user_id, quantity, unit_amount_yen, gross_amount_yen
    )
    values (input_user_id, input_quantity, 100, input_quantity * 100)
    returning * into v_purchase;
  elsif v_purchase.stripe_checkout_session_id is null then
    update collab_v1.project_slot_purchases
    set quantity = input_quantity,
        gross_amount_yen = input_quantity * unit_amount_yen,
        updated_at = timezone('utc', now())
    where id = v_purchase.id
    returning * into v_purchase;
  end if;

  return query select
    v_purchase.id,
    v_purchase.expires_at,
    v_purchase.stripe_checkout_session_id,
    v_purchase.quantity,
    v_purchase.gross_amount_yen;
end
$$;

revoke all on function public.pixisync_create_slot_purchase_intent_v1(uuid, smallint)
  from public, anon, authenticated;
grant execute on function public.pixisync_create_slot_purchase_intent_v1(uuid, smallint)
  to service_role;

create or replace function public.pixisync_create_slot_purchase_intent_v1(input_user_id uuid)
returns table (purchase_id uuid, expires_at timestamptz, checkout_session_id text)
language sql
security definer
set search_path = ''
as $$
  select purchase_id, expires_at, checkout_session_id
  from public.pixisync_create_slot_purchase_intent_v1(input_user_id, 1::smallint)
$$;

revoke all on function public.pixisync_create_slot_purchase_intent_v1(uuid)
  from public, anon, authenticated;
grant execute on function public.pixisync_create_slot_purchase_intent_v1(uuid)
  to service_role;

create or replace function public.pixisync_complete_slot_purchase_v1(
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
     or input_gross_amount_yen <> v_purchase.quantity * v_purchase.unit_amount_yen then
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

revoke all on function public.pixisync_complete_slot_purchase_v1(uuid, uuid, text, text, text, integer, text)
  from public, anon, authenticated;
grant execute on function public.pixisync_complete_slot_purchase_v1(uuid, uuid, text, text, text, integer, text)
  to service_role;
