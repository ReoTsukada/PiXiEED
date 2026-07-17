-- Reviewer/admin console access. Verification decisions remain server-side and
-- are recorded in the immutable market audit log.

create or replace function public.market_current_user_is_admin()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.market_staff_roles
    where user_id = auth.uid() and active and role = 'admin'
  );
$$;
revoke all on function public.market_current_user_is_admin() from public, anon, authenticated;
grant execute on function public.market_current_user_is_admin() to authenticated;

drop policy if exists market_assets_read_reviewer on public.market_assets;
create policy market_assets_read_reviewer on public.market_assets
for select to authenticated using (public.market_current_user_is_reviewer());

drop policy if exists market_seller_profiles_read_reviewer on public.market_seller_profiles;
create policy market_seller_profiles_read_reviewer on public.market_seller_profiles
for select to authenticated using (public.market_current_user_is_admin());

drop policy if exists market_listing_reviews_read_reviewer on public.market_listing_reviews;
create policy market_listing_reviews_read_reviewer on public.market_listing_reviews
for select to authenticated using (public.market_current_user_is_reviewer());

drop policy if exists market_audit_log_read_admin on public.market_audit_log;
create policy market_audit_log_read_admin on public.market_audit_log
for select to authenticated using (public.market_current_user_is_admin());

drop policy if exists market_private_read_reviewer on storage.objects;
create policy market_private_read_reviewer on storage.objects
for select to authenticated
using (bucket_id = 'market-private' and public.market_current_user_is_reviewer());

create or replace function public.market_mark_file_scan(
  input_asset_id uuid,
  input_result text,
  input_note text default ''
)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_asset public.market_assets%rowtype;
begin
  if not public.market_current_user_is_reviewer() then
    raise exception 'reviewer permission required';
  end if;
  if input_result not in ('clean', 'rejected', 'error') then
    raise exception 'invalid scan result';
  end if;
  select * into v_asset from public.market_assets where id = input_asset_id for update;
  if not found or v_asset.status not in ('draft', 'review') then
    raise exception 'reviewable asset not found';
  end if;
  if v_asset.asset_object_path is null or v_asset.source_sha256 is null then
    raise exception 'source file and sha256 are required';
  end if;
  update public.market_assets
  set file_scan_status = input_result,
      status = case when input_result = 'clean' then 'review' else status end,
      updated_at = timezone('utc', now())
  where id = input_asset_id;
  insert into public.market_audit_log(actor_user_id, action, target_type, target_id, details)
  values (auth.uid(), 'listing_file_scan_recorded', 'market_asset', input_asset_id::text,
    jsonb_build_object('result', input_result, 'note', left(coalesce(input_note, ''), 1000)));
end;
$$;
revoke all on function public.market_mark_file_scan(uuid, text, text) from public, anon, authenticated;
grant execute on function public.market_mark_file_scan(uuid, text, text) to authenticated;

create or replace function public.market_update_seller_verification(
  input_user_id uuid,
  input_decision text,
  input_reason text default ''
)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not public.market_current_user_is_admin() then
    raise exception 'admin permission required';
  end if;
  if input_decision not in ('verified', 'failed', 'restricted', 'disabled') then
    raise exception 'invalid seller decision';
  end if;
  update public.market_seller_profiles
  set identity_status = case
        when input_decision = 'verified' then 'verified'
        when input_decision = 'failed' then 'failed'
        else identity_status
      end,
      seller_status = case
        when input_decision = 'verified' then 'verified'
        when input_decision = 'failed' then 'pending'
        else input_decision
      end,
      verified_at = case when input_decision = 'verified' then timezone('utc', now()) else verified_at end,
      restricted_reason = case when input_decision = 'verified' then '' else left(coalesce(input_reason, ''), 1000) end,
      updated_at = timezone('utc', now())
  where user_id = input_user_id
    and terms_accepted_at is not null;
  if not found then raise exception 'seller application not found'; end if;
  insert into public.market_audit_log(actor_user_id, action, target_type, target_id, details)
  values (auth.uid(), 'seller_verification_updated', 'market_seller_profile', input_user_id::text,
    jsonb_build_object('decision', input_decision, 'reason', left(coalesce(input_reason, ''), 1000)));
end;
$$;
revoke all on function public.market_update_seller_verification(uuid, text, text) from public, anon, authenticated;
grant execute on function public.market_update_seller_verification(uuid, text, text) to authenticated;
