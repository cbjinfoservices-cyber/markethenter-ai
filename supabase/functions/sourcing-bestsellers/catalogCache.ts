import { isRecord } from '../_shared/amazon.ts';
import type { AmazonMarket, AmazonCategory, ListingKind } from '../_shared/amazon.ts';

export const CATALOG_CACHE_TTL = 6 * 60 * 60 * 1000;
export type CatalogCacheKey = {
  provider: string;
  market: AmazonMarket;
  category: AmazonCategory | 'all';
  kind: ListingKind;
};
export type CatalogSnapshot = {
  products: unknown[];
  excludedPriceCount: number;
  provenance: Record<string, unknown> & { collectedAt: string };
};
export type CatalogCache = {
  read: (key: CatalogCacheKey) => Promise<CatalogSnapshot | null>;
  write: (key: CatalogCacheKey, snapshot: CatalogSnapshot) => Promise<void>;
};

export function parseCatalogSnapshot(snapshot: unknown): CatalogSnapshot | null {
  if (!isRecord(snapshot) || !Array.isArray(snapshot.products) || !snapshot.products.length ||
    typeof snapshot.excludedPriceCount !== 'number' || !Number.isInteger(snapshot.excludedPriceCount) ||
    snapshot.excludedPriceCount < 0 || !isRecord(snapshot.provenance) ||
    typeof snapshot.provenance.collectedAt !== 'string' || !Number.isFinite(Date.parse(snapshot.provenance.collectedAt))) {
    return null;
  }
  return {
    products: snapshot.products, excludedPriceCount: snapshot.excludedPriceCount,
    provenance: { ...snapshot.provenance, collectedAt: snapshot.provenance.collectedAt },
  };
}

export function createCatalogCache(url: string | undefined, key: string | undefined, fetcher: typeof fetch = fetch): CatalogCache | undefined {
  if (!url || !key) return undefined;
  const endpoint = `${url}/rest/v1/sourcing_catalog_cache`;
  const headers = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
  return {
    async read(cacheKey) {
      const query = new URLSearchParams({ select: 'snapshot' });
      for (const [field, value] of Object.entries(cacheKey)) query.set(field, `eq.${value}`);
      const response = await fetcher(`${endpoint}?${query}`, { headers, signal: AbortSignal.timeout(10_000) });
      if (!response.ok) throw new Error('catalog-cache');
      const rows: unknown = await response.json();
      if (!Array.isArray(rows)) throw new Error('catalog-cache');
      if (!rows.length) return null;
      const snapshot: unknown = isRecord(rows[0]) ? rows[0].snapshot : null;
      const parsed = parseCatalogSnapshot(snapshot);
      if (!parsed) throw new Error('catalog-cache');
      return parsed;
    },
    async write(cacheKey, snapshot) {
      const response = await fetcher(endpoint, {
        method: 'POST', headers: { ...headers, Prefer: 'resolution=merge-duplicates' },
        body: JSON.stringify({ ...cacheKey, snapshot }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) throw new Error('catalog-cache');
    },
  };
}
