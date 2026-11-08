export type VerdictLevel = 'good' | 'warn' | 'bad';

/** Orange under the chosen floor, red below this hard floor. */
export const VERDICT_BAD_FLOOR = 5;

/** Green light from 15 % by default; the reader can aim for 20 or 25 %. */
export const DEFAULT_GOOD_FLOOR = 15;
export const GOOD_FLOOR_PRESETS = [15, 20, 25];
export const GOOD_FLOOR_MIN = 8;
export const GOOD_FLOOR_MAX = 40;

export function clampGoodFloor(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_GOOD_FLOOR;
  const rounded = Math.round(value);
  return Math.min(GOOD_FLOOR_MAX, Math.max(GOOD_FLOOR_MIN, rounded));
}

/**
 * Reads a scenario's net margin and turns it into a traffic light:
 * red when the sale loses money or barely covers its costs,
 * orange below the chosen target (15 %, 20 % or 25 % by default),
 * green from that target up.
 */
export function verdictLevelOf(
  net: number,
  netMargin: number,
  goodFloor: number = DEFAULT_GOOD_FLOOR,
): VerdictLevel {
  const floor = clampGoodFloor(goodFloor);
  if (!Number.isFinite(netMargin) || net <= 0 || netMargin < VERDICT_BAD_FLOOR) return 'bad';
  if (netMargin < floor) return 'warn';
  return 'good';
}

export const VERDICT_KEYS: Record<VerdictLevel, { title: string; advice: string }> = {
  good: {
    title: 'home.calc.verdictGoodTitle',
    advice: 'home.calc.verdictGoodAdvice',
  },
  warn: {
    title: 'home.calc.verdictWarnTitle',
    advice: 'home.calc.verdictWarnAdvice',
  },
  bad: {
    title: 'home.calc.verdictBadTitle',
    advice: 'home.calc.verdictBadAdvice',
  },
};

/** One-word verdict used by the burger reminder cards. */
export const VERDICT_SHORT_KEYS: Record<VerdictLevel, string> = {
  good: 'home.burger.verdictGood',
  warn: 'home.burger.verdictWarn',
  bad: 'home.burger.verdictBad',
};

export const VERDICT_ICONS: Record<VerdictLevel, string> = {
  good: 'ri-checkbox-circle-fill',
  warn: 'ri-error-warning-fill',
  bad: 'ri-close-circle-fill',
};

/** Short labels used by the traffic-light legend. */
export const VERDICT_LEGEND_KEYS: Record<
  VerdictLevel,
  { title: string; desc: string }
> = {
  good: { title: 'home.calcPage.legendGoodT', desc: 'home.calcPage.legendGoodD' },
  warn: { title: 'home.calcPage.legendWarnT', desc: 'home.calcPage.legendWarnD' },
  bad: { title: 'home.calcPage.legendBadT', desc: 'home.calcPage.legendBadD' },
};