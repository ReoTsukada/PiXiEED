-- PiXiEED inheritance material market: domain data only.
-- Payment collection, payout-provider integration, and public UI are added
-- separately after seller verification and operational rules are approved.

create table if not exists public.market_asset_series (
  id uuid primary key default gen_random_uuid(),
  root_asset_id uuid unique,
  root_creator_user_id uuid not null references auth.users(id) on delete restrict,
  title text not null check (char_length(btrim(title)) between 1 and 120),
  status text not null default 'draft' check (status in ('draft', 'review', 'published', 'suspended', 'archived')),
  derivative_sales_allowed boolean not null default false,
  base_use_price_yen integer not null default 0 check (base_use_price_yen >= 0),
  required_option_price_yen integer not null default 0 check (required_option_price_yen >= 0),
  derivative_license_price_yen integer not null default 0 check (derivative_license_price_yen >= 0),
  inherited_terms jsonb not null default '{}'::jsonb,
  prohibited_uses jsonb not null default '[]'::jsonb,
  allowed_media jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  check (jsonb_typeof(inherited_terms) = 'object'),
  check (jsonb_typeof(prohibited_uses) = 'array'),
  check (jsonb_typeof(allowed_media) = 'array')
);

create table if not exists public.market_assets (
  id uuid primary key default gen_random_uuid(),
  series_id uuid not null references public.market_asset_series(id) on delete restrict,
  parent_asset_id uuid references public.market_assets(id) on delete restrict,
  creator_user_id uuid not null references auth.users(id) on delete restrict,
  title text not null check (char_length(btrim(title)) between 1 and 120),
  description text not null default '',
  status text not null default 'draft' check (status in ('draft', 'review', 'published', 'rejected', 'suspended', 'archived')),
  sale_price_yen integer not null check (sale_price_yen >= 0),
  asset_format text not null default 'pixiedraw-project',
  asset_object_path text,
  preview_object_path text,
  change_summary jsonb not null default '[]'::jsonb,
  submitted_at timestamptz,
  published_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  check (jsonb_typeof(change_summary) = 'array')
);

alter table public.market_asset_series
  add constraint market_asset_series_root_asset_fk
  foreign key (root_asset_id) references public.market_assets(id) on delete restrict;

create table if not exists public.market_derivative_licenses (
  id uuid primary key default gen_random_uuid(),
  source_asset_id uuid not null references public.market_assets(id) on delete restrict,
  purchaser_user_id uuid not null references auth.users(id) on delete restrict,
  purchase_id uuid,
  status text not null default 'active' check (status in ('active', 'used', 'revoked', 'refunded')),
  allowed_listing_count integer not null default 1 check (allowed_listing_count = 1),
  used_by_asset_id uuid references public.market_assets(id) on delete restrict,
  created_at timestamptz not null default timezone('utc', now()),
  used_at timestamptz,
  revoked_at timestamptz,
  unique (used_by_asset_id)
);

create table if not exists public.market_purchases (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references public.market_assets(id) on delete restrict,
  buyer_user_id uuid not null references auth.users(id) on delete restrict,
  purchase_kind text not null check (purchase_kind in ('standard_use', 'derivative_license_upgrade')),
  status text not null default 'pending' check (status in ('pending', 'paid', 'refunded', 'disputed', 'cancelled')),
  currency text not null default 'jpy' check (currency = 'jpy'),
  gross_amount_yen integer not null check (gross_amount_yen >= 0),
  processor_fee_yen integer not null default 0 check (processor_fee_yen >= 0),
  platform_fee_yen integer not null default 0 check (platform_fee_yen >= 0),
  distributable_amount_yen integer not null default 0 check (distributable_amount_yen >= 0),
  payment_provider text,
  provider_payment_id text,
  paid_at timestamptz,
  refunded_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  unique (payment_provider, provider_payment_id),
  check (distributable_amount_yen = gross_amount_yen - processor_fee_yen - platform_fee_yen)
);

alter table public.market_derivative_licenses
  add constraint market_derivative_licenses_purchase_fk
  foreign key (purchase_id) references public.market_purchases(id) on delete restrict;

create table if not exists public.market_royalty_ledger (
  id uuid primary key default gen_random_uuid(),
  purchase_id uuid not null references public.market_purchases(id) on delete restrict,
  asset_id uuid not null references public.market_assets(id) on delete restrict,
  recipient_user_id uuid not null references auth.users(id) on delete restrict,
  lineage_depth integer not null check (lineage_depth >= 0),
  royalty_basis_points integer not null check (royalty_basis_points between 0 and 10000),
  amount_microyen bigint not null check (amount_microyen >= 0),
  status text not null default 'pending' check (status in ('pending', 'available', 'reversed', 'paid_out')),
  created_at timestamptz not null default timezone('utc', now()),
  available_at timestamptz,
  reversed_at timestamptz,
  unique (purchase_id, recipient_user_id)
);

create table if not exists public.market_seller_payout_accounts (
  user_id uuid primary key references auth.users(id) on delete restrict,
  provider text not null,
  provider_account_id text not null unique,
  onboarding_status text not null default 'pending' check (onboarding_status in ('pending', 'verified', 'restricted', 'disabled')),
  payouts_enabled boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.market_listing_reviews (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references public.market_assets(id) on delete cascade,
  reviewer_user_id uuid references auth.users(id) on delete set null,
  decision text not null check (decision in ('approved', 'rejected', 'suspended')),
  reason text not null default '',
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists market_assets_series_published_idx
  on public.market_assets(series_id, status, published_at desc);
create index if not exists market_assets_parent_idx on public.market_assets(parent_asset_id);
create index if not exists market_purchases_buyer_idx on public.market_purchases(buyer_user_id, created_at desc);
create index if not exists market_royalty_ledger_recipient_idx
  on public.market_royalty_ledger(recipient_user_id, status, created_at desc);

alter table public.market_asset_series enable row level security;
alter table public.market_assets enable row level security;
alter table public.market_derivative_licenses enable row level security;
alter table public.market_purchases enable row level security;
alter table public.market_royalty_ledger enable row level security;
alter table public.market_seller_payout_accounts enable row level security;
alter table public.market_listing_reviews enable row level security;

create policy market_asset_series_read_published
on public.market_asset_series for select
to anon, authenticated
using (status = 'published' or root_creator_user_id = auth.uid());

create policy market_assets_read_published_or_own
on public.market_assets for select
to anon, authenticated
using (status = 'published' or creator_user_id = auth.uid());

create policy market_derivative_licenses_read_own
on public.market_derivative_licenses for select
to authenticated
using (purchaser_user_id = auth.uid());

create policy market_purchases_read_own
on public.market_purchases for select
to authenticated
using (buyer_user_id = auth.uid());

create policy market_royalty_ledger_read_own
on public.market_royalty_ledger for select
to authenticated
using (recipient_user_id = auth.uid());

create policy market_seller_payout_accounts_read_own
on public.market_seller_payout_accounts for select
to authenticated
using (user_id = auth.uid());

-- Writes occur only through reviewed server-side functions.  Do not grant
-- direct insert/update/delete to browser clients for price, lineage, payment,
-- license, or royalty records.
