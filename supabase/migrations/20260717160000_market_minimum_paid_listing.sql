-- PiXiEED Market does not distribute zero-yen listings. New listings and
-- purchases must be at least JPY 500; limited listings keep their JPY 1,000
-- minimum from the preceding limited-sales migration.

create or replace function public.market_enforce_minimum_listing_price()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.sale_price_yen < 500 then
    raise exception 'market listing price must be at least 500 yen';
  end if;
  return new;
end;
$$;

drop trigger if exists market_assets_minimum_listing_price on public.market_assets;
create trigger market_assets_minimum_listing_price
before insert or update of sale_price_yen on public.market_assets
for each row execute function public.market_enforce_minimum_listing_price();

-- NOT VALID preserves any legacy row while preventing it from being newly
-- published without first raising its price to the current minimum.
alter table public.market_assets
  drop constraint if exists market_assets_published_minimum_price;
alter table public.market_assets
  add constraint market_assets_published_minimum_price
  check (status <> 'published' or sale_price_yen >= 500) not valid;

create or replace function public.market_enforce_minimum_purchase_amount()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.purchase_kind = 'standard_use' and new.gross_amount_yen < 500 then
    raise exception 'market purchase amount must be at least 500 yen';
  end if;
  return new;
end;
$$;

drop trigger if exists market_purchases_minimum_amount on public.market_purchases;
create trigger market_purchases_minimum_amount
before insert or update of gross_amount_yen on public.market_purchases
for each row execute function public.market_enforce_minimum_purchase_amount();

drop function if exists public.market_complete_free_purchase_v1(uuid, uuid);
