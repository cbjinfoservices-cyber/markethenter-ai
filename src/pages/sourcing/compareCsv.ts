import { FIELDS } from '@/pages/home/calcModel';
import { VERDICT_LEGEND_KEYS } from '@/pages/home/calcVerdict';
import type { CompareItem } from '@/pages/sourcing/compareItem';
import { lineDelta } from '@/pages/sourcing/compareDelta';

type Translate = (key: string) => string;

/** The trace left at the foot of the file, so the threshold travels with it. */
export type CompareCsvFooter = {
  /** The active view on one line — tells where the figures come from. */
  viewLine?: string | null;
  /** When the account settings were last saved, already formatted. */
  savedAtText?: string | null;
  /** Margin floor used for the export, in percent. Read back on import. */
  minMargin?: number | null;
};

/**
 * A single stable cell carrying the margin floor, so a re-imported file can
 * tell whether it was built with the same threshold as the account today.
 * It reads the same whatever the page language.
 */
export const MARGIN_MARKER = 'MHMARGIN';

const escapeCell = (value: string): string =>
  /[";\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;

/**
 * The comparison as a flat spreadsheet table — one row per column of the
 * board, one column per metric — so a supplier can sort, filter and rework
 * the figures instead of reading a printed sheet.
 *
 * The eleven calculator inputs sit right after the name, unwrapped: that is
 * the block the board reads back on import, once the purchase costs have been
 * retouched in Excel.
 */
export function buildCompareCsv(
  items: CompareItem[],
  locale: string,
  t: Translate,
  /** Net margin of the whole catalogue, in percent — the reference point. */
  catalogueMedian?: number | null,
  /** The board's active view, written under the table. */
  footer?: CompareCsvFooter,
): string {
  const median = Number.isFinite(catalogueMedian) ? Number(catalogueMedian) : null;
  const nf = new Intl.NumberFormat(locale, { useGrouping: false, maximumFractionDigits: 2 });
  const money = (value: number) => nf.format(Math.round(value * 100) / 100);
  const rate = (value: number) => nf.format(Math.round(value * 10) / 10);
  const cell = (value: number, format: (input: number) => string): string =>
    Number.isFinite(value) ? format(value) : '—';
  const input = (item: CompareItem, key: (typeof FIELDS)[number]['key']): string => {
    const raw = Number(item.values?.[key]);
    return Number.isFinite(raw) ? money(raw) : '';
  };

  /* Same lines as the printed sheet, so the spreadsheet says where the gap
     sits — not only how big it is on the net. */
  const gapLines: { label: string; value: (item: CompareItem) => number }[] = [
    { label: t('home.sourcing.compareNet'), value: (item) => item.metrics.net },
    { label: t('home.sourcing.compareLanded'), value: (item) => item.metrics.landed },
    { label: t('home.sourcing.printTotalCost'), value: (item) => item.metrics.totalCost },
    {
      label: t('home.sourcing.compareTarget'),
      value: (item) => (item.threshold.feasible ? item.threshold.minPrice : NaN),
    },
    { label: t('home.sourcing.compareMargin'), value: (item) => item.metrics.netMargin },
    { label: t('home.sourcing.comparePrice'), value: (item) => item.metrics.price },
    { label: t('home.sourcing.compareMonthly'), value: (item) => item.metrics.monthly },
  ];

  const header = [
    t('home.sourcing.csvName'),
    t('home.sourcing.csvOrigin'),
    t('home.sourcing.csvCategory'),
    ...FIELDS.map((field) => `${t(`home.calc.${field.key}`)} (${field.unit})`),
    `${t('home.sourcing.compareNet')} (EUR)`,
    `${t('home.sourcing.compareLanded')} (EUR)`,
    `${t('home.sourcing.printTotalCost')} (EUR)`,
    `${t('home.sourcing.compareTarget')} (EUR)`,
    `${t('home.sourcing.compareMargin')} (%)`,
    `${t('home.sourcing.comparePrice')} (EUR)`,
    `${t('home.sourcing.compareMonthly')} (EUR)`,
    t('home.sourcing.csvVerdict'),
    t('home.sourcing.csvCostBasis'),
    t('home.sourcing.csvCollected'),
    t('home.sourcing.csvSource'),
    ...gapLines.map((line) => `${t('home.sourcing.csvGap')} ${line.label} (%)`),
    `${t('home.sourcing.csvMedianGap')} (pts)`,
  ];

  const lines = [header.map(escapeCell).join(';')];
  const pair = items.length === 2;

  items.forEach((item) => {
    const origin =
      item.origin === 'scenario'
        ? t('home.sourcing.compareScenarioTag')
        : t('home.sourcing.compareProductTag');
    const other = pair ? items.find((entry) => entry.key !== item.key) : undefined;
    const gaps = gapLines.map((line) => {
      if (!other) return '';
      const gap = lineDelta(line.value(item), line.value(other));
      return gap === null ? '0' : rate(gap);
    });
    const row = [
      item.name,
      origin,
      item.category ? t(`home.sourcing.cat.${item.category}`) : '',
      ...FIELDS.map((field) => input(item, field.key)),
      cell(item.metrics.net, money),
      cell(item.metrics.landed, money),
      cell(item.metrics.totalCost, money),
      cell(item.threshold.feasible ? item.threshold.minPrice : NaN, money),
      cell(item.metrics.netMargin, rate),
      cell(item.metrics.price, money),
      cell(item.metrics.monthly, money),
      t(VERDICT_LEGEND_KEYS[item.level].title),
      item.estimated ? t('home.sourcing.csvEstimated') : t('home.sourcing.csvQuoted'),
      item.collectedAt ?? '',
      item.sourceUrl ?? '',
      ...gaps,
      median === null ? '' : rate(item.metrics.netMargin - median),
    ];
    lines.push(row.map(escapeCell).join(';'));
  });

  /* The settings behind the figures, at the foot of the file: a supplier who
     reworks the numbers still sees which threshold produced them. */
  if (footer?.viewLine || footer?.savedAtText) {
    lines.push('');
    if (footer.viewLine) {
      lines.push([t('home.sourcing.csvViewTrace'), footer.viewLine].map(escapeCell).join(';'));
    }
    if (footer.savedAtText) {
      lines.push([t('home.sourcing.csvViewWhen'), footer.savedAtText].map(escapeCell).join(';'));
    }
  }

  /* The floor itself, kept in a stable cell: the import reads it back to warn
     when the file and the account no longer agree. */
  if (footer?.minMargin != null && Number.isFinite(footer.minMargin)) {
    const value = Math.round(Number(footer.minMargin) * 10) / 10;
    lines.push([MARGIN_MARKER, String(value)].join(';'));
  }

  return `\uFEFF${lines.join('\r\n')}`;
}

export function compareCsvFilename(date = new Date()): string {
  const stamp = date.toISOString().slice(0, 10);
  return `markethunter-comparatif-${stamp}.csv`;
}