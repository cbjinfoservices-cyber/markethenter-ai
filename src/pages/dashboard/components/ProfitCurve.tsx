import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { makeFormatters } from '@/pages/home/calcModel';
import type { ProfitPoint } from '@/pages/dashboard/monthlyProfit';

type Props = {
  points: ProfitPoint[];
  locale: string;
};

/**
 * Twelve-month profit curve across every scenario. The line is drawn with
 * CSS gradient segments so it stays crisp at any width, with a dotted zero
 * baseline and a hover tooltip breaking the month down per scenario.
 */
export default function ProfitCurve({ points, locale }: Props) {
  const { t } = useTranslation();
  const { eur } = useMemo(() => makeFormatters(locale), [locale]);
  const [hover, setHover] = useState<number | null>(null);

  const totals = points.map((point) => point.total);
  const max = Math.max(...totals, 0);
  const min = Math.min(...totals, 0);
  const span = Math.max(0.01, max - min);
  const yOf = (value: number) => ((value - min) / span) * 100;
  const cell = 100 / Math.max(1, points.length);
  const xOf = (index: number) => (index + 0.5) * cell;
  const sum = totals.reduce((acc, value) => acc + value, 0);
  const avg = points.length > 0 ? sum / points.length : 0;
  const bestIndex = totals.indexOf(Math.max(...totals));
  const worstIndex = totals.indexOf(Math.min(...totals));
  const active = hover !== null ? points[hover] : null;
  const tipLeft = hover !== null ? Math.min(82, Math.max(18, xOf(hover))) : 50;
  const activeY = active ? yOf(active.total) : 0;
  const tipBottom = active ? (activeY > 58 ? Math.max(2, activeY - 46) : Math.min(70, activeY + 7)) : 0;

  return (
    <div className="dc">
      <div className="dc-stats">
        <div className="dc-stat">
          <span>{t('home.dash.profitTotal')}</span>
          <b className={sum < 0 ? 'is-neg' : undefined}>{eur(sum)}</b>
        </div>
        <div className="dc-stat">
          <span>{t('home.dash.profitAvg')}</span>
          <b className={avg < 0 ? 'is-neg' : undefined}>{eur(avg)}</b>
        </div>
        <div className="dc-stat">
          <span>{t('home.dash.profitBest')}</span>
          <b>{points[bestIndex]?.short ?? '—'}</b>
          <em>{points[bestIndex] ? eur(points[bestIndex].total) : ''}</em>
        </div>
        <div className="dc-stat">
          <span>{t('home.dash.profitWorst')}</span>
          <b>{points[worstIndex]?.short ?? '—'}</b>
          <em>{points[worstIndex] ? eur(points[worstIndex].total) : ''}</em>
        </div>
      </div>

      <div
        className="dc-plot"
        role="img"
        aria-label={t('home.dash.profitAria')}
        onMouseLeave={() => setHover(null)}
      >
        <span className="dc-zero" style={{ bottom: `${yOf(0)}%` }} aria-hidden="true">
          <em>{t('home.dash.profitZero')}</em>
        </span>

        {totals.slice(0, -1).map((value, index) => {
          const next = totals[index + 1];
          const y1 = yOf(value);
          const y2 = yOf(next);
          const flat = Math.abs(y2 - y1) < 0.6;
          const rising = y2 > y1;
          return (
            <span
              key={`seg-${points[index].short}-${index}`}
              className={`dc-seg${flat ? ' is-flat' : rising ? ' is-up' : ' is-down'}`}
              style={{
                left: `${xOf(index)}%`,
                width: `${cell}%`,
                bottom: `${flat ? y1 : Math.min(y1, y2)}%`,
                height: flat ? '1px' : `${Math.abs(y2 - y1)}%`,
              }}
              aria-hidden="true"
            />
          );
        })}

        {points.map((point, index) => (
          <span
            key={`dot-${point.short}-${index}`}
            className={`dc-dot${hover === index ? ' is-active' : ''}${
              point.total < 0 ? ' is-neg' : ''
            }`}
            style={{ left: `${xOf(index)}%`, bottom: `${yOf(point.total)}%` }}
            aria-hidden="true"
          />
        ))}

        {points.map((point, index) => (
          <button
            key={`hit-${point.short}-${index}`}
            type="button"
            className="dc-hit"
            style={{ left: `${xOf(index) - cell / 2}%`, width: `${cell}%` }}
            onMouseEnter={() => setHover(index)}
            onFocus={() => setHover(index)}
            onBlur={() => setHover(null)}
            aria-label={`${point.long} · ${eur(point.total)}`}
          />
        ))}

        {active && (
          <div
            className="dc-tip"
            style={{ left: `${tipLeft}%`, bottom: `${tipBottom}%` }}
            role="status"
          >
            <span className="dc-tip-month">{active.long}</span>
            <b className={active.total < 0 ? 'is-neg' : 'is-pos'}>{eur(active.total)}</b>
            <ul>
              {active.parts.map((part, index) => (
                <li key={`${part.name}-${index}`}>
                  <span className={`dc-key${part.over ? ' is-over' : ''}`} aria-hidden="true" />
                  <em>{part.name}</em>
                  <b>{eur(part.value)}</b>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className="dc-months" aria-hidden="true">
        {points.map((point, index) => (
          <span key={`mon-${point.short}-${index}`} className={hover === index ? 'is-active' : undefined}>
            {point.short}
          </span>
        ))}
      </div>

      <p className="dc-hint">
        <i className="ri-cursor-line" aria-hidden="true" />
        {t('home.dash.profitHint')}
      </p>
    </div>
  );
}