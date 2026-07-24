-- A completed seller registration is approved immediately. TOTP protects the
-- initial submission, but already approved sellers must not re-authenticate
-- merely to view their payout next step.

create or replace function public.market_submit_seller_registration(
  input_legal_name text,
  input_postal_code text,
  input_address text,
  input_phone text,
  input_terms_version text
)
returns void
language plpgsql security definer set search_path = ''
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
    raise exception 'aal2 mfa session required for initial seller registration';
  end if;
  if v_name is null or char_length(v_name) > 120 then raise exception 'valid legal name required'; end if;
  if v_postal !~ '^[0-9]{7}$' then raise exception 'valid postal code required'; end if;
  if v_address is null or char_length(v_address) not between 4 and 300 then raise exception 'valid address required'; end if;
  if v_phone !~ '^[+]?[0-9]{8,15}$' then raise exception 'valid contact phone required'; end if;
  if v_terms is null then raise exception 'terms version required'; end if;

  insert into public.market_seller_profiles (
    user_id, seller_status, identity_status, terms_version, terms_accepted_at,
    legal_name, postal_code, address, phone, contact_registered_at, mfa_confirmed_at,
    verified_at, restricted_reason
  ) values (
    auth.uid(), 'verified', 'verified', v_terms, timezone('utc', now()),
    v_name, v_postal, v_address, v_phone, timezone('utc', now()), timezone('utc', now()),
    timezone('utc', now()), ''
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
    seller_status = 'verified',
    identity_status = 'verified',
    verified_at = timezone('utc', now()),
    restricted_reason = '',
    updated_at = timezone('utc', now())
  where market_seller_profiles.seller_status in ('pending', 'restricted');

  if not found then
    raise exception 'seller profile cannot be updated while disabled';
  end if;

  insert into public.market_audit_log(actor_user_id, action, target_type, target_id, details)
  values (auth.uid(), 'seller_registration_auto_approved', 'market_seller_profile', auth.uid()::text,
    jsonb_build_object('terms_version', v_terms, 'mfa', 'aal2', 'phone_verified', false));
end;
$$;
revoke all on function public.market_submit_seller_registration(text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.market_submit_seller_registration(text, text, text, text, text) to authenticated;
