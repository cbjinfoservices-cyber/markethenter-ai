import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  VERDICT_ICONS,
  verdictLevelOf,
} from '@/pages/home/calcVerdict';
import type { VerdictLevel } from '@/pages/home/calcVerdict';
import { useGoodFloor, useGoodFloorOrigin } from '@/pages/home/useGoodMargin';
import type { DashboardRow } from '@/pages/dashboard/useDashboard';

type Props = {
  rows: DashboardRow[];
  /** The red counter doubles as the filter switch. */
  riskyOnly: boolean;
  onToggleRisky: () => void;
};

/** Red first, so a losing scenario is the first thing the eye catches. */
const ORDER: VerdictLevel[] = ['bad', 'warn', 'good'];

const LABEL_KEYS: Record<VerdictLevel, string> = {
  good: 'home.dash.tallyGood',
  warn: 'home.dash.tallyWarn',
  bad: 'home.dash.tallyBad',
};

/** How many scenarios sit in each traffic-light band, at the calculator's floor. */
export default function VerdictTally({ rows, riskyOnly, onToggleRisky }: Props) {
  const { t } = useTranslation();
  const [goodFloor] = useGoodFloor();
  /* Le seuil affiché vient-il du compte, ou seulement de cet appareil ?
     Même signal que le calculateur, pour ne pas douter du chiffre en haut
du tableau de bord. */
  const floorOrigin = useGoodFloorOrigin();
  const fromAccount = floorOrigin === 'account';

  const counts = useMemo(() => {
    const base: Record<VerdictLevel, number> = { good: 0, warn: 0, bad: 0 };
    rows.forEach((row) => {
      const level = verdictLevelOf(row.metrics.net, row.metrics.netMargin, goodFloor);
      base[level] += 1;
    });
    return base;
  }, [rows, goodFloor]);

  if (rows.length === 0) return null;

  const unit = (n: number) => (n > 1 ? t('home.dash.tallyMany') : t('home.dash.tallyOne'));

  const chip = (level: VerdictLevel) => (
    <>
      <i className={VERDICT_ICONS[level]} aria-hidden="true" />
      <b>{counts[level]}</b>
      <span>
        {unit(counts[level])} {t(LABEL_KEYS[level])}
      </span>
    </>
  );

  return (
    <section className="dash-tally" aria-live="polite" aria-label={t('home.dash.tallyTitle')}>
      <span className="dash-tally-lab">
        <i className="ri-traffic-light-line" aria-hidden="true" />
        {t('home.dash.tallyTitle')}
      </span>
      <ul className="dash-tally-list">
        {ORDER.filter((level) => counts[level] > 0).map((level) => (
          <li key={level} className={`dash-tally-item is-${level}`}>
            {level === 'bad' ? (
              <button
                type="button"
                className="dash-tally-btn"
                onClick={onToggleRisky}
                aria-pressed={riskyOnly}
                title={t(
                  riskyOnly ? 'home.dash.tallyFilterOff' : 'home.dash.tallyFilterOn',
                  { count: counts.bad },
                )}
              >
                {chip(level)}
                <i
                  className={`dash-tally-switch ${riskyOnly ? 'ri-close-line' : 'ri-filter-3-line'}`}
                  aria-hidden="true"
                />
              </button>
            ) : (
              chip(level)
            )}
          </li>
        ))}
        {counts.bad === 0 && (
          <li className="dash-tally-ok">
            <i className="ri-checkbox-circle-line" aria-hidden="true" />
            {t('home.dash.tallyOk')}
          </li>
        )}
      </ul>
      <span className="dash-tally-floor">
        {t('home.dash.tallyFloor', { value: goodFloor })}
      </span>
      <span className={`dash-tally-sync${fromAccount ? ' is-on' : ''}`}>
        <i className={fromAccount ? 'ri-cloud-line' : 'ri-cloud-off-line'} aria-hidden="true" />
        {t(fromAccount ? 'home.calc.goodFloorSyncOn' : 'home.calc.goodFloorSyncOff')}
      </span>
    </section>
  );
}