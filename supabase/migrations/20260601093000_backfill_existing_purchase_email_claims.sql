do $$
declare
  v_purchase record;
  v_result jsonb;
  v_expires_at timestamptz;
  v_now timestamptz;
begin
  for v_purchase in
    select
      p.id,
      p.provider_order_id,
      p.buyer_email,
      p.product_key,
      p.code,
      p.metadata,
      c.entitlement_key
    from public.browser_adfree_purchase_orders p
    join public.user_entitlement_codes c
      on c.code = p.code
    where p.claimed_by is null
      and coalesce(p.code, '') <> ''
      and lower(trim(coalesce(p.buyer_email, ''))) <> ''
      and lower(trim(coalesce(p.payment_status, ''))) = any (array['paid', 'completed', 'confirmed', 'fulfilled'])
      and lower(trim(coalesce(p.product_key, ''))) in ('browser_ad_free', 'pixiedraw_ad_free', 'pixieed_support_monthly')
      and lower(trim(coalesce(c.entitlement_key, ''))) in ('browser_ad_free', 'pixiedraw_ad_free')
      and coalesce(c.active, false)
      and c.redeemed_by is null
  loop
    v_now := timezone('utc', now());
    v_expires_at := null;

    begin
      if coalesce(v_purchase.metadata ->> 'current_period_end', '') <> '' then
        v_expires_at := (v_purchase.metadata ->> 'current_period_end')::timestamptz;
      end if;
    exception when others then
      v_expires_at := null;
    end;

    v_result := public.pixieed_grant_purchase_entitlement_by_email(
      v_purchase.code,
      v_purchase.buyer_email,
      v_purchase.entitlement_key,
      v_expires_at,
      v_purchase.provider_order_id,
      coalesce(v_purchase.metadata ->> 'subscription_id', null)
    );

    if v_result ->> 'ok' = 'true' and coalesce(v_result ->> 'user_id', '') <> '' then
      update public.browser_adfree_purchase_orders
         set claimed_by = (v_result ->> 'user_id')::uuid,
             claimed_at = coalesce(claimed_at, v_now),
             metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
               'legacy_auto_claimed_by_email_at', v_now,
               'legacy_auto_claim_result', v_result
             ),
             updated_at = v_now
       where id = v_purchase.id;
    else
      update public.browser_adfree_purchase_orders
         set metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
               'legacy_auto_claim_skipped_at', v_now,
               'legacy_auto_claim_skipped_reason', coalesce(v_result ->> 'reason', 'unknown')
             ),
             updated_at = v_now
       where id = v_purchase.id;
    end if;
  end loop;
end;
$$;
