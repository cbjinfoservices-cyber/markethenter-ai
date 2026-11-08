import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { makeFormatters, queueCalculation } from '@/pages/home/calcModel';
import { VERDICT_ICONS, VERDICT_KEYS } from '@/pages/home/calcVerdict';
import { clearFixing } from '@/pages/home/scenarioFix';
import { canCalculateProduct, valuesFor } from '@/pages/sourcing/productMargin';
import type { SourcingRow } from '@/pages/sourcing/productMargin';

type Props = {
  row: SourcingRow;
  locale: string;
  goodFloor: number;
  /** Already written into the dashboard as a scenario. */
  saved: boolean;
  saving: boolean;
  onSave: () => void;
  comparing: boolean;
  compareFull: boolean;
  onCompare: () => void;
  /**
   * Net margin of the whole catalogue, only given when the board was opened
   * from the Modules page — the card then shows where it sits against it.
   */
  median?: number | null;
  /**
   * When a past arrangement is put side by side with the board: what would
   * happen to this very card. `null` when no comparison is open.
   */
  diffState?: 'leaving' | 'entering' | 'moved' | 'same' | null;
  /** The rank it would take under that past arrangement. */
  diffPosition?: number | null;
};

export default function ProductCard({
  row,
  locale,
  goodFloor,
  saved,
  saving,
  onSave,
  comparing,
  compareFull,
  onCompare,
  median = null,
  diffState = null,
  diffPosition = null,
}: Props) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { eur, pct } = useMemo(() => makeFormatters(locale), [locale]);
  const [open, setOpen] = useState(false);
  const compareBlocked = compareFull && !comparing;

  const { product, metrics, threshold, level } = row;
  const calculable = canCalculateProduct(product);
  const medianValue =
    typeof median === 'number' && Number.isFinite(median) ? median : null;
  const medianDelta =
    medianValue === null ? null : metrics.netMargin - medianValue;
  const medianSign =
    medianDelta === null ? '' : medianDelta > 0.05 ? '+' : medianDelta < -0.05 ? '−' : '±';
  const medianText =
    medianDelta === null || medianValue === null
      ? ''
      : t('home.sourcing.vsMedian', {
          value: `${medianSign}${pct(Math.abs(medianDelta))}`,
        });
  const verdictText = t(
    level === 'good'
      ? 'home.burger.verdictGood'
      : level === 'warn'
        ? 'home.burger.verdictWarn'
        : 'home.burger.verdictBad',
  );

  /* Handing the listing's numbers to the calculator, so the reader can tune
     the supplier quote on real data instead of retyping it. */
  const load = () => {
    if (!calculable) return;
    clearFixing();
    queueCalculation(valuesFor(product), 0, product.name);
    navigate('/calculateur#calculator');
  };

  return (
    <article
      className={`src-card is-${level}${
        diffState && diffState !== 'same' ? ` is-diff-${diffState}` : ''
      }`}
    >
      <div className="src-media">
        <img
          className="src-media-img"
          src={product.image}
          alt={product.name}
          title={`${product.name} · produit sourcé`}
        />
        <span className="src-rank">
          <i className="ri-trophy-line" aria-hidden="true" />
          {t('home.sourcing.rank', { rank: product.rank })}
        </span>
        <span className={`src-retailer is-${product.retailer}`}>
          {product.retailer === 'ebay'
            ? t('home.sourcing.retailerEbay')
            : t('home.sourcing.retailerAmazon')}
        </span>
      </div>

      <div className="src-body">
        <div className="src-top">
          <h3 title={product.name}>{product.name}</h3>
          <span
            className={`dash-verdict is-${level}`}
            title={t(VERDICT_KEYS[level].advice, { value: goodFloor })}
          >
            <i className={VERDICT_ICONS[level]} aria-hidden="true" />
            {verdictText}
          </span>
        </div>

        {diffState && diffState !== 'same' && (
          <span className={`src-diff is-${diffState}`}>
            <i
              className={
                diffState === 'leaving'
                  ? 'ri-eye-off-line'
                  : diffState === 'entering'
                    ? 'ri-eye-line'
                    : 'ri-drag-move-line'
              }
              aria-hidden="true"
            />
            {diffState === 'leaving'
              ? t('home.sourcing.cmpCardLeave')
              : diffState === 'entering'
                ? t('home.sourcing.cmpCardEnter')
                : t('home.sourcing.cmpCardMove', { n: diffPosition ?? 0 })}
          </span>
        )}

        <div className="src-meta">
          {product.sourceUrl && (
            <a href={product.sourceUrl} target="_blank" rel="noopener noreferrer">
              {t('home.sourcing.amazonLink')}
              <i className="ri-external-link-line" aria-hidden="true" />
            </a>
          )}
          <span className="src-rating">
            <i className="ri-star-fill" aria-hidden="true" />
            {product.rating > 0 ? product.rating.toFixed(1) : '—'}
            <em className="src-reviews">
              {t('home.sourcing.reviews', { n: product.reviews })}
            </em>
          </span>
          {product.trend !== 0 && (
            <span className={`src-trend${product.trend > 0 ? ' is-up' : ' is-down'}`}>
              <i
                className={product.trend > 0 ? 'ri-arrow-up-line' : 'ri-arrow-down-line'}
                aria-hidden="true"
              />
              {t('home.sourcing.trend', { value: Math.abs(product.trend) })}
            </span>
          )}
        </div>

        <div className="src-price">
          <b className={`src-net${metrics.net < 0 ? ' is-neg' : ' is-pos'}`}>
            {eur(metrics.net)}
          </b>
          <span className="src-cap">
            {t('home.sourcing.netCap', {
              margin: pct(metrics.netMargin),
              monthly: eur(metrics.monthly),
            })}
          </span>
        </div>

        {medianDelta !== null && medianValue !== null && (
          <span
            className={`src-median-chip${
              medianDelta > 0.05 ? ' is-up' : medianDelta < -0.05 ? ' is-down' : ' is-even'
            }`}
            title={t('home.sourcing.vsMedianHint', { value: pct(medianValue) })}
          >
            <i
              className={
                medianDelta > 0.05
                  ? 'ri-arrow-up-line'
                  : medianDelta < -0.05
                    ? 'ri-arrow-down-line'
                    : 'ri-subtract-line'
              }
              aria-hidden="true"
            />
            {medianText}
          </span>
        )}

        <div className="dash-bar" aria-hidden="true">
          <span className="dash-bar-cost" style={{ width: `${metrics.costPct}%` }} />
          <span className="dash-bar-profit" style={{ width: `${metrics.profitPct}%` }} />
        </div>

        <dl className="dash-card-rows src-rows">
          <div>
            <dt>{t('home.sourcing.price')}</dt>
            <dd>{eur(metrics.price)}</dd>
          </div>
          <div>
            <dt>{t('home.sourcing.landed')}</dt>
            <dd>{eur(metrics.landed)}</dd>
          </div>
          <div>
            <dt>{t('home.sourcing.target')}</dt>
            <dd>{threshold.feasible ? eur(threshold.minPrice) : '—'}</dd>
          </div>
          <div>
            <dt>{t('home.sourcing.monthlyUnits')}</dt>
            <dd>{product.units}</dd>
          </div>
        </dl>

        {open && (
          <dl className="src-breakdown">
            <div>
              <dt>{t('home.sourcing.fCommission')}</dt>
              <dd>{eur(metrics.price * 0.15)}</dd>
            </div>
            <div>
              <dt>{t('home.sourcing.fFba')}</dt>
              <dd>{eur(product.fba)}</dd>
            </div>
            <div>
              <dt>{t('home.sourcing.fPpc')}</dt>
              <dd>{eur(product.ppc)}</dd>
            </div>
            <div>
              <dt>{t('home.sourcing.fReturns')}</dt>
              <dd>{eur((metrics.price * product.returns) / 100)}</dd>
            </div>
            <div>
              <dt>{t('home.sourcing.fTotal')}</dt>
              <dd>{eur(metrics.totalCost)}</dd>
            </div>
          </dl>
        )}

        {product.estimated && (
          <p className="src-estimated">
            <i className="ri-information-line" aria-hidden="true" />
            {t('home.sourcing.estimated')}
          </p>
        )}

        <div className="src-actions">
          <button type="button" className="src-load" onClick={load} disabled={!calculable}>
            <i className="ri-calculator-line" aria-hidden="true" />
            {t('home.sourcing.load')}
          </button>
          <button
            type="button"
            className={`src-save${saved ? ' is-saved' : ''}`}
            onClick={onSave}
            disabled={saving}
            aria-label={t('home.sourcing.saveHint')}
            title={saved ? t('home.sourcing.saveUpdateHint') : t('home.sourcing.saveHint')}
          >
            <i
              className={
                saving
                  ? 'ri-loader-4-line dash-spin'
                  : saved
                    ? 'ri-checkbox-circle-fill'
                    : 'ri-bookmark-line'
              }
              aria-hidden="true"
            />
            {saving
              ? t('home.sourcing.saveSaving')
              : saved
                ? t('home.sourcing.saveSaved')
                : t('home.sourcing.save')}
          </button>
        </div>

        <div className="src-mini">
          <button
            type="button"
            className={`src-compare-btn${comparing ? ' is-on' : ''}`}
            onClick={onCompare}
            disabled={compareBlocked}
            aria-pressed={comparing}
            title={compareBlocked ? t('home.sourcing.compareFull') : t('home.sourcing.compareHint')}
          >
            <i className={comparing ? 'ri-check-line' : 'ri-scales-3-line'} aria-hidden="true" />
            {comparing ? t('home.sourcing.compareOn') : t('home.sourcing.compare')}
          </button>
          <button
            type="button"
            className={`src-more${open ? ' is-open' : ''}`}
            onClick={() => setOpen((prev) => !prev)}
            aria-expanded={open}
          >
            {open ? t('home.sourcing.breakdownHide') : t('home.sourcing.breakdown')}
            <i className="ri-arrow-down-s-line" aria-hidden="true" />
          </button>
        </div>
      </div>
    </article>
  );
}