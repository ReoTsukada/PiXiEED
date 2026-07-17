-- Private upload and seller-application boundary for the first market release.
-- Files remain private until a reviewer has completed an external scan and
-- explicitly marks the listing clean before approval.

insert into storage.buckets (id, name, public)
values ('market-private', 'market-private', false)
on conflict (id) do update set public = false;

drop policy if exists market_private_upload_own on storage.objects;
create policy market_private_upload_own
on storage.objects for insert to authenticated
with check (
  bucket_id = 'market-private'
  and owner_id = auth.uid()::text
  and public.market_current_user_can_sell()
  and name like (auth.uid()::text || '/%')
);

drop policy if exists market_private_read_own on storage.objects;
create policy market_private_read_own
on storage.objects for select to authenticated
using (bucket_id = 'market-private' and owner_id = auth.uid()::text);

drop policy if exists market_private_delete_own on storage.objects;
create policy market_private_delete_own
on storage.objects for delete to authenticated
using (bucket_id = 'market-private' and owner_id = auth.uid()::text);

create or replace function public.market_request_seller_verification(input_terms_version text)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not public.market_current_user_has_confirmed_identity() then
    raise exception 'confirmed non-anonymous account required';
  end if;
  if nullif(btrim(input_terms_version), '') is null then
    raise exception 'terms version required';
  end if;
  insert into public.market_seller_profiles (user_id, seller_status, identity_status, terms_version, terms_accepted_at)
  values (auth.uid(), 'pending', 'unverified', btrim(input_terms_version), timezone('utc', now()))
  on conflict (user_id) do update set
    terms_version = excluded.terms_version,
    terms_accepted_at = excluded.terms_accepted_at,
    updated_at = timezone('utc', now())
  where market_seller_profiles.seller_status in ('pending', 'restricted');
  insert into public.market_audit_log(actor_user_id, action, target_type, target_id, details)
  values (auth.uid(), 'seller_verification_requested', 'market_seller_profile', auth.uid()::text,
    jsonb_build_object('terms_version', btrim(input_terms_version)));
end;
$$;
grant execute on function public.market_request_seller_verification(text) to authenticated;

create or replace function public.market_attach_listing_files(
  input_asset_id uuid,
  input_asset_object_path text,
  input_preview_object_path text default null
)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  required_prefix text := auth.uid()::text || '/' || input_asset_id::text || '/';
begin
  if not public.market_current_user_can_sell() then
    raise exception 'verified seller account required';
  end if;
  if nullif(btrim(input_asset_object_path), '') is null
     or left(input_asset_object_path, char_length(required_prefix)) <> required_prefix then
    raise exception 'invalid private asset path';
  end if;
  if input_preview_object_path is not null
     and left(input_preview_object_path, char_length(required_prefix)) <> required_prefix then
    raise exception 'invalid private preview path';
  end if;
  if not exists (
    select 1 from storage.objects
    where bucket_id = 'market-private' and name = input_asset_object_path and owner_id = auth.uid()::text
  ) then
    raise exception 'uploaded source file not found';
  end if;
  update public.market_assets
  set asset_object_path = input_asset_object_path,
      preview_object_path = input_preview_object_path,
      updated_at = timezone('utc', now())
  where id = input_asset_id and creator_user_id = auth.uid() and status = 'draft';
  if not found then raise exception 'editable draft not found'; end if;
  insert into public.market_audit_log(actor_user_id, action, target_type, target_id)
  values (auth.uid(), 'listing_files_attached', 'market_asset', input_asset_id::text);
end;
$$;
grant execute on function public.market_attach_listing_files(uuid, text, text) to authenticated;
