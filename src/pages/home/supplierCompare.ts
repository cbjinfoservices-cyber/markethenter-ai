import { num } from '@/pages/home/calcModel';
import type { Scenario } from '@/pages/home/calcModel';
import {
  HISTORY_MONTHS,
  SECOND_SUFFIX,
  buildDefaultHistory,
} from '@/pages/home/priceHistory';

export type QuoteWinner = 'a' | 'b' | 'tie';

export type QuoteComparison = {
  seriesA: number[];
  seriesB: number[];
  winsA: number;
  winsB: number;
  ties: number;
  /** Sum of (A − B) over the 12 months; positive means B was cheaper. */
  gap: number;
  avgA: number;
  avgB: number;
  winner: QuoteWinner;
  savedPerUnit: number;
};

const average = (list: number[]): number =>
  list.length === 0 ? 0 : list.reduce((sum, value) => sum + value, 0) / list.length;

/**
 * Month-by-month comparison of two supplier quotes on the same 12-month
 * horizon. Returns the winner, how many months each one won and the
 * cumulative saving, so the badge, the CSV and the printed recap all read
 * exactly the same verdict.
 */
export function compareQuotes(a: number[], b: number[]): QuoteComparison {
  const seriesA = a.slice(0, HISTORY_MONTHS);
  const seriesB = b.slice(0, HISTORY_MONTHS);
  let winsA = 0;
  let winsB = 0;
  let gap = 0;

  seriesA.forEach((price, index) => {
    const other = seriesB[index];
    if (!Number.isFinite(other)) return;
    gap += price - other;
    if (other < price - 0.005) winsB += 1;
    else if (other > price + 0.005) winsA += 1;
  });

  const ties = seriesA.length - winsA - winsB;
  const winner: QuoteWinner =
    winsA === winsB
      ? Math.abs(gap) < 0.01
        ? 'tie'
        : gap > 0
          ? 'b'
          : 'a'
      : winsA > winsB
        ? 'a'
        : 'b';

  const avgA = average(seriesA);
  const avgB = average(seriesB);

  return {
    seriesA,
    seriesB,
    winsA,
    winsB,
    ties,
    gap,
    avgA,
    avgB,
    winner,
    savedPerUnit: Math.abs(avgA - avgB),
  };
}

export type ScenarioQuotes = {
  /** First supplier's quote, from storage or the deterministic default curve. */
  seriesA: number[];
  /** Second supplier's quote, only when one was actually recorded. */
  seriesB: number[] | null;
  comparison: QuoteComparison | null;
};

/** Pulls both quotes for one scenario out of the shared history map. */
export function quotesOfScenario(
  scenario: Scenario,
  histories: Record<string, number[]>,
): ScenarioQuotes {
  const key = `s${scenario.id}`;
  const base = num(scenario.values.supplier);
  const storedA = histories[key];
  const seriesA =
    storedA && storedA.length === HISTORY_MONTHS ? storedA : buildDefaultHistory(key, base);

  const storedB = histories[`${key}${SECOND_SUFFIX}`];
  const seriesB = storedB && storedB.length === HISTORY_MONTHS ? storedB : null;

  return {
    seriesA,
    seriesB,
    comparison: seriesB ? compareQuotes(seriesA, seriesB) : null,
  };
}

/** Real name typed by the seller, with a readable fallback. */
export function supplierNameOf(
  names: Record<string, string>,
  key: string,
  fallback: string,
): string {
  const typed = (names[key] ?? '').trim();
  return typed === '' ? fallback : typed;
}