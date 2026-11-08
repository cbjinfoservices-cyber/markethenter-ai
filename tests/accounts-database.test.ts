import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';

const ADMIN = '00000000-0000-4000-8000-000000000001';
const USER = '00000000-0000-4000-8000-000000000002';
const OTHER = '00000000-0000-4000-8000-000000000003';
let db: PGlite;

async function actor(id: string | null, role = 'authenticated') {
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claim.sub', $1, true)", [id ?? '']);
  await db.exec(`set local role ${role}`);
}

async function stamp(id: string) {
  const result = await db.query<{ updated_at: Date }>(
    'select updated_at from public.account_access where user_id = $1', [id],
  );
  return result.rows[0].updated_at;
}

async function rejected(sql: string, params: unknown[] = []) {
  await db.exec('savepoint expected_failure');
  let failure: unknown;
  try {
    await db.query(sql, params);
  } catch (error) {
    failure = error;
  }
  await db.exec('rollback to savepoint expected_failure');
  expect(failure).toBeInstanceOf(Error);
  return failure as Error;
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon;
    create role authenticated;
    create schema auth;
    grant usage on schema auth, public to anon, authenticated;
    create table auth.users (
      id uuid primary key,
      email text,
      created_at timestamptz not null default now(),
      last_sign_in_at timestamptz,
      email_confirmed_at timestamptz,
      raw_user_meta_data jsonb default '{}'::jsonb
    );
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
    $$;
    insert into auth.users(id, email, email_confirmed_at)
      values ('${ADMIN}', 'admin@example.invalid', now());
  `);
  const migration = await readFile(new URL('../supabase/migrations/20261102153000_account_access.sql', import.meta.url), 'utf8');
  await db.exec(migration);
  await db.query(`insert into auth.users(id,email,raw_user_meta_data) values
    ($1, 'user@example.invalid', '{"role":"admin","plan":"agency"}'),
    ($2, 'other@example.invalid', '{}')`, [USER, OTHER]);
  await db.query("update public.account_access set role = 'admin' where user_id = $1", [ADMIN]);
}, 30_000);

beforeEach(async () => { await db.exec('begin'); });
afterEach(async () => { await db.exec('rollback'); });
afterAll(async () => { await db.close(); });

describe('Supabase account migration on PostgreSQL', () => {
  it('backfills old accounts and ignores role/plan signup metadata', async () => {
    const result = await db.query<{ user_id: string; role: string; plan: string }>(
      'select * from public.account_access order by user_id',
    );
    expect(result.rows).toHaveLength(3);
    expect(result.rows.find((row) => row.user_id === USER)).toMatchObject({ role: 'user', plan: 'free' });
    expect(result.rows.find((row) => row.user_id === ADMIN)?.plan).toBe('free');
  });

  it('lets a user read only their own access and never write roles', async () => {
    await actor(USER);
    const result = await db.query<{ user_id: string }>('select * from public.account_access');
    expect(result.rows.map((row) => row.user_id)).toEqual([USER]);
    expect((await rejected("update public.account_access set role = 'admin' where user_id = $1", [USER])).message).toContain('permission denied');
    expect((await rejected("insert into public.account_access(user_id,role) values ($1,'admin')", [OTHER])).message).toContain('permission denied');
    expect((await rejected('select * from public.account_access_audit')).message).toContain('permission denied');
  });

  it('rejects unauthenticated enumeration and role changes', async () => {
    await actor(null, 'anon');
    expect((await rejected('select public.admin_accounts(0)')).message).toContain('permission denied');
    expect((await rejected("select public.admin_update_account($1,'admin','agency',now())", [USER])).message).toContain('permission denied');
    expect((await rejected('select * from public.account_access')).message).toContain('permission denied');
  });

  it('rejects regular users even when calling RPCs directly', async () => {
    await actor(USER);
    expect((await rejected('select public.admin_accounts(0)')).message).toContain('admin-required');
    expect((await rejected("select public.admin_update_account($1,'admin','agency',now())", [USER])).message).toContain('admin-required');
  });

  it('returns real account counts and paginates without leaking auth metadata', async () => {
    await db.exec(`insert into auth.users(id,email)
      select ('10000000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid,
        'sample' || n || '@example.invalid' from generate_series(1,26) n`);
    await actor(ADMIN);
    const first = await db.query<{ result: { total: number; admins: number; confirmed: number; recent: number; accounts: unknown[]; plans: { free: number } } }>(
      'select public.admin_accounts(0) result',
    );
    const second = await db.query<{ result: { accounts: unknown[] } }>('select public.admin_accounts(1) result');
    expect(first.rows[0].result).toMatchObject({ total: 29, admins: 1, confirmed: 1, recent: 29, plans: { free: 29 } });
    expect(first.rows[0].result.accounts).toHaveLength(25);
    expect(second.rows[0].result.accounts).toHaveLength(4);
    expect(JSON.stringify(first.rows[0].result)).not.toContain('raw_user_meta_data');
    expect((await rejected('select public.admin_accounts(-1)')).message).toContain('invalid-page');
  });

  it('persists role and plan changes and records who changed them', async () => {
    const expected = await stamp(USER);
    await actor(ADMIN);
    await db.query("select public.admin_update_account($1,'admin','premium',$2)", [USER, expected]);
    await actor(USER);
    const access = await db.query<{ role: string; plan: string }>('select * from public.account_access');
    expect(access.rows[0]).toMatchObject({ role: 'admin', plan: 'premium' });
    expect((await db.query('select public.admin_accounts(0)')).rows).toHaveLength(1);
    await db.exec('reset role');
    const audit = await db.query('select * from public.account_access_audit');
    expect(audit.rows[0]).toMatchObject({
      actor_id: ADMIN, target_id: USER, previous_role: 'user', next_role: 'admin',
      previous_plan: 'free', next_plan: 'premium',
    });
  });

  it('protects the last admin and rejects stale or invalid changes', async () => {
    const expected = await stamp(ADMIN);
    const userStamp = await stamp(USER);
    await actor(ADMIN);
    expect((await rejected("select public.admin_update_account($1,'user','free',$2)", [ADMIN, expected])).message).toContain('last-admin');
    expect((await rejected("select public.admin_update_account($1,'owner','free',$2)", [USER, userStamp])).message).toContain('invalid-access');
    expect((await rejected("select public.admin_update_account($1,'user','enterprise',$2)", [USER, userStamp])).message).toContain('invalid-access');
    expect((await rejected("select public.admin_update_account($1,'user','pro','2000-01-01'::timestamptz)", [USER])).message).toContain('account-changed');
    expect((await rejected("select public.admin_update_account($1,'user','pro',null)", [USER])).message).toContain('account-changed');
    expect((await rejected("select public.admin_update_account('ffffffff-ffff-4fff-8fff-ffffffffffff','user','free',now())")).message).toContain('account-not-found');
  });

  it('revokes administrative RPC access immediately after demotion', async () => {
    const userStamp = await stamp(USER);
    const adminStamp = await stamp(ADMIN);
    await actor(ADMIN);
    await db.query("select public.admin_update_account($1,'admin','free',$2)", [USER, userStamp]);
    await actor(USER);
    await db.query("select public.admin_update_account($1,'user','free',$2)", [ADMIN, adminStamp]);
    await actor(ADMIN);
    expect((await rejected('select public.admin_accounts(0)')).message).toContain('admin-required');
  });

  it('deletes access rows when the auth account is deleted', async () => {
    await db.query('delete from auth.users where id = $1', [OTHER]);
    const result = await db.query('select * from public.account_access where user_id = $1', [OTHER]);
    expect(result.rows).toHaveLength(0);
  });
});
