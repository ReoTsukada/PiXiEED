-- A payment can have reached `paid` before an earlier webhook/reconcile path
-- materialized its royalty ledger. Repair only genuinely missing ledgers; all
-- materialization writes are idempotent by their existing unique keys.

create or replace function public.market_complete_stripe_purchase_v1(
  input_purchase_id uuid,
  input_checkout_session_id text,
  input_payment_intent_id text,
  input_charge_id text,
  input_gross_amount_yen integer,
  input_processor_fee_yen integer,
  input_event_id text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_purchase public.market_purchases%rowtype;
  v_platform_fee integer;
begin
  if auth.role() <> 'service_role' then
    raise exception 'service role required';
  end if;
  select * into v_purchase
  from public.market_purchases
  where id = input_purchase_id
  for update;

  if not found
     or v_purchase.payment_provider <> 'stripe'
     or v_purchase.provider_checkout_session_id <> btrim(input_checkout_session_id) then
    raise exception 'stripe checkout does not match purchase';
  end if;
  if v_purchase.gross_amount_yen <> input_gross_amount_yen
     or input_gross_amount_yen <= 0 then
    raise exception 'stripe amount does not match purchase';
  end if;
  if input_processor_fee_yen < 0 or input_processor_fee_yen > input_gross_amount_yen then
    raise exception 'invalid stripe processing fee';
  end if;
  if v_purchase.status = 'paid' then
    -- Keep webhook retries and buyer reconciliation self-healing. The helper
    -- inserts with unique keys, so a normal retry cannot duplicate royalties.
    perform public.market_materialize_paid_purchase_v1(v_purchase.id);
    return v_purchase.id;
  end if;
  if v_purchase.status <> 'pending' then
    raise exception 'purchase is not payable';
  end if;

  v_platform_fee := public.market_platform_fee_yen(input_gross_amount_yen);
  if input_processor_fee_yen + v_platform_fee > input_gross_amount_yen then
    raise exception 'fees exceed purchase amount';
  end if;

  update public.market_purchases
  set status = 'paid',
      payment_provider = 'stripe',
      provider_payment_id = btrim(input_payment_intent_id),
      provider_charge_id = nullif(btrim(coalesce(input_charge_id, '')), ''),
      provider_last_event_id = btrim(input_event_id),
      processor_fee_yen = input_processor_fee_yen,
      platform_fee_yen = v_platform_fee,
      distributable_amount_yen = input_gross_amount_yen - input_processor_fee_yen - v_platform_fee,
      paid_at = timezone('utc', now()),
      updated_at = timezone('utc', now())
  where id = v_purchase.id;

  perform public.market_materialize_paid_purchase_v1(v_purchase.id);
  return v_purchase.id;
end;
$$;

do $$
declare v_purchase_id uuid;
begin
  for v_purchase_id in
    select purchase.id
    from public.market_purchases purchase
    join public.market_assets asset on asset.id = purchase.asset_id and asset.status = 'published'
    join public.market_asset_series series on series.id = asset.series_id and series.status = 'published'
    where purchase.status = 'paid'
      and purchase.paid_at is not null
      and purchase.purchase_kind = 'standard_use'
      and not exists (
        select 1 from public.market_royalty_ledger ledger
        where ledger.purchase_id = purchase.id
      )
  loop
    perform public.market_materialize_paid_purchase_v1(v_purchase_id);
  end loop;
end;
$$;

revoke all on function public.market_complete_stripe_purchase_v1(uuid, text, text, text, integer, integer, text)
  from public, anon, authenticated;
grant execute on function public.market_complete_stripe_purchase_v1(uuid, text, text, text, integer, integer, text)
  to service_role;
