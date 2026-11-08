export const AMAZON_MARKETS = {
  FR: { domain: 'amazon.fr', currency: 'EUR', vat: 20 },
  DE: { domain: 'amazon.de', currency: 'EUR', vat: 19 },
  ES: { domain: 'amazon.es', currency: 'EUR', vat: 21 },
  IT: { domain: 'amazon.it', currency: 'EUR', vat: 22 },
  UK: { domain: 'amazon.co.uk', currency: 'GBP', vat: 20 },
  US: { domain: 'amazon.com', currency: 'USD', vat: 0 },
} as const;

export type AmazonMarket = keyof typeof AMAZON_MARKETS;
export const SOURCING_PROVIDERS = { rainforest: 'Rainforest API', logimu: 'Logimu' } as const;
export type SourcingProvider = keyof typeof SOURCING_PROVIDERS;
export const isSourcingProvider = (value: unknown): value is SourcingProvider =>
  typeof value === 'string' && Object.hasOwn(SOURCING_PROVIDERS, value);
export type ListingKind = 'bestsellers' | 'movers-and-shakers' | 'most-wished-for';

export const LISTING_KINDS: ListingKind[] = ['bestsellers', 'movers-and-shakers', 'most-wished-for'];
export const AMAZON_CATEGORIES = ['maison', 'bureau', 'sport', 'animaux', 'beaute', 'tech', 'auto'] as const;
export type AmazonCategory = typeof AMAZON_CATEGORIES[number];

export const isMarket = (value: unknown): value is AmazonMarket =>
  typeof value === 'string' && Object.hasOwn(AMAZON_MARKETS, value);

export const isListingKind = (value: unknown): value is ListingKind =>
  LISTING_KINDS.some((kind) => kind === value);

export const isCategory = (value: unknown): value is AmazonCategory | 'all' =>
  value === 'all' || AMAZON_CATEGORIES.some((category) => category === value);

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const CATEGORY_PATHS: Record<AmazonMarket, Record<AmazonCategory, string>> = {
  FR: { maison: 'kitchen', bureau: 'office-products', sport: 'sports', animaux: 'pet-supplies', beaute: 'beauty', tech: 'electronics', auto: 'automotive' },
  DE: { maison: 'kitchen', bureau: 'officeproduct', sport: 'sports', animaux: 'pet-supplies', beaute: 'beauty', tech: 'ce-de', auto: 'automotive' },
  ES: { maison: 'kitchen', bureau: 'office', sport: 'sports', animaux: 'pet-supplies', beaute: 'beauty', tech: 'electronics', auto: 'automotive' },
  IT: { maison: 'kitchen', bureau: 'office', sport: 'sports', animaux: 'pet-supplies', beaute: 'beauty', tech: 'electronics', auto: 'automotive' },
  UK: { maison: 'kitchen', bureau: 'officeproduct', sport: 'sports', animaux: 'pet-supplies', beaute: 'beauty', tech: 'electronics', auto: 'automotive' },
  US: { maison: 'home-garden', bureau: 'office-products', sport: 'sporting-goods', animaux: 'pet-supplies', beaute: 'beauty', tech: 'electronics', auto: 'automotive' },
};

export function listingUrl(market: AmazonMarket, category: AmazonCategory | 'all', kind: ListingKind): string {
  const suffix = category === 'all' ? '' : `/${CATEGORY_PATHS[market][category]}`;
  return `https://www.${AMAZON_MARKETS[market].domain}/gp/${kind}${suffix}`;
}

export type LiveItem = {
  asin: string;
  title: string;
  image: string;
  price: number;
  priceText?: string;
  rating: number | null;
  reviews: number | null;
  rank: number | null;
  link: string;
};

function numeric(value: unknown): number | null {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  if (typeof value === 'string' && value.trim() === '') return null;
  const parsed = typeof value === 'number' ? value : Number(value.replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
}

export function parsePriceText(value: unknown, currency: string): number | null {
  if (typeof value !== 'string' || value.length > 80) return null;
  const symbol = currency === 'EUR' ? '\u20ac' : currency === 'GBP' ? '\u00a3' : '$';
  let text = value.trim();
  for (const token of [currency, symbol]) {
    if (text.startsWith(token)) text = text.slice(token.length).trim();
    else if (text.endsWith(token)) text = text.slice(0, -token.length).trim();
  }
  // Accept one amount only, never a unit price, range or promotional text.
  if (!/^(?:\d+|\d{1,3}(?:[ .,\u00a0\u202f]\d{3})+)(?:[.,]\d{2})?$/.test(text)) return null;
  const decimal = /[.,]\d{2}$/.exec(text);
  const integer = decimal ? text.slice(0, -3) : text;
  const separators: string[] = integer.match(/[ .,\u00a0\u202f]/g) ?? [];
  if (new Set(separators).size > 1 || (decimal && separators.includes(decimal[0][0]))) return null;
  const amount = Number(integer.replace(/[ .,\u00a0\u202f]/g, '') + (decimal ? `.${decimal[0].slice(1)}` : ''));
  return Number.isFinite(amount) && amount > 0 ? amount : null;
}

export function normaliseListings(
  items: unknown[], market: AmazonMarket,
  options: { requirePriceText?: boolean; onRejectedPrice?: () => void } = {},
): LiveItem[] {
  const result: LiveItem[] = [];
  const seen = new Set<string>();
  const config = AMAZON_MARKETS[market];
  for (const item of items) {
    if (!isRecord(item)) continue;
    const priceObject = isRecord(item.price) ? item.price : null;
    const price = numeric(priceObject ? priceObject.value : item.price);
    const currency = priceObject?.currency;
    const title = typeof item.title === 'string' ? item.title.trim() : '';
    const asin = typeof item.asin === 'string' ? item.asin.toUpperCase() : '';
    if (!title || !/^[A-Z0-9]{10}$/.test(asin) || price === null || price <= 0 ||
      (currency !== undefined && currency !== config.currency) || seen.has(asin)) continue;
    const rawPrice = priceObject?.raw;
    const priceText = typeof rawPrice === 'string' ? rawPrice.trim() : undefined;
    if (options.requirePriceText || rawPrice !== undefined) {
      const textAmount = parsePriceText(priceText, config.currency);
      if (textAmount === null || Math.abs(price - textAmount) > 0.000001) {
        options.onRejectedPrice?.();
        continue;
      }
    }
    const rating = numeric(item.rating);
    const reviews = numeric(item.ratings_total);
    const rank = numeric(item.rank);
    result.push({
      asin, title, price,
      ...(priceText ? { priceText } : {}),
      image: typeof item.image === 'string' && item.image.startsWith('https://') ? item.image : '',
      rating: rating !== null && rating > 0 && rating <= 5 ? rating : null,
      reviews: reviews !== null && Number.isInteger(reviews) && reviews >= 0 ? reviews : null,
      rank: rank !== null && Number.isInteger(rank) && rank > 0 ? rank : null,
      link: `https://www.${config.domain}/dp/${asin}`,
    });
    seen.add(asin);
  }
  return result.slice(0, 24);
}
