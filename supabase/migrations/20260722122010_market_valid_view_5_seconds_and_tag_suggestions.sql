-- 商品詳細の有効表示は5秒以上へ統一する。
alter table public.market_pageview_events
  drop constraint if exists market_pageview_events_dwell_seconds_check;
alter table public.market_pageview_events
  add constraint market_pageview_events_dwell_seconds_check
  check (dwell_seconds between 5 and 3600);

create or replace function public.market_record_valid_pageview_v1(
  input_asset_id uuid,
  input_viewer_key_hash text,
  input_dwell_seconds integer
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_asset public.market_assets%rowtype;
  v_today date := (timezone('utc', now()))::date;
  v_inserted_count integer := 0;
begin
  if coalesce(lower(input_viewer_key_hash), '') !~ '^[0-9a-f]{64}$' then
    raise exception 'valid anonymous viewer key is required';
  end if;
  if input_dwell_seconds is null or input_dwell_seconds < 5 or input_dwell_seconds > 3600 then
    raise exception 'visible dwell time must be between 5 and 3600 seconds';
  end if;
  select * into v_asset from public.market_assets
  where id = input_asset_id and status = 'published';
  if not found then raise exception 'published asset not found'; end if;
  if auth.uid() is not null and auth.uid() = v_asset.creator_user_id then
    return jsonb_build_object('accepted', false, 'reason', 'creator-self-view');
  end if;
  if (select count(*) from public.market_pageview_events
      where viewer_key_hash = lower(input_viewer_key_hash) and view_day = v_today) >= 100 then
    return jsonb_build_object('accepted', false, 'reason', 'daily-view-limit');
  end if;
  insert into public.market_pageview_events(
    asset_id, series_id, view_day, viewer_key_hash, viewer_user_id, dwell_seconds, status
  ) values (
    v_asset.id, v_asset.series_id, v_today, lower(input_viewer_key_hash), auth.uid(), input_dwell_seconds, 'valid'
  ) on conflict (asset_id, view_day, viewer_key_hash) do nothing;
  get diagnostics v_inserted_count = row_count;
  return jsonb_build_object('accepted', v_inserted_count = 1,
    'reason', case when v_inserted_count = 1 then 'recorded' else 'already-recorded-today' end);
end;
$$;

-- 公開済みタグのみを候補にし、同じ表記ゆれを増やさない。
create or replace function public.market_tag_suggestions_v1(input_query text default '', input_limit integer default 12)
returns table(tag text)
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select min(value) as tag
  from public.market_assets asset
  cross join lateral unnest(coalesce(asset.tags, array[]::text[])) as value
  where asset.status = 'published'
    and lower(value) like lower(replace(trim(coalesce(input_query, '')), '%', '\\%')) || '%'
  group by lower(value)
  order by count(*) desc, min(value)
  limit greatest(1, least(coalesce(input_limit, 12), 20));
$$;

revoke all on function public.market_tag_suggestions_v1(text, integer) from public, anon, authenticated;
grant execute on function public.market_tag_suggestions_v1(text, integer) to anon, authenticated;
