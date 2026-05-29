create or replace function public.pixieed_create_supporter_serial_code(
  input_entitlement_key text default 'pixiedraw_ad_free',
  input_duration_days integer default 31,
  input_max_redemptions integer default 1,
  input_note text default null,
  input_expires_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_entitlement_key text := lower(trim(coalesce(input_entitlement_key, 'pixiedraw_ad_free')));
  v_duration_days integer := greatest(1, least(3650, coalesce(input_duration_days, 31)));
  v_max_redemptions integer := greatest(1, coalesce(input_max_redemptions, 1));
  v_code text;
  v_attempt integer;
begin
  if v_entitlement_key not in ('browser_ad_free', 'pixiedraw_ad_free') then
    raise exception 'unsupported entitlement key';
  end if;

  for v_attempt in 1..12 loop
    v_code := 'PXA' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 16));
    begin
      insert into public.user_entitlement_codes (
        code,
        entitlement_key,
        duration_days,
        max_redemptions,
        redemption_count,
        active,
        expires_at,
        note,
        metadata
      )
      values (
        v_code,
        v_entitlement_key,
        v_duration_days,
        v_max_redemptions,
        0,
        true,
        input_expires_at,
        nullif(trim(coalesce(input_note, '')), ''),
        jsonb_build_object(
          'source', 'manual_supporter_serial',
          'issued_at', timezone('utc', now())
        )
      );

      return jsonb_build_object(
        'ok', true,
        'code', v_code,
        'entitlement_key', v_entitlement_key,
        'duration_days', v_duration_days,
        'max_redemptions', v_max_redemptions,
        'expires_at', input_expires_at
      );
    exception
      when unique_violation then
        -- Try another generated code.
        null;
    end;
  end loop;

  raise exception 'code generation failed';
end;
$$;

revoke all on function public.pixieed_create_supporter_serial_code(text, integer, integer, text, timestamptz) from public, anon, authenticated;
grant execute on function public.pixieed_create_supporter_serial_code(text, integer, integer, text, timestamptz) to service_role;
