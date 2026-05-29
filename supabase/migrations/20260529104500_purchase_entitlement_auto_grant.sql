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

  v_already_redeemed_by_user := v_code_row.redeemed_by = v_user_id;
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
    if found and v_entitlement.revoked_at is null and v_entitlement.status = 'active' and v_entitlement.expires_at is null then
      v_next_expires_at := null;
    else
      v_next_expires_at := greatest(coalesce(v_entitlement.expires_at, v_now), v_now)
        + make_interval(days => greatest(coalesce(v_code_row.duration_days, 31), 1));
    end if;
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
    'purchase_email',
    v_next_expires_at,
    v_now,
    v_code,
    jsonb_build_object(
      'buyer_email', v_email,
      'provider_order_id', coalesce(input_order_id, ''),
      'subscription_id', coalesce(input_subscription_id, ''),
      'auto_granted_at', v_now
    ),
    null
  )
  on conflict (user_id, entitlement_key)
  do update set
    status = 'active',
    source = 'purchase_email',
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
           'buyer_email', v_email,
           'provider_order_id', coalesce(input_order_id, ''),
           'subscription_id', coalesce(input_subscription_id, ''),
           'auto_granted_at', v_now
         ),
         updated_at = v_now
   where code = v_code;

  return jsonb_build_object(
    'ok', true,
    'user_id', v_user_id,
    'entitlement_key', v_entitlement_key,
    'expires_at', v_next_expires_at,
    'redeemed_code', v_code
  );
end;
$$;

revoke all on function public.pixieed_grant_purchase_entitlement_by_email(text, text, text, timestamptz, text, text) from public, anon, authenticated;
grant execute on function public.pixieed_grant_purchase_entitlement_by_email(text, text, text, timestamptz, text, text) to service_role;
