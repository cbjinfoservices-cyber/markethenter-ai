import { AMAZON_MARKETS, SOURCING_PROVIDERS, isCategory, isListingKind, isMarket, isRecord, listingUrl, parsePriceText } from '../../../supabase/functions/_shared/amazon';
import type { AmazonCategory, AmazonMarket, ListingKind } from '../../../supabase/functions/_shared/amazon';
import { estimateCosts, pricesAgree } from './productMargin';
import type { SourcingProduct } from './productMargin';

export type CatalogQuery = {
  market: AmazonMarket;
  category: AmazonCategory | 'all';
  kind: ListingKind;
  exchangeRate: number;
};

export type CatalogProvenance = CatalogQuery & {
  provider: typeof SOURCING_PROVIDERS[keyof typeof SOURCING_PROVIDERS];
  currency: string;
  collectedAt: string;
  sourceUrl: string;
};

export function parseCatalog(payload: unknown, query: CatalogQuery): {
  products: SourcingProduct[];
  provenance: CatalogProvenance;
  excludedPriceCount: number;
} {
  if (!Number.isFinite(query.exchangeRate) || query.exchangeRate <= 0 ||
    (AMAZON_MARKETS[query.market].currency === 'EUR' && query.exchangeRate !== 1)) {
    throw new Error('invalid-exchange-rate');
  }
  if (isRecord(payload) && typeof payload.error === 'string' && payload.error) {
    throw new Error(payload.error);
  }
  if (!isRecord(payload) || !Array.isArray(payload.products) || !isRecord(payload.provenance)) {
    throw new Error('provider-invalid');
  }
  const p = payload.provenance;
  if (!isMarket(p.market) || !isCategory(p.category) || !isListingKind(p.kind) ||
    p.market !== query.market || p.category !== query.category || p.kind !== query.kind ||
    p.currency !== AMAZON_MARKETS[query.market].currency ||
    (p.provider !== SOURCING_PROVIDERS.rainforest && p.provider !== SOURCING_PROVIDERS.logimu) ||
    (p.provider === SOURCING_PROVIDERS.logimu && (p.kind !== 'bestsellers' || p.category === 'all')) ||
    typeof p.collectedAt !== 'string' || !Number.isFinite(Date.parse(p.collectedAt)) ||
    p.sourceUrl !== listingUrl(query.market, query.category, query.kind)) {
    throw new Error('provider-invalid');
  }
  const provenance: CatalogProvenance = {
    ...query, provider: p.provider, currency: AMAZON_MARKETS[query.market].currency,
    collectedAt: p.collectedAt, sourceUrl: p.sourceUrl,
  };
  const excludedPriceCount = payload.excludedPriceCount ?? 0;
  if (typeof excludedPriceCount !== 'number' || !Number.isInteger(excludedPriceCount) || excludedPriceCount < 0) {
    throw new Error('provider-invalid');
  }
  const products: SourcingProduct[] = [];
  const seen = new Set<string>();
  for (const item of payload.products) {
    if (!isRecord(item) || typeof item.asin !== 'string' || !/^[A-Z0-9]{10}$/.test(item.asin) ||
      typeof item.title !== 'string' || !item.title.trim() ||
      typeof item.price !== 'number' || !Number.isFinite(item.price) || item.price <= 0 ||
      seen.has(item.asin)) continue;
    if (p.provider === SOURCING_PROVIDERS.logimu || item.priceText !== undefined) {
      const textAmount = parsePriceText(item.priceText, provenance.currency);
      if (textAmount === null || Math.abs(item.price - textAmount) > 0.000001) {
        throw new Error('provider-price-invalid');
      }
    }
    const price = item.price * query.exchangeRate;
    if (!Number.isFinite(price) || price <= 0) continue;
    products.push({
      id: `${query.market}-${item.asin}`,
      name: item.title.trim(),
      category: query.category === 'all' ? 'autres' : query.category,
      retailer: 'amazon',
      image: typeof item.image === 'string' && item.image.startsWith('https://') ? item.image : '',
      price,
      rating: typeof item.rating === 'number' && item.rating > 0 && item.rating <= 5 ? item.rating : 0,
      reviews: typeof item.reviews === 'number' && Number.isInteger(item.reviews) && item.reviews >= 0 ? item.reviews : 0,
      reviewCountKnown: typeof item.reviews === 'number' && Number.isInteger(item.reviews) && item.reviews >= 0,
      rank: typeof item.rank === 'number' && Number.isInteger(item.rank) && item.rank > 0 ? item.rank : 0,
      trend: 0,
      ...estimateCosts(price),
      estimated: true,
      priceVerification: 'pending',
      market: query.market, listingKind: query.kind,
      originalPrice: item.price, originalCurrency: provenance.currency,
      exchangeRate: query.exchangeRate, collectedAt: provenance.collectedAt,
      sourceUrl: `https://www.${AMAZON_MARKETS[query.market].domain}/dp/${item.asin}`,
    });
    seen.add(item.asin);
  }

  if (products.length === 0) throw new Error('provider-empty');
  let catalogProducts = products.slice(0, 24);
  if (payload.observations !== undefined) {
    if (p.provider !== SOURCING_PROVIDERS.rainforest && Array.isArray(payload.observations) && payload.observations.length) {
      throw new Error('provider-invalid');
    }
    catalogProducts = applyPriceObservations({
      market: query.market, currency: provenance.currency, observations: payload.observations,
    }, catalogProducts, query.market, cachedObservationAsins(payload.observations, catalogProducts));
  }
  return { products: catalogProducts, provenance, excludedPriceCount };
}

function cachedObservationAsins(observations: unknown, products: SourcingProduct[]): string[] {
  if (!Array.isArray(observations)) throw new Error('provider-invalid');
  return observations.map((item) => {
    if (!isRecord(item) || typeof item.asin !== 'string' || !products.some((product) => product.id.slice(3) === item.asin)) {
      throw new Error('provider-invalid');
    }
    return item.asin;
  });
}

export function applyPriceObservations(payload: unknown, products: SourcingProduct[], market: AmazonMarket, asins: string[]): SourcingProduct[] {
  if (!isRecord(payload) || payload.market !== market || payload.currency !== AMAZON_MARKETS[market].currency ||
    !Array.isArray(payload.observations) || payload.observations.length !== asins.length) throw new Error('provider-invalid');
  const observations = new Map<string, { price: number | null; checkedAt: string }>();
  for (const item of payload.observations) {
    if (!isRecord(item) || typeof item.asin !== 'string' || !asins.includes(item.asin) || observations.has(item.asin) ||
      typeof item.checkedAt !== 'string' || !Number.isFinite(Date.parse(item.checkedAt)) ||
      (item.price !== null && (typeof item.price !== 'number' || !Number.isFinite(item.price) || item.price <= 0))) {
      throw new Error('provider-invalid');
    }
    observations.set(item.asin, { price: typeof item.price === 'number' ? item.price : null, checkedAt: item.checkedAt });
  }
  return products.map((product) => {
    if (product.market !== market) return product;
    const observation = observations.get(product.id.slice(3));
    if (!observation) return product;
    return {
      ...product,
      priceVerification: observation.price === null ? 'unavailable' :
        product.originalPrice !== undefined && pricesAgree(observation.price, product.originalPrice) ? 'concordant' : 'mismatch',
      detailPrice: observation.price,
      priceCheckedAt: observation.checkedAt,
    };
  });
}
