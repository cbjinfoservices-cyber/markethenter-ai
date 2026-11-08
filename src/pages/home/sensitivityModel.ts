import { compute, num, thresholdFor } from '@/pages/home/calcModel';
import type { Values } from '@/pages/home/calcModel';

/** Number of sale prices shown on the sensitivity grid. */
export const SENS_STEPS = 9;

export type SensitivityPoint = {
  price: number;
  net: number;
  margin: number;
  roi: number;
};

export type SensitivityMarkers = {
  nowIndex: number;
  breakIndex: number;
  hasBreakEven: boolean;
  breakEven: number;
};

export function breakEvenOf(values: Values): number {
  const raw = thresholdFor(values, 0).breakEvenPrice;
  return Number.isFinite(raw) && raw > 0 ? raw : 0;
}

/**
 * The same product at nine sale prices: the ladder the seller can hand to a
 * supplier to show how margin moves with the retail price.
 */
export function buildSensitivityPoints(values: Values, steps = SENS_STEPS): SensitivityPoint[] {
  const current = num(values.price);
  const breakEven = breakEvenOf(values);
  const anchor = breakEven > 0 ? Math.min(current, breakEven) : current;
  const low = Math.max(0.5, anchor * 0.85);
  const high = Math.max(low + 2, Math.max(current, breakEven > 0 ? breakEven : current) * 1.35);
  const out: SensitivityPoint[] = [];
  for (let i = 0; i < steps; i += 1) {
    const price = Math.round((low + ((high - low) * i) / (steps - 1)) * 100) / 100;
    const metrics = compute({ ...values, price: String(price) });
    out.push({ price, net: metrics.net, margin: metrics.netMargin, roi: metrics.roi });
  }
  return out;
}

/**
 * The grid as plain text, so it can be pasted straight into WhatsApp or a
 * message to a supplier: one line per price, net and margin included.
 */
export function buildSensitivityText(
  title: string,
  points: SensitivityPoint[],
  tags: string[],
  fmt: { eur: (value: number) => string; pct: (value: number) => string },
  footer: string,
): string {
  const lines = points.map((point, index) => {
    const tag = (tags[index] ?? '').trim();
    const line = `${fmt.eur(point.price)} → net ${fmt.eur(point.net)} · ${fmt.pct(point.margin)}`;
    return tag === '' ? `• ${line}` : `• ${line} (${tag})`;
  });
  return [`*${title}*`, ...lines, footer].filter(Boolean).join('\n');
}

/** Where the seller's current price and the first profitable price sit on the grid. */
export function sensitivityMarkers(
  points: SensitivityPoint[],
  values: Values,
): SensitivityMarkers {
  const current = num(values.price);
  const breakEven = breakEvenOf(values);
  let nowIndex = 0;
  points.forEach((point, index) => {
    if (Math.abs(point.price - current) < Math.abs(points[nowIndex].price - current)) {
      nowIndex = index;
    }
  });
  return {
    nowIndex,
    breakIndex: points.findIndex((point) => point.net >= 0),
    hasBreakEven: breakEven > 0,
    breakEven,
  };
}