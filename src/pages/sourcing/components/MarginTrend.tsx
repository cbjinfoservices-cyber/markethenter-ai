import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { makeFormatters } from '@/pages/home/calcModel';
import { MARGIN_OFF } from '@/pages/sourcing/components/SourcingFilters';
import { formatTraceWhen } from '@/pages/sourcing/viewHistory';
import type { MarginPoint } from '@/pages/sourcing/viewHistory';

type Props = {
  /** Margin floor per setting, oldest first. */
  series: MarginPoint[];
  /** The floor the board applies right now. */
  active: number;
  locale: string;
};

/** Short axis label: the day only — the hours would not fit. */
const dayLabel = (iso: string, locale: string): string => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' }).format(date);
};

/**
 * The margin floor over the latest settings, drawn as a tiny column chart under
 * the history block. Columns grow from a zero baseline, so a floor that was
 * cleared reads as a flat dash and a raised floor stands taller than the one
 * before it — the direction is visible at a glance.
 */
export default function MarginTrend({ series, active, locale }: Props) {
  const { t } = useTranslation();
  const { pct } = useMemo(() => makeFormatters(locale), [locale]);

  if (series.length < 2) return null;

  /* The tallest floor actually set — when every setting cleared it, the chart
     reads as a flat line and the ceiling label is dropped. */
  const setFloors = series
    .filter((point) => point.margin > MARGIN_OFF)
    .map((point) => Math.max(point.margin, 0));
  const hasFloor = setFloors.length > 0;
  const peak = hasFloor ? Math.max(1, ...setFloors) : 1;

  const bars = series.map((point, index) => {
    const on = point.margin > MARGIN_OFF;
    const height = on ? Math.max(8, Math.round((Math.max(point.margin, 0) / peak) * 100)) : 3;
    return {
      at: point.at,
      height,
      on,
      newest: index === series.length - 1,
      value: on ? pct(point.margin) : t('home.sourcing.histMarginOff'),
    };
  });

  const [first] = series;
  const last = series[series.length - 1];

  return (
    <div className="src-mtrend">
      <div className="src-mtrend-head">
        <span className="src-mtrend-lab">
          <i className="ri-line-chart-line" aria-hidden="true" />
          {t('home.sourcing.histTrendLab', { n: series.length })}
        </span>
        <span className={`src-mtrend-now${active > MARGIN_OFF ? ' is-on' : ''}`}>
          {active > MARGIN_OFF
            ? t('home.sourcing.histTrendNow', { value: pct(active) })
            : t('home.sourcing.histTrendNowOff')}
        </span>
      </div>

      <div
        className="src-mtrend-plot"
        role="img"
        aria-label={t('home.sourcing.histTrendAria', { n: series.length })}
      >
        {bars.map((bar) => (
          <span
            key={bar.at}
            className={`src-mtrend-col${bar.on ? '' : ' is-off'}${
              bar.newest ? ' is-newest' : ''
            }`}
            title={t('home.sourcing.histTrendBar', {
              date: formatTraceWhen(bar.at, locale),
              value: bar.value,
            })}
          >
            <span className="src-mtrend-stem" style={{ height: `${bar.height}%` }} />
          </span>
        ))}
      </div>

      <div className="src-mtrend-axis">
        <span>{dayLabel(first.at, locale)}</span>
        <span className="src-mtrend-peak">
          {hasFloor ? t('home.sourcing.histTrendPeak', { value: pct(peak) }) : ''}
        </span>
        <span>{dayLabel(last.at, locale)}</span>
      </div>
    </div>
  );
}