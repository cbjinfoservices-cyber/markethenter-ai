import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { describe, expect, it, vi } from 'vitest';
import { CATALOG_CACHE_TTL } from '../supabase/functions/sourcing-bestsellers/catalogCache';
import { PRICE_CACHE_TTL } from '../supabase/functions/sourcing-bestsellers/verification';
import { createRedisCache, withRedisCatalogCache, withRedisPriceCache } from '../supabase/functions/sourcing-bestsellers/redisCache';
import { createHandler } from '../supabase/functions/sourcing-bestsellers/handler';
import type { CatalogCache, CatalogSnapshot } from '../supabase/functions/sourcing-bestsellers/catalogCache';
import type { PriceCache } from '../supabase/functions/sourcing-bestsellers/verification';

const now = Date.parse('2026-11-07T12:00:00Z');
const key = { provider: 'rainforest', market: 'FR', category: 'maison', kind: 'bestsellers' } as const;
const asin = 'B077SWXDS5';
const snapshot = (age = 0): CatalogSnapshot => ({
  products: [{ asin }], excludedPriceCount: 0,
  provenance: { collectedAt: new Date(now - age).toISOString() },
});
const observation = (age = 0, price: number | null = 12) => ({
  price, checkedAt: new Date(now - age).toISOString(),
});

function redisHarness() {
  const rows = new Map<string, string>();
  const fetcher = vi.fn<typeof fetch>().mockImplementation(async (_url, init) => {
    const args = JSON.parse(String(init?.body)) as (string | number)[];
    if (args[0] === 'GET') return Response.json({ result: rows.get(String(args[1])) ?? null });
    if (args[0] === 'EVAL') {
      const cacheKey = String(args[3]);
      const existing = rows.get(cacheKey);
      if (existing && JSON.parse(existing).observedAt > args[5]) return Response.json({ result: 0 });
      rows.set(cacheKey, String(args[4]));
      return Response.json({ result: 1 });
    }
    throw new Error('unexpected command');
  });
  return { rows, fetcher, redis: createRedisCache('https://redis.example.com', 'test-token', fetcher)! };
}

describe('Redis and PostgreSQL sourcing caches', () => {
  it('promotes only the remaining catalogue TTL and serves the next read from Redis', async () => {
    const { fetcher, redis } = redisHarness();
    const database: CatalogCache = { read: vi.fn(async () => snapshot(1000)), write: vi.fn() };
    const cache = withRedisCatalogCache(database, redis, 'test', () => now);
    expect(await cache.read(key)).toEqual(snapshot(1000));
    const command = JSON.parse(String(fetcher.mock.calls[1][1]?.body));
    expect(command[0]).toBe('EVAL');
    expect(command[3]).toBe('test:catalog:rainforest:FR:maison:bestsellers');
    expect(command[6]).toBe(CATALOG_CACHE_TTL - 1000);
    expect(await cache.read(key)).toEqual(snapshot(1000));
    expect(database.read).toHaveBeenCalledTimes(1);
  });

  it('keeps prices including absent prices separate by market and ASIN', async () => {
    const { redis } = redisHarness();
    const database: PriceCache = { read: vi.fn(async () => observation(2000, null)), write: vi.fn() };
    const cache = withRedisPriceCache(database, redis, 'test', () => now);
    expect(await cache.read('FR', asin)).toEqual(observation(2000, null));
    expect(await cache.read('FR', asin)).toEqual(observation(2000, null));
    expect(await cache.read('DE', asin)).toEqual(observation(2000, null));
    expect(await cache.read('FR', 'B077SWXDS6')).toEqual(observation(2000, null));
    expect(database.read).toHaveBeenCalledTimes(3);
  });

  it('never promotes expired or future observations or extends their lifetime', async () => {
    const { fetcher, redis } = redisHarness();
    const database: PriceCache = { read: vi.fn(async () => observation(PRICE_CACHE_TTL)), write: vi.fn() };
    const cache = withRedisPriceCache(database, redis, 'test', () => now);
    await cache.read('FR', asin);
    await cache.write('FR', asin, observation(-1000));
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(database.write).toHaveBeenCalledTimes(1);
  });

  it.each([PRICE_CACHE_TTL, PRICE_CACHE_TTL + 1, -1000])(
    'does not serve a Redis price with age %s ms',
    async (age) => {
      const { rows, redis } = redisHarness();
      rows.set(`test:price:FR:${asin}`, JSON.stringify({
        observedAt: now - age, value: observation(age),
      }));
      const database: PriceCache = { read: vi.fn(async () => observation()), write: vi.fn() };
      const cache = withRedisPriceCache(database, redis, 'test', () => now);
      expect(await cache.read('FR', asin)).toEqual(observation());
      expect(database.read).toHaveBeenCalledTimes(1);
    },
  );

  it('serves a cached listing and Buy Box price without a paid request or database read', async () => {
    const { redis } = redisHarness();
    const catalogDatabase: CatalogCache = { read: vi.fn(async () => null), write: vi.fn() };
    const priceDatabase: PriceCache = { read: vi.fn(async () => null), write: vi.fn() };
    const catalog = withRedisCatalogCache(catalogDatabase, redis, 'test');
    const prices = withRedisPriceCache(priceDatabase, redis, 'test');
    const date = new Date().toISOString();
    await catalog.write(key, { ...snapshot(), provenance: { collectedAt: date } });
    await prices.write('FR', asin, { price: 12, checkedAt: date });
    const providerFetch = vi.fn<typeof fetch>();
    const handler = createHandler('key', providerFetch, 'rainforest', prices, catalog, async () => true);
    const response = await handler(new Request('https://local.invalid', {
      method: 'POST', body: JSON.stringify({ ...key, action: 'read-cache' }),
    }));
    expect(response.status).toBe(200);
    expect((await response.json()).observations).toEqual([{ asin, price: 12, checkedAt: date }]);
    expect(catalogDatabase.read).not.toHaveBeenCalled();
    expect(priceDatabase.read).not.toHaveBeenCalled();
    expect(providerFetch).not.toHaveBeenCalled();
  });

  it('falls back to PostgreSQL on Redis failure and propagates database errors', async () => {
    const { fetcher, redis } = redisHarness();
    fetcher.mockRejectedValue(new Error('unavailable'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const database: PriceCache = { read: vi.fn(async () => observation()), write: vi.fn() };
      const cache = withRedisPriceCache(database, redis, 'test', () => now);
      expect(await cache.read('FR', asin)).toEqual(observation());
      await cache.write('FR', asin, observation());
      expect(database.write).toHaveBeenCalledTimes(1);
      expect(warn).toHaveBeenCalled();
      vi.mocked(database.read).mockRejectedValueOnce(new Error('verification-cache'));
      await expect(cache.read('FR', asin)).rejects.toThrow('verification-cache');
      vi.mocked(database.write).mockRejectedValueOnce(new Error('verification-cache'));
      await expect(cache.write('FR', asin, observation())).rejects.toThrow('verification-cache');
    } finally { warn.mockRestore(); }
  });

  it('rejects invalid Redis entries and does not allow an older promotion to replace a newer entry', async () => {
    const { rows, redis } = redisHarness();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const cacheKey = `test:price:FR:${asin}`;
      rows.set(cacheKey, JSON.stringify({ observedAt: now, value: { price: -1, checkedAt: 'bad' } }));
      const database: PriceCache = { read: vi.fn(async () => observation()), write: vi.fn() };
      const cache = withRedisPriceCache(database, redis, 'test', () => now);
      expect(await cache.read('FR', asin)).toEqual(observation());
      expect(warn).toHaveBeenCalled();
      await cache.write('FR', asin, observation(5000, 7));
      expect(await cache.read('FR', asin)).toEqual(observation());
    } finally { warn.mockRestore(); }
  });
});

describe('sourcing history migration', () => {
  it('backfills current caches and records changes atomically, without exposing history to clients', async () => {
    const db = new PGlite();
    try {
      await db.exec('create role anon; create role authenticated; create role service_role bypassrls;');
      for (const file of ['20261103080500_sourcing_price_cache.sql', '20261103094500_sourcing_catalog_cache.sql']) {
        await db.exec(readFileSync(new URL(`../supabase/migrations/${file}`, import.meta.url), 'utf8'));
      }
      await db.query('insert into public.sourcing_catalog_cache values ($1,$2,$3,$4,$5)', [
        key.provider, key.market, key.category, key.kind, JSON.stringify(snapshot(1000)),
      ]);
      await db.query('insert into public.sourcing_price_cache values ($1,$2,$3,$4)', ['FR', asin, null, observation(1000).checkedAt]);
      await db.exec(readFileSync(new URL('../supabase/migrations/20261107170000_sourcing_history.sql', import.meta.url), 'utf8'));
      await db.query('update public.sourcing_catalog_cache set snapshot=$1', [JSON.stringify(snapshot())]);
      await db.query('update public.sourcing_price_cache set price=$1, checked_at=$2', [12, observation().checkedAt]);
      await db.query('update public.sourcing_price_cache set price=$1, checked_at=$2', [12, observation().checkedAt]);
      expect((await db.query('select * from public.sourcing_catalog_history')).rows).toHaveLength(2);
      expect((await db.query('select * from public.sourcing_price_history')).rows).toHaveLength(2);
      await expect(db.query('update public.sourcing_catalog_cache set snapshot=$1', [
        JSON.stringify({ products: [], provenance: { collectedAt: 'invalid' } }),
      ])).rejects.toThrow();
      expect((await db.query('select * from public.sourcing_catalog_history')).rows).toHaveLength(2);
      expect((await db.query<{ snapshot: CatalogSnapshot }>('select snapshot from public.sourcing_catalog_cache')).rows[0].snapshot).toEqual(snapshot());
      await db.exec('set role authenticated');
      await expect(db.query('select * from public.sourcing_price_history')).rejects.toThrow('permission denied');
      await expect(db.query('select * from public.sourcing_catalog_history')).rejects.toThrow('permission denied');
      await db.exec('reset role; set role service_role');
      expect((await db.query('select * from public.sourcing_price_history')).rows).toHaveLength(2);
      await expect(db.query('delete from public.sourcing_price_history')).rejects.toThrow('permission denied');
      await db.query('update public.sourcing_price_cache set price=$1, checked_at=$2', [13, observation(-1000).checkedAt]);
      expect((await db.query('select * from public.sourcing_price_history')).rows).toHaveLength(3);
    } finally { await db.close(); }
  });
});
