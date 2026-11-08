import { AMAZON_MARKETS, SOURCING_PROVIDERS, isSourcingProvider, isCategory, isListingKind, isMarket, isRecord, listingUrl, normaliseListings } from '../_shared/amazon.ts';
import { createPriceVerifier, PRICE_CACHE_TTL, ProviderHttpError } from './verification.ts';
import type { PriceCache } from './verification.ts';
import { CATALOG_CACHE_TTL } from './catalogCache.ts';
import type { CatalogCache, CatalogSnapshot } from './catalogCache.ts';
import { resolveProviderKey } from './providerKey.ts';
import type { ProviderKey } from './providerKey.ts';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export type RequestAuthenticator = (request: Request) => Promise<boolean>;

export function createHandler(
  apiKey: ProviderKey,
  fetcher: typeof fetch = fetch,
  provider = 'rainforest',
  cache?: PriceCache,
  catalogCache?: CatalogCache,
  authenticate: RequestAuthenticator = async () => false,
  authenticateScheduled: RequestAuthenticator = async () => false,
) {
  const verify = cache ? createPriceVerifier(apiKey, cache, fetcher) : null;
  return async (req: Request): Promise<Response> => {
    const json = (body: unknown, status = 200): Response =>
      new Response(JSON.stringify(body), {
        status,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });

    if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });
    if (req.method !== 'POST') return json({ error: 'method-not-allowed' }, 405);

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return json({ error: 'invalid-json' }, 400);
    }
    if (!isRecord(body)) return json({ error: 'invalid-request' }, 400);
    const { market = 'FR', category = 'all', kind = 'bestsellers' } = body;
    if (!isMarket(market) || !isCategory(category) || !isListingKind(kind)) {
      return json({ error: 'invalid-request' }, 400);
    }
    if (!isSourcingProvider(provider)) return json({ error: 'invalid-provider' }, 503);
    const scheduled = body.action === 'refresh-cache' || body.action === 'refresh-prices';
    if (scheduled) {
      if (provider !== 'rainforest' || market !== 'FR' || kind !== 'bestsellers' || category === 'all') {
        return json({ error: 'invalid-request' }, 400);
      }
      try {
        if (!await authenticateScheduled(req)) return json({ error: 'auth-required' }, 401);
      } catch {
        return json({ error: 'auth-unavailable' }, 503);
      }
      if (!catalogCache) return json({ error: 'catalog-cache' }, 503);
    }
    if (body.action === 'verify-prices' || body.action === 'refresh-prices') {
      if (provider !== 'rainforest') return json({ error: 'verification-provider' }, 400);
      if (typeof apiKey !== 'function' && !apiKey?.trim()) return json({ error: 'missing-key' }, 503);
      if (!verify) return json({ error: 'verification-cache' }, 503);
      if (!Array.isArray(body.asins) || body.asins.length < 1 || body.asins.length > 3 ||
        body.asins.some((asin) => typeof asin !== 'string' || !/^[A-Z0-9]{10}$/.test(asin)) ||
        new Set(body.asins).size !== body.asins.length) return json({ error: 'invalid-request' }, 400);
      const asins: string[] = body.asins;
      const observations = [];
      try {
        const results = await Promise.allSettled(asins.map(async (asin) => ({
          asin, ...await verify(market, asin, () => scheduled ? Promise.resolve(true) : authenticate(req), scheduled),
        })));
        for (const result of results) {
          if (result.status === 'fulfilled') observations.push(result.value);
        }
        const failed = results.find((result) => result.status === 'rejected');
        if (failed?.status === 'rejected') throw failed.reason;
        return json({ market, currency: AMAZON_MARKETS[market].currency, observations });
      } catch (error) {
        const code = error instanceof Error ? error.message : '';
        const partial = observations.length ? { market, currency: AMAZON_MARKETS[market].currency, observations } : {};
        if (code === 'auth-required') return json({ error: code, ...partial }, 401);
        if (code === 'auth-unavailable') return json({ error: code, ...partial }, 503);
        if (code === 'missing-key' || code === 'provider-key-store') return json({ error: code, ...partial }, 503);
        const allowed = ['provider-auth', 'provider-http', 'provider-invalid', 'verification-cache'];
        const timeout = error instanceof Error && ['TimeoutError', 'AbortError'].includes(error.name);
        return json({
          error: allowed.includes(code) ? code : timeout ? 'provider-timeout' : 'provider-unreachable',
          ...partial,
          ...(error instanceof ProviderHttpError ? { providerStatus: error.providerStatus } : {}),
        }, 502);
      }
    }
    const cacheOnly = body.action === 'read-cache';
    if (body.action !== undefined && !cacheOnly && body.action !== 'refresh-cache') return json({ error: 'invalid-request' }, 400);
    if (provider === 'logimu' && kind !== 'bestsellers') {
      return json({ error: 'unsupported-ranking' }, 400);
    }
    if (provider === 'logimu' && category === 'all') {
      return json({ error: 'category-required' }, 400);
    }
    const sourceUrl = listingUrl(market, category, kind);
    const cacheKey = { provider, market, category, kind };
    const withObservations = async (snapshot: CatalogSnapshot): Promise<Response> => {
      const observations = [];
      if (provider === 'rainforest' && cache) {
        const results = await Promise.allSettled(snapshot.products.map(async (product) => {
          if (!isRecord(product) || typeof product.asin !== 'string') throw new Error('catalog-cache');
          const saved = await cache.read(market, product.asin);
          const age = saved ? Date.now() - Date.parse(saved.checkedAt) : Infinity;
          return saved && age >= 0 && age < PRICE_CACHE_TTL ? { asin: product.asin, ...saved } : null;
        }));
        for (const result of results) {
          if (result.status === 'rejected') return json({ error: 'verification-cache' }, 502);
          if (result.value) observations.push(result.value);
        }
      }
      return json({ ...snapshot, observations });
    };
    if (catalogCache) {
      try {
        const saved = await catalogCache.read(cacheKey);
        const age = saved ? Date.now() - Date.parse(saved.provenance.collectedAt) : Infinity;
        if (!scheduled && saved && age >= 0 && age < CATALOG_CACHE_TTL) return await withObservations(saved);
      } catch {
        return json({ error: 'catalog-cache' }, 503);
      }
    }
    if (cacheOnly) {
      if (!catalogCache) return json({ error: 'catalog-cache' }, 503);
      return json({ products: [], cacheMiss: true });
    }
    if (typeof apiKey !== 'function' && !apiKey?.trim()) return json({ error: 'missing-key' }, 503);
    try {
      if (!scheduled && !await authenticate(req)) return json({ error: 'auth-required' }, 401);
    } catch {
      return json({ error: 'auth-unavailable' }, 503);
    }
    let resolvedKey: string | undefined;
    try {
      resolvedKey = await resolveProviderKey(apiKey);
    } catch {
      return json({ error: 'provider-key-store' }, 503);
    }
    if (!resolvedKey) return json({ error: 'missing-key' }, 503);
    const target = new URL(provider === 'logimu'
      ? 'https://api.logimu.com/v1/bestsellers'
      : 'https://api.rainforestapi.com/request');
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (provider === 'logimu') {
      headers['X-API-KEY'] = resolvedKey;
      target.searchParams.set('country', market.toLowerCase());
      target.searchParams.set('pages', '1');
    } else {
      target.searchParams.set('api_key', resolvedKey);
      target.searchParams.set('type', 'bestsellers');
      target.searchParams.set('output', 'json');
    }
    target.searchParams.set('url', sourceUrl);

    try {
      const response = await fetcher(target, {
        headers,
        signal: AbortSignal.timeout(provider === 'logimu' ? 120_000 : 25_000),
      });
      if (response.status === 401 || response.status === 403) {
        return json({ error: 'provider-auth', providerStatus: response.status }, 502);
      }
      if (!response.ok) return json({ error: 'provider-http', providerStatus: response.status }, 502);
      const payload: unknown = await response.json();
      if (!isRecord(payload)) {
        return json({ error: 'provider-invalid' }, 502);
      }
      if ((provider === 'logimu' && payload.ok === false) ||
        (isRecord(payload.request_info) && payload.request_info.success === false)) {
        return json({ error: 'provider-rejected' }, 502);
      }
      let collectedAt = new Date().toISOString();
      if (provider === 'logimu') {
        if (payload.ok !== true || payload.marketplace !== market.toLowerCase() ||
          payload.page_type !== 'category' || typeof payload.observed_at !== 'string' ||
          !Number.isFinite(Date.parse(payload.observed_at))) {
          return json({ error: 'provider-invalid' }, 502);
        }
        collectedAt = payload.observed_at;
      }
      if (!Array.isArray(payload.bestsellers)) return json({ error: 'provider-invalid' }, 502);
      let excludedPriceCount = 0;
      const products = normaliseListings(payload.bestsellers, market, {
        requirePriceText: provider === 'logimu',
        onRejectedPrice: () => { excludedPriceCount++; },
      });
      if (products.length === 0) {
        return json({ error: excludedPriceCount > 0 ? 'provider-price-invalid' : 'provider-empty' }, 502);
      }
      const snapshot = {
        products,
        excludedPriceCount,
        provenance: {
          provider: SOURCING_PROVIDERS[provider],
          market, category, kind,
          currency: AMAZON_MARKETS[market].currency,
          collectedAt,
          sourceUrl,
        },
      };
      if (catalogCache) {
        try { await catalogCache.write(cacheKey, snapshot); }
        catch { return json({ error: 'catalog-cache' }, 503); }
      }
      return await withObservations(snapshot);
    } catch (error) {
      const timeout = error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError');
      return json({ error: timeout ? 'provider-timeout' : 'provider-unreachable' }, timeout ? 504 : 502);
    }
  };
}
