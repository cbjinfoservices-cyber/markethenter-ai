import { MARGIN_CEIL, MARGIN_OFF } from '@/pages/sourcing/components/SourcingFilters';

/** The slider position survives the visit, so the requirement is not retyped. */
const KEY = 'mh:sourcing:minmargin';

/** Slider bounds are shared with the account copy of the requirement. */
export const clampMinMargin = (value: number): number => {
  if (!Number.isFinite(value)) return MARGIN_OFF;
  return Math.min(MARGIN_CEIL, Math.max(MARGIN_OFF, Math.round(value)));
};

/** Reads the remembered minimum margin; `MARGIN_OFF` when nothing was kept. */
export function readMinMargin(): number {
  try {
    const stored = window.localStorage.getItem(KEY);
    if (stored === null || stored.trim() === '') return MARGIN_OFF;
    return clampMinMargin(Number(stored));
  } catch {
    return MARGIN_OFF;
  }
}

/** Stores the requirement; clearing it keeps the storage clean. */
export function rememberMinMargin(value: number): void {
  try {
    const next = clampMinMargin(value);
    if (next === MARGIN_OFF) window.localStorage.removeItem(KEY);
    else window.localStorage.setItem(KEY, String(next));
  } catch {
    /* storage blocked — the slider simply starts from zero next time */
  }
}