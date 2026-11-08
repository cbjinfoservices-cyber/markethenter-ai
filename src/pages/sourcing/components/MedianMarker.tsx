import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { makeFormatters } from '@/pages/home/calcModel';

type Props = {
  /** Median net margin of the whole catalogue, in percent. */
  median: number;
  /** Lowest and highest margin on the board, to place the marker on the rail. */
  low: number;
  high: number;
  /** How many listings sit on each side of the median. */
  above: number;
  below: number;
  total: number;
  locale: string;
};

/**
 * The catalogue median, drawn on the grid itself: a rail with one tick where
 * the middle listing sits, so the reader sees at a glance whether the cards
 * below are the upper or the lower half of the board.
 */
export default function MedianMarker({
  median,
  low,
  high,
  above,
  below,
  total,
  locale,
}: Props) {
  const { t } = useTranslation();
  const { pct } = useMemo(() => makeFormatters(locale), [locale]);

  const span = Math.max(1, high - low);
  const position = Math.min(100, Math.max(0, ((median - low) / span) * 100));

  return (
    <div className="src-median" role="status">
      <div className="src-median-head">
        <span className="src-median-ico" aria-hidden="true">
          <i className="ri-bar-chart-horizontal-line" />
        </span>
        <p className="src-median-text">
          <span className="src-median-lab">{t('home.sourcing.medianLab')}</span>
          <b>{pct(median)}</b>
          <span className="src-median-scope">
            {t('home.sourcing.medianScope', { total })}
          </span>
        </p>
      </div>

      <div className="src-median-rail" aria-hidden="true">
        <span className="src-median-fill" style={{ width: `${position}%` }} />
        <span className="src-median-tick" style={{ left: `${position}%` }} />
      </div>

      <div className="src-median-foot">
        <span>
          <i className="ri-arrow-down-line" aria-hidden="true" />
          {t('home.sourcing.medianBelow', { value: below })}
        </span>
        <span>
          <i className="ri-arrow-up-line" aria-hidden="true" />
          {t('home.sourcing.medianAbove', { value: above })}
        </span>
        <span className="src-median-range">
          {pct(low)} → {pct(high)}
        </span>
      </div>
    </div>
  );
}