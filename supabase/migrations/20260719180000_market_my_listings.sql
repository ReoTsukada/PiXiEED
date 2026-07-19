begin;

create or replace function public.market_my_listings_v1()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_result jsonb;
begin
  if v_user_id is null then
    raise exception 'authentication_required';
  end if;
  if not public.market_current_user_is_dev() then
    raise exception 'market_dev_access_required';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', asset.id,
    'title', asset.title,
    'status', asset.status,
    'sale_price_yen', asset.sale_price_yen,
    'asset_format', asset.asset_format,
    'included_formats', asset.included_formats,
    'preview_url', case
      when asset.status = 'published' and asset.preview_object_path ~ '^https://' then asset.preview_object_path
      else null
    end,
    'published_at', asset.published_at,
    'created_at', asset.created_at,
    'updated_at', asset.updated_at
  ) order by asset.created_at desc), '[]'::jsonb)
  into v_result
  from (
    select own.*
    from public.market_assets own
    where own.creator_user_id = v_user_id
    order by own.created_at desc
    limit 100
  ) asset;

  return v_result;
end;
$$;

revoke all on function public.market_my_listings_v1() from public, anon;
grant execute on function public.market_my_listings_v1() to authenticated;

commit;
