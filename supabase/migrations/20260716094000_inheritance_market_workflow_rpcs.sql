-- Server-side guards for the inheritance market.  Browser clients receive no
-- write policies for these records, so lineage and price rules cannot be
-- bypassed by a handcrafted request.

create or replace function public.market_create_root_asset(
  input_title text,
  input_description text,
  input_sale_price_yen integer,
  input_base_use_price_yen integer,
  input_required_option_price_yen integer,
  input_derivative_license_price_yen integer,
  input_derivative_sales_allowed boolean,
  input_inherited_terms jsonb default '{}'::jsonb,
  input_prohibited_uses jsonb default '[]'::jsonb,
  input_allowed_media jsonb default '[]'::jsonb,
  input_asset_format text default 'pixiedraw-project',
  input_change_summary jsonb default '[]'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_series_id uuid;
  v_asset_id uuid;
  v_minimum_price integer;
begin
  if v_user_id is null then
    raise exception 'login required';
  end if;

  if jsonb_typeof(coalesce(input_inherited_terms, '{}'::jsonb)) <> 'object'
     or jsonb_typeof(coalesce(input_prohibited_uses, '[]'::jsonb)) <> 'array'
     or jsonb_typeof(coalesce(input_allowed_media, '[]'::jsonb)) <> 'array'
     or jsonb_typeof(coalesce(input_change_summary, '[]'::jsonb)) <> 'array' then
    raise exception 'invalid market metadata shape';
  end if;

  v_minimum_price := greatest(0, coalesce(input_base_use_price_yen, 0))
    + greatest(0, coalesce(input_required_option_price_yen, 0));
  if coalesce(input_sale_price_yen, -1) < v_minimum_price then
    raise exception 'root sale price must cover required use price';
  end if;

  insert into public.market_asset_series (
    root_creator_user_id, title, derivative_sales_allowed,
    base_use_price_yen, required_option_price_yen, derivative_license_price_yen,
    inherited_terms, prohibited_uses, allowed_media
  ) values (
    v_user_id, btrim(input_title), coalesce(input_derivative_sales_allowed, false),
    greatest(0, coalesce(input_base_use_price_yen, 0)),
    greatest(0, coalesce(input_required_option_price_yen, 0)),
    greatest(0, coalesce(input_derivative_license_price_yen, 0)),
    coalesce(input_inherited_terms, '{}'::jsonb),
    coalesce(input_prohibited_uses, '[]'::jsonb),
    coalesce(input_allowed_media, '[]'::jsonb)
  ) returning id into v_series_id;

  insert into public.market_assets (
    series_id, creator_user_id, title, description, sale_price_yen,
    asset_format, change_summary
  ) values (
    v_series_id, v_user_id, btrim(input_title), coalesce(input_description, ''),
    input_sale_price_yen, coalesce(nullif(btrim(input_asset_format), ''), 'pixiedraw-project'),
    coalesce(input_change_summary, '[]'::jsonb)
  ) returning id into v_asset_id;

  update public.market_asset_series
  set root_asset_id = v_asset_id
  where id = v_series_id;

  return v_asset_id;
end;
$$;

grant execute on function public.market_create_root_asset(text, text, integer, integer, integer, integer, boolean, jsonb, jsonb, jsonb, text, jsonb) to authenticated;

create or replace function public.market_create_derivative_draft(
  input_source_asset_id uuid,
  input_derivative_license_id uuid,
  input_title text,
  input_description text,
  input_sale_price_yen integer,
  input_asset_format text default 'pixiedraw-project',
  input_change_summary jsonb default '[]'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_source public.market_assets%rowtype;
  v_series public.market_asset_series%rowtype;
  v_license public.market_derivative_licenses%rowtype;
  v_asset_id uuid;
  v_minimum_price integer;
begin
  if v_user_id is null then
    raise exception 'login required';
  end if;
  if jsonb_typeof(coalesce(input_change_summary, '[]'::jsonb)) <> 'array'
     or jsonb_array_length(coalesce(input_change_summary, '[]'::jsonb)) = 0 then
    raise exception 'a derivative requires a non-empty change summary';
  end if;

  select * into v_source from public.market_assets where id = input_source_asset_id for share;
  if not found or v_source.status <> 'published' then
    raise exception 'source asset is not available for derivation';
  end if;
  select * into v_series from public.market_asset_series where id = v_source.series_id for share;
  if not found or not v_series.derivative_sales_allowed then
    raise exception 'derivative sales are not allowed for this series';
  end if;

  select * into v_license
  from public.market_derivative_licenses
  where id = input_derivative_license_id
  for update;
  if not found
     or v_license.purchaser_user_id <> v_user_id
     or v_license.source_asset_id <> input_source_asset_id
     or v_license.status <> 'active'
     or v_license.used_by_asset_id is not null then
    raise exception 'an unused derivative license for this source asset is required';
  end if;

  v_minimum_price := ceiling(
    (v_series.base_use_price_yen + v_series.required_option_price_yen) * 1.2
  )::integer;
  if coalesce(input_sale_price_yen, -1) < v_minimum_price then
    raise exception 'derivative sale price is below the series minimum';
  end if;

  insert into public.market_assets (
    series_id, parent_asset_id, creator_user_id, title, description,
    sale_price_yen, asset_format, change_summary
  ) values (
    v_source.series_id, v_source.id, v_user_id, btrim(input_title),
    coalesce(input_description, ''), input_sale_price_yen,
    coalesce(nullif(btrim(input_asset_format), ''), 'pixiedraw-project'),
    input_change_summary
  ) returning id into v_asset_id;

  update public.market_derivative_licenses
  set status = 'used', used_by_asset_id = v_asset_id, used_at = timezone('utc', now())
  where id = v_license.id;

  return v_asset_id;
end;
$$;

grant execute on function public.market_create_derivative_draft(uuid, uuid, text, text, integer, text, jsonb) to authenticated;

create or replace function public.market_create_royalty_ledger(input_purchase_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_purchase public.market_purchases%rowtype;
begin
  select * into v_purchase from public.market_purchases where id = input_purchase_id for update;
  if not found or v_purchase.status <> 'paid' then
    raise exception 'a paid market purchase is required';
  end if;

  -- depth 0 is the current seller; each parent receives 10%, 5%, 2.5%… .
  -- Amounts are stored in micro-yen so repeated fractional royalties stay in
  -- the internal balance until payout conversion.
  with recursive lineage as (
    select id, parent_asset_id, creator_user_id, 0 as depth
    from public.market_assets where id = v_purchase.asset_id
    union all
    select parent.id, parent.parent_asset_id, parent.creator_user_id, lineage.depth + 1
    from lineage
    join public.market_assets parent on parent.id = lineage.parent_asset_id
    where lineage.depth < 60
  ), shares as (
    select creator_user_id as recipient_user_id,
      case
        when depth = 0 then 10000 - coalesce(sum(case when depth > 0 then floor(1000.0 / power(2, depth - 1))::integer else 0 end) over (), 0)
        else floor(1000.0 / power(2, depth - 1))::integer
      end as royalty_basis_points,
      depth
    from lineage
  ), combined as (
    select recipient_user_id,
      min(depth) as lineage_depth,
      sum(royalty_basis_points)::integer as royalty_basis_points
    from shares
    group by recipient_user_id
  )
  insert into public.market_royalty_ledger (
    purchase_id, asset_id, recipient_user_id, lineage_depth,
    royalty_basis_points, amount_microyen, status, available_at
  )
  select v_purchase.id, v_purchase.asset_id, recipient_user_id, lineage_depth,
    royalty_basis_points,
    v_purchase.distributable_amount_yen::bigint * royalty_basis_points::bigint * 100,
    'available', timezone('utc', now())
  from combined
  on conflict (purchase_id, recipient_user_id) do nothing;
end;
$$;

-- Called by a future verified payment webhook only; browser clients cannot
-- create a paid order or materialize balances.
revoke all on function public.market_create_royalty_ledger(uuid) from public, anon, authenticated;
