-- Keep low-price sales sustainable while reducing the marginal PiXiEED fee
-- smoothly as the sale price rises. The calculation is progressive: each rate
-- applies only to the portion inside that band, so crossing a boundary never
-- reduces the total fee.
create or replace function public.market_platform_fee_yen(input_gross_amount_yen integer)
returns integer
language sql
immutable
strict
as $$
  select floor(
    least(input_gross_amount_yen, 1000)::numeric * 0.10
    + greatest(least(input_gross_amount_yen, 2000) - 1000, 0)::numeric * 0.09
    + greatest(least(input_gross_amount_yen, 3000) - 2000, 0)::numeric * 0.08
    + greatest(least(input_gross_amount_yen, 5000) - 3000, 0)::numeric * 0.07
    + greatest(least(input_gross_amount_yen, 8000) - 5000, 0)::numeric * 0.06
    + greatest(least(input_gross_amount_yen, 12000) - 8000, 0)::numeric * 0.05
    + greatest(least(input_gross_amount_yen, 20000) - 12000, 0)::numeric * 0.04
    + greatest(least(input_gross_amount_yen, 30000) - 20000, 0)::numeric * 0.03
    + greatest(least(input_gross_amount_yen, 50000) - 30000, 0)::numeric * 0.02
    + greatest(input_gross_amount_yen - 50000, 0)::numeric * 0.01
  )::integer;
$$;

revoke all on function public.market_platform_fee_yen(integer)
  from public, anon, authenticated;
grant execute on function public.market_platform_fee_yen(integer)
  to service_role;
