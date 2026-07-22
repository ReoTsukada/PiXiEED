-- v4 は古いブラウザキャッシュで無透かしのまま生成された可能性があるため、
-- 実画像へ焼き込み済みと判定するのは v5 以降だけに限定する。
create or replace function public.market_admin_replace_listing_previews_v1(
  input_asset_id uuid,
  input_preview_object_path text,
  input_sample_preview_paths text[]
)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare v_asset public.market_assets%rowtype; v_prefix text;
begin
  if not public.market_current_user_is_admin() then raise exception 'admin permission required'; end if;
  select * into v_asset from public.market_assets where id = input_asset_id and status = 'published' for update;
  if not found then raise exception 'published asset not found'; end if;
  v_prefix := v_asset.creator_user_id::text || '/' || v_asset.id::text || '/previews/global-v3/';
  if left(input_preview_object_path, char_length(v_prefix)) <> v_prefix
    or cardinality(coalesce(input_sample_preview_paths, array[]::text[])) > 6
    or exists (select 1 from unnest(coalesce(input_sample_preview_paths, array[]::text[])) path where left(path, char_length(v_prefix)) <> v_prefix) then raise exception 'invalid_preview_path'; end if;
  if not exists (select 1 from storage.objects where bucket_id = 'market-private' and name = input_preview_object_path) then raise exception 'preview_file_not_found'; end if;
  if (select count(*) from storage.objects where bucket_id = 'market-private' and name = any(coalesce(input_sample_preview_paths, array[]::text[]))) <> cardinality(coalesce(input_sample_preview_paths, array[]::text[])) then raise exception 'sample_preview_file_not_found'; end if;
  update public.market_assets set preview_object_path = input_preview_object_path,
    provenance_manifest = provenance_manifest || jsonb_build_object(
      'storage_sample_preview_paths', to_jsonb(coalesce(input_sample_preview_paths, array[]::text[])),
      'preview_selection', coalesce(provenance_manifest -> 'preview_selection', '{}'::jsonb) || jsonb_build_object(
        'public_preview_kind', 'baked-fixed-size-watermark',
        'watermark_version', 'baked-v5'
      )
    ),
    updated_at = timezone('utc', now()) where id = v_asset.id;
  insert into public.market_audit_log(actor_user_id, action, target_type, target_id, details)
  values (auth.uid(), 'admin_listing_previews_rebuilt', 'market_asset', v_asset.id::text,
    jsonb_build_object('preview_object_path', input_preview_object_path, 'sample_count', cardinality(coalesce(input_sample_preview_paths, array[]::text[])), 'watermark_version', 'baked-v5'));
end; $$;

revoke all on function public.market_admin_replace_listing_previews_v1(uuid, text, text[]) from public, anon, authenticated;
grant execute on function public.market_admin_replace_listing_previews_v1(uuid, text, text[]) to authenticated;
