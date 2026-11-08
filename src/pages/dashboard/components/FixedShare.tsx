import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { encodeValues, makeFormatters } from '@/pages/home/calcModel';
import type { Values } from '@/pages/home/calcModel';

type Props = {
  /** Scenario name, already resolved (never empty). */
  name: string;
  /** The scenario's numbers, with the advised price already applied. */
  values: Values;
  /** Advised selling price that reaches the green floor. */
  greenPrice: number;
  /** Selling price used today, to show the gap. */
  currentPrice: number;
  /** Green floor in percent, as set in the calculator. */
  floor: number;
  locale: string;
};

/** Link to the calculator pre-filled with these exact numbers. */
function calcLink(values: Values, floor: number): string {
  const basePath = __BASE_PATH__.split('/').filter(Boolean).join('/');
  const prefix = basePath ? `/${basePath}` : '';
  return `${window.location.origin}${prefix}/calculateur?calc=${encodeValues(values)}&floor=${floor}`;
}

type Status = 'idle' | 'done' | 'fail';

export default function FixedShare({
  name,
  values,
  greenPrice,
  currentPrice,
  floor,
  locale,
}: Props) {
  const { t } = useTranslation();
  const { eur } = useMemo(() => makeFormatters(locale), [locale]);
  const [status, setStatus] = useState<Status>('idle');
  const timer = useRef<number>(0);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const message = useMemo(() => {
    const link = calcLink(values, floor);
    return t('home.dash.shareText', {
      name,
      price: eur(greenPrice),
      now: eur(currentPrice),
      floor,
      link,
    });
  }, [values, floor, name, greenPrice, currentPrice, eur, t]);

  const copy = async () => {
    let next: Status = 'done';
    try {
      if (!navigator.clipboard) throw new Error('clipboard-unavailable');
      await navigator.clipboard.writeText(message);
    } catch {
      next = 'fail';
    }
    setStatus(next);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setStatus('idle'), 8000);
  };

  return (
    <div className="dash-share">
      <div className="dash-share-head">
        <span className="dash-share-lab" title={t('home.dash.shareHint')}>
          <i className="ri-price-tag-3-line" aria-hidden="true" />
          {t('home.dash.shareLab')}
        </span>
        <b className="dash-share-price">{eur(greenPrice)}</b>
        {Math.abs(greenPrice - currentPrice) >= 0.01 && (
          <span className="dash-share-delta">
            {t('home.dash.shareDelta', { value: eur(Math.abs(greenPrice - currentPrice)) })}
          </span>
        )}
      </div>

      <button
        type="button"
        className={`dash-share-btn${status === 'done' ? ' is-done' : ''}`}
        onClick={() => {
          void copy();
        }}
        aria-label={t('home.dash.shareLabel', { name })}
      >
        <i
          className={status === 'done' ? 'ri-checkbox-circle-line' : 'ri-share-forward-line'}
          aria-hidden="true"
        />
        {status === 'done' ? t('home.dash.shareCopied') : t('home.dash.shareCta')}
      </button>

      {status === 'fail' && (
        <div className="dash-share-fallback">
          <span>{t('home.dash.shareFail')}</span>
          <input
            type="text"
            readOnly
            value={message}
            onFocus={(event) => event.currentTarget.select()}
            aria-label={t('home.dash.shareFail')}
          />
        </div>
      )}
    </div>
  );
}