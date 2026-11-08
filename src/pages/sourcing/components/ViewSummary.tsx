import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { makeFormatters } from '@/pages/home/calcModel';
import { buildViewLine } from '@/pages/sourcing/viewLine';
import {
  MARGIN_OFF,
  SORT_LABEL_KEYS,
} from '@/pages/sourcing/components/SourcingFilters';
import type {
  SortKey,
  SortThen,
  VerdictFilter,
} from '@/pages/sourcing/components/SourcingFilters';
import type { SourcingCategory } from '@/pages/sourcing/productMargin';

type Props = {
  category: SourcingCategory | 'all';
  verdict: VerdictFilter;
  sort: SortKey;
  sort2: SortThen;
  /** The grid reads the other way round — the arrow follows it. */
  flip: boolean;
  minMargin: number;
  inAccount: boolean;
  locale: string;
};

/** Price and rank read best ascending; the other sorts start descending. */
const ASCENDING: SortKey[] = ['price', 'rank'];

/**
 * One short line at the top of the board, telling at a glance what the grid is
 * currently showing: how it is sorted, which filters narrow it, how high the
 * margin floor sits, and where those settings are kept.
 */
export default function ViewSummary({
  category,
  verdict,
  sort,
  sort2,
  flip,
  minMargin,
  inAccount,
  locale,
}: Props) {
  const { t } = useTranslation();
  const { pct } = useMemo(() => makeFormatters(locale), [locale]);
  /** `idle` then `done` or `fail` for a couple of seconds after a click. */
  const [copyState, setCopyState] = useState<'idle' | 'done' | 'fail'>('idle');
  const copyTimer = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (copyTimer.current !== null) window.clearTimeout(copyTimer.current);
    },
    [],
  );

  const ascending = ASCENDING.includes(sort) !== flip;
  const floorOn = minMargin > MARGIN_OFF;

  /* The very line the reader sees, flattened — ready to paste in a message. */
  const copySummary = async () => {
    const line = buildViewLine(
      { category, verdict, sort, sort2, flip, minMargin, inAccount, locale },
      (key, options) => t(key, options),
    );
    try {
      if (!navigator.clipboard?.writeText) throw new Error('no-clipboard');
      await navigator.clipboard.writeText(line);
      setCopyState('done');
    } catch {
      setCopyState('fail');
    }
    if (copyTimer.current !== null) window.clearTimeout(copyTimer.current);
    copyTimer.current = window.setTimeout(() => setCopyState('idle'), 2400);
  };

  return (
    <div className="src-brief" role="status" aria-label={t('home.sourcing.briefAria')}>
      <span className="src-brief-lab">
        <i className="ri-eye-line" aria-hidden="true" />
        {t('home.sourcing.briefLab')}
      </span>

      <span className="src-brief-items">
        <span
          className="src-brief-item"
          title={t(ascending ? 'home.sourcing.sortDirAsc' : 'home.sourcing.sortDirDesc')}
        >
          {t('home.sourcing.briefSort', { sort: t(SORT_LABEL_KEYS[sort]) })}
          <i
            className={ascending ? 'ri-arrow-up-line' : 'ri-arrow-down-line'}
            aria-hidden="true"
          />
        </span>

        {sort2 !== 'none' && (
          <span className="src-brief-item">
            {t('home.sourcing.briefThen', { sort: t(SORT_LABEL_KEYS[sort2]) })}
          </span>
        )}

        {category !== 'all' && (
          <span className="src-brief-item is-soft">
            <i className="ri-price-tag-3-line" aria-hidden="true" />
            {t(`home.sourcing.cat.${category}`)}
          </span>
        )}

        {verdict !== 'all' && (
          <span className={`src-brief-item is-${verdict === 'good' ? 'good' : 'risk'}`}>
            <i
              className={verdict === 'good' ? 'ri-checkbox-circle-line' : 'ri-alert-line'}
              aria-hidden="true"
            />
            {t(
              verdict === 'good'
                ? 'home.sourcing.briefVerdictGood'
                : 'home.sourcing.briefVerdictRisk',
            )}
          </span>
        )}

        <span className={`src-brief-item${floorOn ? ' is-on' : ' is-soft'}`}>
          <i className="ri-speed-up-line" aria-hidden="true" />
          {floorOn
            ? t('home.sourcing.briefFloor', { value: pct(minMargin) })
            : t('home.sourcing.briefFloorOff')}
        </span>

        <span className={`src-brief-item${inAccount ? ' is-cloud' : ' is-soft'}`}>
          <i className={inAccount ? 'ri-cloud-line' : 'ri-save-3-line'} aria-hidden="true" />
          {inAccount
            ? t('home.sourcing.briefAccount')
            : t('home.sourcing.briefDevice')}
        </span>
      </span>

      <button
        type="button"
        className={`src-brief-copy${copyState === 'done' ? ' is-done' : ''}${
          copyState === 'fail' ? ' is-fail' : ''
        }`}
        onClick={() => void copySummary()}
        title={t('home.sourcing.briefCopyHint')}
      >
        <i
          className={
            copyState === 'done'
              ? 'ri-check-line'
              : copyState === 'fail'
                ? 'ri-error-warning-line'
                : 'ri-file-copy-line'
          }
          aria-hidden="true"
        />
        {copyState === 'done'
          ? t('home.sourcing.briefCopied')
          : copyState === 'fail'
            ? t('home.sourcing.briefCopyFail')
            : t('home.sourcing.briefCopy')}
      </button>
    </div>
  );
}