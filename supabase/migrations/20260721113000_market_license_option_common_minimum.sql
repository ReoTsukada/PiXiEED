-- Standard license options are selected as included terms, not paid add-ons.
-- Existing listings retain their snapshotted option terms; this only changes
-- the catalog used for newly created listings.
update public.market_license_options
set minimum_price_yen = 0,
    updated_at = timezone('utc', now())
where id in ('commercial-use', 'merchandise-use', 'credit-omission')
  and minimum_price_yen <> 0;

insert into public.market_audit_log(actor_user_id, action, target_type, target_id, details)
values (
  null,
  'license_option_catalog_included_terms_updated',
  'market_license_options',
  '20260721113000',
  jsonb_build_object(
    'option_ids', array['commercial-use', 'merchandise-use', 'credit-omission'],
    'minimum_price_yen', 0
  )
);
