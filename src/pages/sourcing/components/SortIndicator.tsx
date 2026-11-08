import { useTranslation } from 'react-i18next';
import type { SortKey, SortThen } from '@/pages/sourcing/components/SourcingFilters';

type Props = {
  sort: SortKey;
  sort2: SortThen;
  /** The whole grid order is reversed. */
  flip: boolean;
  onFlip: () => void;
};

const SORT_LABELS: Record<SortKey, string> = {
  margin: 'home.sourcing.sortMargin',
  net: 'home.sourcing.sortNet',
  price: 'home.sourcing.sortPrice',
  rank: 'home.sourcing.sortRank',
  trend: 'home.sourcing.sortTrend',
};

/** Price and rank read best ascending; the rest descending. */
const ASCENDING: SortKey[] = ['price', 'rank'];

export default function SortIndicator({ sort, sort2, flip, onFlip }: Props) {
  const { t } = useTranslation();
  const natural = ASCENDING.includes(sort);
  const ascending = flip ? !natural : natural;

  return (
    <div className="src-sorted">
      <span className="src-sorted-ico" aria-hidden="true">
        <i className={ascending ? 'ri-sort-asc' : 'ri-sort-desc'} />
      </span>
      <p className="src-sorted-text">
        <span className="src-sorted-by">{t('home.sourcing.sortByLab')}</span>
        <b>{t(SORT_LABELS[sort])}</b>
        <em>{ascending ? t('home.sourcing.sortDirAsc') : t('home.sourcing.sortDirDesc')}</em>
        {sort2 !== 'none' && (
          <>
            <span className="src-sorted-then">{t('home.sourcing.sortThenWord')}</span>
            <b>{t(SORT_LABELS[sort2])}</b>
          </>
        )}
      </p>
      <button
        type="button"
        className={`src-sorted-flip${flip ? ' is-on' : ''}`}
        onClick={onFlip}
        aria-pressed={flip}
        title={`${t('home.sourcing.sortFlipHint')} ${t('home.sourcing.sortFlipShortcut')}`}
      >
        <i className={flip ? 'ri-swap-box-line' : 'ri-arrow-up-down-line'} aria-hidden="true" />
        {t('home.sourcing.sortFlip')}
        <kbd className="src-kbd">⇧I</kbd>
      </button>
    </div>
  );
}