-- Free seller onboarding: confirmed account + TOTP AAL2 + contact details.
-- Phone numbers are contact information only and are never marked verified.

alter table public.market_seller_profiles
  add column if not exists legal_name text,
  add column if not exists postal_code text,
  add column if not exists address text,
  add column if not exists phone text,
  add column if not exists contact_registered_at timestamptz,
  add column if not exists mfa_confirmed_at timestamptz;

alter table public.market_seller_profiles
  add constraint market_seller_legal_name_length check (legal_name is null or char_length(legal_name) between 1 and 120),
  add constraint market_seller_postal_code_shape check (postal_code is null or postal_code ~ '^[0-9]{7}$'),
  add constraint market_seller_address_length check (address is null or char_length(address) between 4 and 300),
  add constraint market_seller_phone_shape check (phone is null or phone ~ '^[+]?[0-9]{8,15}$');

create or replace function public.market_current_session_has_mfa()
returns boolean
language sql stable
as $$ select coalesce(auth.jwt() ->> 'aal', '') = 'aal2'; $$;
revoke all on function public.market_current_session_has_mfa() from public, anon, authenticated;
grant execute on function public.market_current_session_has_mfa() to authenticated;

create or replace function public.market_submit_seller_registration(
  input_legal_name text,
  input_postal_code text,
  input_address text,
  input_phone text,
  input_terms_version text
)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_name text := nullif(btrim(input_legal_name), '');
  v_postal text := regexp_replace(coalesce(input_postal_code, ''), '[^0-9]', '', 'g');
  v_address text := nullif(btrim(input_address), '');
  v_phone text := regexp_replace(coalesce(input_phone, ''), '[^0-9+]', '', 'g');
  v_terms text := nullif(btrim(input_terms_version), '');
begin
  if not public.market_current_user_has_confirmed_identity() then
    raise exception 'confirmed non-anonymous account required';
  end if;
  if not public.market_current_session_has_mfa() then
    raise exception 'aal2 mfa session required';
  end if;
  if v_name is null or char_length(v_name) > 120 then raise exception 'valid legal name required'; end if;
  if v_postal !~ '^[0-9]{7}$' then raise exception 'valid postal code required'; end if;
  if v_address is null or char_length(v_address) not between 4 and 300 then raise exception 'valid address required'; end if;
  if v_phone !~ '^[+]?[0-9]{8,15}$' then raise exception 'valid contact phone required'; end if;
  if v_terms is null then raise exception 'terms version required'; end if;

  insert into public.market_seller_profiles (
    user_id, seller_status, identity_status, terms_version, terms_accepted_at,
    legal_name, postal_code, address, phone, contact_registered_at, mfa_confirmed_at
  ) values (
    auth.uid(), 'pending', 'unverified', v_terms, timezone('utc', now()),
    v_name, v_postal, v_address, v_phone, timezone('utc', now()), timezone('utc', now())
  )
  on conflict (user_id) do update set
    terms_version = excluded.terms_version,
    terms_accepted_at = excluded.terms_accepted_at,
    legal_name = excluded.legal_name,
    postal_code = excluded.postal_code,
    address = excluded.address,
    phone = excluded.phone,
    contact_registered_at = excluded.contact_registered_at,
    mfa_confirmed_at = excluded.mfa_confirmed_at,
    updated_at = timezone('utc', now())
  where market_seller_profiles.seller_status in ('pending', 'restricted');

  insert into public.market_audit_log(actor_user_id, action, target_type, target_id, details)
  values (auth.uid(), 'seller_registration_submitted', 'market_seller_profile', auth.uid()::text,
    jsonb_build_object('terms_version', v_terms, 'mfa', 'aal2', 'phone_verified', false));
end;
$$;
revoke all on function public.market_submit_seller_registration(text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.market_submit_seller_registration(text, text, text, text, text) to authenticated;

create or replace function public.market_current_user_can_sell()
returns boolean
language sql stable security definer set search_path = public
as $$
  select public.market_current_user_has_confirmed_identity()
    and public.market_current_session_has_mfa()
    and exists (
      select 1 from public.market_seller_profiles as seller
      where seller.user_id = auth.uid()
        and seller.seller_status = 'verified'
        and seller.identity_status = 'verified'
        and seller.terms_accepted_at is not null
        and seller.contact_registered_at is not null
        and seller.mfa_confirmed_at is not null
    );
$$;
revoke all on function public.market_current_user_can_sell() from public, anon, authenticated;
grant execute on function public.market_current_user_can_sell() to authenticated;

create or replace function public.market_update_seller_verification(
  input_user_id uuid, input_decision text, input_reason text default ''
)
returns void
language plpgsql security definer set search_path = public
as $$
declare v_seller public.market_seller_profiles%rowtype;
begin
  if not public.market_current_user_is_admin() then raise exception 'admin permission required'; end if;
  if input_decision not in ('verified', 'failed', 'restricted', 'disabled') then raise exception 'invalid seller decision'; end if;
  select * into v_seller from public.market_seller_profiles where user_id = input_user_id for update;
  if not found or v_seller.terms_accepted_at is null or v_seller.contact_registered_at is null or v_seller.mfa_confirmed_at is null then
    raise exception 'complete seller registration required';
  end if;
  update public.market_seller_profiles set
    identity_status = case when input_decision = 'verified' then 'verified' when input_decision = 'failed' then 'failed' else identity_status end,
    seller_status = case when input_decision = 'verified' then 'verified' when input_decision = 'failed' then 'pending' else input_decision end,
    verified_at = case when input_decision = 'verified' then timezone('utc', now()) else verified_at end,
    restricted_reason = case when input_decision = 'verified' then '' else left(coalesce(input_reason, ''), 1000) end,
    updated_at = timezone('utc', now())
  where user_id = input_user_id;
  insert into public.market_audit_log(actor_user_id, action, target_type, target_id, details)
  values (auth.uid(), 'seller_verification_updated', 'market_seller_profile', input_user_id::text,
    jsonb_build_object('decision', input_decision, 'reason', left(coalesce(input_reason, ''), 1000)));
end;
$$;
revoke all on function public.market_update_seller_verification(uuid, text, text) from public, anon, authenticated;
grant execute on function public.market_update_seller_verification(uuid, text, text) to authenticated;
