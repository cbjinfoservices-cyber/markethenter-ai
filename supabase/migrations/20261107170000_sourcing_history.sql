create table public.sourcing_catalog_history (
  id bigint generated always as identity primary key,
  provider text not null,
  market text not null,
  category text not null,
  kind text not null,
  collected_at timestamptz not null,
  snapshot jsonb not null
);

create index sourcing_catalog_history_lookup
  on public.sourcing_catalog_history (provider, market, category, kind, collected_at desc);

create table public.sourcing_price_history (
  id bigint generated always as identity primary key,
  market text not null,
  asin text not null,
  checked_at timestamptz not null,
  price double precision
);

create index sourcing_price_history_lookup
  on public.sourcing_price_history (market, asin, checked_at desc);

alter table public.sourcing_catalog_history enable row level security;
alter table public.sourcing_price_history enable row level security;
revoke all on public.sourcing_catalog_history, public.sourcing_price_history from public, anon, authenticated, service_role;
grant select on public.sourcing_catalog_history, public.sourcing_price_history to service_role;

create function public.record_sourcing_catalog_history()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' or new.snapshot is distinct from old.snapshot then
    insert into public.sourcing_catalog_history (provider, market, category, kind, collected_at, snapshot)
    values (new.provider, new.market, new.category, new.kind,
      (new.snapshot -> 'provenance' ->> 'collectedAt')::timestamptz, new.snapshot);
  end if;
  return new;
end;
$$;

create function public.record_sourcing_price_history()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' or (new.price, new.checked_at) is distinct from (old.price, old.checked_at) then
    insert into public.sourcing_price_history (market, asin, checked_at, price)
    values (new.market, new.asin, new.checked_at, new.price);
  end if;
  return new;
end;
$$;

revoke all on function public.record_sourcing_catalog_history() from public, anon, authenticated;
revoke all on function public.record_sourcing_price_history() from public, anon, authenticated;

create trigger sourcing_catalog_history_on_write
after insert or update on public.sourcing_catalog_cache
for each row execute function public.record_sourcing_catalog_history();

create trigger sourcing_price_history_on_write
after insert or update on public.sourcing_price_cache
for each row execute function public.record_sourcing_price_history();

insert into public.sourcing_catalog_history (provider, market, category, kind, collected_at, snapshot)
select provider, market, category, kind,
  (snapshot -> 'provenance' ->> 'collectedAt')::timestamptz, snapshot
from public.sourcing_catalog_cache;

insert into public.sourcing_price_history (market, asin, checked_at, price)
select market, asin, checked_at, price from public.sourcing_price_cache;
