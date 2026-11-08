import { CATEGORIES } from '@/pages/sourcing/productMargin';
import type { SourcingCategory } from '@/pages/sourcing/productMargin';
import type { SortKey, SortThen, VerdictFilter } from '@/pages/sourcing/components/SourcingFilters';

export type { SortThen };

/** The reading posture — category, verdict, sort and tie-breaker — survives the visit. */
const KEY = 'mh:sourcing:view';

const SORTS: SortKey[] = ['margin', 'net', 'price', 'rank', 'trend'];
const VERDICTS: VerdictFilter[] = ['all', 'good', 'risk'];

export type ViewMemory = {
  category: SourcingCategory | 'all';
  verdict: VerdictFilter;
  sort: SortKey;
  sort2: SortThen;
  /** The grid order is reversed — the reader reads it bottom-up. */
  flip: boolean;
};

export const DEFAULT_VIEW: ViewMemory = {
  category: 'all',
  verdict: 'all',
  sort: 'margin',
  sort2: 'none',
  flip: false,
};

const isCategory = (value: unknown): value is SourcingCategory | 'all' =>
  value === 'all' || CATEGORIES.includes(value as SourcingCategory);

const isVerdict = (value: unknown): value is VerdictFilter =>
  VERDICTS.includes(value as VerdictFilter);

/** Guards a sort coming from storage as well as from a link. */
export const isSortKey = (value: unknown): value is SortKey =>
  SORTS.includes(value as SortKey);

const isSort = isSortKey;

const isSortThen = (value: unknown): value is SortThen => value === 'none' || isSort(value);

/**
 * Turns anything — browser memory or a row read back from the account — into
 * a usable view, one valid field at a time.
 */
export function sanitizeView(input: unknown): ViewMemory {
  if (!input || typeof input !== 'object') return { ...DEFAULT_VIEW };
  const source = input as {
    category?: unknown;
    verdict?: unknown;
    sort?: unknown;
    sort2?: unknown;
    flip?: unknown;
  };
  const sort = isSort(source.sort) ? source.sort : DEFAULT_VIEW.sort;
  const rawThen = isSortThen(source.sort2) ? source.sort2 : DEFAULT_VIEW.sort2;
  return {
    category: isCategory(source.category) ? source.category : DEFAULT_VIEW.category,
    verdict: isVerdict(source.verdict) ? source.verdict : DEFAULT_VIEW.verdict,
    sort,
    /* A tie-breaker identical to the main sort would do nothing. */
    sort2: rawThen === sort ? 'none' : rawThen,
    flip: source.flip === true,
  };
}

/** Reads the remembered working view, one valid field at a time. */
export function readView(): ViewMemory {
  try {
    const stored = window.localStorage.getItem(KEY);
    if (!stored) return { ...DEFAULT_VIEW };
    return sanitizeView(JSON.parse(stored));
  } catch {
    return { ...DEFAULT_VIEW };
  }
}

/** True when the view is the neutral one — nothing worth remembering. */
export function isDefaultView(view: ViewMemory): boolean {
  return (
    view.category === DEFAULT_VIEW.category &&
    view.verdict === DEFAULT_VIEW.verdict &&
    view.sort === DEFAULT_VIEW.sort &&
    view.sort2 === DEFAULT_VIEW.sort2 &&
    view.flip === DEFAULT_VIEW.flip
  );
}

/** Stores the view; a neutral view clears the storage instead of piling up. */
export function rememberView(view: ViewMemory): void {
  try {
    if (isDefaultView(view)) {
      window.localStorage.removeItem(KEY);
      return;
    }
    window.localStorage.setItem(
      KEY,
      JSON.stringify({
        category: view.category,
        verdict: view.verdict,
        sort: view.sort,
        sort2: view.sort2,
        flip: view.flip,
      }),
    );
  } catch {
    /* storage blocked — the board simply opens neutral next time */
  }
}