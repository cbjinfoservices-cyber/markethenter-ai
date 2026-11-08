import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { describe, expect, it, vi } from 'vitest';
import { AMAZON_CATEGORIES } from '../supabase/functions/_shared/amazon';
import { createHandler } from '../supabase/functions/sourcing-bestsellers/handler';
import type { CatalogCache, CatalogSnapshot } from '../supabase/functions/sourcing-bestsellers/catalogCache';
import type { PriceCache } from '../supabase/functions/sourcing-bestsellers/verification';

const asin = 'B000000001';
const query = { market: 'FR', category: 'maison', kind: 'bestsellers' };
const request = (body: object) => new Request('https://local.invalid', {
  method: 'POST', body: JSON.stringify(body),
});
const snapshot = (): CatalogSnapshot => ({
  products: [{ asin, title: 'Cached product', price: 10 }],
  excludedPriceCount: 0,
  provenance: { ...query, collectedAt: new Date().toISOString() },
});
const setup = (authorize = async () => true) => {
  let saved = snapshot();
  const catalog: CatalogCache = {
    read: vi.fn(async () => saved),
    write: vi.fn(async (_key, value) => { saved = value; }),
  };
  const prices: PriceCache = {
    read: vi.fn(async () => ({ price: 10, checkedAt: new Date().toISOString() })),
    write: vi.fn(async () => {}),
  };
  const fetcher = vi.fn<typeof fetch>().mockImplementation(async (url) => {
    if (new URL(String(url)).searchParams.get('type') === 'product') return Response.json({
      request_info: { success: true }, request_parameters: { amazon_domain: 'amazon.fr' },
      product: { asin, buybox_winner: { price: { value: 20, currency: 'EUR' }, condition: { is_new: true } } },
    });
    return Response.json({ bestsellers: [{ asin, title: 'Updated product', price: { value: 20, currency: 'EUR' } }] });
  });
  const userAuth = vi.fn(async () => false);
  const handler = createHandler('mock', fetcher, 'rainforest', prices, catalog, userAuth, authorize);
  return { handler, catalog, prices, fetcher, userAuth };
};

describe('scheduled sourcing refresh', () => {
  it.each(['refresh-cache', 'refresh-prices'])('requires dedicated server authentication before %s can read cache or call providers', async (action) => {
    const { handler, catalog, prices, fetcher } = setup(async () => false);
    const result = await handler(request({ ...query, action, asins: [asin] }));
    expect(result.status).toBe(401);
    expect(catalog.read).not.toHaveBeenCalled();
    expect(prices.read).not.toHaveBeenCalled();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('does not let ordinary user authentication authorize scheduled actions', async () => {
    const { catalog, prices, fetcher } = setup();
    const userAuth = vi.fn(async () => true);
    const handler = createHandler('mock', fetcher, 'rainforest', prices, catalog, userAuth);
    expect((await handler(request({ ...query, action: 'refresh-cache' }))).status).toBe(401);
    expect(userAuth).not.toHaveBeenCalled();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it.each([{ market: 'DE' }, { category: 'all' }, { kind: 'most-wished-for' }])('restricts scheduled work to the seven France categories: %j', async (override) => {
    const { handler, fetcher } = setup();
    expect((await handler(request({ ...query, ...override, action: 'refresh-cache' }))).status).toBe(400);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('forces an hourly ranking update without using end-user authentication', async () => {
    const { handler, catalog, fetcher, userAuth } = setup();
    const result = await handler(request({ ...query, action: 'refresh-cache' }));
    expect(result.status).toBe(200);
    expect((await result.json()).products[0].title).toBe('Updated product');
    expect(catalog.write).toHaveBeenCalledTimes(1);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(userAuth).not.toHaveBeenCalled();
    fetcher.mockClear();
    expect((await handler(request({ ...query, action: 'read-cache' }))).status).toBe(200);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('refreshes even still-fresh prices so duration jitter cannot skip an hour', async () => {
    const { handler, prices, fetcher, userAuth } = setup();
    const result = await handler(request({ ...query, action: 'refresh-prices', asins: [asin] }));
    expect(result.status).toBe(200);
    expect((await result.json()).observations[0].price).toBe(20);
    expect(prices.write).toHaveBeenCalledTimes(1);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(userAuth).not.toHaveBeenCalled();
  });

  it('retains the last good ranking when an hourly update fails', async () => {
    const { handler, catalog, fetcher } = setup();
    fetcher.mockResolvedValue(new Response('', { status: 429 }));
    expect((await handler(request({ ...query, action: 'refresh-cache' }))).status).toBe(502);
    expect(catalog.write).not.toHaveBeenCalled();
    const restored = await handler(request({ ...query, action: 'read-cache' }));
    expect(restored.status).toBe(200);
    expect((await restored.json()).products[0].title).toBe('Cached product');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('reports scheduler authentication outages explicitly', async () => {
    const { handler, fetcher } = setup(async () => { throw new Error('cron-configuration'); });
    const result = await handler(request({ ...query, action: 'refresh-cache' }));
    expect(result.status).toBe(503);
    expect(await result.json()).toEqual({ error: 'auth-unavailable' });
    expect(fetcher).not.toHaveBeenCalled();
  });
});

describe('Supabase hourly dispatch plan', () => {
  it('plans exactly seven rankings and 56 bounded price batches, denies client access and deduplicates dispatches', async () => {
    const db = new PGlite();
    try {
      await db.exec(`
        create role anon; create role authenticated; create role service_role bypassrls;
        create schema vault; create schema net;
        create table vault.decrypted_secrets (name text primary key, decrypted_secret text);
        create table net.calls (id bigserial, url text, headers jsonb, body jsonb, timeout_ms integer);
        create function net.http_post(url text, headers jsonb, body jsonb, timeout_milliseconds integer)
        returns bigint language sql as $$
          insert into net.calls (url, headers, body, timeout_ms)
          values (url, headers, body, timeout_milliseconds) returning id;
        $$;
      `);
      await db.exec(readFileSync(new URL('../supabase/migrations/20261103094500_sourcing_catalog_cache.sql', import.meta.url), 'utf8'));
      const migration = readFileSync(new URL('../supabase/migrations/20261107211500_sourcing_hourly_refresh.sql', import.meta.url), 'utf8');
      await db.exec(migration.replace(/^create extension.*;\r?$/gm, '')
        .replace('v_now timestamptz := clock_timestamp();', "v_now timestamptz := '2026-11-07T12:16:00Z';"));
      const { rows } = await db.query<{ minute: number; category: string; action: string; batch: number }>(`
        select minute, plan.* from generate_series(0, 59) minute,
        lateral public.sourcing_refresh_plan(minute) plan order by minute, action;
      `);
      expect(rows).toHaveLength(63);
      for (const [index, category] of AMAZON_CATEGORIES.entries()) {
        expect(rows.filter((row) => row.category === category && row.action === 'refresh-cache'))
          .toEqual([{ minute: index * 8, category, action: 'refresh-cache', batch: -1 }]);
        expect(rows.filter((row) => row.category === category && row.action === 'refresh-prices')
          .map((row) => [row.minute, row.batch]))
          .toEqual(Array.from({ length: 8 }, (_, batch) => [index * 8 + batch + 1, batch]));
      }
      expect((await db.query('select * from public.sourcing_refresh_plan(-1)')).rows).toEqual([]);
      expect((await db.query('select * from public.sourcing_refresh_plan(60)')).rows).toEqual([]);
      await expect(db.query('select public.dispatch_sourcing_refresh()')).rejects.toThrow('Vault configuration');

      await db.exec(`
        insert into vault.decrypted_secrets values
          ('sourcing_function_url', 'https://testproject.supabase.co/functions/v1/sourcing-bestsellers'),
          ('sourcing_gateway_jwt', repeat('x', 32)),
          ('sourcing_cron_secret', repeat('y', 32));
      `);
      for (const category of AMAZON_CATEGORIES) {
        await db.query(`insert into public.sourcing_catalog_cache values ('rainforest','FR',$1,'bestsellers',$2)`, [
          category, { products: Array.from({ length: 24 }, (_, i) => ({ asin: `B${String(i).padStart(9, '0')}` })) },
        ]);
      }
      await db.query('select public.dispatch_sourcing_refresh()');
      const calls = (await db.query<{ body: { action: string; asins?: string[] }; timeout_ms: number }>('select body, timeout_ms from net.calls')).rows;
      expect(calls).toHaveLength(2);
      expect(calls.map((call) => call.body.action)).toEqual(['refresh-cache', 'refresh-prices']);
      for (const call of calls) {
        expect(call.timeout_ms).toBe(60000);
        if (call.body.action === 'refresh-prices') expect(call.body.asins).toHaveLength(3);
      }
      await db.query('select public.dispatch_sourcing_refresh()');
      expect((await db.query('select * from net.calls')).rows).toHaveLength(calls.length);
      const dispatcher = migration.slice(migration.indexOf('create function public.dispatch_sourcing_refresh()'))
        .replace('create function', 'create or replace function');
      for (let minute = 0; minute < 60; minute++) {
        await db.exec(dispatcher.replace(
          'v_now timestamptz := clock_timestamp();',
          `v_now timestamptz := '2026-11-07T12:${String(minute).padStart(2, '0')}:00Z';`,
        ));
        await db.query('select public.dispatch_sourcing_refresh()');
      }
      expect((await db.query('select * from net.calls')).rows).toHaveLength(63);
      expect((await db.query('select * from public.sourcing_refresh_requests')).rows).toHaveLength(63);
      for (const role of ['anon', 'authenticated']) {
        await db.exec(`set role ${role}`);
        await expect(db.query('select public.dispatch_sourcing_refresh()')).rejects.toThrow('permission denied');
        await expect(db.query('select * from public.sourcing_refresh_requests')).rejects.toThrow('permission denied');
        await db.exec('reset role');
      }
    } finally { await db.close(); }
  });
});
