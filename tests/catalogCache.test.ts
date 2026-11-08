import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { describe, expect, it, vi } from 'vitest';
import { CATALOG_CACHE_TTL, createCatalogCache } from '../supabase/functions/sourcing-bestsellers/catalogCache';
import type { CatalogCache, CatalogSnapshot } from '../supabase/functions/sourcing-bestsellers/catalogCache';
import { createHandler as createHandlerImpl } from '../supabase/functions/sourcing-bestsellers/handler';

const query = { market: 'FR', category: 'maison', kind: 'bestsellers' } as const;
const asin = 'B077SWXDS5';
const createHandler = (
  apiKey: Parameters<typeof createHandlerImpl>[0],
  fetcher?: Parameters<typeof createHandlerImpl>[1],
  provider?: Parameters<typeof createHandlerImpl>[2],
  cache?: Parameters<typeof createHandlerImpl>[3],
  catalogCache?: Parameters<typeof createHandlerImpl>[4],
) => createHandlerImpl(apiKey, fetcher, provider, cache, catalogCache, async () => true);
const request = (body: object = query) => new Request('https://local.invalid', {
  method: 'POST', body: JSON.stringify(body),
});
function setup() {
  const rows = new Map<string, CatalogSnapshot>();
  const cache: CatalogCache = {
    read: vi.fn(async (key) => rows.get(JSON.stringify(key)) ?? null),
    write: vi.fn(async (key, snapshot) => { rows.set(JSON.stringify(key), snapshot); }),
  };
  const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => Response.json({
    bestsellers: [{ asin, title: 'Mattress protector', price: { value: 19.99, currency: 'EUR' } }],
  }));
  const handler = createHandler('mock', fetcher, 'rainforest', undefined, cache);
  return { rows, cache, fetcher, handler };
}

describe('six hour sourcing catalog cache', () => {
  it('restores a cached catalog on page entry without credentials or a provider call', async () => {
    const { cache, fetcher, handler } = setup();
    const first = await (await handler(request())).json();
    fetcher.mockClear();
    const readOnly = createHandler(undefined, fetcher, 'rainforest', undefined, cache);
    expect(await (await readOnly(request({ ...query, action: 'read-cache' }))).json()).toEqual(first);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('never calls the provider for a missing or expired read-only cache', async () => {
    const { rows, cache, fetcher, handler } = setup();
    const readOnly = createHandler('mock', fetcher, 'rainforest', undefined, cache);
    expect(await (await readOnly(request({ ...query, action: 'read-cache' }))).json())
      .toEqual({ products: [], cacheMiss: true });
    expect(fetcher).not.toHaveBeenCalled();
    await handler(request());
    for (const snapshot of rows.values()) {
      snapshot.provenance.collectedAt = new Date(Date.now() - CATALOG_CACHE_TTL).toISOString();
    }
    fetcher.mockClear();
    expect(await (await readOnly(request({ ...query, action: 'read-cache' }))).json())
      .toEqual({ products: [], cacheMiss: true });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('reuses a persisted listing across handlers without a paid request or changing its observation date', async () => {
    const { cache, fetcher, handler } = setup();
    const first = await (await handler(request())).json();
    const again = createHandler('mock', fetcher, 'rainforest', undefined, cache);
    expect(await (await again(request())).json()).toEqual(first);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(cache.write).toHaveBeenCalledTimes(1);
    expect(cache.write).toHaveBeenCalledWith({ provider: 'rainforest', ...query }, expect.anything());
  });

  it('serves a fresh cache without provider credentials and rejects a miss without calling the provider', async () => {
    const { cache, fetcher, handler } = setup();
    await handler(request());
    const cachedWithoutKey = createHandler(undefined, fetcher, 'rainforest', undefined, cache);
    expect((await cachedWithoutKey(request())).status).toBe(200);
    const missWithoutKey = await cachedWithoutKey(request({ ...query, category: 'sport' }));
    expect(missWithoutKey.status).toBe(503);
    expect(await missWithoutKey.json()).toEqual({ error: 'missing-key' });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it.each([CATALOG_CACHE_TTL, CATALOG_CACHE_TTL + 1, -60_000])('refetches expired or future observations at age %s ms', async (age) => {
    const { rows, handler, fetcher } = setup();
    await handler(request());
    for (const snapshot of rows.values()) snapshot.provenance.collectedAt = new Date(Date.now() - age).toISOString();
    await handler(request());
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('isolates markets, categories and ranking types', async () => {
    const { handler, fetcher } = setup();
    for (const body of [query, { ...query, market: 'DE' }, { ...query, category: 'sport' }, { ...query, kind: 'most-wished-for' }]) {
      expect((await handler(request(body))).status).toBe(200);
      expect((await handler(request(body))).status).toBe(200);
    }
    expect(fetcher).toHaveBeenCalledTimes(4);
  });

  it('separates provider keys', async () => {
    const { cache, handler, fetcher } = setup();
    await handler(request());
    const logimu = createHandler('mock', fetcher, 'logimu', undefined, cache);
    await logimu(request());
    expect(cache.read).toHaveBeenLastCalledWith({ provider: 'logimu', ...query });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('refreshes price observations independently of the six hour catalog lifetime', async () => {
    const { cache, fetcher, handler } = setup();
    await handler(request());
    const prices = { read: vi.fn(async () => ({ price: 19.99, checkedAt: new Date().toISOString() })), write: vi.fn() };
    const cached = createHandler('mock', fetcher, 'rainforest', prices, cache);
    expect((await (await cached(request())).json()).observations).toHaveLength(1);
    prices.read.mockResolvedValue({ price: 19.99, checkedAt: new Date(Date.now() - 3_600_000).toISOString() });
    expect((await (await cached(request())).json()).observations).toEqual([]);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('fails before a paid request on cache read failure and reports write failures', async () => {
    const { cache, handler, fetcher } = setup();
    vi.mocked(cache.read).mockRejectedValueOnce(new Error('database unavailable'));
    expect(await (await handler(request())).json()).toEqual({ error: 'catalog-cache' });
    expect(fetcher).not.toHaveBeenCalled();
    vi.mocked(cache.write).mockRejectedValueOnce(new Error('database unavailable'));
    expect(await (await handler(request())).json()).toEqual({ error: 'catalog-cache' });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('never caches provider failures', async () => {
    const { cache, fetcher, handler } = setup();
    fetcher.mockResolvedValue(new Response('', { status: 500 }));
    expect((await handler(request())).status).toBe(502);
    expect(cache.write).not.toHaveBeenCalled();
  });

  it('uses exact REST key filters and reports storage errors', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json([]));
    const cache = createCatalogCache('https://local.invalid', 'mock', fetcher)!;
    expect(await cache.read({ provider: 'rainforest', ...query })).toBeNull();
    const url = new URL(String(fetcher.mock.calls[0][0]));
    for (const [field, value] of Object.entries({ provider: 'rainforest', ...query })) {
      expect(url.searchParams.get(field)).toBe(`eq.${value}`);
    }
    fetcher.mockResolvedValue(new Response('', { status: 500 }));
    await expect(cache.read({ provider: 'rainforest', ...query })).rejects.toThrow('catalog-cache');
  });

  it('keeps catalog data inaccessible to clients under PostgreSQL RLS', async () => {
    const db = new PGlite();
    try {
      await db.exec('create role anon; create role authenticated; create role service_role bypassrls;');
      const migration = readFileSync(new URL('../supabase/migrations/20261103094500_sourcing_catalog_cache.sql', import.meta.url), 'utf8');
      await db.exec(migration);
      await expect(db.exec(migration)).resolves.toBeDefined();
      await db.exec('set role authenticated');
      await expect(db.query('select * from public.sourcing_catalog_cache')).rejects.toThrow('permission denied');
      await db.exec('reset role; set role anon');
      await expect(db.query('select * from public.sourcing_catalog_cache')).rejects.toThrow('permission denied');
      await db.exec('reset role; set role service_role');
      await db.query(`insert into public.sourcing_catalog_cache values ('rainforest','FR','maison','bestsellers','{}')`);
      expect((await db.query('select * from public.sourcing_catalog_cache')).rows).toHaveLength(1);
    } finally { await db.close(); }
  });
});
