-- Bootstrap the first PiXiEED market administrator without storing the
-- administrator's email address in repository history.
do $$
declare
  v_user_id uuid;
  v_match_count integer;
begin
  select count(*)
  into v_match_count
  from auth.users
  where md5(lower(btrim(email))) = '41c3496ddd732f01ec22f1dd6c405e13'
    and email_confirmed_at is not null;

  if v_match_count <> 1 then
    raise exception 'expected exactly one confirmed bootstrap administrator account';
  end if;

  select id into v_user_id
  from auth.users
  where md5(lower(btrim(email))) = '41c3496ddd732f01ec22f1dd6c405e13'
    and email_confirmed_at is not null;

  insert into public.market_staff_roles(user_id, role, active)
  values (v_user_id, 'admin', true)
  on conflict (user_id, role) do update set active = true;

  insert into public.market_audit_log(actor_user_id, action, target_type, target_id, details)
  values (
    v_user_id,
    'market_admin_bootstrapped',
    'market_staff_role',
    v_user_id::text,
    jsonb_build_object('role', 'admin')
  );
end;
$$;
