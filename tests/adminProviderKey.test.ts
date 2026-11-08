import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { describe, expect, it } from 'vitest';

describe('admin provider configuration authorization', () => {
  it('permits only admins to write, never reveals keys to clients, and resumes the existing cron job', async () => {
    const db = new PGlite();
    try {
      await db.exec(`
        create role anon; create role authenticated; create role service_role;
        create schema auth; create schema vault; create schema cron;
        create table auth.users(id uuid primary key);
        create function auth.uid() returns uuid language sql as $$
          select nullif(current_setting('request.jwt.claim.sub', true),'')::uuid;
        $$;
        create table vault.secrets(id uuid primary key default gen_random_uuid(), name text unique, secret text);
        create view vault.decrypted_secrets as select id, secret as decrypted_secret from vault.secrets;
        create function vault.create_secret(p_secret text, p_name text) returns uuid language sql as $$
          insert into vault.secrets(name,secret) values (p_name,p_secret) returning id;
        $$;
        create function vault.update_secret(p_id uuid,p_secret text) returns void language sql as $$
          update vault.secrets set secret=p_secret where id=p_id;
        $$;
        create table cron.job(jobid bigint primary key, jobname text, active boolean);
        create function cron.alter_job(p_id bigint,active boolean) returns void language sql as $$
          update cron.job set active=$2 where jobid=p_id;
        $$;
        insert into auth.users values ('00000000-0000-0000-0000-000000000001'),('00000000-0000-0000-0000-000000000002');
      `);
      await db.exec(readFileSync(new URL('../supabase/migrations/20261102153000_account_access.sql', import.meta.url), 'utf8'));
      await db.exec(readFileSync(new URL('../supabase/migrations/20261107230000_admin_rainforest_key.sql', import.meta.url), 'utf8')
        .replace(/^create extension.*;\r?$/gm, ''));
      await db.exec(`
        update public.account_access set role='admin' where user_id='00000000-0000-0000-0000-000000000001';
        insert into cron.job values (1,'sourcing-hourly-fr',false),(2,'unrelated',false);
        select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',false);
        set role authenticated;
      `);
      await expect(db.query('select public.admin_sourcing_status()')).rejects.toThrow('admin-required');
      await expect(db.query("select public.admin_save_rainforest_key('test-key-123456789')")).rejects.toThrow('admin-required');
      await expect(db.query('select public.sourcing_rainforest_key()')).rejects.toThrow('permission denied');
      await expect(db.query('select * from public.sourcing_provider_settings')).rejects.toThrow('permission denied');
      await db.exec("select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false)");
      await expect(db.query("select public.admin_save_rainforest_key('invalid')")).rejects.toThrow('invalid-provider-key');
      await db.query("select public.admin_save_rainforest_key('test-key-123456789')");
      expect((await db.query<{ status: object }>('select public.admin_sourcing_status() as status')).rows[0].status)
        .toEqual({ configured: true, scheduled: true });
      await expect(db.query('select public.sourcing_rainforest_key()')).rejects.toThrow('permission denied');
      await db.query("select public.admin_save_rainforest_key('rotated-key-123456789')");
      await db.exec('reset role; set role service_role');
      expect((await db.query<{ key: string }>('select public.sourcing_rainforest_key() as key')).rows[0].key)
        .toBe('rotated-key-123456789');
      await db.exec('reset role');
      expect((await db.query('select id from vault.secrets')).rows).toHaveLength(1);
      expect((await db.query<{ active: boolean }>("select active from cron.job where jobname='unrelated'")).rows[0].active).toBe(false);
      await db.exec('set role anon');
      await expect(db.query('select public.admin_sourcing_status()')).rejects.toThrow('permission denied');
      await expect(db.query("select public.admin_save_rainforest_key('test-key-123456789')")).rejects.toThrow('permission denied');
    } finally { await db.close(); }
  });
});
