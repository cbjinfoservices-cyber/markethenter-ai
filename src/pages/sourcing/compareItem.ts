import { compute, thresholdFor } from '@/pages/home/calcModel';
import type { Metrics, Scenario, Threshold, Values } from '@/pages/home/calcModel';
import { verdictLevelOf } from '@/pages/home/calcVerdict';
import type { VerdictLevel } from '@/pages/home/calcVerdict';
import { valuesFor } from '@/pages/sourcing/productMargin';
import type { SourcingRow } from '@/pages/sourcing/productMargin';

export type CompareOrigin = 'product' | 'scenario';

/**
 * One comparison column, whatever it comes from: a sourced best-seller or a
 * scenario already saved in the dashboard. Same maths for both, so the two
 * sides are honestly comparable.
 */
export type CompareItem = {
  key: string;
  name: string;
  /** Sourced listings carry a picture; dashboard scenarios do not. */
  image: string | null;
  category: string | null;
  origin: CompareOrigin;
  metrics: Metrics;
  threshold: Threshold;
  level: VerdictLevel;
  /** Costs were inferred instead of quoted — never passed off as a real quote. */
  estimated: boolean;
  /** Calculator inputs, so the column can be reworked or exported. */
  values: Values | null;
  /** Where and when the sourced figures were read — kept in every export. */
  collectedAt?: string;
  sourceUrl?: string;
};

export function itemFromRow(row: SourcingRow): CompareItem {
  return {
    key: row.product.id,
    name: row.product.name,
    image: row.product.image || null,
    category: row.product.category,
    origin: 'product',
    metrics: row.metrics,
    threshold: row.threshold,
    level: row.level,
    estimated: Boolean(row.product.estimated),
    values: valuesFor(row.product),
    collectedAt: row.product.collectedAt,
    sourceUrl: row.product.sourceUrl,
  };
}

export function itemFromScenario(
  scenario: Scenario,
  targetNet: number,
  goodFloor: number,
  label: string,
): CompareItem {
  const metrics = compute(scenario.values);
  return {
    key: `scenario-${scenario.id}`,
    name: label,
    image: null,
    category: null,
    origin: 'scenario',
    metrics,
    threshold: thresholdFor(scenario.values, targetNet),
    level: verdictLevelOf(metrics.net, metrics.netMargin, goodFloor),
    estimated: false,
    values: scenario.values,
  };
}

export type { Metrics, Threshold };