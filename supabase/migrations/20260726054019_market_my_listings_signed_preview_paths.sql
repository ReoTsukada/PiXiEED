begin;

-- The preview bucket is private. Return only the owner's object path here;
-- the authenticated browser turns it into a short-lived signed URL instead of
-- publishing a durable media URL in the listing response.
create or replace function public.market_my_listings_v1()
returns jsonb language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_result jsonb;
begin
  if v_user_id is null then raise exception 'authentication_required'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', asset.id, 'title', asset.title, 'status', asset.status,
    'sale_price_yen', asset.sale_price_yen, 'asset_format', asset.asset_format,
    'included_formats', asset.included_formats, 'withdrawn_at', asset.withdrawn_at,
    'preview_object_path', asset.preview_object_path,
    'published_at', asset.published_at, 'created_at', asset.created_at,
    'updated_at', asset.updated_at
  ) order by asset.created_at desc), '[]'::jsonb) into v_result
  from (select own.* from public.market_assets own
    where own.creator_user_id = v_user_id order by own.created_at desc limit 100) asset;
  return v_result;
end;
$$;

revoke all on function public.market_my_listings_v1() from public, anon;
grant execute on function public.market_my_listings_v1() to authenticated;

commit;
