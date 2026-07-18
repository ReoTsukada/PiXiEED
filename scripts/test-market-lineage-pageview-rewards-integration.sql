\set ON_ERROR_STOP on

select set_config('app.test_admin_id', '00000000-0000-4000-8000-000000000001', false);
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000001', false);

insert into auth.users(id, email) values
  ('00000000-0000-4000-8000-000000000001', 'admin@example.test'),
  ('00000000-0000-4000-8000-00000000000a', 'a@example.test'),
  ('00000000-0000-4000-8000-00000000000b', 'b@example.test'),
  ('00000000-0000-4000-8000-00000000000c', 'c@example.test'),
  ('00000000-0000-4000-8000-00000000000d', 'd@example.test'),
  ('00000000-0000-4000-8000-00000000000e', 'viewer@example.test');

insert into public.market_asset_series(id, root_creator_user_id, title, status, derivative_sales_allowed) values
  ('10000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-00000000000a', 'AB', 'published', true),
  ('20000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-00000000000a', 'ABCD', 'published', true),
  ('30000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-00000000000a', 'C split', 'published', true),
  ('40000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-00000000000a', 'branch', 'published', true);

insert into public.market_assets(id, series_id, parent_asset_id, creator_user_id, title, status, source_sha256, published_at) values
  ('11000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', null, '00000000-0000-4000-8000-00000000000a', 'A1', 'published', repeat('1',64), '2024-01-01'),
  ('11000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', '11000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-00000000000b', 'B1', 'published', repeat('2',64), '2024-01-02'),

  ('22000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', null, '00000000-0000-4000-8000-00000000000a', 'A2', 'published', repeat('3',64), '2024-01-01'),
  ('22000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000001', '22000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-00000000000b', 'B2', 'published', repeat('4',64), '2024-01-02'),
  ('22000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-000000000001', '22000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-00000000000c', 'C2', 'published', repeat('5',64), '2024-01-03'),
  ('22000000-0000-4000-8000-000000000004', '20000000-0000-4000-8000-000000000001', '22000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-00000000000d', 'D2', 'published', repeat('6',64), '2024-01-04'),

  ('33000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', null, '00000000-0000-4000-8000-00000000000a', 'A3', 'published', repeat('7',64), '2024-01-01'),
  ('33000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000001', '33000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-00000000000b', 'B3', 'published', repeat('8',64), '2024-01-02'),
  ('33000000-0000-4000-8000-000000000003', '30000000-0000-4000-8000-000000000001', '33000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-00000000000c', 'C3', 'published', repeat('9',64), '2024-01-03'),
  ('33000000-0000-4000-8000-000000000004', '30000000-0000-4000-8000-000000000001', '33000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-00000000000c', 'C3-2', 'published', repeat('a',64), '2024-01-03'),
  ('33000000-0000-4000-8000-000000000005', '30000000-0000-4000-8000-000000000001', '33000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-00000000000c', 'C3-3', 'published', repeat('b',64), '2024-01-03'),
  ('33000000-0000-4000-8000-000000000006', '30000000-0000-4000-8000-000000000001', '33000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-00000000000d', 'D3', 'published', repeat('c',64), '2024-01-04'),

  ('44000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001', null, '00000000-0000-4000-8000-00000000000a', 'A4', 'published', repeat('d',64), '2024-01-01'),
  ('44000000-0000-4000-8000-000000000002', '40000000-0000-4000-8000-000000000001', '44000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-00000000000b', 'B4', 'published', repeat('e',64), '2024-01-02'),
  ('44000000-0000-4000-8000-000000000003', '40000000-0000-4000-8000-000000000001', '44000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-00000000000c', 'C4', 'published', repeat('f',64), '2024-01-03'),
  ('44000000-0000-4000-8000-000000000004', '40000000-0000-4000-8000-000000000001', '44000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-00000000000b', 'B4-2', 'published', repeat('0',64), '2024-01-02'),
  ('44000000-0000-4000-8000-000000000005', '40000000-0000-4000-8000-000000000001', '44000000-0000-4000-8000-000000000004', '00000000-0000-4000-8000-00000000000d', 'C4-2', 'published', repeat('1a',32), '2024-01-03');

update public.market_asset_series series set root_asset_id = asset.id
from public.market_assets asset where asset.series_id = series.id and asset.parent_asset_id is null;

insert into public.market_pageview_reward_budgets(reward_year, reward_month, amount_yen, updated_by)
select 2025, month_number, 120, '00000000-0000-4000-8000-000000000001'
from generate_series(1,4) month_number;

insert into public.market_pageview_events(asset_id, series_id, view_day, viewer_key_hash, dwell_seconds) values
  ('11000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', '2025-01-15', repeat('1',64), 10),
  ('22000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', '2025-02-15', repeat('2',64), 10),
  ('33000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', '2025-03-15', repeat('3',64), 10),
  ('44000000-0000-4000-8000-000000000005', '40000000-0000-4000-8000-000000000001', '2025-04-15', repeat('4',64), 10);

select public.market_admin_calculate_pageview_rewards_v1(2025, 1, true);
select public.market_admin_calculate_pageview_rewards_v1(2025, 2, false);
select public.market_admin_calculate_pageview_rewards_v1(2025, 3, false);
select public.market_admin_calculate_pageview_rewards_v1(2025, 4, false);

do $$
declare v_count integer;
begin
  if (select amount_microyen from public.market_pageview_reward_allocations where reward_year=2025 and reward_month=1 and recipient_asset_id='11000000-0000-4000-8000-000000000001') <> 60000000 then raise exception 'AB A share mismatch'; end if;
  if (select amount_microyen from public.market_pageview_reward_allocations where reward_year=2025 and reward_month=1 and recipient_asset_id='11000000-0000-4000-8000-000000000002') <> 60000000 then raise exception 'AB B share mismatch'; end if;

  select count(*) into v_count from public.market_pageview_reward_allocations where reward_year=2025 and reward_month=2 and amount_microyen=30000000;
  if v_count <> 4 then raise exception 'ABCD must have four equal shares'; end if;

  if (select amount_microyen from public.market_pageview_reward_allocations where reward_year=2025 and reward_month=3 and recipient_asset_id='33000000-0000-4000-8000-000000000001') <> 30000000 then raise exception 'split A share mismatch'; end if;
  if (select amount_microyen from public.market_pageview_reward_allocations where reward_year=2025 and reward_month=3 and recipient_asset_id='33000000-0000-4000-8000-000000000002') <> 30000000 then raise exception 'split B share mismatch'; end if;
  select count(*) into v_count from public.market_pageview_reward_allocations where reward_year=2025 and reward_month=3 and generation_index=2 and amount_microyen=10000000;
  if v_count <> 3 then raise exception 'C generation must split equally between three works'; end if;
  if (select amount_microyen from public.market_pageview_reward_allocations where reward_year=2025 and reward_month=3 and recipient_asset_id='33000000-0000-4000-8000-000000000006') <> 30000000 then raise exception 'split D share mismatch'; end if;

  select count(*) into v_count from public.market_pageview_reward_allocations where reward_year=2025 and reward_month=4 and amount_microyen=40000000;
  if v_count <> 3 then raise exception 'C2 branch must have three equal direct-line shares'; end if;
  if exists (select 1 from public.market_pageview_reward_allocations where reward_year=2025 and reward_month=4 and recipient_asset_id='44000000-0000-4000-8000-000000000003') then raise exception 'sibling branch C must not receive C2 reward'; end if;
end $$;

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-00000000000a', false);
do $$
declare result jsonb;
begin
  result := public.market_my_pageview_rewards_v1();
  if (result ->> 'total_microyen')::bigint <> 60000000 then
    raise exception 'author A finalized reward total mismatch: %', result;
  end if;
end $$;

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-00000000000e', false);
do $$
declare first_result jsonb; duplicate_result jsonb;
begin
  first_result := public.market_record_valid_pageview_v1(
    '11000000-0000-4000-8000-000000000001', repeat('9',64), 10
  );
  duplicate_result := public.market_record_valid_pageview_v1(
    '11000000-0000-4000-8000-000000000001', repeat('9',64), 10
  );
  if not (first_result ->> 'accepted')::boolean then raise exception 'first valid view was not accepted'; end if;
  if (duplicate_result ->> 'accepted')::boolean then raise exception 'duplicate daily view was accepted'; end if;
end $$;

insert into public.market_derivative_licenses(
  id, source_asset_id, purchaser_user_id, status
) values (
  '99000000-0000-4000-8000-000000000001',
  '11000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-00000000000e',
  'active'
);

do $$
declare rejected boolean := false;
begin
  begin
    perform public.market_create_derivative_draft_v4(
      '11000000-0000-4000-8000-000000000001',
      '99000000-0000-4000-8000-000000000001',
      'unchanged copy', '', 500, 'external', repeat('1',64), array['png'],
      '{}'::jsonb, '[{"type":"creator-declaration","text":"changed"}]'::jsonb,
      '2026-07-19', '2026-07-19', 'not-used', true, true
    );
  exception when others then
    if position('original package cannot be reposted unchanged' in sqlerrm) > 0 then
      rejected := true;
    else
      raise;
    end if;
  end;
  if not rejected then raise exception 'unchanged derivative package was accepted'; end if;
end $$;

do $$
declare rejected boolean := false;
begin
  begin
    perform public.market_create_root_asset_v5(
      'copied root', '', 500, true, 'external', repeat('1',64), array['png'],
      array[]::text[], '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '[]'::jsonb,
      '[]'::jsonb, '2026-07-19', '2026-07-19', 'not-used', true, true, true
    );
  exception when others then
    if position('existing PiXiEED asset must be listed through its derivative right' in sqlerrm) > 0 then
      rejected := true;
    else
      raise;
    end if;
  end;
  if not rejected then raise exception 'unchanged third-party root package was accepted'; end if;
end $$;

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-00000000000a', false);
do $$
declare result jsonb;
begin
  result := public.market_record_valid_pageview_v1(
    '11000000-0000-4000-8000-000000000001', repeat('8',64), 10
  );
  if (result ->> 'accepted')::boolean or result ->> 'reason' <> 'creator-self-view' then
    raise exception 'creator self-view was not rejected: %', result;
  end if;
end $$;

select 'market lineage pageview PostgreSQL integration: OK' as result;
