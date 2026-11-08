import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { makeFormatters } from '@/pages/home/calcModel';
import { useSupplierAlerts } from '@/pages/home/supplierAlerts';
import type { SupplierAlert } from '@/pages/home/supplierAlerts';

type Props = {
  /** Pre-computed alerts (dashboard); falls back to this browser's data. */
  alerts?: SupplierAlert[];
  locale?: string;
};

/**
 * Header warning: at least one supplier quote is above the break-even price.
 * Opening it lists the suppliers, each one landing on its own 12-month
 * history in the calculator.
 */
export default function AlertPill({ alerts: preset, locale = 'fr-FR' }: Props) {
  const { t } = useTranslation();
  const live = useSupplierAlerts(t);
  const alerts = preset ?? live;
  const { eur } = useMemo(() => makeFormatters(locale), [locale]);
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (event: MouseEvent) => {
      if (box.current && !box.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (alerts.length === 0) return null;

  const months = alerts.reduce((sum, alert) => sum + alert.monthsOver, 0);
  const label = t('home.alerts.badge', { count: alerts.length, months });
  const detail = alerts
    .map((alert) =>
      t('home.alerts.line', {
        scenario: alert.scenarioName,
        supplier: alert.supplierName,
        months: alert.monthsOver,
        price: eur(alert.breakEven),
      }),
    )
    .join(' · ');

  return (
    <div className="nav-alert-wrap" ref={box}>
      <button
        type="button"
        className={['nav-alert', open ? 'is-open' : ''].filter(Boolean).join(' ')}
        aria-expanded={open}
        aria-haspopup="true"
        aria-label={label}
        title={`${label} ${detail}`}
        onClick={() => setOpen((prev) => !prev)}
      >
        <i className="ri-alert-line" aria-hidden="true" />
        <b>{alerts.length}</b>
        <span className="nav-alert-lab">{t('home.alerts.short')}</span>
        <i className={open ? 'ri-arrow-up-s-line' : 'ri-arrow-down-s-line'} aria-hidden="true" />
      </button>
      {open && (
        <div className="nav-alert-panel" role="menu">
          <p className="nav-alert-head">
            <i className="ri-shield-keyhole-line" aria-hidden="true" />
            <span>{label}</span>
          </p>
          <ul className="nav-alert-list">
            {alerts.map((alert) => (
              <li key={alert.key}>
                <Link
                  role="menuitem"
                  tabIndex={0}
                  className="nav-alert-row"
                  to={`/calculateur?history=${encodeURIComponent(alert.key)}#history-${alert.key}`}
                  aria-label={t('home.alerts.openHistory', { supplier: alert.supplierName })}
                  title={t('home.alerts.line', {
                    scenario: alert.scenarioName,
                    supplier: alert.supplierName,
                    months: alert.monthsOver,
                    price: eur(alert.breakEven),
                  })}
                  onClick={() => setOpen(false)}
                >
                  <span className="nav-alert-row-name">
                    <b>{alert.supplierName}</b>
                    <em>{alert.scenarioName}</em>
                  </span>
                  <span className="nav-alert-row-meta">
                    <b>{t('home.alerts.breakEven', { price: eur(alert.breakEven) })}</b>
                    <em>{t('home.alerts.monthsOver', { count: alert.monthsOver })}</em>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          <Link
            className="nav-alert-all"
            role="menuitem"
            tabIndex={0}
            to="/calculateur#calculator"
            onClick={() => setOpen(false)}
          >
            {t('home.alerts.proOpen')}
            <i className="ri-arrow-right-line" aria-hidden="true" />
          </Link>
        </div>
      )}
    </div>
  );
}