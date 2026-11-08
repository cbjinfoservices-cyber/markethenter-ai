import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { compute, makeFormatters, num, thresholdFor } from '@/pages/home/calcModel';
import type { CalcHandoff } from '@/pages/home/calcHandoff';

type Props = {
  handoff: CalcHandoff;
  onDismiss: () => void;
};

/** Mirror of the calculator reminder: what the calculator currently holds. */
export default function FromCalculatorBanner({ handoff, onDismiss }: Props) {
  const { t, i18n } = useTranslation();
  const lang = (i18n.resolvedLanguage || 'fr').slice(0, 2);
  const locale = lang === 'fr' ? 'fr-FR' : 'en-GB';
  const { eur, pct } = useMemo(() => makeFormatters(locale), [locale]);

  const metrics = useMemo(() => compute(handoff.values), [handoff]);
  const threshold = useMemo(() => thresholdFor(handoff.values, num(handoff.target)), [handoff]);

  return (
    <div className="calc-banner dash-banner">
      <span className="calc-banner-ico" aria-hidden="true">
        <i className="ri-calculator-line" />
      </span>
      <div className="calc-banner-copy">
        <span className="calc-banner-lab">{t('home.dash.fromCalcLabel')}</span>
        <b>{t('home.calc.fromDashDraft')}</b>
        <p>
          {t('home.dash.fromCalcHint', {
            net: eur(metrics.net),
            margin: pct(metrics.netMargin),
            min: threshold.feasible ? eur(threshold.minPrice) : '—',
          })}
        </p>
      </div>
      <div className="calc-banner-actions">
        <Link className="calc-banner-back" to="/calculateur#calculator">
          {t('home.dash.fromCalcOpen')}
          <i className="ri-arrow-right-line" aria-hidden="true" />
        </Link>
        <button
          type="button"
          className="calc-banner-x"
          onClick={onDismiss}
          aria-label={t('home.dash.fromCalcHide')}
          title={t('home.dash.fromCalcHide')}
        >
          <i className="ri-close-line" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}