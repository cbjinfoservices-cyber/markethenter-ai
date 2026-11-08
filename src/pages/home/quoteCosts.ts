import { num } from '@/pages/home/calcModel';
import type { Values } from '@/pages/home/calcModel';

/** Costs that belong to one supplier quote; everything else is shared by the scenario. */
export type QuoteCosts = {
  shipping: string;
  packaging: string;
  customs: string;
};

const QUOTE_COSTS_KEY = 'mh:calc:quote-costs';

/** Costs of the second quote, keyed by its storage key (see secondKey). */
export function loadQuoteCosts(): Record<string, QuoteCosts> {
  try {
    const stored = window.localStorage.getItem(QUOTE_COSTS_KEY);
    if (!stored) return {};
    const parsed: unknown = JSON.parse(stored);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const out: Record<string, QuoteCosts> = {};
    Object.entries(parsed as Record<string, Partial<QuoteCosts>>).forEach(([key, value]) => {
      if (!value || typeof value !== 'object') return;
      out[key] = {
        shipping: String(value.shipping ?? ''),
        packaging: String(value.packaging ?? ''),
        customs: String(value.customs ?? ''),
      };
    });
    return out;
  } catch {
    return {};
  }
}

export function persistQuoteCosts(costs: Record<string, QuoteCosts>): void {
  try {
    window.localStorage.setItem(QUOTE_COSTS_KEY, JSON.stringify(costs));
  } catch {
    /* storage blocked — costs stay for this session only */
  }
}

/**
 * Scenario values with the second quote's own costs applied. A blank field
 * keeps the scenario value, so nothing changes until the seller types one.
 */
export function quoteValues(values: Values, costs: QuoteCosts | undefined): Values {
  if (!costs) return values;
  return {
    ...values,
    shipping: costs.shipping.trim() === '' ? values.shipping : costs.shipping,
    packaging: costs.packaging.trim() === '' ? values.packaging : costs.packaging,
    customs: costs.customs.trim() === '' ? values.customs : costs.customs,
  };
}

/** The second quote: its own costs, and its latest purchase price when known. */
export function secondQuoteValues(
  values: Values,
  costs: QuoteCosts | undefined,
  latestB: number | null,
): Values {
  const merged = quoteValues(values, costs);
  return latestB === null ? merged : { ...merged, supplier: String(latestB) };
}

/**
 * Purchase price that gives the same landed cost under the first quote's
 * costs. Net depends only on the landed cost and the price, so comparing
 * these equivalent prices is the same as comparing the nets.
 */
export function equivalentPrice(price: number, first: Values, second: Values): number {
  const secondLanded =
    (price + num(second.shipping)) * (1 + num(second.customs) / 100) + num(second.packaging);
  const firstShipping = num(first.shipping);
  const firstPackaging = num(first.packaging);
  const firstCustoms = num(first.customs);
  return (
    (secondLanded - firstPackaging) / (1 + firstCustoms / 100) - firstShipping
  );
}

/** The whole second series expressed as first-quote purchase prices. */
export function equivalentSeries(series: number[], first: Values, second: Values): number[] {
  return series.map((price) => {
    const value = equivalentPrice(price, first, second);
    return Number.isFinite(value) ? Math.round(value * 100) / 100 : price;
  });
}
