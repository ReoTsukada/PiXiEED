-- Keep buyer-facing license choices short and outcome-oriented.

update public.market_license_options
set label = '商用・収益化利用',
    description = 'ゲーム、アプリ、動画、配信、広告などの商用・収益化用途で利用できます。',
    minimum_price_yen = 500,
    sort_order = 10,
    active = true,
    updated_at = timezone('utc', now())
where id = 'commercial-use';

update public.market_license_options
set label = 'グッズ・印刷販売',
    description = 'グッズや印刷物を制作して販売できます。',
    minimum_price_yen = 1000,
    sort_order = 20,
    active = true,
    updated_at = timezone('utc', now())
where id = 'merchandise-use';

update public.market_license_options
set label = 'クレジット表記不要',
    description = '利用時の作者名表記を省略できます。',
    minimum_price_yen = 300,
    sort_order = 30,
    active = true,
    updated_at = timezone('utc', now())
where id = 'credit-omission';

-- These uses are now included in the broader commercial option. Existing
-- listings keep their snapshotted terms, but new listings cannot select them.
update public.market_license_options
set active = false,
    updated_at = timezone('utc', now())
where id in ('game-app-use', 'video-stream-use');

insert into public.market_audit_log(actor_user_id, action, target_type, target_id, details)
values (
  null,
  'license_option_catalog_simplified',
  'market_license_options',
  '20260717155000',
  jsonb_build_object(
    'active_option_ids', array['commercial-use', 'merchandise-use', 'credit-omission'],
    'merged_option_ids', array['game-app-use', 'video-stream-use']
  )
);
