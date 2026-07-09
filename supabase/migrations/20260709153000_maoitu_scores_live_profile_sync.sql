create or replace function public.request_client_id()
returns text
language plpgsql
stable
as $$
declare
  v_headers_raw text := nullif(current_setting('request.headers', true), '');
  v_headers jsonb := '{}'::jsonb;
begin
  if v_headers_raw is not null then
    v_headers := v_headers_raw::jsonb;
  end if;
  return coalesce(nullif(trim(v_headers ->> 'x-client-id'), ''), '');
exception
  when others then
    return '';
end;
$$;

grant execute on function public.request_client_id() to anon, authenticated;

do $$
begin
  if to_regclass('public.scores') is null then
    return;
  end if;

  execute 'alter table public.scores add column if not exists client_id text';
  execute 'alter table public.scores add column if not exists avatar text';
  execute 'create index if not exists scores_client_id_idx on public.scores (client_id)';
  execute 'alter table public.scores enable row level security';
  execute 'grant select, insert, update on public.scores to anon, authenticated';

  if not exists (
    select 1
      from pg_policies
     where schemaname = 'public'
       and tablename = 'scores'
       and policyname = 'scores_select_public'
  ) then
    execute 'create policy scores_select_public on public.scores for select to anon, authenticated using (true)';
  end if;

  if not exists (
    select 1
      from pg_policies
     where schemaname = 'public'
       and tablename = 'scores'
       and policyname = 'scores_insert_own_client'
  ) then
    execute $policy$
      create policy scores_insert_own_client
      on public.scores
      for insert
      to anon, authenticated
      with check (
        coalesce(client_id, '') <> ''
        and client_id = public.request_client_id()
      )
    $policy$;
  end if;

  if not exists (
    select 1
      from pg_policies
     where schemaname = 'public'
       and tablename = 'scores'
       and policyname = 'scores_update_own_client'
  ) then
    execute $policy$
      create policy scores_update_own_client
      on public.scores
      for update
      to anon, authenticated
      using (
        coalesce(client_id, '') <> ''
        and client_id = public.request_client_id()
      )
      with check (
        coalesce(client_id, '') <> ''
        and client_id = public.request_client_id()
      )
    $policy$;
  end if;

  begin
    execute 'alter publication supabase_realtime add table public.scores';
  exception
    when duplicate_object then
      null;
    when undefined_object then
      null;
  end;
end;
$$;
