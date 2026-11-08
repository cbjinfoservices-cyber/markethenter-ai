import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { compute, makeFormatters, num, thresholdFor } from '@/pages/home/calcModel';
import type { Values } from '@/pages/home/calcModel';

type Props = {
  /** Name of the scenario handed over by the dashboard (empty for a draft). */
  name: string;
  values: Values;
  target: string;
  onDismiss: () => void;
};

/**
 * Reminder at the top of the calculator: where these numbers come from, the
 * same net / margin / minimum-price preview the dashboard shows, and the way
 * back. Mirrors the dashboard's empty-state preview, figure for figure.
 */
export default function FromDashboardBanner({ name, values, target, onDismiss }: Props) {
  const { t, i18n } = useTranslation();
  const lang = (i18n.resolvedLanguage || 'fr').slice(0, 2);
  const locale = lang === 'fr' ? 'fr-FR' : 'en-GB';
  const { eur, pct } = useMemo(() => makeFormatters(locale), [locale]);

  const metrics = useMemo(() => compute(values), [values]);
  const threshold = useMemo(() => thresholdFor(values, num(target)), [values, target]);

  return (
    <div className="calc-banner" data-reveal>
      <span className="calc-banner-ico" aria-hidden="true">
        <i className="ri-dashboard-3-line" />
      </span>
      <div className="calc-banner-copy">
        <span className="calc-banner-lab">{t('home.calc.fromDashLabel')}</span>
        <b>{name || t('home.calc.fromDashDraft')}</b>
        <div className="calc-banner-preview">
          <div>
            <span>{t('home.calc.netProfit')}</span>
            <b className={metrics.net < 0 ? 'is-neg' : 'is-pos'}>{eur(metrics.net)}</b>
          </div>
          <div>
            <span>{t('home.dash.margin')}</span>
            <b>{pct(metrics.netMargin)}</b>
          </div>
          <div>
            <span>{t('home.dash.minPrice')}</span>
            <b>{threshold.feasible ? eur(threshold.minPrice) : '—'}</b>
          </div>
        </div>
        <p>{t('home.calc.fromDashPreview')}</p>
      </div>
      <div className="calc-banner-actions">
        <Link className="calc-banner-back" to="/dashboard">
          <i className="ri-arrow-left-line" aria-hidden="true" />
          {t('home.calc.fromDashBack')}
        </Link>
        <button
          type="button"
          className="calc-banner-x"
          onClick={onDismiss}
          aria-label={t('home.calc.fromDashHide')}
          title={t('home.calc.fromDashHide')}
        >
          <i className="ri-close-line" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}