-- プロフィール保存前の既存出品も、現在の公開名へ一括同期する。
-- 同じ名前を再保存した場合も、未同期の出品だけを修復できるようにする。
create or replace function public.market_sync_creator_display_name_from_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_display_name text := coalesce(nullif(left(btrim(new.nickname), 40), ''), 'PiXiEEDクリエイター');
  v_should_sync boolean := false;
begin
  if tg_op = 'INSERT' then
    v_should_sync := true;
  elsif new.nickname is distinct from old.nickname then
    v_should_sync := true;
  elsif exists (
    select 1
    from public.market_assets as asset
    where asset.creator_user_id = new.id
      and asset.creator_display_name is distinct from v_display_name
  ) then
    v_should_sync := true;
  end if;

  if v_should_sync then
    update public.market_assets
    set creator_display_name = v_display_name,
        updated_at = timezone('utc', now())
    where creator_user_id = new.id
      and creator_display_name is distinct from v_display_name;
  end if;
  return new;
end;
$$;

update public.market_assets as asset
set creator_display_name = coalesce(nullif(left(btrim(profile.nickname), 40), ''), 'PiXiEEDクリエイター'),
    updated_at = timezone('utc', now())
from public.user_profiles as profile
where profile.id = asset.creator_user_id
  and asset.creator_display_name is distinct from coalesce(nullif(left(btrim(profile.nickname), 40), ''), 'PiXiEEDクリエイター');
