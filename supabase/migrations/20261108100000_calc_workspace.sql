-- Espace de travail du calculateur et du sourcing, par compte.
-- Colonnes déduites de src/pages/home/cloudStore.ts, goodFloorCloud.ts,
-- psychoRuleCloud.ts et src/pages/sourcing/sourcingCloud.ts.

create table if not exists public.calc_workspace (
  user_id uuid primary key references auth.users(id) on delete cascade,
  inputs jsonb,
  target_net numeric,
  supplier_names jsonb not null default '{}'::jsonb,
  supplier_emails jsonb not null default '{}'::jsonb,
  good_floor numeric,
  sourcing_view jsonb,
  sourcing_compare jsonb,
  sourcing_margin numeric,
  sourcing_view_at timestamptz,
  sourcing_view_log jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.calc_scenarios (
  user_id uuid not null references auth.users(id) on delete cascade,
  position integer not null,
  name text,
  "values" jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, position)
);

create table if not exists public.calc_price_history (
  user_id uuid not null references auth.users(id) on delete cascade,
  scenario_key text not null,
  series jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, scenario_key)
);

alter table public.calc_workspace enable row level security;
alter table public.calc_scenarios enable row level security;
alter table public.calc_price_history enable row level security;

drop policy if exists "Calc workspace owner access" on public.calc_workspace;
create policy "Calc workspace owner access" on public.calc_workspace
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "Calc scenarios owner access" on public.calc_scenarios;
create policy "Calc scenarios owner access" on public.calc_scenarios
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "Calc price history owner access" on public.calc_price_history;
create policy "Calc price history owner access" on public.calc_price_history
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

grant select, insert, update, delete on public.calc_workspace to authenticated;
grant select, insert, update, delete on public.calc_scenarios to authenticated;
grant select, insert, update, delete on public.calc_price_history to authenticated;

notify pgrst, 'reload schema';
