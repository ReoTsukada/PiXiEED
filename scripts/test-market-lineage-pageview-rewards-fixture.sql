\set ON_ERROR_STOP on

do $$ begin
  create role anon;
exception when duplicate_object then null; end $$;
do $$ begin
  create role authenticated;
exception when duplicate_object then null; end $$;
do $$ begin
  create role service_role;
exception when duplicate_object then null; end $$;

create schema if not exists auth;
create table auth.users (
  id uuid primary key,
  email text,
  created_at timestamptz default now()
);
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

create table public.market_asset_series (
  id uuid primary key,
  root_asset_id uuid,
  root_creator_user_id uuid not null references auth.users(id),
  title text not null,
  status text not null default 'published',
  derivative_sales_allowed boolean not null default false,
  base_use_price_yen integer not null default 0,
  required_option_price_yen integer not null default 0,
  derivative_license_price_yen integer not null default 0,
  inherited_terms jsonb not null default '{}'::jsonb,
  prohibited_uses jsonb not null default '[]'::jsonb,
  allowed_media jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.market_assets (
  id uuid primary key default gen_random_uuid(),
  series_id uuid not null references public.market_asset_series(id),
  parent_asset_id uuid references public.market_assets(id),
  creator_user_id uuid not null references auth.users(id),
  creator_display_name text not null default 'test',
  title text not null,
  description text not null default '',
  status text not null default 'draft',
  sale_price_yen integer not null default 500,
  asset_format text not null default 'png',
  included_formats text[] not null default array['png']::text[],
  source_kind text not null default 'external',
  source_sha256 text,
  provenance_manifest jsonb not null default '{}'::jsonb,
  verification_status text not null default 'pending',
  verification_level text not null default 'unverified',
  file_scan_status text not null default 'pending',
  ai_usage_status text not null default 'not-used',
  terms_version text,
  privacy_version text,
  legal_confirmed_at timestamptz,
  change_summary jsonb not null default '[]'::jsonb,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.market_derivative_licenses (
  id uuid primary key default gen_random_uuid(),
  source_asset_id uuid not null references public.market_assets(id),
  purchaser_user_id uuid not null references auth.users(id),
  purchase_id uuid,
  status text not null default 'active',
  allowed_listing_count integer not null default 1,
  used_by_asset_id uuid references public.market_assets(id),
  created_at timestamptz not null default now(),
  used_at timestamptz,
  revoked_at timestamptz
);

create table public.market_asset_formats (
  id text primary key,
  active boolean not null default true,
  allows_external_upload boolean not null default true,
  allows_pixieed_native boolean not null default true
);
insert into public.market_asset_formats(id) values ('png');

create table public.market_audit_log (
  id bigint generated always as identity primary key,
  actor_user_id uuid,
  action text not null,
  target_type text not null,
  target_id text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.market_pageview_reward_budgets (
  reward_year integer not null,
  reward_month integer not null,
  amount_yen bigint not null,
  currency text not null default 'JPY',
  updated_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (reward_year, reward_month)
);

create or replace function public.market_current_user_is_admin()
returns boolean language sql stable as $$
  select auth.uid() = nullif(current_setting('app.test_admin_id', true), '')::uuid;
$$;

create or replace function public.market_create_root_asset_v4(
  text, text, integer, boolean, text, text, text[], text[], jsonb, jsonb,
  jsonb, jsonb, jsonb, text, text, text, boolean, boolean
) returns uuid language sql security definer as $$ select gen_random_uuid(); $$;

create or replace function public.market_create_derivative_draft_v2(
  uuid, uuid, text, text, integer, text, text, text, jsonb, jsonb
) returns uuid language sql security definer as $$ select gen_random_uuid(); $$;
