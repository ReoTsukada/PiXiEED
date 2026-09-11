-- Public iGAME Player contract.
--
-- A published Game is a Market asset whose immutable package is a verified
-- Draw2 PXD containing the embedded Game module.  We deliberately reuse
-- market_assets + market_asset_revisions instead of creating a second product
-- registry: acquisition, license, revision, and Storage authority must remain
-- the same records used by the rest of the Market.

alter table public.market_assets
  add constraint market_assets_igame_product_contract_check
  check (
    provenance_manifest -> 'igame_product' is null
    or (
      jsonb_typeof(provenance_manifest -> 'igame_product') = 'object'
      and provenance_manifest #>> '{igame_product,schema}' = 'pixieed-igame-product/v1'
      and (provenance_manifest #>> '{igame_product,project_id}') ~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{0,255}$'
      and (provenance_manifest #>> '{igame_product,runtime_profile_id}') ~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{0,255}$'
      and (provenance_manifest #>> '{igame_product,runtime_version}') ~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{0,255}$'
      and provenance_manifest #>> '{igame_product,visibility}' in ('PUBLIC', 'UNLISTED')
    )
  );

comment on constraint market_assets_igame_product_contract_check on public.market_assets is
  'When present, igame_product identifies a published iGAME Player package. The Market asset and immutable revision remain the authority.';

create index if not exists market_assets_igame_product_idx
  on public.market_assets (
    ((provenance_manifest #>> '{igame_product,schema}')),
    status,
    active_revision_id
  )
  where provenance_manifest #>> '{igame_product,schema}' = 'pixieed-igame-product/v1';

-- The player bootstrap is server-only because revision manifests contain
-- private Storage paths. The Edge Function returns only a short-lived signed
-- URL plus a proof bound to the exact asset and active revision.
