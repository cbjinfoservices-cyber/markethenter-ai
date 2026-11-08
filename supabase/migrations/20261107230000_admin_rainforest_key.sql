create extension if not exists supabase_vault with schema vault;

create table public.sourcing_provider_settings (
  provider text primary key check (provider = 'rainforest'),
  secret_id uuid not null references vault.secrets(id),
  updated_at timestamptz not null default clock_timestamp(),
  updated_by uuid references auth.users(id) on delete set null
);
alter table public.sourcing_provider_settings enable row level security;
revoke all on public.sourcing_provider_settings from public, anon, authenticated;

create function public.admin_sourcing_status()
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_account_admin() then
    raise exception 'admin-required' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'configured', exists(select 1 from public.sourcing_provider_settings where provider = 'rainforest'),
    'scheduled', exists(select 1 from cron.job where jobname = 'sourcing-hourly-fr' and active)
  );
end;
$$;
revoke all on function public.admin_sourcing_status() from public, anon;
grant execute on function public.admin_sourcing_status() to authenticated;

create function public.admin_save_rainforest_key(p_key text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_secret_id uuid;
begin
  if not public.is_account_admin() then
    raise exception 'admin-required' using errcode = '42501';
  end if;
  if p_key is null or length(p_key) not between 16 and 256 or p_key !~ '^[A-Za-z0-9_-]+$' then
    raise exception 'invalid-provider-key' using errcode = '22023';
  end if;
  lock table public.sourcing_provider_settings in share row exclusive mode;
  select secret_id into v_secret_id from public.sourcing_provider_settings where provider = 'rainforest';
  if v_secret_id is null then
    select vault.create_secret(p_key, 'markethunter_rainforest_api_key') into v_secret_id;
    insert into public.sourcing_provider_settings(provider, secret_id, updated_by)
    values ('rainforest', v_secret_id, auth.uid());
  else
    perform vault.update_secret(v_secret_id, p_key);
    update public.sourcing_provider_settings set updated_at = clock_timestamp(), updated_by = auth.uid()
    where provider = 'rainforest';
  end if;
  -- Resume the previously configured hourly job; do not create an unconfigured job.
  perform cron.alter_job(jobid, active := true) from cron.job where jobname = 'sourcing-hourly-fr';
end;
$$;
revoke all on function public.admin_save_rainforest_key(text) from public, anon;
grant execute on function public.admin_save_rainforest_key(text) to authenticated;

create function public.sourcing_rainforest_key()
returns text language sql security definer set search_path = '' as $$
  select v.decrypted_secret from public.sourcing_provider_settings s
  join vault.decrypted_secrets v on v.id = s.secret_id where s.provider = 'rainforest';
$$;
revoke all on function public.sourcing_rainforest_key() from public, anon, authenticated;
grant execute on function public.sourcing_rainforest_key() to service_role;
