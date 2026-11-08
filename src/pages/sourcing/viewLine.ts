import { makeFormatters } from '@/pages/home/calcModel';
import { MARGIN_OFF, SORT_LABEL_KEYS } from '@/pages/sourcing/components/SourcingFilters';
import type { SortKey, SortThen, VerdictFilter } from '@/pages/sourcing/components/SourcingFilters';
import type { SourcingCategory } from '@/pages/sourcing/productMargin';

type Translate = (key: string, options: Record<string, string | number>) => string;

export type ViewLineInput = {
  category: SourcingCategory | 'all';
  verdict: VerdictFilter;
  sort: SortKey;
  sort2: SortThen;
  /** The grid reads upside down — the arrow follows it. */
  flip: boolean;
  minMargin: number;
  /** Settings live in the account rather than only in this browser. */
  inAccount: boolean;
  locale: string;
};

/** Price and rank read best ascending; the other sorts start descending. */
const ASCENDING: SortKey[] = ['price', 'rank'];

/**
 * The active view, split into short readable pieces: sorting, tie-breaker,
 * category, verdict, margin floor and where the settings are kept. Both the
 * hero summary and the copied supplier message are built from these, so the
 * two never drift apart.
 */
export function buildViewParts(input: ViewLineInput, t: Translate): string[] {
  const { pct } = makeFormatters(input.locale);
  const parts: string[] = [];
  const ascending = ASCENDING.includes(input.sort) !== input.flip;

  parts.push(
    `${t('home.sourcing.briefSort', {
      sort: t(SORT_LABEL_KEYS[input.sort], {}),
    })} ${ascending ? '↑' : '↓'}`,
  );

  if (input.sort2 !== 'none') {
    parts.push(t('home.sourcing.briefThen', { sort: t(SORT_LABEL_KEYS[input.sort2], {}) }));
  }

  if (input.category !== 'all') {
    parts.push(t(`home.sourcing.cat.${input.category}`, {}));
  }

  if (input.verdict !== 'all') {
    parts.push(
      t(
        input.verdict === 'good'
          ? 'home.sourcing.briefVerdictGood'
          : 'home.sourcing.briefVerdictRisk',
        {},
      ),
    );
  }

  parts.push(
    input.minMargin > MARGIN_OFF
      ? t('home.sourcing.briefFloor', { value: pct(input.minMargin) })
      : t('home.sourcing.briefFloorOff', {}),
  );

  parts.push(
    input.inAccount
      ? t('home.sourcing.briefAccount', {})
      : t('home.sourcing.briefDevice', {}),
  );

  return parts;
}

/**
 * The same view on one single line, ready to be pasted into a message to a
 * supplier so they know which settings produced the figures below.
 */
export function buildViewLine(input: ViewLineInput, t: Translate): string {
  return `${t('home.sourcing.briefLab', {})} : ${buildViewParts(input, t).join(' · ')}`;
}