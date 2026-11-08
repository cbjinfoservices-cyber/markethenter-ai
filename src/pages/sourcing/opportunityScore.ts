import type { SourcingRow } from './productMargin';

const clamp = (value: number) => Math.round(Math.max(0, Math.min(100, value)));

export function opportunityScore({ product, metrics }: SourcingRow) {
  // Rankings from wish lists and movers are not sales rankings.
  const demand = product.rank > 0 && (!product.listingKind || product.listingKind === 'bestsellers')
    ? clamp(100 / (1 + product.rank / 100))
    : null;
  const competition = product.reviewCountKnown !== false && Number.isFinite(product.reviews) && product.reviews >= 0
    ? clamp(Math.log10(1 + product.reviews) * 20)
    : null;
  const margin = Number.isFinite(metrics.netMargin) ? clamp(metrics.netMargin * 2) : null;
  const components = [demand, competition === null ? null : 100 - competition, margin]
    .filter((value): value is number => value !== null);
  const average = components.length === 3
    ? Math.round(components.reduce((sum, value) => sum + value, 0) / 3)
    : null;
  const total = average === null ? null : metrics.net <= 0 ? Math.min(39, average) : average;
  return {
    demand, competition, margin, total,
    coverage: Math.round(components.length / 5 * 100),
    grade: total === null ? null : total >= 85 ? 'A+' : total >= 70 ? 'A' : total >= 55 ? 'B' : total >= 40 ? 'C' : 'D',
  };
}
