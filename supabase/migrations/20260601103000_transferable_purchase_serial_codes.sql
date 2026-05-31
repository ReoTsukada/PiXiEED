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
  v_prior_user_id uuid := null;
  v_already_redeemed_by_user boolean := false;
  v_transfer_from_auto_grant boolean := false;
  v_manual_redeemed boolean := false;
  v_base_metadata jsonb;
  v_entitlement_keys text[];
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

  v_entitlement_key := lower(trim(coalesce(v_code_row.entitlement_key, '')));
  if v_entitlement_key not in ('browser_ad_free', 'pixiedraw_ad_free') then
    raise exception 'unsupported entitlement key';
  end if;

  v_product_key := lower(trim(coalesce(v_code_row.metadata ->> 'product_key', '')));
  if v_product_key = 'pixieed_support_monthly' then
    v_linked_entitlement_key := case
      when v_entitlement_key = 'browser_ad_free' then 'pixiedraw_ad_free'
      else 'browser_ad_free'
    end;
  end if;

  v_prior_user_id := v_code_row.redeemed_by;
  v_already_redeemed_by_user := coalesce(v_prior_user_id = v_user_id, false);
  v_manual_redeemed := coalesce(v_code_row.metadata ? 'manual_redeemed_at', false);
  v_transfer_from_auto_grant := v_prior_user_id is not null
    and not v_already_redeemed_by_user
    and not v_manual_redeemed
    and (
      coalesce(v_code_row.metadata ? 'auto_granted_at', false)
      or coalesce(v_code_row.metadata ? 'claimed_by_email_at', false)
      or coalesce(v_code_row.metadata ? 'auto_entitlement_granted_at', false)
    );

  if v_prior_user_id is not null and not v_already_redeemed_by_user and not v_transfer_from_auto_grant then
    raise exception 'code already redeemed';
  end if;

  if v_prior_user_id is null
     and coalesce(v_code_row.redemption_count, 0) >= coalesce(v_code_row.max_redemptions, 1) then
    raise exception 'code already redeemed';
  end if;

  v_entitlement_keys := array[v_entitlement_key];
  if v_linked_entitlement_key <> '' then
    v_entitlement_keys := v_entitlement_keys || v_linked_entitlement_key;
  end if;

  if v_transfer_from_auto_grant then
    update public.user_entitlements
       set status = 'revoked',
           revoked_at = v_now,
           expires_at = case
             when expires_at is null or expires_at > v_now then v_now
             else expires_at
           end,
           metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
             'transferred_serial_code_to_user_id', v_user_id,
             'transferred_serial_code_at', v_now
           ),
           updated_at = v_now
     where user_id = v_prior_user_id
       and entitlement_key = any(v_entitlement_keys)
       and redeemed_code = v_code;
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

  v_base_metadata := jsonb_build_object(
    'last_redeemed_code', v_code,
    'last_redeemed_at', v_now,
    'manual_redeemed_at', coalesce(v_code_row.metadata ->> 'manual_redeemed_at', v_now::text),
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
           else greatest(coalesce(redemption_count, 0), 1)
         end,
         redeemed_by = v_user_id,
         redeemed_at = case
           when v_already_redeemed_by_user then coalesce(redeemed_at, v_now)
           else v_now
         end,
         metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
           'last_redeemed_at', v_now,
           'manual_redeemed_at', coalesce(v_code_row.metadata ->> 'manual_redeemed_at', v_now::text),
           'transferred_from_user_id', case when v_transfer_from_auto_grant then v_prior_user_id else null end,
           'transferred_at', case when v_transfer_from_auto_grant then v_now else null end,
           'linked_entitlement_key', nullif(v_linked_entitlement_key, '')
         ),
         updated_at = v_now
   where code = v_code;

  if v_transfer_from_auto_grant then
    update public.browser_adfree_purchase_orders
       set claimed_by = v_user_id,
           claimed_at = coalesce(claimed_at, v_now),
           metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
             'transferred_serial_code_to_user_id', v_user_id,
             'transferred_serial_code_at', v_now
           ),
           updated_at = v_now
     where code = v_code;
  end if;

  return jsonb_build_object(
    'ok', true,
    'entitlement_key', v_entitlement_key,
    'linked_entitlement_key', nullif(v_linked_entitlement_key, ''),
    'expires_at', v_next_expires_at,
    'redeemed_code', v_code,
    'transferred_from_auto_grant', v_transfer_from_auto_grant
  );
end;
$$;

grant execute on function public.redeem_browser_adfree_code(text) to authenticated;
