create or replace function public.get_active_supporter_count()
returns jsonb
language sql
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'ok', true,
    'count', count(distinct user_id),
    'goal', 50,
    'generated_at', timezone('utc', now())
  )
  from public.user_entitlements
  where lower(trim(coalesce(entitlement_key, ''))) in ('browser_ad_free', 'pixiedraw_ad_free')
    and lower(trim(coalesce(status, ''))) = 'active'
    and revoked_at is null
    and (expires_at is null or expires_at > now());
$$;

revoke all on function public.get_active_supporter_count() from public, anon, authenticated;
grant execute on function public.get_active_supporter_count() to anon, authenticated;
