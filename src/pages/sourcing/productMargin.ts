import { compute, thresholdFor } from '@/pages/home/calcModel';
import type { Metrics, Threshold, Values } from '@/pages/home/calcModel';
import { verdictLevelOf } from '@/pages/home/calcVerdict';
import type { VerdictLevel } from '@/pages/home/calcVerdict';

export type SourcingCategory =
  | 'maison'
  | 'bureau'
  | 'sport'
  | 'animaux'
  | 'beaute'
  | 'tech'
  | 'auto'
  | 'autres';

export type SourcingRetailer = 'amazon' | 'ebay';

/**
 * A marketplace best-seller candidate, reduced to what the margin engine and
 * the card need. Costs come either from the demo catalogue or, for live
 * listings, from an explicit estimate flagged on the row.
 */
export type SourcingProduct = {
  id: string;
  name: string;
  category: SourcingCategory;
  categories?: SourcingCategory[];
  retailer: SourcingRetailer;
  image: string;
  /** Retail price shown on the marketplace, VAT included. */
  price: number;
  rating: number;
  reviews: number;
  rank: number;
  /** Search-interest change over 30 days, in percent. */
  trend: number;
  supplier: number;
  shipping: number;
  packaging: number;
  customs: number;
  fba: number;
  ppc: number;
  returns: number;
  units: number;
  /** True when the costs were inferred instead of being read from a quote. */
  estimated?: boolean;
  reviewCountKnown?: boolean;
  market?: string;
  listingKind?: string;
  originalPrice?: number;
  originalCurrency?: string;
  exchangeRate?: number;
  detailPrice?: number | null;
  priceCheckedAt?: string;
  priceVerification?: 'pending' | 'concordant' | 'mismatch' | 'unavailable';
  collectedAt?: string;
  sourceUrl?: string;
};

export const CATEGORIES: SourcingCategory[] = [
  'maison',
  'bureau',
  'sport',
  'animaux',
  'beaute',
  'tech',
  'auto',
];

/** Commission applied to every sourced product, before tuning. */
export const DEFAULT_COMMISSION = '15';
/** Sales VAT per marketplace (hors sales tax aux États-Unis). Unknown markets fall back to FR. */
const VAT_BY_MARKET: Record<string, string> = { FR: '20', DE: '19', ES: '21', IT: '22', UK: '20', US: '0' };
export const DEFAULT_VAT = '20';

export function pricesAgree(a: number, b: number): boolean {
  return Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= 0.010000001;
}

export function canCalculateProduct(product: SourcingProduct, now = Date.now()): boolean {
  if (!product.priceVerification) return true;
  const checkedAt = product.priceCheckedAt ? Date.parse(product.priceCheckedAt) : NaN;
  return product.priceVerification === 'concordant' &&
    Number.isFinite(checkedAt) && now - checkedAt >= 0 && now - checkedAt < 3_600_000 &&
    typeof product.detailPrice === 'number' && typeof product.originalPrice === 'number' &&
    pricesAgree(product.detailPrice, product.originalPrice);
}

/** Turns a marketplace listing into the calculator's eleven fields. */
export function valuesFor(product: SourcingProduct): Values {
  return {
    supplier: String(product.supplier),
    shipping: String(product.shipping),
    packaging: String(product.packaging),
    customs: String(product.customs),
    amazon: DEFAULT_COMMISSION,
    fba: String(product.fba),
    ppc: String(product.ppc),
    returns: String(product.returns),
    price: String(product.price),
    units: String(product.units),
    vat: VAT_BY_MARKET[product.market ?? 'FR'] ?? DEFAULT_VAT,
  };
}

export type SourcingRow = {
  product: SourcingProduct;
  metrics: Metrics;
  /** Selling price that reaches the reader's net target. */
  threshold: Threshold;
  level: VerdictLevel;
};

/**
 * One product, fully costed: net per unit, margin, and the traffic light at the
 * same green floor the calculator and the dashboard use.
 */
export function rowFor(
  product: SourcingProduct,
  targetNet: number,
  goodFloor: number,
): SourcingRow {
  const values = valuesFor(product);
  const metrics = compute(values);
  return {
    product,
    metrics,
    threshold: thresholdFor(values, targetNet),
    level: verdictLevelOf(metrics.net, metrics.netMargin, goodFloor),
  };
}

/** Cost estimate used for live listings, which never ship with a quote. */
export function estimateCosts(price: number): Pick<
  SourcingProduct,
  'supplier' | 'shipping' | 'packaging' | 'customs' | 'fba' | 'ppc' | 'returns' | 'units'
> {
  const safe = Number.isFinite(price) && price > 0 ? price : 0;
  return {
    supplier: Math.round(safe * 0.26 * 100) / 100,
    shipping: Math.round(safe * 0.06 * 100) / 100,
    packaging: 0.35,
    customs: 5.5,
    fba: Math.round(safe * 0.11 * 100) / 100,
    ppc: Math.round(safe * 0.1 * 100) / 100,
    returns: 8,
    units: 300,
  };
}