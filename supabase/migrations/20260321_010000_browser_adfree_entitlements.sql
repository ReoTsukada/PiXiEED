create table if not exists public.user_entitlements (
  user_id uuid not null references auth.users(id) on delete cascade,
  entitlement_key text not null,
  status text not null default 'active',
  source text not null default 'manual',
  expires_at timestamptz,
  granted_at timestamptz not null default timezone('utc', now()),
  redeemed_code text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  revoked_at timestamptz,
  primary key (user_id, entitlement_key)
);

alter table public.user_entitlements
  add column if not exists status text not null default 'active',
  add column if not exists source text not null default 'manual',
  add column if not exists expires_at timestamptz,
  add column if not exists granted_at timestamptz not null default timezone('utc', now()),
  add column if not exists redeemed_code text,
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists created_at timestamptz not null default timezone('utc', now()),
  add column if not exists updated_at timestamptz not null default timezone('utc', now()),
  add column if not exists revoked_at timestamptz;

create index if not exists user_entitlements_entitlement_key_idx
  on public.user_entitlements (entitlement_key);

create index if not exists user_entitlements_expires_at_idx
  on public.user_entitlements (expires_at);

create table if not exists public.user_entitlement_codes (
  code text primary key,
  entitlement_key text not null default 'browser_ad_free',
  duration_days integer not null default 31 check (duration_days between 1 and 3650),
  max_redemptions integer not null default 1 check (max_redemptions >= 1),
  redemption_count integer not null default 0 check (redemption_count >= 0),
  active boolean not null default true,
  expires_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  redeemed_by uuid references auth.users(id) on delete set null,
  redeemed_at timestamptz,
  note text,
  metadata jsonb not null default '{}'::jsonb
);

alter table public.user_entitlement_codes
  add column if not exists entitlement_key text not null default 'browser_ad_free',
  add column if not exists duration_days integer not null default 31,
  add column if not exists max_redemptions integer not null default 1,
  add column if not exists redemption_count integer not null default 0,
  add column if not exists active boolean not null default true,
  add column if not exists expires_at timestamptz,
  add column if not exists created_at timestamptz not null default timezone('utc', now()),
  add column if not exists updated_at timestamptz not null default timezone('utc', now()),
  add column if not exists redeemed_by uuid references auth.users(id) on delete set null,
  add column if not exists redeemed_at timestamptz,
  add column if not exists note text,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

create index if not exists user_entitlement_codes_entitlement_key_idx
  on public.user_entitlement_codes (entitlement_key, active);

create or replace function public.set_user_entitlements_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists trg_set_user_entitlements_updated_at on public.user_entitlements;
create trigger trg_set_user_entitlements_updated_at
before update on public.user_entitlements
for each row
execute function public.set_user_entitlements_updated_at();

create or replace function public.set_user_entitlement_codes_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists trg_set_user_entitlement_codes_updated_at on public.user_entitlement_codes;
create trigger trg_set_user_entitlement_codes_updated_at
before update on public.user_entitlement_codes
for each row
execute function public.set_user_entitlement_codes_updated_at();

alter table public.user_entitlements enable row level security;
alter table public.user_entitlement_codes enable row level security;

revoke all on public.user_entitlements from anon, authenticated;
grant select on public.user_entitlements to authenticated;

revoke all on public.user_entitlement_codes from anon, authenticated;

drop policy if exists user_entitlements_select_own on public.user_entitlements;
create policy user_entitlements_select_own
on public.user_entitlements
for select
to authenticated
using (auth.uid() = user_id);

create or replace function public.redeem_browser_adfree_code(input_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_code text := regexp_replace(upper(trim(coalesce(input_code, ''))), '[^A-Z0-9]', '', 'g');
  v_now timestamptz := timezone('utc', now());
  v_code_row public.user_entitlement_codes%rowtype;
  v_entitlement public.user_entitlements%rowtype;
  v_next_expires_at timestamptz := null;
begin
  if v_user_id is null then
    raise exception 'login required';
  end if;

  if v_code = '' then
    raise exception 'code is required';
  end if;

  select *
    into v_code_row
    from public.user_entitlement_codes
   where code = v_code
   for update;

  if not found then
    raise exception 'code not found';
  end if;

  if not coalesce(v_code_row.active, false) then
    raise exception 'code inactive';
  end if;

  if v_code_row.expires_at is not null and v_code_row.expires_at <= v_now then
    raise exception 'code expired';
  end if;

  if coalesce(v_code_row.redemption_count, 0) >= coalesce(v_code_row.max_redemptions, 1) then
    raise exception 'code already redeemed';
  end if;

  select *
    into v_entitlement
    from public.user_entitlements
   where user_id = v_user_id
     and entitlement_key = v_code_row.entitlement_key
   for update;

  if found and v_entitlement.revoked_at is null and v_entitlement.status = 'active' and v_entitlement.expires_at is null then
    v_next_expires_at := null;
  else
    v_next_expires_at := greatest(coalesce(v_entitlement.expires_at, v_now), v_now)
      + make_interval(days => greatest(coalesce(v_code_row.duration_days, 31), 1));
  end if;

  insert into public.user_entitlements (
    user_id,
    entitlement_key,
    status,
    source,
    expires_at,
    granted_at,
    redeemed_code,
    metadata,
    revoked_at
  )
  values (
    v_user_id,
    v_code_row.entitlement_key,
    'active',
    'code',
    v_next_expires_at,
    v_now,
    v_code,
    jsonb_build_object(
      'last_redeemed_code', v_code,
      'last_redeemed_at', v_now
    ),
    null
  )
  on conflict (user_id, entitlement_key)
  do update set
    status = 'active',
    source = 'code',
    expires_at = excluded.expires_at,
    granted_at = excluded.granted_at,
    redeemed_code = excluded.redeemed_code,
    metadata = coalesce(public.user_entitlements.metadata, '{}'::jsonb) || excluded.metadata,
    revoked_at = null,
    updated_at = v_now;

  update public.user_entitlement_codes
     set redemption_count = coalesce(redemption_count, 0) + 1,
         redeemed_by = v_user_id,
         redeemed_at = v_now,
         updated_at = v_now
   where code = v_code;

  return jsonb_build_object(
    'ok', true,
    'entitlement_key', v_code_row.entitlement_key,
    'expires_at', v_next_expires_at,
    'redeemed_code', v_code
  );
end;
$$;

grant execute on function public.redeem_browser_adfree_code(text) to authenticated;
