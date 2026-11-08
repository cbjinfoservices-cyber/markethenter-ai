import { AMAZON_MARKETS, isRecord, normaliseListings } from '../_shared/amazon.ts';
import type { AmazonMarket } from '../_shared/amazon.ts';
import { resolveProviderKey } from './providerKey.ts';
import type { ProviderKey } from './providerKey.ts';

export type PriceObservation = {
  price: number | null;
  checkedAt: string;
};
export class ProviderHttpError extends Error {
  readonly providerStatus: number;

  constructor(providerStatus: number) {
    super(providerStatus === 401 || providerStatus === 403 ? 'provider-auth' : 'provider-http');
    this.providerStatus = providerStatus;
  }
}
export const PRICE_CACHE_TTL = 60 * 60 * 1000;
export type PriceCache = {
  read: (market: AmazonMarket, asin: string) => Promise<PriceObservation | null>;
  write: (market: AmazonMarket, asin: string, observation: PriceObservation) => Promise<void>;
};

export function parsePriceObservation(value: unknown): PriceObservation | null {
  if (!isRecord(value) || typeof value.checkedAt !== 'string' ||
    !Number.isFinite(Date.parse(value.checkedAt)) ||
    (value.price !== null && (typeof value.price !== 'number' || !Number.isFinite(value.price) || value.price <= 0))) {
    return null;
  }
  return { price: typeof value.price === 'number' ? value.price : null, checkedAt: value.checkedAt };
}

export function createPriceCache(url: string | undefined, key: string | undefined, fetcher: typeof fetch = fetch): PriceCache | undefined {
  if (!url || !key) return undefined;
  const headers = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
  const endpoint = `${url}/rest/v1/sourcing_price_cache`;
  return {
    async read(market, asin) {
      const response = await fetcher(`${endpoint}?market=eq.${market}&asin=eq.${asin}&select=price,checked_at`, {
        headers, signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) throw new Error('verification-cache');
      const rows: unknown = await response.json();
      if (!Array.isArray(rows)) throw new Error('verification-cache');
      if (!rows.length) return null;
      const row: unknown = rows[0];
      const observation = isRecord(row) ? parsePriceObservation({ price: row.price, checkedAt: row.checked_at }) : null;
      if (!observation) throw new Error('verification-cache');
      return observation;
    },
    async write(market, asin, observation) {
      const response = await fetcher(endpoint, {
        method: 'POST',
        headers: { ...headers, Prefer: 'resolution=merge-duplicates' },
        body: JSON.stringify({ market, asin, price: observation.price, checked_at: observation.checkedAt }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) throw new Error('verification-cache');
    },
  };
}

export function createPriceVerifier(apiKey: ProviderKey, cache: PriceCache, fetcher: typeof fetch, now = Date.now) {
  const pending = new Map<string, Promise<PriceObservation>>();
  return async (market: AmazonMarket, asin: string, authorize: () => Promise<boolean>, refresh = false): Promise<PriceObservation> => {
    const key = `${market}:${asin}`;
    const existing = pending.get(key);
    if (existing) return existing;
    const work = (async () => {
      const saved = await cache.read(market, asin);
      if (!refresh && saved && now() - Date.parse(saved.checkedAt) >= 0 && now() - Date.parse(saved.checkedAt) < PRICE_CACHE_TTL) return saved;
      let authorized: boolean;
      try {
        authorized = await authorize();
      } catch {
        throw new Error('auth-unavailable');
      }
      if (!authorized) throw new Error('auth-required');
      const resolvedKey = await resolveProviderKey(apiKey);
      if (!resolvedKey) throw new Error('missing-key');
      const target = new URL('https://api.rainforestapi.com/request');
      target.searchParams.set('api_key', resolvedKey);
      target.searchParams.set('type', 'product');
      target.searchParams.set('amazon_domain', AMAZON_MARKETS[market].domain);
      target.searchParams.set('asin', asin);
      const response = await fetcher(target, { signal: AbortSignal.timeout(25_000) });
      if (!response.ok) throw new ProviderHttpError(response.status);
      const payload: unknown = await response.json();
      if (!isRecord(payload) || !isRecord(payload.request_info) || payload.request_info.success !== true ||
        !isRecord(payload.request_parameters) || payload.request_parameters.amazon_domain !== AMAZON_MARKETS[market].domain ||
        !isRecord(payload.product) || payload.product.asin !== asin) throw new Error('provider-invalid');
      const product = payload.product;
      const buybox = isRecord(product.buybox_winner) ? product.buybox_winner : null;
      const price = buybox && isRecord(buybox.price) ? buybox.price : null;
      // Require an explicit currency and new condition; never use unit prices or another variant.
      const condition = buybox && isRecord(buybox.condition) ? buybox.condition : null;
      const item = price?.currency === AMAZON_MARKETS[market].currency && condition?.is_new === true
        ? normaliseListings([{ asin, title: 'Price verification', price }], market)[0]
        : undefined;
      const observation = { price: item?.price ?? null, checkedAt: new Date(now()).toISOString() };
      await cache.write(market, asin, observation);
      return observation;
    })();
    pending.set(key, work);
    try { return await work; } finally { pending.delete(key); }
  };
}
