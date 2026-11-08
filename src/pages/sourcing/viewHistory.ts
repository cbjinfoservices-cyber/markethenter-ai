import { makeFormatters } from '@/pages/home/calcModel';
import { MARGIN_OFF, SORT_LABEL_KEYS } from '@/pages/sourcing/components/SourcingFilters';
import type { SortKey } from '@/pages/sourcing/components/SourcingFilters';
import { clampMinMargin } from '@/pages/sourcing/minMarginMemory';
import { sanitizeView } from '@/pages/sourcing/viewMemory';
import type { ViewMemory } from '@/pages/sourcing/viewMemory';
import { buildViewParts } from '@/pages/sourcing/viewLine';

type Translate = (key: string, options?: Record<string, string | number>) => string;

/** How many arrangements the account keeps — enough to archive and to plot. */
export const VIEW_TRACE_KEEP = 30;

/** How many arrangements the badge block lists — the list stays short. */
export const VIEW_TRACE_SHOWN = 3;

/** How many margin-floor points the little chart under the block draws. */
export const VIEW_TRACE_TREND = 10;

/** Backwards-compatible alias: the history is capped at 30 kept entries. */
export const VIEW_TRACE_MAX = VIEW_TRACE_KEEP;

/** One arrangement of the board, stamped when it was written to the account. */
export type ViewTrace = {
  /** ISO string of the write. */
  at: string;
  view: ViewMemory;
  /** Minimum margin requirement, in percent. `MARGIN_OFF` means none. */
  minMargin: number;
};

/** Price and rank read best ascending; the other sorts start descending. */
const ASCENDING: SortKey[] = ['price', 'rank'];

const parseStamp = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  return Number.isFinite(Date.parse(value)) ? value : null;
};

const sanitizeTrace = (input: unknown): ViewTrace | null => {
  if (!input || typeof input !== 'object') return null;
  const source = input as { at?: unknown; view?: unknown; minMargin?: unknown };
  const at = parseStamp(source.at);
  if (at === null) return null;
  const rawMargin =
    source.minMargin == null || source.minMargin === ''
      ? Number.NaN
      : Number(source.minMargin);
  return {
    at,
    view: sanitizeView(source.view),
    minMargin: Number.isFinite(rawMargin) ? clampMinMargin(rawMargin) : MARGIN_OFF,
  };
};

/** Turns anything — the account row or a fresh array — into a usable history. */
export function sanitizeViewLog(input: unknown): ViewTrace[] {
  if (!Array.isArray(input)) return [];
  const out: ViewTrace[] = [];
  input.forEach((entry) => {
    const trace = sanitizeTrace(entry);
    if (!trace) return;
    if (out.some((kept) => kept.at === trace.at)) return;
    out.push(trace);
  });
  return out.slice(0, VIEW_TRACE_KEEP);
}

/** Two arrangements are the same when every setting matches. */
export function sameTrace(a: ViewTrace, b: ViewTrace): boolean {
  return (
    a.minMargin === b.minMargin &&
    a.view.category === b.view.category &&
    a.view.verdict === b.view.verdict &&
    a.view.sort === b.view.sort &&
    a.view.sort2 === b.view.sort2 &&
    a.view.flip === b.view.flip
  );
}

/**
 * Prepends a new arrangement — unless it repeats the last one, in which case
 * the history is left untouched (only the timestamp moves).
 */
export function appendViewTrace(log: ViewTrace[], entry: ViewTrace): ViewTrace[] {
  if (log.length > 0 && sameTrace(log[0], entry)) return log;
  return [entry, ...log].slice(0, VIEW_TRACE_KEEP);
}

const ascendingOf = (view: ViewMemory): boolean => ASCENDING.includes(view.sort) !== view.flip;

const sortLabel = (key: SortKey, t: Translate): string => t(SORT_LABEL_KEYS[key], {});

const marginLabel = (value: number, locale: string, t: Translate): string => {
  const { pct } = makeFormatters(locale);
  return value > MARGIN_OFF ? pct(value) : t('home.sourcing.histMarginOff', {});
};

/**
 * What actually moved between two arrangements, in short readable pieces.
 * The oldest kept entry has nothing to compare against, so it spells out the
 * arrangement it holds instead.
 */
export function describeTraceChange(
  previous: ViewTrace | null,
  entry: ViewTrace,
  t: Translate,
  locale: string,
): string[] {
  if (!previous) {
    const parts = buildViewParts(
      {
        ...entry.view,
        minMargin: entry.minMargin,
        inAccount: true,
        locale,
      },
      (key, options) => t(key, options),
    );
    /* The account/device tail is redundant here — the block already says account. */
    return [parts.slice(0, -1).join(' · ')];
  }
  const changes: string[] = [];

  if (entry.view.category !== previous.view.category) {
    changes.push(
      t('home.sourcing.histCat', {
        value:
          entry.view.category === 'all'
            ? t('home.sourcing.catAll', {})
            : t(`home.sourcing.cat.${entry.view.category}`, {}),
      }),
    );
  }

  if (entry.view.verdict !== previous.view.verdict) {
    changes.push(
      t('home.sourcing.histVerdict', {
        value: t(
          entry.view.verdict === 'all'
            ? 'home.sourcing.verdictAll'
            : entry.view.verdict === 'good'
              ? 'home.sourcing.verdictGo'
              : 'home.sourcing.verdictRisk',
          {},
        ),
      }),
    );
  }

  if (
    entry.view.sort !== previous.view.sort ||
    entry.view.sort2 !== previous.view.sort2 ||
    entry.view.flip !== previous.view.flip
  ) {
    changes.push(
      t('home.sourcing.histSort', {
        value: `${sortLabel(entry.view.sort, t)} ${
          ascendingOf(entry.view) ? '↑' : '↓'
        }`,
        then:
          entry.view.sort2 === 'none'
            ? ''
            : t('home.sourcing.histSortThen', {
                value: sortLabel(entry.view.sort2, t),
              }),
      }),
    );
  }

  if (entry.minMargin !== previous.minMargin) {
    changes.push(
      entry.minMargin > MARGIN_OFF && previous.minMargin <= MARGIN_OFF
        ? t('home.sourcing.histMarginOn', {
            value: marginLabel(entry.minMargin, locale, t),
          })
        : entry.minMargin <= MARGIN_OFF
          ? t('home.sourcing.histMarginOffChange', {})
          : t('home.sourcing.histMarginMove', {
              from: marginLabel(previous.minMargin, locale, t),
              to: marginLabel(entry.minMargin, locale, t),
            }),
    );
  }

  return changes.length > 0 ? changes : [t('home.sourcing.histSame', {})];
}

/**
 * One arrangement spelled out in full — what the reader unfolds when they
 * click a history row and want to know exactly what was saved that day.
 */
export function describeTraceFull(entry: ViewTrace, t: Translate, locale: string): string {
  const parts = buildViewParts(
    {
      ...entry.view,
      minMargin: entry.minMargin,
      inAccount: true,
      locale,
    },
    (key, options) => t(key, options),
  );
  /* The account/device tail is redundant here — the block already says account. */
  return parts.slice(0, -1).join(' · ');
}

/**
 * The latest arrangements flattened onto a single line, dated, so they can be
 * pasted straight into a message. The block shows three; this keeps three.
 */
export function buildHistoryLine(
  log: ViewTrace[],
  t: Translate,
  locale: string,
  count = VIEW_TRACE_SHOWN,
): string {
  const rows = log.slice(0, count).map((entry, index) => {
    const previous = log[index + 1] ?? null;
    const change = describeTraceChange(previous, entry, t, locale).join(' · ');
    return `${formatTraceWhen(entry.at, locale)} — ${change}`;
  });
  return `${t('home.sourcing.histCopyLab', {})} : ${rows.join(' | ')}`;
}

/** One point of the margin-floor curve under the history block. */
export type MarginPoint = {
  at: string;
  /** Minimum margin in percent. `MARGIN_OFF` means the floor was cleared. */
  margin: number;
};

/**
 * The margin floor of the latest arrangements, oldest first, so it can be drawn
 * left to right. Ten points is enough to see the direction without turning the
 * block into a dashboard.
 */
export function marginSeries(log: ViewTrace[], count = VIEW_TRACE_TREND): MarginPoint[] {
  return log
    .slice(0, count)
    .map((entry) => ({ at: entry.at, margin: entry.minMargin }))
    .reverse();
}

/** Short stamp for the history rows, localised to the reader. */
export function formatTraceWhen(iso: string, locale: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}