import { compute } from '@/pages/home/calcModel';
import { monthLabels } from '@/pages/home/priceHistory';
import type { DashboardRow } from '@/pages/dashboard/useDashboard';

export type ProfitPart = {
  name: string;
  value: number;
  /** Bought above break-even that month: the sale lost money. */
  over: boolean;
};

export type ProfitPoint = {
  short: string;
  long: string;
  total: number;
  parts: ProfitPart[];
};

/**
 * Monthly profit for the 12-month horizon, every scenario added up. Each
 * month is costed at the cheapest quote available for that month, so the
 * curve shows the money the seller would actually have made.
 */
export function buildMonthlyProfit(
  rows: DashboardRow[],
  locale: string,
  nameOf: (row: DashboardRow, index: number) => string,
): ProfitPoint[] {
  return monthLabels(locale).map((month, index) => {
    const parts: ProfitPart[] = rows.map((row, rowIndex) => {
      const a = row.seriesA[index] ?? 0;
      const b = row.seriesB ? row.seriesB[index] : null;
      const quote = b !== null && Number.isFinite(b) ? Math.min(a, b) : a;
      const breakEven = row.threshold.feasible ? row.threshold.breakEvenPrice : 0;
      const metrics = compute({ ...row.scenario.values, supplier: String(quote) });
      return {
        name: nameOf(row, rowIndex),
        value: metrics.monthly,
        over: breakEven > 0 && quote > breakEven + 0.005,
      };
    });

    return {
      short: month.short,
      long: month.long,
      total: parts.reduce((sum, part) => sum + part.value, 0),
      parts,
    };
  });
}