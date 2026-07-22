-- 管理者だけが全出品の元ファイルを読み取り、新規プレビューを別パスへ保存できる。
create or replace function public.market_admin_preview_rebuild_targets_v1()
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not public.market_current_user_is_admin() then raise exception 'admin permission required'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
    'id', asset.id, 'creator_user_id', asset.creator_user_id, 'title', asset.title,
    'files', coalesce(asset.provenance_manifest -> 'files', '[]'::jsonb),
    'storage_file_paths', coalesce(asset.provenance_manifest -> 'storage_file_paths', '[]'::jsonb),
    'preview_selection', coalesce(asset.provenance_manifest -> 'preview_selection', '{}'::jsonb)
  ) order by asset.created_at asc) from public.market_assets asset where asset.status = 'published'), '[]'::jsonb);
end; $$;

create or replace function public.market_admin_replace_listing_previews_v1(input_asset_id uuid, input_preview_object_path text, input_sample_preview_paths text[])
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare v_asset public.market_assets%rowtype; v_prefix text;
begin
  if not public.market_current_user_is_admin() then raise exception 'admin permission required'; end if;
  select * into v_asset from public.market_assets where id = input_asset_id and status = 'published' for update;
  if not found then raise exception 'published asset not found'; end if;
  v_prefix := v_asset.creator_user_id::text || '/' || v_asset.id::text || '/previews/global-v3/';
  if left(input_preview_object_path, char_length(v_prefix)) <> v_prefix
    or coalesce(cardinality(input_sample_preview_paths), 0) = 0
    or cardinality(input_sample_preview_paths) > 6
    or exists (select 1 from unnest(input_sample_preview_paths) path where left(path, char_length(v_prefix)) <> v_prefix) then raise exception 'invalid_preview_path'; end if;
  if not exists (select 1 from storage.objects where bucket_id = 'market-private' and name = input_preview_object_path) then raise exception 'preview_file_not_found'; end if;
  if (select count(*) from storage.objects where bucket_id = 'market-private' and name = any(input_sample_preview_paths)) <> cardinality(input_sample_preview_paths) then raise exception 'sample_preview_file_not_found'; end if;
  update public.market_assets set preview_object_path = input_preview_object_path,
    provenance_manifest = provenance_manifest || jsonb_build_object(
      'storage_sample_preview_paths', to_jsonb(input_sample_preview_paths),
      'preview_selection', coalesce(provenance_manifest -> 'preview_selection', '{}'::jsonb) || jsonb_build_object(
        'public_preview_kind', 'viewer-overlay-fixed-size-watermark',
        'watermark_version', 'viewer-overlay-v3'
      )
    ),
    updated_at = timezone('utc', now()) where id = v_asset.id;
  insert into public.market_audit_log(actor_user_id, action, target_type, target_id, details)
  values (auth.uid(), 'admin_listing_previews_rebuilt', 'market_asset', v_asset.id::text,
    jsonb_build_object('preview_object_path', input_preview_object_path, 'sample_count', cardinality(input_sample_preview_paths)));
end; $$;

drop policy if exists market_private_read_admin_preview_rebuild on storage.objects;
create policy market_private_read_admin_preview_rebuild on storage.objects for select to authenticated
using (bucket_id = 'market-private' and public.market_current_user_is_admin());
drop policy if exists market_private_insert_admin_preview_rebuild on storage.objects;
create policy market_private_insert_admin_preview_rebuild on storage.objects for insert to authenticated
with check (bucket_id = 'market-private' and name like '%/previews/global-v3/%' and public.market_current_user_is_admin());

revoke all on function public.market_admin_preview_rebuild_targets_v1() from public, anon, authenticated;
revoke all on function public.market_admin_replace_listing_previews_v1(uuid, text, text[]) from public, anon, authenticated;
grant execute on function public.market_admin_preview_rebuild_targets_v1() to authenticated;
grant execute on function public.market_admin_replace_listing_previews_v1(uuid, text, text[]) to authenticated;
