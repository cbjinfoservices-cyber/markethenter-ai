import { MARGIN_OFF, SORT_LABEL_KEYS } from '@/pages/sourcing/components/SourcingFilters';
import type { SortKey } from '@/pages/sourcing/components/SourcingFilters';
import { describeTraceChange } from '@/pages/sourcing/viewHistory';
import type { ViewTrace } from '@/pages/sourcing/viewHistory';

type Translate = (key: string, options?: Record<string, string | number>) => string;

const escapeCell = (value: string): string =>
  /[";\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;

const sortLabel = (key: SortKey, t: Translate): string => t(SORT_LABEL_KEYS[key], {});

/** Full stamp for an archive file: the reader keeps the exact minute. */
const stampOf = (iso: string, locale: string): string => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(date);
};

/**
 * The whole kept history as a small archive spreadsheet — one row per
 * setting, one column per part of the arrangement. It exists to keep the trace
 * of margin-floor changes over time, so the floor always sits in its own
 * numeric column.
 *
 * Rows read newest first, like the block on the board.
 */
export function buildHistoryCsv(log: ViewTrace[], t: Translate, locale: string): string {
  const header = [
    t('home.sourcing.histCsvWhen', {}),
    t('home.sourcing.histCsvCategory', {}),
    t('home.sourcing.histCsvVerdict', {}),
    t('home.sourcing.histCsvSort', {}),
    t('home.sourcing.histCsvSortThen', {}),
    t('home.sourcing.histCsvReverse', {}),
    t('home.sourcing.histCsvMargin', {}),
    t('home.sourcing.histCsvChange', {}),
  ];

  const lines = [header.map(escapeCell).join(';')];

  log.forEach((entry, index) => {
    const previous = log[index + 1] ?? null;
    const category =
      entry.view.category === 'all'
        ? t('home.sourcing.catAll', {})
        : t(`home.sourcing.cat.${entry.view.category}`, {});
    const verdict = t(
      entry.view.verdict === 'all'
        ? 'home.sourcing.verdictAll'
        : entry.view.verdict === 'good'
          ? 'home.sourcing.verdictGo'
          : 'home.sourcing.verdictRisk',
      {},
    );
    const then =
      entry.view.sort2 === 'none'
        ? t('home.sourcing.sortNone', {})
        : sortLabel(entry.view.sort2, t);
    const change = describeTraceChange(previous, entry, t, locale).join(' · ');
    const floor =
      entry.minMargin > MARGIN_OFF
        ? String(Math.round(entry.minMargin * 10) / 10)
        : '';

    const row = [
      stampOf(entry.at, locale),
      category,
      verdict,
      sortLabel(entry.view.sort, t),
      then,
      entry.view.flip ? t('home.sourcing.histCsvYes', {}) : t('home.sourcing.histCsvNo', {}),
      floor,
      change,
    ];
    lines.push(row.map(escapeCell).join(';'));
  });

  return `\uFEFF${lines.join('\r\n')}`;
}

export function historyCsvFilename(date = new Date()): string {
  const stamp = date.toISOString().slice(0, 10);
  return `markethunter-reglages-compte-${stamp}.csv`;
}