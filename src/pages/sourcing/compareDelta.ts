/**
 * Relative gap between the two columns of the comparison board, line by line.
 * Expressed against the larger of the two values, so it is always positive and
 * reads the same whichever side is written first.
 */
export function lineDelta(a: number, b: number): number | null {
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  if (Math.abs(a - b) < 0.005) return null;
  const base = Math.max(Math.abs(a), Math.abs(b));
  if (base < 0.0001) return null;
  return (Math.abs(a - b) / base) * 100;
}