import { thresholdFor } from '@/pages/home/calcModel';
import type { Scenario } from '@/pages/home/calcModel';
import { SECOND_SUFFIX } from '@/pages/home/priceHistory';
import { quotesOfScenario, supplierNameOf } from '@/pages/home/supplierCompare';

export type PrintCurve = {
  series: number[];
  second: number[] | null;
  lowPrice: number;
  highPrice: number;
  over: number;
  hasBreak: boolean;
  breakEven: number;
  /** Bar height in percent, shared by both suppliers of the same scenario. */
  heightOf: (value: number) => number;
  linePct: number;
  nameA: string;
  nameB: string;
  winsA: number;
  winsB: number;
  gap: number;
  verdict: 'a' | 'b' | 'tie';
};

type Translate = (key: string) => string;

/**
 * Everything the printed recap needs to draw one scenario's 12-month supplier
 * curve: both quotes, the break-even alert line and the month-by-month verdict.
 */
export function buildPrintCurves(
  scenarios: Scenario[],
  histories: Record<string, number[]>,
  supplierNames: Record<string, string>,
  t: Translate,
): PrintCurve[] {
  return scenarios.map((scenario) => {
    const key = `s${scenario.id}`;
    const quotes = quotesOfScenario(scenario, histories);
    const series = quotes.seriesA;
    const second = quotes.seriesB;
    const comparison = quotes.comparison;

    const rawBreak = thresholdFor(scenario.values, 0).breakEvenPrice;
    const hasBreak = Number.isFinite(rawBreak) && rawBreak > 0;
    const breakEven = hasBreak ? rawBreak : 0;

    const pool = second ? [...series, ...second] : series;
    const lowPrice = Math.min(...pool);
    const highPrice = Math.max(...pool);
    let low = lowPrice;
    let high = highPrice;
    if (hasBreak) {
      low = Math.min(low, rawBreak);
      high = Math.max(high, rawBreak);
    }
    const span = Math.max(0.01, high - low);
    const heightOf = (value: number) => 20 + ((value - low) / span) * 80;
    const linePct = hasBreak ? Math.min(100, Math.max(0, heightOf(rawBreak))) : 0;

    const over = hasBreak
      ? series.filter((price) => price > rawBreak + 0.005).length
      : 0;

    return {
      series,
      second,
      lowPrice,
      highPrice,
      over,
      hasBreak,
      breakEven,
      heightOf,
      linePct,
      nameA: supplierNameOf(supplierNames, key, t('home.calc.historySupplierA')),
      nameB: supplierNameOf(
        supplierNames,
        `${key}${SECOND_SUFFIX}`,
        t('home.calc.historySupplierB'),
      ),
      winsA: comparison?.winsA ?? 0,
      winsB: comparison?.winsB ?? 0,
      gap: comparison?.gap ?? 0,
      verdict: comparison?.winner ?? 'tie',
    };
  });
}