create or replace function public.claim_browser_adfree_purchase_code(input_order_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_order_ref text := upper(regexp_replace(trim(coalesce(input_order_id, '')), '\s+', '', 'g'));
  v_now timestamptz := timezone('utc', now());
  v_purchase public.browser_adfree_purchase_orders%rowtype;
  v_code_row public.user_entitlement_codes%rowtype;
  v_already_claimed_by_user boolean := false;
  v_code_already_redeemed_by_user boolean := false;
  v_transfer_from_auto_grant boolean := false;
begin
  if v_user_id is null then
    raise exception 'login required';
  end if;

  if v_order_ref = '' then
    raise exception 'order id is required';
  end if;

  select *
    into v_purchase
    from public.browser_adfree_purchase_orders
   where lower(trim(coalesce(payment_status, ''))) = any (array['paid', 'completed', 'confirmed', 'fulfilled'])
     and lower(trim(coalesce(product_key, ''))) in ('browser_ad_free', 'pixiedraw_ad_free', 'pixieed_support_monthly')
     and (
       upper(regexp_replace(coalesce(provider_order_id, ''), '\s+', '', 'g')) = v_order_ref
       or upper(regexp_replace(coalesce(metadata ->> 'payment_intent_id', ''), '\s+', '', 'g')) = v_order_ref
       or upper(regexp_replace(coalesce(metadata ->> 'subscription_id', ''), '\s+', '', 'g')) = v_order_ref
       or upper(coalesce(metadata::text, '')) like '%' || v_order_ref || '%'
       or upper(coalesce(raw_payload::text, '')) like '%' || v_order_ref || '%'
     )
   order by issued_at desc nulls last, created_at desc
   limit 1
   for update;

  if not found or coalesce(v_purchase.code, '') = '' then
    raise exception 'purchase not found';
  end if;

  select *
    into v_code_row
    from public.user_entitlement_codes
   where code = v_purchase.code
   for update;

  if not found or not coalesce(v_code_row.active, false) then
    raise exception 'code unavailable';
  end if;

  if v_code_row.expires_at is not null and v_code_row.expires_at <= v_now then
    raise exception 'code expired';
  end if;

  v_already_claimed_by_user := coalesce(v_purchase.claimed_by = v_user_id, false);
  v_code_already_redeemed_by_user := coalesce(v_code_row.redeemed_by = v_user_id, false);
  v_transfer_from_auto_grant := v_code_row.redeemed_by is not null
    and not v_code_already_redeemed_by_user
    and not coalesce(v_code_row.metadata ? 'manual_redeemed_at', false)
    and (
      coalesce(v_code_row.metadata ? 'auto_granted_at', false)
      or coalesce(v_code_row.metadata ? 'claimed_by_email_at', false)
      or coalesce(v_code_row.metadata ? 'auto_entitlement_granted_at', false)
    );

  if v_purchase.claimed_by is not null and not v_already_claimed_by_user and not v_transfer_from_auto_grant then
    raise exception 'purchase already claimed';
  end if;

  if v_code_row.redeemed_by is not null
     and not v_code_already_redeemed_by_user
     and not v_transfer_from_auto_grant then
    raise exception 'code already redeemed';
  end if;

  if v_code_row.redeemed_by is null
     and coalesce(v_code_row.redemption_count, 0) >= coalesce(v_code_row.max_redemptions, 1) then
    raise exception 'code already redeemed';
  end if;

  update public.browser_adfree_purchase_orders
     set claimed_at = coalesce(claimed_at, v_now),
         claimed_by = coalesce(claimed_by, v_user_id),
         metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
           'claimed_by_payment_reference_at', v_now,
           'claimed_by_payment_reference', v_order_ref,
           'claimed_without_email_match_at', v_now,
           'claimed_without_email_match_user_id', v_user_id
         ),
         updated_at = v_now
   where id = v_purchase.id;

  return jsonb_build_object(
    'ok', true,
    'code', v_purchase.code,
    'order_id', v_purchase.provider_order_id,
    'product_key', v_purchase.product_key,
    'matched_reference', v_order_ref,
    'entitlement_key', v_code_row.entitlement_key,
    'code_expires_at', v_code_row.expires_at,
    'email_match_required', false
  );
end;
$$;

grant execute on function public.claim_browser_adfree_purchase_code(text) to authenticated;
