-- Isolated PostgreSQL acceptance fixtures only. The caller owns a disposable DB.
begin;

insert into auth.users (id) values
  ('00000000-0000-4000-8000-00000000e001'),
  ('00000000-0000-4000-8000-00000000e002')
on conflict (id) do nothing;

insert into public.social_posts (id, creator_user_id, status, post_kind, distribution_mode, media_object_path) values
  ('00000000-0000-4000-8000-00000000e101', '00000000-0000-4000-8000-00000000e001', 'published', 'image', 'showcase', 'posts/eligible.png'),
  ('00000000-0000-4000-8000-00000000e102', '00000000-0000-4000-8000-00000000e001', 'pending',   'image', 'showcase', 'posts/pending.png'),
  ('00000000-0000-4000-8000-00000000e103', '00000000-0000-4000-8000-00000000e001', 'published', 'video', 'showcase', 'posts/video.mp4'),
  ('00000000-0000-4000-8000-00000000e104', '00000000-0000-4000-8000-00000000e001', 'published', 'image', 'private', 'posts/private.png'),
  ('00000000-0000-4000-8000-00000000e105', '00000000-0000-4000-8000-00000000e001', 'published', 'image', 'showcase', null),
  ('00000000-0000-4000-8000-00000000e106', '00000000-0000-4000-8000-00000000e002', 'published', 'image', 'showcase', 'posts/other-owner.png');

insert into public.social_post_map_points (social_post_id, globe_cell_id, projection_version, globe_band, globe_column) values
  ('00000000-0000-4000-8000-00000000e101', 'globe:v11-meridian-parallel-quarter-degree:360:720', 'v11-meridian-parallel-quarter-degree', 360, 720),
  ('00000000-0000-4000-8000-00000000e102', 'globe:v11-meridian-parallel-quarter-degree:361:720', 'v11-meridian-parallel-quarter-degree', 361, 720),
  ('00000000-0000-4000-8000-00000000e103', 'globe:v11-meridian-parallel-quarter-degree:362:720', 'v11-meridian-parallel-quarter-degree', 362, 720),
  ('00000000-0000-4000-8000-00000000e104', 'globe:v11-meridian-parallel-quarter-degree:363:720', 'v11-meridian-parallel-quarter-degree', 363, 720),
  ('00000000-0000-4000-8000-00000000e105', 'globe:v11-meridian-parallel-quarter-degree:364:720', 'v11-meridian-parallel-quarter-degree', 364, 720),
  ('00000000-0000-4000-8000-00000000e106', 'globe:v11-meridian-parallel-quarter-degree:365:720', 'v11-meridian-parallel-quarter-degree', 365, 720);

-- RLS permits placement only while the source is a published showcase image with a path.
set local role anon;
do $$
begin
  if (select count(*) from public.social_post_map_points) <> 2
    or not exists(select 1 from public.social_post_map_points where social_post_id = '00000000-0000-4000-8000-00000000e101')
    or not exists(select 1 from public.social_post_map_points where social_post_id = '00000000-0000-4000-8000-00000000e106') then
    raise exception 'public map reader did not restrict points to eligible published showcase images';
  end if;
end;
$$;
reset role;

-- Authenticated owner can insert, update, and delete; another user and anon cannot write.
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-00000000e001', true);
set local role authenticated;
do $$
declare v_rows integer;
begin
  delete from public.social_post_map_points where social_post_id = '00000000-0000-4000-8000-00000000e101';
  get diagnostics v_rows = row_count;
  if v_rows <> 1 then raise exception 'owner could not delete their seeded eligible placement'; end if;

  insert into public.social_post_map_points (social_post_id, globe_cell_id, projection_version, globe_band, globe_column)
  values ('00000000-0000-4000-8000-00000000e101', 'globe:v11-meridian-parallel-quarter-degree:100:200', 'v11-meridian-parallel-quarter-degree', 100, 200);
  update public.social_post_map_points
    set globe_cell_id = 'globe:v11-meridian-parallel-quarter-degree:101:201', globe_band = 101, globe_column = 201
    where social_post_id = '00000000-0000-4000-8000-00000000e101';
  get diagnostics v_rows = row_count;
  if v_rows <> 1 then raise exception 'owner could not update their eligible placement'; end if;
  delete from public.social_post_map_points where social_post_id = '00000000-0000-4000-8000-00000000e101';
  get diagnostics v_rows = row_count;
  if v_rows <> 1 then raise exception 'owner could not delete their eligible placement'; end if;

  insert into public.social_post_map_points (social_post_id, globe_cell_id, projection_version, globe_band, globe_column)
  values ('00000000-0000-4000-8000-00000000e101', 'globe:v11-meridian-parallel-quarter-degree:360:720', 'v11-meridian-parallel-quarter-degree', 360, 720);

  perform set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-00000000e002', true);
  begin
    insert into public.social_post_map_points (social_post_id, globe_cell_id, projection_version, globe_band, globe_column)
    values ('00000000-0000-4000-8000-00000000e101', 'globe:v11-meridian-parallel-quarter-degree:10:10', 'v11-meridian-parallel-quarter-degree', 10, 10);
    raise exception 'different user inserted an owner placement';
  exception when insufficient_privilege then null;
  end;
  update public.social_post_map_points
    set globe_cell_id = 'globe:v11-meridian-parallel-quarter-degree:11:11', globe_band = 11, globe_column = 11
    where social_post_id = '00000000-0000-4000-8000-00000000e101';
  get diagnostics v_rows = row_count;
  if v_rows <> 0 then raise exception 'different user updated an owner placement'; end if;
  delete from public.social_post_map_points where social_post_id = '00000000-0000-4000-8000-00000000e101';
  get diagnostics v_rows = row_count;
  if v_rows <> 0 then raise exception 'different user deleted an owner placement'; end if;

  -- Anonymous cannot write even when the source image is publicly eligible.
end;
$$;
reset role;
set local role anon;
do $$
begin
  begin
    insert into public.social_post_map_points (social_post_id, globe_cell_id, projection_version, globe_band, globe_column)
    values ('00000000-0000-4000-8000-00000000e101', 'globe:v11-meridian-parallel-quarter-degree:12:12', 'v11-meridian-parallel-quarter-degree', 12, 12);
    raise exception 'anonymous user inserted a placement';
  exception when insufficient_privilege then null;
  end;
end;
$$;
reset role;

-- Once the source is no longer eligible, anonymous reads stop exposing its point.
update public.social_posts set status = 'hidden' where id = '00000000-0000-4000-8000-00000000e106';
set local role anon;
do $$
begin
  if exists(select 1 from public.social_post_map_points where social_post_id = '00000000-0000-4000-8000-00000000e106') then
    raise exception 'map reader exposed a point after its source became non-public';
  end if;
end;
$$;
reset role;

-- Placement operations never mutate the legacy source records.
update public.social_posts set status = 'published' where id = '00000000-0000-4000-8000-00000000e106';
do $$
begin
  if (select count(*) from public.social_posts where id between '00000000-0000-4000-8000-00000000e101' and '00000000-0000-4000-8000-00000000e106') <> 6
    or exists (
      (select id, creator_user_id, status, post_kind, distribution_mode, media_object_path
       from public.social_posts
       where id between '00000000-0000-4000-8000-00000000e101' and '00000000-0000-4000-8000-00000000e106')
      except
      (values
        ('00000000-0000-4000-8000-00000000e101'::uuid, '00000000-0000-4000-8000-00000000e001'::uuid, 'published'::text, 'image'::text, 'showcase'::text, 'posts/eligible.png'::text),
        ('00000000-0000-4000-8000-00000000e102'::uuid, '00000000-0000-4000-8000-00000000e001'::uuid, 'pending'::text, 'image'::text, 'showcase'::text, 'posts/pending.png'::text),
        ('00000000-0000-4000-8000-00000000e103'::uuid, '00000000-0000-4000-8000-00000000e001'::uuid, 'published'::text, 'video'::text, 'showcase'::text, 'posts/video.mp4'::text),
        ('00000000-0000-4000-8000-00000000e104'::uuid, '00000000-0000-4000-8000-00000000e001'::uuid, 'published'::text, 'image'::text, 'private'::text, 'posts/private.png'::text),
        ('00000000-0000-4000-8000-00000000e105'::uuid, '00000000-0000-4000-8000-00000000e001'::uuid, 'published'::text, 'image'::text, 'showcase'::text, null::text),
        ('00000000-0000-4000-8000-00000000e106'::uuid, '00000000-0000-4000-8000-00000000e002'::uuid, 'published'::text, 'image'::text, 'showcase'::text, 'posts/other-owner.png'::text)
      )
    ) then
    raise exception 'legacy source posts were unexpectedly changed';
  end if;
end;
$$;

rollback;
