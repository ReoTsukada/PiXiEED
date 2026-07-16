-- Retire the former fixed-product Stripe/STORES implementation.
--
-- This migration is intentionally destructive: it removes the old purchase
-- records, redemption codes, and entitlement records.  Apply it only after
-- confirming that no historical purchaser needs access to those products.

drop function if exists public.get_active_supporter_count();
drop function if exists public.claim_browser_adfree_purchase_by_email(text);
drop function if exists public.claim_browser_adfree_purchase_code(text);
drop function if exists public.redeem_browser_adfree_code(text);
drop function if exists public.pixieed_grant_purchase_entitlement_by_email(uuid, text, text, timestamptz, text, text);
drop function if exists public.pixieed_upsert_purchase_entitlement(uuid, text, text, timestamptz, text, text, jsonb);

-- These two functions formerly read user_entitlements.  Shared projects keep
-- their current generous limits, but no longer depend on a paid entitlement.
create or replace function public.pixieed_shared_project_member_limit_for_owner(
  input_owner_user_id uuid
)
returns integer
language sql
security definer
set search_path = public
as $$
  select 4;
$$;

revoke all on function public.pixieed_shared_project_member_limit_for_owner(uuid) from public, anon, authenticated;

create or replace function public.pixieed_enforce_shared_project_limit()
returns table (
  effective_limit integer,
  owned_project_count integer,
  over_limit boolean,
  grace_active boolean,
  warned_at timestamptz,
  grace_until timestamptz,
  deleted_project_keys text[]
)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  current_count integer := 0;
begin
  if current_user_id is null then
    return;
  end if;

  select count(*) into current_count
  from public.shared_projects
  where owner_user_id = current_user_id;

  return query select 4, current_count, false, false,
    null::timestamptz, null::timestamptz, array[]::text[];
end;
$$;

revoke all on function public.pixieed_enforce_shared_project_limit() from public, anon;
grant execute on function public.pixieed_enforce_shared_project_limit() to authenticated;

drop table if exists public.browser_adfree_purchase_orders cascade;
drop table if exists public.user_entitlement_codes cascade;
drop table if exists public.user_entitlements cascade;
