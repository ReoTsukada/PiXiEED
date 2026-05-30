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

    if lower(trim(coalesce(v_code_row.entitlement_key, ''))) not in ('browser_ad_free', 'pixiedraw_ad_free') then
      continue;
    end if;

    if not coalesce(v_code_row.active, false) then
      continue;
    end if;

    if v_code_row.expires_at is not null and v_code_row.expires_at <= v_now then
      continue;
    end if;

    v_already_redeemed_by_user := v_code_row.redeemed_by = v_user_id;
    if v_code_row.redeemed_by is not null and not v_already_redeemed_by_user then
      continue;
    end if;

    if not v_already_redeemed_by_user
       and coalesce(v_code_row.redemption_count, 0) >= coalesce(v_code_row.max_redemptions, 1) then
      continue;
    end if;

    select *
      into v_entitlement
      from public.user_entitlements
     where user_id = v_user_id
       and entitlement_key = v_code_row.entitlement_key
     for update;

    if v_code_row.expires_at is not null then
      v_next_expires_at := v_code_row.expires_at;
    elsif found and v_entitlement.revoked_at is null and v_entitlement.status = 'active' and v_entitlement.expires_at is null then
      v_next_expires_at := null;
    else
      v_next_expires_at := greatest(coalesce(v_entitlement.expires_at, v_now), v_now)
        + make_interval(days => greatest(coalesce(v_code_row.duration_days, 31), 1));
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
      v_code_row.entitlement_key,
      'active',
      'purchase_email_claim',
      v_next_expires_at,
      v_now,
      v_code_row.code,
      jsonb_build_object(
        'buyer_email', v_user_email,
        'provider', coalesce(v_purchase.provider, ''),
        'provider_order_id', coalesce(v_purchase.provider_order_id, ''),
        'product_key', coalesce(v_purchase.product_key, ''),
        'claimed_by_email_at', v_now
      ),
      null
    )
    on conflict (user_id, entitlement_key)
    do update set
      status = 'active',
      source = 'purchase_email_claim',
      expires_at = excluded.expires_at,
      granted_at = excluded.granted_at,
      redeemed_code = excluded.redeemed_code,
      metadata = coalesce(public.user_entitlements.metadata, '{}'::jsonb) || excluded.metadata,
      revoked_at = null,
      updated_at = v_now;

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
             'claimed_by_email_at', v_now
           ),
           updated_at = v_now
     where code = v_code_row.code;

    update public.browser_adfree_purchase_orders
       set claimed_at = coalesce(claimed_at, v_now),
           claimed_by = coalesce(claimed_by, v_user_id),
           metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
             'claimed_by_email_at', v_now,
             'claimed_by_email_user_id', v_user_id
           ),
           updated_at = v_now
     where id = v_purchase.id;

    return jsonb_build_object(
      'ok', true,
      'code', v_code_row.code,
      'order_id', v_purchase.provider_order_id,
      'product_key', v_purchase.product_key,
      'entitlement_key', v_code_row.entitlement_key,
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
