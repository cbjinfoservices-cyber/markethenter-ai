create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;
create extension if not exists supabase_vault with schema vault;

create table public.sourcing_refresh_requests (
  cycle timestamptz not null,
  category text not null check (category in ('maison', 'bureau', 'sport', 'animaux', 'beaute', 'tech', 'auto')),
  action text not null check (action in ('refresh-cache', 'refresh-prices')),
  batch integer not null check (batch between -1 and 7),
  request_id bigint,
  error text,
  submitted_at timestamptz not null default clock_timestamp(),
  primary key (cycle, category, action, batch)
);
alter table public.sourcing_refresh_requests enable row level security;
revoke all on public.sourcing_refresh_requests from anon, authenticated;
grant select on public.sourcing_refresh_requests to service_role;

create function public.sourcing_refresh_plan(p_minute integer)
returns table (category text, action text, batch integer)
language sql immutable strict
set search_path = ''
as $$
  with categories as (
    select array['maison', 'bureau', 'sport', 'animaux', 'beaute', 'tech', 'auto'] as names
  )
  select names[p_minute / 8 + 1], 'refresh-cache'::text, -1
  from categories
  where p_minute between 0 and 48 and p_minute % 8 = 0
  union all
  select names[(p_minute - 1) / 8 + 1], 'refresh-prices'::text, (p_minute - 1) % 8
  from categories
  where p_minute between 1 and 56;
$$;
revoke all on function public.sourcing_refresh_plan(integer) from public, anon, authenticated;

create function public.dispatch_sourcing_refresh()
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_cycle timestamptz := date_trunc('hour', v_now);
  v_url text;
  v_jwt text;
  v_secret text;
  v_job record;
  v_asins jsonb;
  v_body jsonb;
  v_request_id bigint;
begin
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'sourcing_function_url';
  select decrypted_secret into v_jwt from vault.decrypted_secrets where name = 'sourcing_gateway_jwt';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'sourcing_cron_secret';
  if v_url is null or v_url !~ '^https://([a-z0-9]+[.]supabase[.]co|markethunter-ai[.]com/supabase)/functions/v1/sourcing-bestsellers$'
    or v_jwt is null or length(v_jwt) < 32 or v_secret is null or length(v_secret) < 32 then
    raise exception 'sourcing-cron: missing or invalid Vault configuration';
  end if;

  delete from public.sourcing_refresh_requests where cycle < v_now - interval '7 days';
  for v_job in select * from public.sourcing_refresh_plan(extract(minute from v_now)::integer) loop
    insert into public.sourcing_refresh_requests (cycle, category, action, batch)
    values (v_cycle, v_job.category, v_job.action, v_job.batch)
    on conflict do nothing;
    if not found then continue; end if;

    v_body := jsonb_build_object(
      'action', v_job.action, 'market', 'FR', 'category', v_job.category, 'kind', 'bestsellers'
    );
    if v_job.action = 'refresh-prices' then
      select jsonb_agg(product->>'asin' order by position) into v_asins
      from public.sourcing_catalog_cache c,
        jsonb_array_elements(c.snapshot->'products') with ordinality as items(product, position)
      where c.provider = 'rainforest' and c.market = 'FR' and c.category = v_job.category
        and c.kind = 'bestsellers' and position > v_job.batch * 3 and position <= (v_job.batch + 1) * 3
        and product->>'asin' ~ '^[A-Z0-9]{10}$';
      if v_asins is null then
        update public.sourcing_refresh_requests set error = 'no-cached-candidates'
        where cycle = v_cycle and category = v_job.category and action = v_job.action and batch = v_job.batch;
        raise log 'sourcing-cron: no cached candidates for category %, batch %', v_job.category, v_job.batch;
        continue;
      end if;
      v_body := v_body || jsonb_build_object('asins', v_asins);
    end if;

    select net.http_post(
      url := v_url,
      headers := jsonb_build_object(
        'Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_jwt,
        'apikey', v_jwt, 'x-sourcing-cron-secret', v_secret
      ),
      body := v_body,
      timeout_milliseconds := 60000
    ) into v_request_id;
    update public.sourcing_refresh_requests set request_id = v_request_id
    where cycle = v_cycle and category = v_job.category and action = v_job.action and batch = v_job.batch;
  end loop;
end;
$$;
revoke all on function public.dispatch_sourcing_refresh() from public, anon, authenticated;

-- Enable the job only after configuring Vault and deploying the scheduled actions.
