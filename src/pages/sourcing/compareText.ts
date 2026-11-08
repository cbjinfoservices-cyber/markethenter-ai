import { makeFormatters } from '@/pages/home/calcModel';
import { VERDICT_LEGEND_KEYS } from '@/pages/home/calcVerdict';
import type { CompareItem } from '@/pages/sourcing/compareItem';
import { lineDelta } from '@/pages/sourcing/compareDelta';
import { costLinesOf } from '@/pages/sourcing/compareCosts';

type Translate = (key: string, options?: Record<string, unknown>) => string;

type TextRow = {
  label: string;
  value: number;
  format: (value: number) => string;
};

/**
 * The comparison as plain text, ready to be pasted into a chat message or an
 * email to a supplier. No table, no markup: every line reads on its own, even
 * on a phone.
 */
export function buildCompareText(
  items: CompareItem[],
  locale: string,
  t: Translate,
  /** Net margin of the whole catalogue, in percent — where the board stands. */
  catalogueMedian?: number | null,
  /** The board's active view, on one line — traces the figures to its settings. */
  viewLine?: string | null,
): string {
  const { eur, pct } = makeFormatters(locale);
  const median = Number.isFinite(catalogueMedian) ? Number(catalogueMedian) : null;
  const date = new Intl.DateTimeFormat(locale, { dateStyle: 'long' }).format(new Date());
  const lines: string[] = [];

  lines.push('MarketHunter AI');
  lines.push(`${t('home.sourcing.compareTitle')} · ${date}`);
  if (viewLine) lines.push(viewLine);
  lines.push(t('home.sourcing.printUnit'));
  lines.push('');

  items.forEach((item, index) => {
    const origin =
      item.origin === 'scenario'
        ? t('home.sourcing.compareScenarioTag')
        : t('home.sourcing.compareProductTag');
    lines.push(
      `${index + 1}. ${item.name} — ${origin} · ${t(VERDICT_LEGEND_KEYS[item.level].title)}`,
    );

    const rows: TextRow[] = [
      { label: t('home.sourcing.compareNet'), value: item.metrics.net, format: eur },
      { label: t('home.sourcing.compareLanded'), value: item.metrics.landed, format: eur },
      { label: t('home.sourcing.printTotalCost'), value: item.metrics.totalCost, format: eur },
      {
        label: t('home.sourcing.compareTarget'),
        value: item.threshold.feasible ? item.threshold.minPrice : NaN,
        format: eur,
      },
      { label: t('home.sourcing.compareMargin'), value: item.metrics.netMargin, format: pct },
      { label: t('home.sourcing.comparePrice'), value: item.metrics.price, format: eur },
      { label: t('home.sourcing.compareMonthly'), value: item.metrics.monthly, format: eur },
    ];

    rows.forEach((row) => {
      const value = Number.isFinite(row.value) ? row.format(row.value) : '—';
      lines.push(`   ${row.label} : ${value}`);
    });

    /* Where this listing sits against the catalogue median, in points. */
    if (median !== null) {
      const delta = item.metrics.netMargin - median;
      const sign = delta > 0.05 ? '+' : delta < -0.05 ? '−' : '±';
      lines.push(
        `   ${t('home.sourcing.copyMedian', {
          value: `${sign}${pct(Math.abs(delta))}`,
          median: pct(median),
        })}`,
      );
    }

    /* Where the sale price actually goes, cost by cost. */
    const costs = costLinesOf(item, t);
    if (costs.length > 0) {
      lines.push('');
      lines.push(`   ${t('home.sourcing.copyCostsTitle')}`);
      costs.forEach((cost) => {
        const share = item.metrics.price > 0
          ? t('home.sourcing.copyCostShare', { pct: pct((cost.amount / item.metrics.price) * 100) })
          : '';
        lines.push(`     ${cost.label} : ${eur(cost.amount)}${share ? ` · ${share}` : ''}`);
      });
      const totalShare = item.metrics.price > 0
        ? pct((item.metrics.totalCost / item.metrics.price) * 100)
        : '—';
      lines.push(
        `     ${t('home.sourcing.copyCostsTotal', {
          value: eur(item.metrics.totalCost),
          pct: totalShare,
        })}`,
      );
    }

    if (item.estimated) lines.push(`   ${t('home.sourcing.csvEstimated')}`);
    if (item.collectedAt) lines.push(`   ${t('home.sourcing.csvCollected')} : ${item.collectedAt}`);
    if (item.sourceUrl) lines.push(`   ${t('home.sourcing.csvSource')} : ${item.sourceUrl}`);
    lines.push('');
  });

  if (items.length === 2) {
    const gap = lineDelta(items[0].metrics.net, items[1].metrics.net);
    const absolute = Math.abs(items[0].metrics.net - items[1].metrics.net);
    const suffix = gap === null ? '' : ` · ${pct(gap)}`;
    lines.push(`${t('home.sourcing.copyGap')} : ${eur(absolute)}${suffix}`);
    lines.push('');
  }

  lines.push(t('home.sourcing.printFoot'));
  if (items.some((item) => item.estimated)) {
    lines.push(t('home.sourcing.printEstimateNote'));
  }

  return lines.join('\n').trim();
}