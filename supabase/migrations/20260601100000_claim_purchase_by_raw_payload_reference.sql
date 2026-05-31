create or replace function public.claim_browser_adfree_purchase_code(input_order_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_user_email text := lower(trim(coalesce(auth.jwt() ->> 'email', '')));
  v_order_ref text := upper(regexp_replace(trim(coalesce(input_order_id, '')), '\s+', '', 'g'));
  v_purchase public.browser_adfree_purchase_orders%rowtype;
  v_code_row public.user_entitlement_codes%rowtype;
begin
  if v_user_id is null then
    raise exception 'login required';
  end if;

  if v_user_email = '' then
    raise exception 'login email unavailable';
  end if;

  if v_order_ref = '' then
    raise exception 'order id is required';
  end if;

  select *
    into v_purchase
    from public.browser_adfree_purchase_orders
   where lower(trim(coalesce(buyer_email, ''))) = v_user_email
     and lower(trim(coalesce(payment_status, ''))) = any (array['paid', 'completed', 'confirmed', 'fulfilled'])
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
   limit 1;

  if not found or not coalesce(v_code_row.active, false) then
    raise exception 'code unavailable';
  end if;

  update public.browser_adfree_purchase_orders
     set claimed_at = coalesce(claimed_at, timezone('utc', now())),
         claimed_by = coalesce(claimed_by, v_user_id),
         metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
           'claimed_by_payment_reference_at', timezone('utc', now()),
           'claimed_by_payment_reference', v_order_ref
         ),
         updated_at = timezone('utc', now())
   where id = v_purchase.id;

  return jsonb_build_object(
    'ok', true,
    'code', v_purchase.code,
    'order_id', v_purchase.provider_order_id,
    'product_key', v_purchase.product_key,
    'matched_reference', v_order_ref,
    'entitlement_key', v_code_row.entitlement_key,
    'code_expires_at', v_code_row.expires_at
  );
end;
$$;

grant execute on function public.claim_browser_adfree_purchase_code(text) to authenticated;
