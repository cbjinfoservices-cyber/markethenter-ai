import { useTranslation } from 'react-i18next';
import {
  GOOD_FLOOR_PRESETS,
  VERDICT_BAD_FLOOR,
  VERDICT_ICONS,
  VERDICT_LEGEND_KEYS,
} from '@/pages/home/calcVerdict';
import type { VerdictLevel } from '@/pages/home/calcVerdict';
import { useGoodFloor, useGoodFloorOrigin } from '@/pages/home/useGoodMargin';

const LEVELS: VerdictLevel[] = ['good', 'warn', 'bad'];

/**
 * Traffic-light legend printed under the "three numbers, three decisions"
 * section, with the green floor adjustable straight from here.
 */
export default function VerdictLegend() {
  const { t } = useTranslation();
  const [goodFloor, setGoodFloor] = useGoodFloor();
  /* Le seuil vient-il du compte, ou seulement de cet appareil ? */
  const floorOrigin = useGoodFloorOrigin();
  const fromAccount = floorOrigin === 'account';

  const rangeOf = (level: VerdictLevel) => {
    if (level === 'good') return `≥ ${goodFloor} %`;
    if (level === 'warn') return `${VERDICT_BAD_FLOOR} – ${goodFloor} %`;
    return `< ${VERDICT_BAD_FLOOR} %`;
  };

  return (
    <section className="calc-legend" aria-labelledby="calc-legend-title" data-reveal>
      <div className="calc-legend-head">
        <h3 id="calc-legend-title">{t('home.calcPage.legendTitle')}</h3>
        <div className="calc-legend-floor">
          <span className="calc-legend-floor-lab">{t('home.calc.goodFloorLab')}</span>
          <div
            className="calc-legend-floor-presets"
            role="group"
            aria-label={t('home.calc.goodFloorGroup')}
          >
            {GOOD_FLOOR_PRESETS.map((preset) => (
              <button
                type="button"
                key={preset}
                className={preset === goodFloor ? 'is-on' : undefined}
                aria-pressed={preset === goodFloor}
                onClick={() => setGoodFloor(preset)}
              >
                {`${preset} %`}
              </button>
            ))}
          </div>
          <span className="calc-legend-floor-hint">{t('home.calc.goodFloorHint')}</span>
          <span className={`calc-floor-sync${fromAccount ? ' is-on' : ''}`}>
            <i className={fromAccount ? 'ri-cloud-line' : 'ri-cloud-off-line'} aria-hidden="true" />
            {t(fromAccount ? 'home.calc.goodFloorSyncOn' : 'home.calc.goodFloorSyncOff')}
          </span>
        </div>
      </div>

      <ul className="calc-legend-list">
        {LEVELS.map((level) => (
          <li className={`calc-legend-item is-${level}`} key={level}>
            <span className="calc-legend-light" aria-hidden="true">
              <i className={VERDICT_ICONS[level]} />
            </span>
            <div className="calc-legend-copy">
              <div className="calc-legend-line">
                <b>{t(VERDICT_LEGEND_KEYS[level].title)}</b>
                <span className="calc-legend-range">{rangeOf(level)}</span>
              </div>
              <p>{t(VERDICT_LEGEND_KEYS[level].desc, { good: goodFloor, bad: VERDICT_BAD_FLOOR })}</p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}