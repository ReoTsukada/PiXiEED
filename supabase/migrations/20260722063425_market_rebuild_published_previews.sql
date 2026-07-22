-- 出品者だけが、自分の保存済み元ファイルを使って公開プレビューを作り直せる。
-- 元ファイルと旧プレビューは削除せず、新しいプレビューを参照先に切り替える。
create or replace function public.market_my_listing_preview_sources_v1()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then raise exception 'authentication_required'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', asset.id,
      'title', asset.title,
      'status', asset.status,
      'preview_selection', coalesce(asset.provenance_manifest -> 'preview_selection', '{}'::jsonb),
      'files', coalesce(asset.provenance_manifest -> 'files', '[]'::jsonb),
      'storage_file_paths', coalesce(asset.provenance_manifest -> 'storage_file_paths', '[]'::jsonb)
    ) order by asset.created_at desc)
    from public.market_assets as asset
    where asset.creator_user_id = v_user_id
      and asset.status = 'published'
  ), '[]'::jsonb);
end;
$$;

create or replace function public.market_replace_my_listing_previews_v1(
  input_asset_id uuid,
  input_preview_object_path text,
  input_sample_preview_paths text[] default array[]::text[]
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_prefix text;
  v_sample_count integer := coalesce(cardinality(input_sample_preview_paths), 0);
begin
  if v_user_id is null then raise exception 'authentication_required'; end if;
  if nullif(btrim(input_preview_object_path), '') is null then raise exception 'preview_required'; end if;
  if v_sample_count > 6 then raise exception 'too_many_sample_previews'; end if;
  v_prefix := v_user_id::text || '/' || input_asset_id::text || '/previews/';
  if left(input_preview_object_path, char_length(v_prefix)) <> v_prefix
    or exists (select 1 from unnest(coalesce(input_sample_preview_paths, array[]::text[])) as path where left(path, char_length(v_prefix)) <> v_prefix) then
    raise exception 'invalid_preview_path';
  end if;
  if not exists (
    select 1 from storage.objects
    where bucket_id = 'market-private' and owner_id = v_user_id::text and name = input_preview_object_path
  ) then raise exception 'preview_file_not_found'; end if;
  if (select count(*) from storage.objects where bucket_id = 'market-private' and owner_id = v_user_id::text and name = any(coalesce(input_sample_preview_paths, array[]::text[]))) <> v_sample_count then
    raise exception 'sample_preview_file_not_found';
  end if;
  update public.market_assets
  set preview_object_path = input_preview_object_path,
      provenance_manifest = provenance_manifest || jsonb_build_object(
        'storage_sample_preview_paths', to_jsonb(coalesce(input_sample_preview_paths, array[]::text[])),
        'preview_selection', coalesce(provenance_manifest -> 'preview_selection', '{}'::jsonb) || jsonb_build_object(
          'public_preview_kind', 'fixed-size-watermarked-derivative',
          'watermark_version', 'fixed-v2'
        )
      ),
      updated_at = timezone('utc', now())
  where id = input_asset_id and creator_user_id = v_user_id and status = 'published';
  if not found then raise exception 'published_owned_listing_not_found'; end if;
  insert into public.market_audit_log(actor_user_id, action, target_type, target_id, details)
  values (v_user_id, 'listing_previews_rebuilt', 'market_asset', input_asset_id::text,
    jsonb_build_object('preview_object_path', input_preview_object_path, 'sample_preview_count', v_sample_count, 'watermark_version', 'fixed-v2'));
end;
$$;

revoke all on function public.market_my_listing_preview_sources_v1() from public, anon, authenticated;
revoke all on function public.market_replace_my_listing_previews_v1(uuid, text, text[]) from public, anon, authenticated;
grant execute on function public.market_my_listing_preview_sources_v1() to authenticated;
grant execute on function public.market_replace_my_listing_previews_v1(uuid, text, text[]) to authenticated;
