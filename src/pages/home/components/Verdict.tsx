import { useTranslation } from 'react-i18next';
import {
  GOOD_FLOOR_PRESETS,
  VERDICT_ICONS,
  VERDICT_KEYS,
  verdictLevelOf,
} from '@/pages/home/calcVerdict';
import { useGoodFloorOrigin } from '@/pages/home/useGoodMargin';

type Props = {
  net: number;
  netMargin: number;
  marginLabel: string;
  goodFloor: number;
  onGoodFloorChange: (value: number) => void;
};

/**
 * Traffic-light verdict sitting above the results: colour, one-line title and
 * one short piece of advice, readable at a glance behind the numbers. The
 * green floor is adjustable and remembered in this browser.
 */
export default function Verdict({
  net,
  netMargin,
  marginLabel,
  goodFloor,
  onGoodFloorChange,
}: Props) {
  const { t } = useTranslation();
  const level = verdictLevelOf(net, netMargin, goodFloor);
  const keys = VERDICT_KEYS[level];
  /* Le seuil vient-il du compte, ou seulement de cet appareil ? */
  const floorOrigin = useGoodFloorOrigin();
  const fromAccount = floorOrigin === 'account';

  return (
    <div className={`calc-verdict is-${level}`}>
      <span className="calc-verdict-light" aria-hidden="true">
        <i className={VERDICT_ICONS[level]} />
      </span>
      <div className="calc-verdict-copy">
        <span className="calc-verdict-lab">{t('home.calc.verdictLab')}</span>
        <b>{t(keys.title)}</b>
        <p>{t(keys.advice, { value: goodFloor })}</p>
      </div>
      <span className="calc-verdict-margin" aria-hidden="true">
        {marginLabel}
      </span>

      <div className="calc-verdict-seuil">
        <span className="calc-verdict-seuil-lab">{t('home.calc.goodFloorLab')}</span>
        <div
          className="calc-verdict-seuil-presets"
          role="group"
          aria-label={t('home.calc.goodFloorGroup')}
        >
          {GOOD_FLOOR_PRESETS.map((preset) => (
            <button
              type="button"
              key={preset}
              className={preset === goodFloor ? 'is-on' : undefined}
              aria-pressed={preset === goodFloor}
              onClick={() => onGoodFloorChange(preset)}
            >
              {`${preset} %`}
            </button>
          ))}
        </div>
        <span className="calc-verdict-seuil-hint">{t('home.calc.goodFloorHint')}</span>
        <span className={`calc-floor-sync${fromAccount ? ' is-on' : ''}`}>
          <i className={fromAccount ? 'ri-cloud-line' : 'ri-cloud-off-line'} aria-hidden="true" />
          {t(fromAccount ? 'home.calc.goodFloorSyncOn' : 'home.calc.goodFloorSyncOff')}
        </span>
      </div>
    </div>
  );
}