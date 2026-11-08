import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { makeFormatters } from '@/pages/home/calcModel';
import { SECOND_SUFFIX } from '@/pages/home/priceHistory';
import { countMonthsOver } from '@/pages/home/supplierAlerts';
import { supplierNameOf } from '@/pages/home/supplierCompare';
import type { DashboardRow } from '@/pages/dashboard/useDashboard';

type Props = {
  rows: DashboardRow[];
  locale: string;
  supplierNames: Record<string, string>;
};

type SortMode = 'alert' | 'order';

const SORT_KEY = 'mh.dash.supplierSort';

/** Month-by-month supplier duel, scenario by scenario. */
export default function SupplierBoard({ rows, locale, supplierNames }: Props) {
  const { t } = useTranslation();
  const { eur } = useMemo(() => makeFormatters(locale), [locale]);
  const [sort, setSort] = useState<SortMode>('alert');

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(SORT_KEY);
      if (stored === 'alert' || stored === 'order') setSort(stored);
    } catch {
      /* storage blocked — the default order stands */
    }
  }, []);

  const remember = (mode: SortMode) => {
    setSort(mode);
    try {
      window.localStorage.setItem(SORT_KEY, mode);
    } catch {
      /* storage blocked — the choice stays for this visit only */
    }
  };

  const compared = useMemo(
    () =>
      rows
        .map((row, index) => {
          const breakEven = row.threshold.feasible ? row.threshold.breakEvenPrice : 0;
          const overA = breakEven > 0 ? countMonthsOver(row.seriesA, breakEven) : 0;
          const overB =
            row.comparableB && breakEven > 0 ? countMonthsOver(row.comparableB, breakEven) : 0;
          const monthsOver = overA + overB;
          return { row, index, monthsOver, alerted: monthsOver > 0, breakEven };
        })
        .filter((entry) => entry.row.comparison !== null),
    [rows],
  );

  const ordered = useMemo(() => {
    if (sort === 'order') return compared;
    return [...compared].sort((a, b) => {
      if (a.alerted === b.alerted) return a.index - b.index;
      return a.alerted ? -1 : 1;
    });
  }, [compared, sort]);

  if (compared.length === 0) {
    return (
      <p className="dash-empty">
        <i className="ri-store-2-line" aria-hidden="true" />
        {t('home.dash.suppliersEmpty')}
      </p>
    );
  }

  const alertTotal = compared.filter((entry) => entry.alerted).length;

  return (
    <div className="dash-suppliers">
      <div className="dash-sort">
        <span className="dash-sort-lab">{t('home.dash.supplierSort')}</span>
        <div className="dash-sort-group" role="group" aria-label={t('home.dash.supplierSort')}>
          <button
            type="button"
            className={sort === 'alert' ? 'is-active' : undefined}
            aria-pressed={sort === 'alert'}
            onClick={() => remember('alert')}
          >
            <i className="ri-alert-line" aria-hidden="true" />
            {t('home.dash.supplierSortAlerts')}
            {alertTotal > 0 && <b>{alertTotal}</b>}
          </button>
          <button
            type="button"
            className={sort === 'order' ? 'is-active' : undefined}
            aria-pressed={sort === 'order'}
            onClick={() => remember('order')}
          >
            <i className="ri-list-ordered" aria-hidden="true" />
            {t('home.dash.supplierSortOrder')}
          </button>
        </div>
      </div>

      {ordered.map(({ row, index, monthsOver, alerted, breakEven }) => {
        const { scenario, comparison } = row;
        if (!comparison) return null;
        const name =
          scenario.name.trim() || `${t('home.calc.scenario')} ${String.fromCharCode(65 + index)}`;
        const nameA = supplierNameOf(
          supplierNames,
          `s${scenario.id}`,
          t('home.calc.historySupplierA'),
        );
        const nameB = supplierNameOf(
          supplierNames,
          `s${scenario.id}${SECOND_SUFFIX}`,
          t('home.calc.historySupplierB'),
        );
        const tied = comparison.winner === 'tie';
        const winner = comparison.winner === 'b' ? nameB : nameA;
        const months = tied ? 0 : comparison.winner === 'b' ? comparison.winsB : comparison.winsA;
        const total = comparison.seriesA.length;

        return (
          <article
            className={`dash-duel${alerted ? ' is-alert' : ''}`}
            key={`duel-${scenario.id}`}
          >
            <div className="dash-duel-head">
              <span className="dash-duel-name">{name}</span>
              <span className="dash-duel-meta">
                {eur(comparison.avgA)} · {eur(comparison.avgB)}
              </span>
            </div>
            {alerted && (
              <span className="dash-duel-alert">
                <i className="ri-alert-line" aria-hidden="true" />
                {t('home.dash.supplierAlert', {
                  n: monthsOver,
                  price: eur(breakEven),
                })}
              </span>
            )}
            <p className={`dash-duel-line${tied ? ' is-tie' : ''}`}>
              <i className={tied ? 'ri-scales-3-line' : 'ri-trophy-line'} aria-hidden="true" />
              {tied
                ? t('home.dash.supplierTie', { a: nameA, b: nameB })
                : t('home.dash.supplierWins', {
                    name: winner,
                    n: months,
                    total: eur(Math.abs(comparison.gap)),
                  })}
            </p>
            <div className="dash-duel-bar" aria-hidden="true">
              <span
                className="dash-duel-fill dash-duel-fill--a"
                style={{ width: `${(comparison.winsA / total) * 100}%` }}
              />
              <span
                className="dash-duel-fill dash-duel-fill--tie"
                style={{ width: `${(comparison.ties / total) * 100}%` }}
              />
              <span
                className="dash-duel-fill dash-duel-fill--b"
                style={{ width: `${(comparison.winsB / total) * 100}%` }}
              />
            </div>
            <div className="dash-duel-legend">
              <span>
                {nameA} · {comparison.winsA}/{total}
              </span>
              <span>
                {nameB} · {comparison.winsB}/{total}
              </span>
            </div>
          </article>
        );
      })}
    </div>
  );
}