import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { describe, expect, it, vi } from 'vitest';
import { createPriceCache, createPriceVerifier } from '../supabase/functions/sourcing-bestsellers/verification';
import type { PriceCache, PriceObservation } from '../supabase/functions/sourcing-bestsellers/verification';
import { createHandler as createHandlerImpl } from '../supabase/functions/sourcing-bestsellers/handler';
import { applyPriceObservations, parseCatalog } from '@/pages/sourcing/sourcingCatalog';
import { availableProducts, parsePriceVerification } from '@/pages/sourcing/availableProducts';
import { canCalculateProduct, pricesAgree, rowFor, valuesFor } from '@/pages/sourcing/productMargin';
import { listingUrl } from '../supabase/functions/_shared/amazon';
import { itemFromRow } from '@/pages/sourcing/compareItem';
import { blankCalculation, incompleteCalculationFields, manualCalculation, FIELD_KEYS, INITIAL } from '@/pages/home/calcModel';

const asin = 'B01FXICQ50';
const now = Date.now();
const checkedAt = new Date(now).toISOString();
const authorize = async () => true;
const createHandler = (
  apiKey: Parameters<typeof createHandlerImpl>[0],
  fetcher?: Parameters<typeof createHandlerImpl>[1],
  provider?: Parameters<typeof createHandlerImpl>[2],
  cache?: Parameters<typeof createHandlerImpl>[3],
  catalogCache?: Parameters<typeof createHandlerImpl>[4],
) => createHandlerImpl(apiKey, fetcher, provider, cache, catalogCache, authorize);
const q = { market: 'FR', category: 'maison', kind: 'bestsellers', exchangeRate: 1 } as const;
const products = () => parseCatalog({
  products: [{ asin, title: 'Wipes', price: 215, priceText: '€215' }],
  provenance: {
    ...q, provider: 'Rainforest API', currency: 'EUR', collectedAt: checkedAt,
    sourceUrl: listingUrl('FR', 'maison', 'bestsellers'),
  },
}, q).products;
const response = (price: unknown = { value: 1.89, currency: 'EUR', raw: '1,89 €' }) => Response.json({
  request_info: { success: true },
  request_parameters: { amazon_domain: 'amazon.fr' },
  product: { asin, buybox_winner: { price, condition: { is_new: true } } },
});
const memoryCache = () => {
  const rows = new Map<string, PriceObservation>();
  const cache: PriceCache = {
    read: vi.fn(async (market, id) => rows.get(`${market}:${id}`) ?? null),
    write: vi.fn(async (market, id, observation) => { rows.set(`${market}:${id}`, observation); }),
  };
  return { rows, cache };
};

describe('budgeted Rainforest verification', () => {
  it.each([1.89, null])('restores fresh cached detail prices in a refreshed ranking without product API calls: %s', async (price) => {
    const { cache, rows } = memoryCache();
    rows.set(`FR:${asin}`, { price, checkedAt });
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json({
      request_info: { success: true },
      bestsellers: [{ asin, title: 'Wipes', price: { value: 215, currency: 'EUR', raw: '€215' } }],
    }));
    const result = await createHandler('mock', fetcher, 'rainforest', cache)(new Request('https://local.invalid', {
      method: 'POST', body: JSON.stringify(q),
    }));
    expect(result.status).toBe(200);
    const restored = parseCatalog(await result.json(), q).products[0];
    expect(restored.detailPrice).toBe(price);
    expect(restored.priceCheckedAt).toBe(checkedAt);
    expect(restored.priceVerification).toBe(price === null ? 'unavailable' : 'mismatch');
    expect(canCalculateProduct(restored)).toBe(false);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(new URL(String(fetcher.mock.calls[0][0])).searchParams.get('type')).toBe('bestsellers');
    expect(cache.write).not.toHaveBeenCalled();
  });

  it('does not restore expired or future cached prices in listings', async () => {
    const { cache, rows } = memoryCache();
    rows.set(`FR:${asin}`, { price: 1.89, checkedAt: new Date(Date.now() - 3_600_000).toISOString() });
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => Response.json({
      bestsellers: [{ asin, title: 'Wipes', price: { value: 215, currency: 'EUR' } }],
    }));
    const handler = createHandler('mock', fetcher, 'rainforest', cache);
    for (const stamp of [Date.now() - 3_600_000, Date.now() + 60_000]) {
      rows.set(`FR:${asin}`, { price: 1.89, checkedAt: new Date(stamp).toISOString() });
      const result = await handler(new Request('https://local.invalid', { method: 'POST', body: JSON.stringify(q) }));
      expect((await result.json()).observations).toEqual([]);
    }
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('reports listing cache read errors instead of discarding existing detail prices silently', async () => {
    const { cache } = memoryCache();
    cache.read = vi.fn().mockRejectedValue(new Error('verification-cache'));
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json({
      bestsellers: [{ asin, title: 'Wipes', price: { value: 215, currency: 'EUR' } }],
    }));
    const result = await createHandler('mock', fetcher, 'rainforest', cache)(new Request('https://local.invalid', {
      method: 'POST', body: JSON.stringify(q),
    }));
    expect(result.status).toBe(502);
    expect(await result.json()).toEqual({ error: 'verification-cache' });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('queries the exact product once and reuses the persistent cache across verifier instances', async () => {
    const { cache } = memoryCache();
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => response());
    const first = createPriceVerifier('mock', cache, fetcher, () => now);
    expect(await first('FR', asin, authorize)).toEqual({ price: 1.89, checkedAt });
    const second = createPriceVerifier('mock', cache, fetcher, () => now + 1000);
    expect(await second('FR', asin, authorize)).toEqual({ price: 1.89, checkedAt });
    expect(fetcher).toHaveBeenCalledTimes(1);
    const target = new URL(String(fetcher.mock.calls[0][0]));
    expect(target.searchParams.get('type')).toBe('product');
    expect(target.searchParams.get('asin')).toBe(asin);
    expect(target.searchParams.get('amazon_domain')).toBe('amazon.fr');
  });

  it('coalesces concurrent identical requests within one handler', async () => {
    const { cache } = memoryCache();
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => response());
    const verify = createPriceVerifier('mock', cache, fetcher, () => now);
    await Promise.all([verify('FR', asin, authorize), verify('FR', asin, authorize)]);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it.each([undefined, null, { value: 215, currency: 'USD' }, { value: 215, currency: 'EUR', raw: '2,15 €' }])('caches missing or unusable prices without approving the listing: %j', async (price) => {
    const { cache } = memoryCache();
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json({
      request_info: { success: true }, product: { asin, buybox_winner: { price, condition: { is_new: true } } },
      request_parameters: { amazon_domain: 'amazon.fr' },
    }));
    const verify = createPriceVerifier('mock', cache, fetcher, () => now);
    expect((await verify('FR', asin, authorize)).price).toBeNull();
    expect((await verify('FR', asin, authorize)).price).toBeNull();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('expires at exactly one hour and isolates countries', async () => {
    const { cache, rows } = memoryCache();
    rows.set(`FR:${asin}`, { price: 1.89, checkedAt: new Date(now - 3_600_000).toISOString() });
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async (url) => Response.json({
      request_info: { success: true },
      request_parameters: { amazon_domain: new URL(String(url)).searchParams.get('amazon_domain') },
      product: { asin, buybox_winner: { price: { value: 1.89, currency: 'EUR' }, condition: { is_new: true } } },
    }));
    const verify = createPriceVerifier('mock', cache, fetcher, () => now);
    await verify('FR', asin, authorize);
    await verify('DE', asin, authorize);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('fails before a paid call if cache reads fail', async () => {
    const { cache } = memoryCache();
    cache.read = vi.fn().mockRejectedValue(new Error('verification-cache'));
    const fetcher = vi.fn<typeof fetch>();
    await expect(createPriceVerifier('mock', cache, fetcher)('FR', asin, authorize)).rejects.toThrow('verification-cache');
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('requires authentication only when price verification would call the provider', async () => {
    const { cache, rows } = memoryCache();
    const fetcher = vi.fn<typeof fetch>();
    const authenticate = vi.fn(async () => false);
    const handler = createHandlerImpl('mock', fetcher, 'rainforest', cache, undefined, authenticate);
    const verify = () => handler(new Request('https://local.invalid', {
      method: 'POST', body: JSON.stringify({ action: 'verify-prices', market: 'FR', asins: [asin] }),
    }));

    rows.set(`FR:${asin}`, { price: 1.89, checkedAt });
    const freshCacheResponse = await verify();
    expect(freshCacheResponse.status).toBe(200);
    expect(authenticate).not.toHaveBeenCalled();

    rows.set(`FR:${asin}`, { price: 1.89, checkedAt: new Date(now - 3_600_000).toISOString() });
    const expiredCacheResponse = await verify();
    expect(expiredCacheResponse.status).toBe(401);
    expect(await expiredCacheResponse.json()).toEqual({ error: 'auth-required' });
    expect(authenticate).toHaveBeenCalledTimes(1);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('reports authentication service failures without calling the price provider', async () => {
    const { cache } = memoryCache();
    const fetcher = vi.fn<typeof fetch>();
    const handler = createHandlerImpl('mock', fetcher, 'rainforest', cache, undefined, async () => {
      throw new Error('auth unavailable');
    });
    const result = await handler(new Request('https://local.invalid', {
      method: 'POST', body: JSON.stringify({ action: 'verify-prices', market: 'FR', asins: [asin] }),
    }));
    expect(result.status).toBe(503);
    expect(await result.json()).toEqual({ error: 'auth-unavailable' });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it.each([
    { request_info: { success: false }, product: { asin } },
    { request_info: { success: true }, product: { asin: 'B012345678' } },
  ])('rejects rejected or wrong-ASIN responses', async (body) => {
    const { cache } = memoryCache();
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json(body));
    await expect(createPriceVerifier('mock', cache, fetcher)('FR', asin, authorize)).rejects.toThrow('provider-invalid');
    expect(cache.write).not.toHaveBeenCalled();
  });

  it.each([[asin, asin], [asin, asin, asin, asin], [], ['not-an-asin']].map((asins) => ({ asins })))('rejects invalid budget requests $asins before provider calls', async ({ asins }) => {
    const { cache } = memoryCache();
    const fetcher = vi.fn<typeof fetch>();
    const result = await createHandler('mock', fetcher, 'rainforest', cache)(new Request('https://local.invalid', {
      method: 'POST', body: JSON.stringify({ action: 'verify-prices', market: 'FR', asins }),
    }));
    expect(result.status).toBe(400);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('supports exactly three ASINs without extra enrichment calls', async () => {
    const { cache } = memoryCache();
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async (url) => Response.json({
      request_info: { success: true },
      request_parameters: { amazon_domain: 'amazon.fr' },
      product: { asin: new URL(String(url)).searchParams.get('asin'), buybox_winner: {} },
    }));
    const result = await createHandler('mock', fetcher, 'rainforest', cache)(new Request('https://local.invalid', {
      method: 'POST', body: JSON.stringify({ action: 'verify-prices', market: 'FR', asins: [asin, 'B012345678', 'B012345679'] }),
    }));
    expect(result.status).toBe(200);
    expect((await result.json()).observations).toHaveLength(3);
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it.each([401, 403, 402, 429, 500, 503])('preserves provider HTTP %s without caching failures or retrying paid requests', async (status) => {
    const { cache } = memoryCache();
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response('private provider details', { status }));
    const result = await createHandler('mock', fetcher, 'rainforest', cache)(new Request('https://local.invalid', {
      method: 'POST', body: JSON.stringify({ action: 'verify-prices', market: 'FR', asins: [asin] }),
    }));
    expect(result.status).toBe(502);
    expect(await result.json()).toEqual({
      error: status === 401 || status === 403 ? 'provider-auth' : 'provider-http', providerStatus: status,
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(cache.write).not.toHaveBeenCalled();
  });

  it.each([0, 1, 2])('returns all successful observations when ASIN index %s fails, and reuses them on retry', async (failedIndex) => {
    const { cache, rows } = memoryCache();
    const asins = [asin, 'B012345678', 'B012345679'];
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async (url) => {
      const id = new URL(String(url)).searchParams.get('asin');
      if (id === asins[failedIndex]) return new Response('', { status: 429 });
      return Response.json({
        request_info: { success: true }, request_parameters: { amazon_domain: 'amazon.fr' },
        product: { asin: id, buybox_winner: { price: { value: 10, currency: 'EUR' }, condition: { is_new: true } } },
      });
    });
    const handler = createHandler('mock', fetcher, 'rainforest', cache);
    const verifyRequest = () => new Request('https://local.invalid', {
      method: 'POST', body: JSON.stringify({ action: 'verify-prices', market: 'FR', asins }),
    });
    const result = await handler(verifyRequest());
    expect(result.status).toBe(502);
    const body = await result.json();
    expect(body).toMatchObject({ error: 'provider-http', providerStatus: 429, market: 'FR', currency: 'EUR' });
    expect(body.observations.map((item: { asin: string }) => item.asin)).toEqual(asins.filter((_, index) => index !== failedIndex));
    expect(body.observations.every((item: PriceObservation) => item.price === 10)).toBe(true);
    expect(rows.size).toBe(2);
    expect(fetcher).toHaveBeenCalledTimes(3);

    const progress = vi.fn();
    await expect(availableProducts(
      asins.map((id) => ({ asin: id, price: 215 })),
      [],
      async () => parsePriceVerification(body),
      () => true,
      progress,
    )).rejects.toThrow('provider-http');
    expect(progress).toHaveBeenLastCalledWith(
      asins.filter((_, index) => index !== failedIndex).map((id) => ({ asin: id, price: 10 })),
    );

    const retried = await handler(verifyRequest());
    expect(retried.status).toBe(502);
    expect((await retried.json()).observations).toEqual(body.observations);
    expect(fetcher).toHaveBeenCalledTimes(4);
  });
});

describe('financial verification gate', () => {
  it('requires every cost, tax and volume input before presenting manual profitability', () => {
    expect(incompleteCalculationFields(manualCalculation('?manual=1&price=19.99').values)).toEqual(
      FIELD_KEYS.filter((key) => key !== 'price'),
    );
    expect(incompleteCalculationFields(INITIAL)).toEqual([]);
  });

  it.each(FIELD_KEYS)('does not treat a blank %s field as an explicit zero', (key) => {
    expect(incompleteCalculationFields({ ...INITIAL, [key]: '' })).toEqual([key]);
    expect(incompleteCalculationFields({ ...INITIAL, [key]: '0' })).toEqual(key === 'price' ? [key] : []);
  });

  it.each(['Infinity', 'NaN', '-1', '46'])('rejects invalid commission values: %s', (amazon) => {
    expect(incompleteCalculationFields({ ...INITIAL, amazon })).toEqual(['amazon']);
  });

  it('prefills only the manually confirmed price, never estimated costs', () => {
    const manual = manualCalculation('?manual=1&price=1.89');
    expect(manual.invalidPrice).toBe(false);
    expect(manual.values.price).toBe('1.89');
    for (const key of FIELD_KEYS.filter((key) => key !== 'price')) expect(manual.values[key]).toBe('');
  });

  it.each(['', '-1', '0', 'NaN', 'Infinity', 'text'])('reports an invalid manual price instead of restoring stored data: %s', (price) => {
    expect(manualCalculation(`?manual=1&price=${price}`)).toEqual({ values: blankCalculation(), invalidPrice: true });
  });
  it('opens manual entry without carrying unverified prices or hypothetical costs', () => {
    const blank = blankCalculation();
    expect(Object.keys(blank)).toHaveLength(FIELD_KEYS.length);
    for (const key of FIELD_KEYS) expect(blank[key]).toBe('');
  });
  it('accepts exactly one cent of difference but not more', () => {
    expect(pricesAgree(16.9, 16.91)).toBe(true);
    expect(pricesAgree(16.9, 16.911)).toBe(false);
    expect(pricesAgree(215, 1.89)).toBe(false);
  });
  it.each([null, 1.89])('blocks Sanytol when its detail price is %s, including compare/calculator inputs', (price) => {
    const result = applyPriceObservations({ market: 'FR', currency: 'EUR', observations: [{ asin, price, checkedAt }] }, products(), 'FR', [asin])[0];
    expect(result.priceVerification).toBe(price === null ? 'unavailable' : 'mismatch');
    expect(canCalculateProduct(result, now)).toBe(false);
    expect(valuesFor(result).price).toBe(String(result.price));
    expect(rowFor(result, 5, 20).metrics).toBeDefined();
  });

  it('blocks legacy unverified listings, permits concordance and expires it', () => {
    const product = products()[0];
    expect(canCalculateProduct(product, now)).toBe(false);
    const verified = applyPriceObservations({
      market: 'FR', currency: 'EUR', observations: [{ asin, price: 215, checkedAt }],
    }, [product], 'FR', [asin])[0];
    expect(canCalculateProduct(verified, now)).toBe(true);
    expect(canCalculateProduct(verified, now + 3_600_000)).toBe(false);
    expect(canCalculateProduct(verified, now - 1)).toBe(false);
  });

  it('rejects mismatched provenance or missing observations', () => {
    expect(() => applyPriceObservations({ market: 'DE', currency: 'EUR', observations: [] }, products(), 'FR', [asin])).toThrow('provider-invalid');
    expect(() => applyPriceObservations({ market: 'FR', currency: 'EUR', observations: [] }, products(), 'FR', [asin])).toThrow('provider-invalid');
  });
});

describe('persistent cache access', () => {
  it('surfaces database failures and never returns a success-shaped cache fallback', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response('', { status: 500 }));
    const cache = createPriceCache('https://local.invalid', 'mock', fetcher)!;
    await expect(cache.read('FR', asin)).rejects.toThrow('verification-cache');
    await expect(cache.write('FR', asin, { price: null, checkedAt })).rejects.toThrow('verification-cache');
  });

  it('keeps cache writes server-only with RLS in PostgreSQL', async () => {
    const db = new PGlite();
    try {
      await db.exec('create role anon; create role authenticated; create role service_role bypassrls;');
      await db.exec(readFileSync(new URL('../supabase/migrations/20261103080500_sourcing_price_cache.sql', import.meta.url), 'utf8'));
      await db.exec(`insert into public.sourcing_price_cache values ('FR', '${asin}', null, now()); set role authenticated;`);
      await expect(db.query('select * from public.sourcing_price_cache')).rejects.toThrow('permission denied');
      await db.exec('reset role; set role service_role;');
      expect((await db.query('select * from public.sourcing_price_cache')).rows).toHaveLength(1);
    } finally { await db.close(); }
  });
});
