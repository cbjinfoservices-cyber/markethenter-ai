import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { makeFormatters } from '@/pages/home/calcModel';
import type { Metrics } from '@/pages/home/calcModel';

type Props = {
  metrics: Metrics;
  locale: string;
};

/** Cost rows read best as a table: label on the left, figure right-aligned. */
type Row = {
  key: string;
  label: string;
  value: string;
  tone?: 'pos' | 'neg';
  strong?: boolean;
};

/**
 * The nine results of the calculator, laid out as a small quiet table: the
 * four figures that decide the deal on top, then the cost-by-cost detail
 * underneath, so the numbers can be read in one glance instead of nine.
 */
export default function CalcResults({ metrics, locale }: Props) {
  const { t } = useTranslation();
  const { eur, pct } = useMemo(() => makeFormatters(locale), [locale]);

  const toneOf = (value: number): 'pos' | 'neg' => (value < 0 ? 'neg' : 'pos');

  const hero = [
    {
      key: 'net',
      icon: 'ri-wallet-3-line',
      label: t('home.calc.netProfit'),
      value: eur(metrics.net),
      tone: toneOf(metrics.net),
      note: t('home.calc.perUnit'),
    },
    {
      key: 'margin',
      icon: 'ri-percent-line',
      label: t('home.calc.netMargin'),
      value: pct(metrics.netMargin),
      tone: toneOf(metrics.netMargin),
      note: t('home.calc.resOnPrice'),
    },
    {
      key: 'roi',
      icon: 'ri-line-chart-line',
      label: t('home.calc.roi'),
      value: pct(metrics.roi),
      tone: toneOf(metrics.net),
      note: t('home.calc.resOnCost'),
    },
    {
      key: 'monthly',
      icon: 'ri-calendar-line',
      label: t('home.calc.monthly'),
      value: eur(metrics.monthly),
      tone: toneOf(metrics.monthly),
      note: t('home.calc.resPerMonth'),
    },
  ];

  const rows: Row[] = [
    {
      key: 'price',
      label: t('home.calc.price'),
      value: eur(metrics.price),
      strong: true,
    },
    {
      key: 'cost',
      label: t('home.calc.totalCost'),
      value: eur(metrics.totalCost),
      strong: true,
    },
    {
      key: 'gross',
      label: t('home.calc.grossMargin'),
      value: pct(metrics.grossMargin),
    },
    {
      key: 'priceHT',
      label: t('home.calc.priceHT'),
      value: eur(metrics.priceHT),
    },
    {
      key: 'vat',
      label: t('home.calc.vatAmount'),
      value: eur(metrics.vatAmount),
    },
    {
      key: 'netHT',
      label: t('home.calc.netHT'),
      value: eur(metrics.netHT),
      tone: toneOf(metrics.netHT),
      strong: true,
    },
  ];

  return (
    <div className="calc-res">
      <div className="calc-res-head">
        <span className="calc-res-title">
          <i className="ri-table-line" aria-hidden="true" />
          {t('home.calc.resTitle')}
        </span>
        <span className="calc-res-hint">{t('home.calc.resHint')}</span>
      </div>

      <div className="calc-res-hero">
        {hero.map((item) => (
          <div className="calc-res-tile" key={item.key}>
            <span>
              <i className={item.icon} aria-hidden="true" />
              {item.label}
            </span>
            <b className={`is-${item.tone}`}>{item.value}</b>
            <em>{item.note}</em>
          </div>
        ))}
      </div>

      <dl className="calc-res-table">
        {rows.map((row) => (
          <div className={`calc-res-row${row.strong ? ' is-strong' : ''}`} key={row.key}>
            <dt>{row.label}</dt>
            <dd className={row.tone ? `is-${row.tone}` : undefined}>{row.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}