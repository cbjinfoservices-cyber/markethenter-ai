import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { makeFormatters } from '@/pages/home/calcModel';
import { CATEGORIES } from '@/pages/sourcing/productMargin';
import type { SourcingCategory } from '@/pages/sourcing/productMargin';
import {
  VIEW_TRACE_SHOWN,
  buildHistoryLine,
  describeTraceChange,
  describeTraceFull,
  formatTraceWhen,
  marginSeries,
} from '@/pages/sourcing/viewHistory';
import type { ViewTrace } from '@/pages/sourcing/viewHistory';
import MarginTrend from '@/pages/sourcing/components/MarginTrend';

export type SortKey = 'margin' | 'net' | 'price' | 'rank' | 'trend';
/** A second sort, used only to separate rows the first one leaves tied. */
export type SortThen = SortKey | 'none';
export type VerdictFilter = 'all' | 'good' | 'risk';

type Props = {
  category: SourcingCategory | 'all';
  onCategory: (value: SourcingCategory | 'all') => void;
  sort: SortKey;
  onSort: (value: SortKey) => void;
  /** Tie-breaker applied when two rows share the same value on `sort`. */
  sort2: SortThen;
  onSort2: (value: SortThen) => void;
  verdict: VerdictFilter;
  onVerdict: (value: VerdictFilter) => void;
  shown: number;
  total: number;
  /** Lowest net margin kept, in percent. `MARGIN_OFF` means no requirement. */
  minMargin: number;
  onMinMargin: (value: number) => void;
  goodFloor: number;
  locale: string;
  /** Category, verdict and sort come back from the previous visit. */
  remembered?: boolean;
  /** The view is also stored in the signed-in account, not only here. */
  inAccount?: boolean;
  /** True when something is actually off-neutral — the account can be reset. */
  canReset?: boolean;
  /** Drops filters, sorting and the margin floor everywhere, account included. */
  onResetView?: () => void;
  /** True when a filter or the margin floor is actually narrowing the grid. */
  canClearFilters?: boolean;
  /** Drops the category, verdict and margin floor but keeps the sorting. */
  onClearFilters?: () => void;
  /** ISO stamp of the account's last arrangement — printed beside the badge. */
  savedAt?: string | null;
  /** The grid order is reversed — used to spot the configuration in place. */
  flip?: boolean;
  /** The arrangements kept in the account, newest first (up to 30). */
  history?: ViewTrace[];
  /** Puts a past arrangement back — sorting, filters and margin floor. */
  onRestoreTrace?: (entry: ViewTrace) => void;
  /** Downloads the whole archive as a small CSV. */
  onExportHistory?: () => void;
  /** The past arrangement currently put side by side with the board. */
  compareAt?: string | null;
  /** Opens or closes the comparison with a past arrangement. */
  onCompareTrace?: (entry: ViewTrace | null) => void;
  /** Combien d'adresses du comparatif viennent du fichier de travail. */
  importedCount?: number;
  /** Amène l'écran au comparatif, où ces adresses se lisent. */
  onImportedJump?: () => void;
};

/** Slider floor: below this, the requirement is simply off. */
export const MARGIN_OFF = -50;
export const MARGIN_CEIL = 60;

/** One label per sort key, shared with the hero's active-view summary. */
export const SORT_LABEL_KEYS: Record<SortKey, string> = {
  margin: 'home.sourcing.sortMargin',
  net: 'home.sourcing.sortNet',
  price: 'home.sourcing.sortPrice',
  rank: 'home.sourcing.sortRank',
  trend: 'home.sourcing.sortTrend',
};

const SORTS: { key: SortKey; label: string }[] = (
  ['margin', 'net', 'price', 'rank', 'trend'] as SortKey[]
).map((key) => ({ key, label: SORT_LABEL_KEYS[key] }));

export default function SourcingFilters({
  category,
  onCategory,
  sort,
  onSort,
  sort2,
  onSort2,
  verdict,
  onVerdict,
  shown,
  total,
  minMargin,
  onMinMargin,
  goodFloor,
  locale,
  remembered = false,
  inAccount = false,
  canReset = false,
  onResetView,
  canClearFilters = false,
  onClearFilters,
  savedAt = null,
  history = [],
  flip = false,
  onRestoreTrace,
  onExportHistory,
  compareAt = null,
  onCompareTrace,
  importedCount = 0,
  onImportedJump,
}: Props) {
  const { t } = useTranslation();
  const { pct } = useMemo(() => makeFormatters(locale), [locale]);
  const active = minMargin > MARGIN_OFF;
  const floorValue = Math.min(MARGIN_CEIL, Math.max(MARGIN_OFF, Math.round(goodFloor)));

  /* When the account's board was last arranged — the reader sees what the
     figures they are looking at were produced with. */
  const savedAtText = useMemo(() => {
    if (!savedAt) return null;
    const stamp = new Date(savedAt);
    if (Number.isNaN(stamp.getTime())) return null;
    return new Intl.DateTimeFormat(locale, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(stamp);
  }, [savedAt, locale]);

  /* One row unfolded at a time — the full settings of that day. */
  const [openAt, setOpenAt] = useState<string | null>(null);
  const [copyState, setCopyState] = useState<'idle' | 'done' | 'fail'>('idle');
  const copyTimer = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (copyTimer.current !== null) window.clearTimeout(copyTimer.current);
    },
    [],
  );

  /* True when that day's arrangement is exactly what the board shows now. */
  const isCurrentTrace = (entry: ViewTrace): boolean =>
    entry.minMargin === minMargin &&
    entry.view.category === category &&
    entry.view.verdict === verdict &&
    entry.view.sort === sort &&
    entry.view.sort2 === sort2 &&
    entry.view.flip === flip;

  /* The three arrangements flattened onto one line, ready to paste. */
  const copyHistory = async () => {
    const line = buildHistoryLine(history, (key, options) => t(key, options), locale);
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
    <div className="src-filters">
      <div className="src-cats" role="group" aria-label={t('home.sourcing.catsLabel')}>
        <button
          type="button"
          className={`src-cat${category === 'all' ? ' is-on' : ''}`}
          onClick={() => onCategory('all')}
          aria-pressed={category === 'all'}
        >
          {t('home.sourcing.catAll')}
        </button>
        {CATEGORIES.map((key) => (
          <button
            key={key}
            type="button"
            className={`src-cat${category === key ? ' is-on' : ''}`}
            onClick={() => onCategory(key)}
            aria-pressed={category === key}
          >
            {t(`home.sourcing.cat.${key}`)}
          </button>
        ))}
      </div>

      <div className="src-filter-row">
        <div className="src-verdicts" role="group" aria-label={t('home.sourcing.verdictLabel')}>
          {(['all', 'good', 'risk'] as VerdictFilter[]).map((key) => (
            <button
              key={key}
              type="button"
              className={`src-verdict${verdict === key ? ' is-on' : ''}`}
              onClick={() => onVerdict(key)}
              aria-pressed={verdict === key}
            >
              {t(
                key === 'all'
                  ? 'home.sourcing.verdictAll'
                  : key === 'good'
                    ? 'home.sourcing.verdictGo'
                    : 'home.sourcing.verdictRisk',
              )}
            </button>
          ))}
        </div>

        <label className="src-sort">
          <span>{t('home.sourcing.sortLab')}</span>
          <select value={sort} onChange={(event) => onSort(event.target.value as SortKey)}>
            {SORTS.map((item) => (
              <option key={item.key} value={item.key}>
                {t(item.label)}
              </option>
            ))}
          </select>
          <i className="ri-arrow-down-s-line" aria-hidden="true" />
        </label>

        <label className="src-sort src-sort--then" title={t('home.sourcing.sortThenHint')}>
          <span>{t('home.sourcing.sortThenLab')}</span>
          <select
            value={sort2}
            onChange={(event) => onSort2(event.target.value as SortThen)}
            aria-label={t('home.sourcing.sortThenAria')}
          >
            <option value="none">{t('home.sourcing.sortNone')}</option>
            {SORTS.filter((item) => item.key !== sort).map((item) => (
              <option key={item.key} value={item.key}>
                {t(item.label)}
              </option>
            ))}
          </select>
          <i className="ri-arrow-down-s-line" aria-hidden="true" />
        </label>

        <span className="src-count" role="status">
          {t('home.sourcing.count', { shown, total })}
        </span>

        {/* Les adresses ramenées par le fichier de travail, comptées ici même :
           un clic amène au comparatif qui les porte. */}
        {importedCount > 0 && (
          <button
            type="button"
            className="src-filters-imported"
            onClick={onImportedJump}
            title={t('home.sourcing.filtersImportedHint', { count: importedCount })}
          >
            <i className="ri-upload-2-line" aria-hidden="true" />
            {t(
              importedCount > 1
                ? 'home.sourcing.filtersImportedMany'
                : 'home.sourcing.filtersImportedOne',
              { count: importedCount },
            )}
          </button>
        )}

        {remembered && (
          <span
            className="src-view-saved"
            title={
              inAccount
                ? t('home.sourcing.viewRememberedAccountHint')
                : t('home.sourcing.viewRememberedHint')
            }
          >
            <i className={inAccount ? 'ri-cloud-line' : 'ri-save-3-line'} aria-hidden="true" />
            {inAccount
              ? t('home.sourcing.viewRememberedAccount')
              : t('home.sourcing.viewRemembered')}
          </span>
        )}

        {remembered && inAccount && savedAtText && (
          <span className="src-view-when" title={t('home.sourcing.viewRememberedWhenHint')}>
            <i className="ri-time-line" aria-hidden="true" />
            {t('home.sourcing.viewRememberedWhen', { date: savedAtText })}
          </span>
        )}
      </div>

      {inAccount && history.length > 0 && (
        <div className="src-history" aria-label={t('home.sourcing.histAria')}>
          <div className="src-history-head">
            <span className="src-history-lab">
              <i className="ri-history-line" aria-hidden="true" />
              {t('home.sourcing.histLab')}
            </span>
            <span className="src-history-hint">{t('home.sourcing.histExpandHint')}</span>
            {onExportHistory && (
              <button
                type="button"
                className="src-history-copy"
                onClick={onExportHistory}
                title={t('home.sourcing.histCsvHint')}
              >
                <i className="ri-download-2-line" aria-hidden="true" />
                {t('home.sourcing.histCsv')}
              </button>
            )}
            <button
              type="button"
              className={`src-history-copy${copyState === 'done' ? ' is-done' : ''}${
                copyState === 'fail' ? ' is-fail' : ''
              }`}
              onClick={() => void copyHistory()}
              title={t('home.sourcing.histCopyHint')}
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
                ? t('home.sourcing.histCopied')
                : copyState === 'fail'
                  ? t('home.sourcing.histCopyFail')
                  : t('home.sourcing.histCopy')}
            </button>
          </div>

          <ol className="src-history-list">
            {history.slice(0, VIEW_TRACE_SHOWN).map((entry, index) => {
              /* The row above the list still exists in the log: the change it
                 describes stays exact even when older settings are hidden. */
              const previous = history[index + 1] ?? null;
              const changes = describeTraceChange(
                previous,
                entry,
                (key, options) => t(key, options),
                locale,
              );
              const open = openAt === entry.at;
              const comparing = compareAt === entry.at;
              return (
                <li
                  key={entry.at}
                  className={`src-history-item${open ? ' is-open' : ''}${
                    comparing ? ' is-compare' : ''
                  }`}
                >
                  <div className="src-history-line">
                    <button
                      type="button"
                      className="src-history-btn"
                      onClick={() => setOpenAt(open ? null : entry.at)}
                      aria-expanded={open}
                    >
                      <span className="src-history-when">
                        {formatTraceWhen(entry.at, locale)}
                      </span>
                      <span className="src-history-what">{changes.join(' · ')}</span>
                      <span className="src-history-see">
                        {open
                          ? t('home.sourcing.histFullHide')
                          : t('home.sourcing.histFull')}
                      </span>
                      <i
                        className={open ? 'ri-arrow-up-s-line' : 'ri-arrow-down-s-line'}
                        aria-hidden="true"
                      />
                    </button>
                    {onRestoreTrace &&
                      (isCurrentTrace(entry) ? (
                        <span className="src-history-restore is-current">
                          <i className="ri-check-line" aria-hidden="true" />
                          <span className="src-history-restore-lab">
                            {t('home.sourcing.histRestoreActive')}
                          </span>
                        </span>
                      ) : (
                        <button
                          type="button"
                          className="src-history-restore"
                          onClick={() => onRestoreTrace(entry)}
                          title={t('home.sourcing.histRestoreHint')}
                        >
                          <i className="ri-arrow-go-back-line" aria-hidden="true" />
                          <span className="src-history-restore-lab">
                            {t('home.sourcing.histRestore')}
                          </span>
                        </button>
                      ))}
                    {onCompareTrace && !isCurrentTrace(entry) && (
                      <button
                        type="button"
                        className={`src-history-compare${comparing ? ' is-on' : ''}`}
                        onClick={() => onCompareTrace(comparing ? null : entry)}
                        aria-pressed={comparing}
                        title={
                          comparing
                            ? t('home.sourcing.histCompareOffHint')
                            : t('home.sourcing.histCompareHint')
                        }
                      >
                        <i
                          className={
                            comparing ? 'ri-checkbox-circle-fill' : 'ri-scales-3-line'
                          }
                          aria-hidden="true"
                        />
                        <span className="src-history-compare-lab">
                          {comparing
                            ? t('home.sourcing.histCompareOn')
                            : t('home.sourcing.histCompare')}
                        </span>
                      </button>
                    )}
                  </div>
                  {open && (
                    <div className="src-history-full">
                      <span className="src-history-full-lab">
                        {t('home.sourcing.histFullLab')}
                      </span>
                      <p>{describeTraceFull(entry, (key, options) => t(key, options), locale)}</p>
                    </div>
                  )}
                </li>
              );
            })}
          </ol>

          {history.length > 1 && (
            <MarginTrend series={marginSeries(history)} active={minMargin} locale={locale} />
          )}
        </div>
      )}

      <div className="src-margin">
        <label className="src-margin-head" htmlFor="src-margin-range">
          <i className="ri-speed-up-line" aria-hidden="true" />
          <span>{t('home.sourcing.marginLab')}</span>
          <b className={active ? 'is-on' : undefined}>
            {active ? pct(minMargin) : t('home.sourcing.marginAny')}
          </b>
        </label>
        <input
          id="src-margin-range"
          className="src-margin-range"
          type="range"
          min={MARGIN_OFF}
          max={MARGIN_CEIL}
          step={1}
          value={minMargin}
          onChange={(event) => onMinMargin(Number(event.target.value))}
          aria-label={t('home.sourcing.marginLab')}
          aria-valuetext={active ? pct(minMargin) : t('home.sourcing.marginAny')}
        />
        <div className="src-margin-foot">
          <button
            type="button"
            className={`src-margin-preset${minMargin === floorValue ? ' is-on' : ''}`}
            onClick={() => onMinMargin(minMargin === floorValue ? MARGIN_OFF : floorValue)}
            aria-pressed={minMargin === floorValue}
          >
            <i className="ri-leaf-line" aria-hidden="true" />
            {t('home.sourcing.marginFloor', { value: floorValue })}
          </button>
          {active && (
            <button
              type="button"
              className="src-margin-reset"
              onClick={() => onMinMargin(MARGIN_OFF)}
            >
              <i className="ri-close-line" aria-hidden="true" />
              {t('home.sourcing.marginReset')}
            </button>
          )}
          {active && (
            <span className="src-margin-saved">
              <i className={inAccount ? 'ri-cloud-line' : 'ri-save-3-line'} aria-hidden="true" />
              {inAccount
                ? t('home.sourcing.marginRememberedAccount')
                : t('home.sourcing.marginRemembered')}
            </span>
          )}
          {(onClearFilters || onResetView) && (
            <span className="src-reset-group">
              {onClearFilters && (
                <button
                  type="button"
                  className="src-view-reset src-filters-clear"
                  onClick={onClearFilters}
                  disabled={!canClearFilters}
                  title={`${t('home.sourcing.filtersClearHint')} ${t(
                    'home.sourcing.filtersClearShortcut',
                  )}`}
                >
                  <i className="ri-filter-off-line" aria-hidden="true" />
                  {t('home.sourcing.filtersClear')}
                  <kbd className="src-kbd">⇧F</kbd>
                </button>
              )}
              {onResetView && (
                <button
                  type="button"
                  className="src-view-reset"
                  onClick={onResetView}
                  disabled={!canReset}
                  title={t('home.sourcing.viewResetHint')}
                >
                  <i className="ri-restart-line" aria-hidden="true" />
                  {t('home.sourcing.viewReset')}
                </button>
              )}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}