create table if not exists public.sourcing_catalog_cache (
  provider text not null check (provider in ('rainforest', 'logimu')),
  market text not null check (market in ('FR', 'DE', 'ES', 'IT', 'UK', 'US')),
  category text not null check (category in ('all', 'maison', 'bureau', 'sport', 'animaux', 'beaute', 'tech', 'auto')),
  kind text not null check (kind in ('bestsellers', 'movers-and-shakers', 'most-wished-for')),
  snapshot jsonb not null check (jsonb_typeof(snapshot) = 'object'),
  primary key (provider, market, category, kind)
);
alter table public.sourcing_catalog_cache enable row level security;
revoke all on public.sourcing_catalog_cache from anon, authenticated;
grant select, insert, update on public.sourcing_catalog_cache to service_role;
