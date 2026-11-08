create table public.sourcing_price_cache (
  market text not null check (market in ('FR', 'DE', 'ES', 'IT', 'UK', 'US')),
  asin text not null check (asin ~ '^[A-Z0-9]{10}$'),
  price double precision check (price > 0 and price < 'Infinity'::double precision),
  checked_at timestamptz not null,
  primary key (market, asin)
);
alter table public.sourcing_price_cache enable row level security;
revoke all on public.sourcing_price_cache from anon, authenticated;
grant select, insert, update on public.sourcing_price_cache to service_role;
