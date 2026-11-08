import { MARGIN_OFF } from '@/pages/sourcing/components/SourcingFilters';
import type { SortKey, SortThen, VerdictFilter } from '@/pages/sourcing/components/SourcingFilters';
import type { SourcingCategory, SourcingRow } from '@/pages/sourcing/productMargin';

/** One full posture of the board — what a history entry holds, all in one. */
export type GridConfig = {
  category: SourcingCategory | 'all';
  verdict: VerdictFilter;
  sort: SortKey;
  sort2: SortThen;
  flip: boolean;
  /** Lowest net margin kept, in percent. `MARGIN_OFF` means no requirement. */
  minMargin: number;
  locale: string;
};

/** Price and rank read best ascending; the others descending. */
const isAscendingByNature = (key: SortKey): boolean => key === 'price' || key === 'rank';

const valueOf = (row: SourcingRow, key: SortKey): number => {
  switch (key) {
    case 'price':
      return row.metrics.price;
    case 'rank':
      return row.product.rank;
    case 'trend':
      return row.product.trend;
    case 'net':
      return row.metrics.net;
    default:
      return row.metrics.netMargin;
  }
};

/**
 * Filters, then sorts the catalogue exactly as the reader arranged it.
 * The same function serves the live board and any past arrangement put beside
 * it, so the two can never be compared on different rules.
 */
export function arrangeGrid(rows: SourcingRow[], config: GridConfig): SourcingRow[] {
  const { category, verdict, sort, sort2, flip, minMargin, locale } = config;

  const filtered = rows.filter((row) => {
    if (category !== 'all' && row.product.category !== category && !row.product.categories?.includes(category)) return false;
    if (verdict === 'good' && row.level !== 'good') return false;
    if (verdict === 'risk' && row.level !== 'bad') return false;
    if (minMargin > MARGIN_OFF && row.metrics.netMargin < minMargin) return false;
    return true;
  });

  /* Ties are settled by the second sort, then by name so the order never jumps.
     A missing rank (stored as 0) always goes last, whatever the direction. */
  const compareBy = (key: SortKey) => (a: SourcingRow, b: SourcingRow) => {
    if (key === 'rank') {
      const aMissing = !(a.product.rank > 0);
      const bMissing = !(b.product.rank > 0);
      if (aMissing !== bMissing) return aMissing ? 1 : -1;
    }
    const diff = valueOf(a, key) - valueOf(b, key);
    if (Math.abs(diff) < 0.005) return 0;
    const natural = isAscendingByNature(key) ? diff : -diff;
    return flip ? -natural : natural;
  };

  const sorted = [...filtered];
  sorted.sort((a, b) => {
    const first = compareBy(sort)(a, b);
    if (first !== 0) return first;
    if (sort2 !== 'none' && sort2 !== sort) {
      const second = compareBy(sort2)(a, b);
      if (second !== 0) return second;
    }
    return a.product.name.localeCompare(b.product.name, locale);
  });
  return sorted;
}

/** What applying a past arrangement would do to the grid, row by row. */
export type GridDiff = {
  /** Listed now, gone once that arrangement comes back. */
  leaving: Set<string>;
  /** Hidden now, listed once that arrangement comes back. */
  entering: Set<string>;
  /** Present in both, but at another rank — id → new 1-based position. */
  moved: Map<string, number>;
  /** Rows that arrangement would leave on the board. */
  total: number;
};

/** Compares two grids by identity and rank — the live one and the past one. */
export function diffGrid(current: SourcingRow[], next: SourcingRow[]): GridDiff {
  const currentIds = current.map((row) => row.product.id);
  const nextIds = next.map((row) => row.product.id);
  const currentSet = new Set(currentIds);
  const nextSet = new Set(nextIds);

  const leaving = new Set(currentIds.filter((id) => !nextSet.has(id)));
  const entering = new Set(nextIds.filter((id) => !currentSet.has(id)));

  const moved = new Map<string, number>();
  currentIds.forEach((id, index) => {
    const target = nextIds.indexOf(id);
    if (target === -1 || target === index) return;
    moved.set(id, target + 1);
  });

  return { leaving, entering, moved, total: nextIds.length };
}

/** True when that arrangement would leave the exact same grid on the board. */
export function isEmptyDiff(diff: GridDiff): boolean {
  return diff.leaving.size === 0 && diff.entering.size === 0 && diff.moved.size === 0;
}