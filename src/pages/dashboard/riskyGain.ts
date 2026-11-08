import { afterVatShare, num } from '@/pages/home/calcModel';
import type { Values } from '@/pages/home/calcModel';
import { VERDICT_BAD_FLOOR, clampGoodFloor } from '@/pages/home/calcVerdict';
import type { DashboardRow } from '@/pages/dashboard/useDashboard';

/**
 * The cost structure of a scenario, split the way the green price needs it:
 * costs that never move with the price, and the share of the price kept after
 * sales VAT, the commission and the returns.
 */
function costParts(values: Values) {
  const supplier = num(values.supplier);
  const shipping = num(values.shipping);
  const packaging = num(values.packaging);
  const customs = num(values.customs);
  const landed = supplier + shipping + packaging + (supplier + shipping) * (customs / 100);
  const fixed = landed + num(values.fba) + num(values.ppc);
  return {
    fixed,
    variable: afterVatShare(values),
    units: num(values.units),
  };
}

/**
 * Sale price that brings the net margin exactly to the green floor:
 * net / price = variable − fixed / price must equal the floor,
 * so price = fixed / (variable − floor).
 * NaN when that price does not exist (VAT + commission + returns + floor ≥ 100 %).
 */
function greenPriceOfValues(values: Values, floor: number): number {
  const { fixed, variable } = costParts(values);
  const target = clampGoodFloor(floor) / 100;
  /* Same red line as the traffic light: a red scenario has to clear the hard
     floor before it can aim for green. */
  const greenRate = Math.max(target, VERDICT_BAD_FLOOR / 100);
  const denominator = variable - greenRate;
  if (denominator <= 0.0001) return NaN;
  return fixed / denominator;
}

/**
 * Rounded-up advised price for a scenario: the smallest clean price (to the
 * next 0,10 €) that still reaches the green floor.
 */
export function greenPriceFor(row: DashboardRow, floor: number): number | null {
  const price = greenPriceOfValues(row.scenario.values, floor);
  if (!Number.isFinite(price) || price <= 0) return null;
  return Math.ceil(price * 10 - 0.0001) / 10;
}

/**
 * What a scenario would earn each month at that green price, at the same
 * volume. Never returns a negative "gain".
 */
function monthlyUpliftOf(row: DashboardRow, floor: number): number {
  const price = greenPriceOfValues(row.scenario.values, floor);
  if (!Number.isFinite(price)) return 0;
  const { fixed, variable, units } = costParts(row.scenario.values);
  const greenMonthly = (price * variable - fixed) * units;
  return Math.max(0, greenMonthly - row.metrics.monthly);
}

/** Monthly net to recover by putting every given scenario back on green. */
export function monthlyUplift(rows: DashboardRow[], floor: number): number {
  return rows.reduce((sum, row) => sum + monthlyUpliftOf(row, floor), 0);
}