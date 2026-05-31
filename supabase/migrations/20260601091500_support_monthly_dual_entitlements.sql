create or replace function public.pixieed_upsert_purchase_entitlement(
  input_user_id uuid,
  input_entitlement_key text,
  input_source text,
  input_expires_at timestamptz,
  input_granted_at timestamptz,
  input_redeemed_code text,
  input_metadata jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := input_user_id;
  v_entitlement_key text := lower(trim(coalesce(input_entitlement_key, '')));
  v_source text := trim(coalesce(input_source, 'purchase_email'));
  v_granted_at timestamptz := coalesce(input_granted_at, timezone('utc', now()));
  v_code text := regexp_replace(upper(trim(coalesce(input_redeemed_code, ''))), '[^A-Z0-9]', '', 'g');
  v_metadata jsonb := coalesce(input_metadata, '{}'::jsonb);
begin
  if v_user_id is null then
    raise exception 'user id is required';
  end if;

  if v_entitlement_key not in ('browser_ad_free', 'pixiedraw_ad_free') then
    raise exception 'unsupported entitlement key';
  end if;

  insert into public.user_entitlements (
    user_id,
    entitlement_key,
    status,
    source,
    expires_at,
    granted_at,
    redeemed_code,
    metadata,
    revoked_at
  )
  values (
    v_user_id,
    v_entitlement_key,
    'active',
    v_source,
    input_expires_at,
    v_granted_at,
    v_code,
    v_metadata,
    null
  )
  on conflict (user_id, entitlement_key)
  do update set
    status = 'active',
    source = excluded.source,
    expires_at = excluded.expires_at,
    granted_at = excluded.granted_at,
    redeemed_code = excluded.redeemed_code,
    metadata = coalesce(public.user_entitlements.metadata, '{}'::jsonb) || excluded.metadata,
    revoked_at = null,
    updated_at = v_granted_at;
end;
$$;

revoke all on function public.pixieed_upsert_purchase_entitlement(uuid, text, text, timestamptz, timestamptz, text, jsonb) from public, anon, authenticated;

create or replace function public.pixieed_grant_purchase_entitlement_by_email(
  input_code text,
  input_buyer_email text,
  input_entitlement_key text,
  input_expires_at timestamptz default null,
  input_order_id text default null,
  input_subscription_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text := regexp_replace(upper(trim(coalesce(input_code, ''))), '[^A-Z0-9]', '', 'g');
  v_email text := lower(trim(coalesce(input_buyer_email, '')));
  v_entitlement_key text := lower(trim(coalesce(input_entitlement_key, '')));
  v_now timestamptz := timezone('utc', now());
  v_user_id uuid;
  v_code_row public.user_entitlement_codes%rowtype;
  v_entitlement public.user_entitlements%rowtype;
  v_next_expires_at timestamptz := input_expires_at;
  v_reserved_email text := '';
  v_already_redeemed_by_user boolean := false;
  v_product_key text := '';
  v_linked_entitlement_key text := '';
  v_base_metadata jsonb;
begin
  if v_code = '' then
    return jsonb_build_object('ok', false, 'reason', 'code_required');
  end if;

  if v_email = '' then
    return jsonb_build_object('ok', false, 'reason', 'buyer_email_required');
  end if;

  if v_entitlement_key not in ('browser_ad_free', 'pixiedraw_ad_free') then
    return jsonb_build_object('ok', false, 'reason', 'unsupported_entitlement');
  end if;

  select id
    into v_user_id
    from auth.users
   where lower(trim(coalesce(email, ''))) = v_email
   order by created_at desc
   limit 1;

  if v_user_id is null then
    return jsonb_build_object('ok', false, 'reason', 'user_not_found');
  end if;

  select *
    into v_code_row
    from public.user_entitlement_codes
   where code = v_code
   for update;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'code_not_found');
  end if;

  if lower(trim(coalesce(v_code_row.entitlement_key, ''))) <> v_entitlement_key then
    return jsonb_build_object('ok', false, 'reason', 'entitlement_mismatch');
  end if;

  v_reserved_email := lower(trim(coalesce(v_code_row.metadata ->> 'buyer_email', '')));
  if v_reserved_email <> '' and v_reserved_email <> v_email then
    return jsonb_build_object('ok', false, 'reason', 'purchase_email_mismatch');
  end if;

  if v_code_row.expires_at is not null and v_code_row.expires_at <= v_now then
    return jsonb_build_object('ok', false, 'reason', 'code_expired');
  end if;

  v_already_redeemed_by_user := coalesce(v_code_row.redeemed_by = v_user_id, false);
  if v_code_row.redeemed_by is not null and not v_already_redeemed_by_user then
    return jsonb_build_object('ok', false, 'reason', 'code_redeemed_by_other_user');
  end if;

  if not v_already_redeemed_by_user
     and coalesce(v_code_row.redemption_count, 0) >= coalesce(v_code_row.max_redemptions, 1) then
    return jsonb_build_object('ok', false, 'reason', 'code_already_redeemed');
  end if;

  select *
    into v_entitlement
    from public.user_entitlements
   where user_id = v_user_id
     and entitlement_key = v_entitlement_key
   for update;

  if v_next_expires_at is null then
    if v_already_redeemed_by_user and found then
      v_next_expires_at := v_entitlement.expires_at;
    elsif found and v_entitlement.revoked_at is null and v_entitlement.status = 'active' and v_entitlement.expires_at is null then
      v_next_expires_at := null;
    else
      v_next_expires_at := greatest(coalesce(v_entitlement.expires_at, v_now), v_now)
        + make_interval(days => greatest(coalesce(v_code_row.duration_days, 31), 1));
    end if;
  end if;

  v_product_key := lower(trim(coalesce(v_code_row.metadata ->> 'product_key', '')));
  if v_product_key = '' and trim(coalesce(input_order_id, '')) <> '' then
    select lower(trim(coalesce(product_key, '')))
      into v_product_key
      from public.browser_adfree_purchase_orders
     where code = v_code
       and upper(regexp_replace(coalesce(provider_order_id, ''), '\s+', '', 'g')) = upper(regexp_replace(coalesce(input_order_id, ''), '\s+', '', 'g'))
     order by issued_at desc nulls last, created_at desc
     limit 1;
    v_product_key := lower(trim(coalesce(v_product_key, '')));
  end if;
  if v_product_key = 'pixieed_support_monthly' then
    v_linked_entitlement_key := case
      when v_entitlement_key = 'browser_ad_free' then 'pixiedraw_ad_free'
      else 'browser_ad_free'
    end;
  end if;

  v_base_metadata := jsonb_build_object(
    'buyer_email', v_email,
    'provider_order_id', coalesce(input_order_id, ''),
    'subscription_id', coalesce(input_subscription_id, ''),
    'product_key', v_product_key,
    'auto_granted_at', v_now
  );

  perform public.pixieed_upsert_purchase_entitlement(
    v_user_id,
    v_entitlement_key,
    'purchase_email',
    v_next_expires_at,
    v_now,
    v_code,
    v_base_metadata
  );

  if v_linked_entitlement_key <> '' then
    perform public.pixieed_upsert_purchase_entitlement(
      v_user_id,
      v_linked_entitlement_key,
      'purchase_email',
      v_next_expires_at,
      v_now,
      v_code,
      v_base_metadata || jsonb_build_object(
        'linked_primary_entitlement_key', v_entitlement_key,
        'supplemental_for_product_key', 'pixieed_support_monthly'
      )
    );
  end if;

  update public.user_entitlement_codes
     set redemption_count = case
           when v_already_redeemed_by_user then coalesce(redemption_count, 0)
           else coalesce(redemption_count, 0) + 1
         end,
         redeemed_by = coalesce(redeemed_by, v_user_id),
         redeemed_at = coalesce(redeemed_at, v_now),
         metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
           'buyer_email', v_email,
           'provider_order_id', coalesce(input_order_id, ''),
           'subscription_id', coalesce(input_subscription_id, ''),
           'auto_granted_at', v_now,
           'linked_entitlement_key', nullif(v_linked_entitlement_key, '')
         ),
         updated_at = v_now
   where code = v_code;

  return jsonb_build_object(
    'ok', true,
    'user_id', v_user_id,
    'entitlement_key', v_entitlement_key,
    'linked_entitlement_key', nullif(v_linked_entitlement_key, ''),
    'expires_at', v_next_expires_at,
    'redeemed_code', v_code
  );
end;
$$;

revoke all on function public.pixieed_grant_purchase_entitlement_by_email(text, text, text, timestamptz, text, text) from public, anon, authenticated;
grant execute on function public.pixieed_grant_purchase_entitlement_by_email(text, text, text, timestamptz, text, text) to service_role;

create or replace function public.claim_browser_adfree_purchase_by_email(
  input_product_key text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_user_email text := lower(trim(coalesce(auth.jwt() ->> 'email', '')));
  v_product_key text := lower(trim(coalesce(input_product_key, '')));
  v_now timestamptz := timezone('utc', now());
  v_purchase public.browser_adfree_purchase_orders%rowtype;
  v_code_row public.user_entitlement_codes%rowtype;
  v_entitlement public.user_entitlements%rowtype;
  v_next_expires_at timestamptz;
  v_already_redeemed_by_user boolean;
  v_purchase_product_key text := '';
  v_entitlement_key text := '';
  v_linked_entitlement_key text := '';
  v_base_metadata jsonb;
begin
  if v_user_id is null then
    raise exception 'login required';
  end if;

  if v_user_email = '' then
    raise exception 'login email unavailable';
  end if;

  if v_product_key <> '' and v_product_key not in ('browser_ad_free', 'pixiedraw_ad_free', 'pixieed_support_monthly') then
    raise exception 'unsupported product key';
  end if;

  for v_purchase in
    select *
      from public.browser_adfree_purchase_orders
     where lower(trim(coalesce(buyer_email, ''))) = v_user_email
       and lower(trim(coalesce(payment_status, ''))) = any (array['paid', 'completed', 'confirmed', 'fulfilled'])
       and coalesce(code, '') <> ''
       and (
         v_product_key = ''
         or product_key = v_product_key
         or (v_product_key = 'browser_ad_free' and product_key = 'pixieed_support_monthly')
         or (v_product_key = 'pixieed_support_monthly' and product_key = 'browser_ad_free')
       )
       and (claimed_by is null or claimed_by = v_user_id)
     order by issued_at desc nulls last, created_at desc
     limit 12
  loop
    select *
      into v_code_row
      from public.user_entitlement_codes
     where code = v_purchase.code
     for update;

    if not found then
      continue;
    end if;

    v_entitlement_key := lower(trim(coalesce(v_code_row.entitlement_key, '')));
    if v_entitlement_key not in ('browser_ad_free', 'pixiedraw_ad_free') then
      continue;
    end if;

    if not coalesce(v_code_row.active, false) then
      continue;
    end if;

    if v_code_row.expires_at is not null and v_code_row.expires_at <= v_now then
      continue;
    end if;

    v_already_redeemed_by_user := coalesce(v_code_row.redeemed_by = v_user_id, false);
    if v_code_row.redeemed_by is not null and not v_already_redeemed_by_user then
      continue;
    end if;

    if not v_already_redeemed_by_user
       and coalesce(v_code_row.redemption_count, 0) >= coalesce(v_code_row.max_redemptions, 1) then
      continue;
    end if;

    v_next_expires_at := null;

    select *
      into v_entitlement
      from public.user_entitlements
     where user_id = v_user_id
       and entitlement_key = v_entitlement_key
     for update;

    if v_code_row.expires_at is not null then
      v_next_expires_at := v_code_row.expires_at;
    elsif v_already_redeemed_by_user and found then
      v_next_expires_at := v_entitlement.expires_at;
    elsif found and v_entitlement.revoked_at is null and v_entitlement.status = 'active' and v_entitlement.expires_at is null then
      v_next_expires_at := null;
    else
      v_next_expires_at := greatest(coalesce(v_entitlement.expires_at, v_now), v_now)
        + make_interval(days => greatest(coalesce(v_code_row.duration_days, 31), 1));
    end if;

    v_purchase_product_key := lower(trim(coalesce(v_purchase.product_key, '')));
    v_linked_entitlement_key := '';
    if v_purchase_product_key = 'pixieed_support_monthly' then
      v_linked_entitlement_key := case
        when v_entitlement_key = 'browser_ad_free' then 'pixiedraw_ad_free'
        else 'browser_ad_free'
      end;
    end if;

    v_base_metadata := jsonb_build_object(
      'buyer_email', v_user_email,
      'provider', coalesce(v_purchase.provider, ''),
      'provider_order_id', coalesce(v_purchase.provider_order_id, ''),
      'product_key', coalesce(v_purchase.product_key, ''),
      'claimed_by_email_at', v_now
    );

    perform public.pixieed_upsert_purchase_entitlement(
      v_user_id,
      v_entitlement_key,
      'purchase_email_claim',
      v_next_expires_at,
      v_now,
      v_code_row.code,
      v_base_metadata
    );

    if v_linked_entitlement_key <> '' then
      perform public.pixieed_upsert_purchase_entitlement(
        v_user_id,
        v_linked_entitlement_key,
        'purchase_email_claim',
        v_next_expires_at,
        v_now,
        v_code_row.code,
        v_base_metadata || jsonb_build_object(
          'linked_primary_entitlement_key', v_entitlement_key,
          'supplemental_for_product_key', 'pixieed_support_monthly'
        )
      );
    end if;

    update public.user_entitlement_codes
       set redemption_count = case
             when v_already_redeemed_by_user then coalesce(redemption_count, 0)
             else coalesce(redemption_count, 0) + 1
           end,
           redeemed_by = coalesce(redeemed_by, v_user_id),
           redeemed_at = coalesce(redeemed_at, v_now),
           metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
             'buyer_email', v_user_email,
             'provider_order_id', coalesce(v_purchase.provider_order_id, ''),
             'product_key', coalesce(v_purchase.product_key, ''),
             'claimed_by_email_at', v_now,
             'linked_entitlement_key', nullif(v_linked_entitlement_key, '')
           ),
           updated_at = v_now
     where code = v_code_row.code;

    update public.browser_adfree_purchase_orders
       set claimed_at = coalesce(claimed_at, v_now),
           claimed_by = coalesce(claimed_by, v_user_id),
           metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
             'claimed_by_email_at', v_now,
             'claimed_by_email_user_id', v_user_id,
             'linked_entitlement_key', nullif(v_linked_entitlement_key, '')
           ),
           updated_at = v_now
     where id = v_purchase.id;

    return jsonb_build_object(
      'ok', true,
      'code', v_code_row.code,
      'order_id', v_purchase.provider_order_id,
      'product_key', v_purchase.product_key,
      'entitlement_key', v_entitlement_key,
      'linked_entitlement_key', nullif(v_linked_entitlement_key, ''),
      'expires_at', v_next_expires_at
    );
  end loop;

  return jsonb_build_object(
    'ok', false,
    'reason', 'purchase_not_found_for_login_email'
  );
end;
$$;

revoke all on function public.claim_browser_adfree_purchase_by_email(text) from public, anon;
grant execute on function public.claim_browser_adfree_purchase_by_email(text) to authenticated;

create or replace function public.redeem_browser_adfree_code(input_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_code text := regexp_replace(upper(trim(coalesce(input_code, ''))), '[^A-Z0-9]', '', 'g');
  v_now timestamptz := timezone('utc', now());
  v_code_row public.user_entitlement_codes%rowtype;
  v_entitlement public.user_entitlements%rowtype;
  v_next_expires_at timestamptz := null;
  v_entitlement_key text := '';
  v_product_key text := '';
  v_linked_entitlement_key text := '';
  v_already_redeemed_by_user boolean := false;
  v_base_metadata jsonb;
begin
  if v_user_id is null then
    raise exception 'login required';
  end if;

  if v_code = '' then
    raise exception 'code is required';
  end if;

  select *
    into v_code_row
    from public.user_entitlement_codes
   where code = v_code
   for update;

  if not found then
    raise exception 'code not found';
  end if;

  if not coalesce(v_code_row.active, false) then
    raise exception 'code inactive';
  end if;

  if v_code_row.expires_at is not null and v_code_row.expires_at <= v_now then
    raise exception 'code expired';
  end if;

  v_already_redeemed_by_user := coalesce(v_code_row.redeemed_by = v_user_id, false);
  if v_code_row.redeemed_by is not null and not v_already_redeemed_by_user then
    raise exception 'code already redeemed';
  end if;

  if not v_already_redeemed_by_user
     and coalesce(v_code_row.redemption_count, 0) >= coalesce(v_code_row.max_redemptions, 1) then
    raise exception 'code already redeemed';
  end if;

  v_entitlement_key := lower(trim(coalesce(v_code_row.entitlement_key, '')));
  if v_entitlement_key not in ('browser_ad_free', 'pixiedraw_ad_free') then
    raise exception 'unsupported entitlement key';
  end if;

  select *
    into v_entitlement
    from public.user_entitlements
   where user_id = v_user_id
     and entitlement_key = v_entitlement_key
   for update;

  if v_already_redeemed_by_user and found then
    v_next_expires_at := v_entitlement.expires_at;
  elsif found and v_entitlement.revoked_at is null and v_entitlement.status = 'active' and v_entitlement.expires_at is null then
    v_next_expires_at := null;
  else
    v_next_expires_at := greatest(coalesce(v_entitlement.expires_at, v_now), v_now)
      + make_interval(days => greatest(coalesce(v_code_row.duration_days, 31), 1));
  end if;

  v_product_key := lower(trim(coalesce(v_code_row.metadata ->> 'product_key', '')));
  if v_product_key = 'pixieed_support_monthly' then
    v_linked_entitlement_key := case
      when v_entitlement_key = 'browser_ad_free' then 'pixiedraw_ad_free'
      else 'browser_ad_free'
    end;
  end if;

  v_base_metadata := jsonb_build_object(
    'last_redeemed_code', v_code,
    'last_redeemed_at', v_now,
    'product_key', v_product_key
  );

  perform public.pixieed_upsert_purchase_entitlement(
    v_user_id,
    v_entitlement_key,
    'code',
    v_next_expires_at,
    v_now,
    v_code,
    v_base_metadata
  );

  if v_linked_entitlement_key <> '' then
    perform public.pixieed_upsert_purchase_entitlement(
      v_user_id,
      v_linked_entitlement_key,
      'code',
      v_next_expires_at,
      v_now,
      v_code,
      v_base_metadata || jsonb_build_object(
        'linked_primary_entitlement_key', v_entitlement_key,
        'supplemental_for_product_key', 'pixieed_support_monthly'
      )
    );
  end if;

  update public.user_entitlement_codes
     set redemption_count = case
           when v_already_redeemed_by_user then coalesce(redemption_count, 0)
           else coalesce(redemption_count, 0) + 1
         end,
         redeemed_by = coalesce(redeemed_by, v_user_id),
         redeemed_at = coalesce(redeemed_at, v_now),
         metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
           'last_redeemed_at', v_now,
           'linked_entitlement_key', nullif(v_linked_entitlement_key, '')
         ),
         updated_at = v_now
   where code = v_code;

  return jsonb_build_object(
    'ok', true,
    'entitlement_key', v_entitlement_key,
    'linked_entitlement_key', nullif(v_linked_entitlement_key, ''),
    'expires_at', v_next_expires_at,
    'redeemed_code', v_code
  );
end;
$$;

grant execute on function public.redeem_browser_adfree_code(text) to authenticated;

with now_row as (
  select timezone('utc', now()) as now_utc
),
support_claims as (
  select
    p.claimed_by as user_id,
    case lower(trim(coalesce(c.entitlement_key, '')))
      when 'browser_ad_free' then 'pixiedraw_ad_free'
      else 'browser_ad_free'
    end as linked_entitlement_key,
    lower(trim(coalesce(c.entitlement_key, ''))) as primary_entitlement_key,
    c.code,
    coalesce(p.provider_order_id, '') as provider_order_id,
    coalesce(p.buyer_email, '') as buyer_email,
    coalesce(p.product_key, '') as product_key,
    case
      when primary_ent.user_id is not null then primary_ent.expires_at
      when c.expires_at is not null then c.expires_at
      else now_row.now_utc + make_interval(days => greatest(coalesce(c.duration_days, 31), 1))
    end as expires_at,
    now_row.now_utc
  from public.browser_adfree_purchase_orders p
  join public.user_entitlement_codes c
    on c.code = p.code
  cross join now_row
  left join public.user_entitlements primary_ent
    on primary_ent.user_id = p.claimed_by
   and primary_ent.entitlement_key = lower(trim(coalesce(c.entitlement_key, '')))
  where lower(trim(coalesce(p.product_key, ''))) = 'pixieed_support_monthly'
    and p.claimed_by is not null
    and lower(trim(coalesce(p.payment_status, ''))) = any (array['paid', 'completed', 'confirmed', 'fulfilled'])
    and lower(trim(coalesce(c.entitlement_key, ''))) in ('browser_ad_free', 'pixiedraw_ad_free')
    and coalesce(c.active, false)
    and (c.expires_at is null or c.expires_at > now_row.now_utc)
    and (
      primary_ent.user_id is null
      or (
        coalesce(primary_ent.status, 'active') = 'active'
        and primary_ent.revoked_at is null
        and (primary_ent.expires_at is null or primary_ent.expires_at > now_row.now_utc)
      )
    )
)
insert into public.user_entitlements (
  user_id,
  entitlement_key,
  status,
  source,
  expires_at,
  granted_at,
  redeemed_code,
  metadata,
  revoked_at
)
select
  user_id,
  linked_entitlement_key,
  'active',
  'purchase_email_claim',
  expires_at,
  now_utc,
  code,
  jsonb_build_object(
    'buyer_email', buyer_email,
    'provider_order_id', provider_order_id,
    'product_key', product_key,
    'linked_primary_entitlement_key', primary_entitlement_key,
    'supplemental_for_product_key', 'pixieed_support_monthly',
    'backfilled_at', now_utc
  ),
  null
from support_claims
on conflict (user_id, entitlement_key)
do update set
  status = 'active',
  source = excluded.source,
  expires_at = case
    when public.user_entitlements.expires_at is null or excluded.expires_at is null then null
    else greatest(public.user_entitlements.expires_at, excluded.expires_at)
  end,
  granted_at = greatest(public.user_entitlements.granted_at, excluded.granted_at),
  redeemed_code = excluded.redeemed_code,
  metadata = coalesce(public.user_entitlements.metadata, '{}'::jsonb) || excluded.metadata,
  revoked_at = null,
  updated_at = excluded.granted_at;
