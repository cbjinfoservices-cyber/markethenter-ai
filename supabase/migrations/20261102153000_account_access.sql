create table public.account_access (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'user' check (role in ('user', 'admin')),
  plan text not null default 'free' check (plan in ('free', 'starter', 'pro', 'premium', 'agency')),
  updated_at timestamptz not null default now()
);

alter table public.account_access enable row level security;
revoke all on public.account_access from anon, authenticated;
grant select on public.account_access to authenticated;
create policy "Read own account access" on public.account_access
  for select to authenticated using (user_id = (select auth.uid()));

create table public.account_access_audit (
  id bigint generated always as identity primary key,
  actor_id uuid references auth.users(id) on delete set null,
  target_id uuid references auth.users(id) on delete set null,
  previous_role text not null,
  next_role text not null,
  previous_plan text not null,
  next_plan text not null,
  created_at timestamptz not null default now()
);
alter table public.account_access_audit enable row level security;
revoke all on public.account_access_audit from anon, authenticated;

create function public.initialize_account_access()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  -- Never copy role or plan from user-editable signup metadata.
  insert into public.account_access(user_id) values (new.id);
  return new;
end;
$$;
revoke all on function public.initialize_account_access() from public, anon, authenticated;
create trigger initialize_account_access after insert on auth.users
  for each row execute function public.initialize_account_access();
insert into public.account_access(user_id) select id from auth.users on conflict do nothing;

create function public.is_account_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.account_access
    where user_id = auth.uid() and role = 'admin'
  );
$$;
revoke all on function public.is_account_admin() from public, anon;
grant execute on function public.is_account_admin() to authenticated;

create function public.admin_accounts(p_page integer default 0)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  result jsonb;
begin
  if not public.is_account_admin() then
    raise exception 'admin-required' using errcode = '42501';
  end if;
  if p_page is null or p_page < 0 or p_page > 1000000 then
    raise exception 'invalid-page' using errcode = '22023';
  end if;

  select jsonb_build_object(
    'accounts', coalesce((
      select jsonb_agg(to_jsonb(account) order by account.created_at desc, account.id)
      from (
        select u.id, u.email, u.created_at, u.last_sign_in_at,
          u.email_confirmed_at is not null as confirmed, a.role, a.plan, a.updated_at
        from auth.users u join public.account_access a on a.user_id = u.id
        order by u.created_at desc, u.id
        limit 25 offset (p_page::bigint * 25)
      ) account
    ), '[]'::jsonb),
    'total', (select count(*) from public.account_access),
    'admins', (select count(*) from public.account_access where role = 'admin'),
    'confirmed', (select count(*) from auth.users where email_confirmed_at is not null),
    'recent', (select count(*) from auth.users where created_at >= now() - interval '7 days'),
    'plans', (select jsonb_object_agg(plan, amount) from (
      select plan, count(*) as amount from public.account_access group by plan
    ) counts)
  ) into result;
  return result;
end;
$$;
revoke all on function public.admin_accounts(integer) from public, anon;
grant execute on function public.admin_accounts(integer) to authenticated;

create function public.admin_update_account(
  p_user_id uuid, p_role text, p_plan text, p_expected_updated_at timestamptz
)
returns void language plpgsql security definer set search_path = '' as $$
declare
  previous public.account_access%rowtype;
begin
  -- Serialize role changes, including simultaneous last-admin demotions.
  lock table public.account_access in share row exclusive mode;
  if not public.is_account_admin() then
    raise exception 'admin-required' using errcode = '42501';
  end if;
  if p_role is null or p_role not in ('user', 'admin') or p_plan is null
    or p_plan not in ('free', 'starter', 'pro', 'premium', 'agency') then
    raise exception 'invalid-access' using errcode = '22023';
  end if;
  select * into previous from public.account_access where user_id = p_user_id for update;
  if not found then
    raise exception 'account-not-found' using errcode = 'P0002';
  end if;
  if p_expected_updated_at is null or previous.updated_at <> p_expected_updated_at then
    raise exception 'account-changed' using errcode = '40001';
  end if;
  if previous.role = 'admin' and p_role = 'user' and
    (select count(*) from public.account_access where role = 'admin') <= 1 then
    raise exception 'last-admin' using errcode = '23514';
  end if;
  if previous.role = p_role and previous.plan = p_plan then return; end if;

  update public.account_access set role = p_role, plan = p_plan, updated_at = clock_timestamp()
    where user_id = p_user_id;
  insert into public.account_access_audit(
    actor_id, target_id, previous_role, next_role, previous_plan, next_plan
  ) values (auth.uid(), p_user_id, previous.role, p_role, previous.plan, p_plan);
end;
$$;
revoke all on function public.admin_update_account(uuid, text, text, timestamptz) from public, anon;
grant execute on function public.admin_update_account(uuid, text, text, timestamptz) to authenticated;
