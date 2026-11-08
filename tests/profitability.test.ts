import { describe, expect, it } from 'vitest';
import { INITIAL, compute, decodeValues, encodeValues, maxSupplierFor, priceForMargin, thresholdFor } from '@/pages/home/calcModel';
import type { Values } from '@/pages/home/calcModel';
import { costLinesOf } from '@/pages/sourcing/compareCosts';
import { itemFromRow, itemFromScenario } from '@/pages/sourcing/compareItem';
import { rowFor, valuesFor } from '@/pages/sourcing/productMargin';
import { SOURCING_PRODUCTS } from '@/mocks/sourcing';
import { greenPriceFor, monthlyUplift } from '@/pages/dashboard/riskyGain';
import type { DashboardRow } from '@/pages/dashboard/useDashboard';
import { buildCompareCsv } from '@/pages/sourcing/compareCsv';
import { parseCompareCsv } from '@/pages/sourcing/compareImport';

const example: Values = {
  ...INITIAL, price: '49.99', supplier: '8.50', shipping: '2', fba: '9.20',
  packaging: '0', customs: '0', amazon: '0', ppc: '0', returns: '0', vat: '20', units: '100',
};

describe('after-VAT FBA profitability', () => {
  it('deducts sales VAT exactly once, with an explicit landed-cost ROI', () => {
    const m = compute(example);
    expect(m.vatAmount).toBeCloseTo(8.33166667);
    expect(m.landed).toBeCloseTo(10.5);
    expect(m.net).toBeCloseTo(21.95833333);
    expect(m.totalCost + m.net).toBeCloseTo(m.price);
    expect(m.netHT).toBe(m.net);
    expect(m.roi).toBeCloseTo(209.12698413);
    expect(m.netMargin).toBeCloseTo(m.net / 49.99 * 100);
    expect(m.netMarginHT).toBeCloseTo(m.net / m.priceHT * 100);
    expect(m.monthly).toBeCloseTo(m.net * 100);
  });

  it('keeps zero-VAT behaviour and charges commission on the gross price', () => {
    const m = compute({ ...example, vat: '0', amazon: '15', returns: '5' });
    expect(m.net).toBeCloseTo(49.99 * 0.8 - 19.7);
    expect(m.vatAmount).toBe(0);
  });

  it.each([0, 5.5, 19, 20, 21, 22])('solves net and margin thresholds at VAT %s', (vat) => {
    const values = { ...INITIAL, vat: String(vat) };
    const threshold = thresholdFor(values, 5);
    expect(threshold.feasible).toBe(true);
    expect(compute({ ...values, price: String(threshold.minPrice) }).net).toBeCloseTo(5, 8);
    expect(compute({ ...values, price: String(threshold.breakEvenPrice) }).net).toBeCloseTo(0, 8);
    expect(threshold.minPriceHT).toBeCloseTo(threshold.minPrice / (1 + vat / 100));
    const greenPrice = priceForMargin(values, 20);
    expect(greenPrice).not.toBeNull();
    expect(compute({ ...values, price: String(greenPrice) }).netMargin).toBeCloseTo(20, 8);
    const ceiling = maxSupplierFor(values, 49.99, 20);
    expect(ceiling).not.toBeNull();
    expect(compute({ ...values, price: '49.99', supplier: String(ceiling) }).netMargin).toBeGreaterThanOrEqual(20);
  });

  it('recognises a target made impossible by VAT plus variable fees', () => {
    const values = { ...INITIAL, vat: '20', amazon: '70', returns: '20' };
    expect(thresholdFor(values, 0).feasible).toBe(false);
    expect(priceForMargin(values, 20)).toBeNull();
    expect(maxSupplierFor(values, 50, 20)).toBeNull();
  });

  it('has finite zero-price and zero-landed-cost outputs', () => {
    const m = compute({ ...example, price: '0', supplier: '0', shipping: '0' });
    expect(m.roi).toBe(0);
    expect(m.netMargin).toBe(0);
    expect(Object.values(m).every(Number.isFinite)).toBe(true);
  });

  it('preserves shared links, including old links without VAT', () => {
    expect(decodeValues(encodeValues(example))).toEqual(Object.fromEntries(
      Object.entries(example).map(([key, value]) => [key, String(Number(value))]),
    ));
    expect(decodeValues('4.5,1.2,0.35,5,15,3.6,1.4,6,19.99,300')?.vat).toBe('20');
    expect(decodeValues('invalid')).toBeNull();
  });
});

describe('consistent sourcing, recommendations and exports', () => {
  it.each(['FR', 'DE', 'ES', 'IT', 'UK', 'US'] as const)('uses the %s VAT assumption', (market) => {
    const expected = { FR: '20', DE: '19', ES: '21', IT: '22', UK: '20', US: '0' };
    expect(valuesFor({ ...SOURCING_PRODUCTS[0], market }).vat).toBe(expected[market]);
  });

  it('reconciles itemised costs, including VAT, to total costs', () => {
    const item = itemFromRow(rowFor(SOURCING_PRODUCTS[0], 5, 20));
    const lines = costLinesOf(item, (key) => key);
    expect(lines.find((line) => line.key === 'vat')?.amount).toBe(item.metrics.vatAmount);
    expect(lines.reduce((sum, line) => sum + line.amount, 0)).toBeCloseTo(item.metrics.totalCost);
  });

  it('uses the same after-VAT maths for dashboard recommendations', () => {
    const scenario = { id: 1, name: 'Test', values: INITIAL };
    const row: DashboardRow = {
      scenario, metrics: compute(INITIAL), threshold: thresholdFor(INITIAL, 5),
      seriesA: [], seriesB: null, comparison: null,
    };
    const price = greenPriceFor(row, 20);
    expect(price).not.toBeNull();
    expect(compute({ ...INITIAL, price: String(price) }).netMargin).toBeGreaterThanOrEqual(20);
    const exact = priceForMargin(INITIAL, 20);
    expect(monthlyUplift([row], 20)).toBeCloseTo(
      Math.max(0, compute({ ...INITIAL, price: String(exact) }).monthly - row.metrics.monthly),
    );
  });

  it('keeps CSV input round trips compatible', () => {
    const item = itemFromScenario({ id: 1, name: 'Example', values: example }, 5, 20, 'Example');
    const csv = buildCompareCsv([item], 'fr-FR', (key) => key);
    const result = parseCompareCsv(csv);
    expect(result.ok).toBe(true);
    if (result.ok) expect(compute(result.data.rows[0].values).net).toBeCloseTo(compute(example).net);
  });
});
