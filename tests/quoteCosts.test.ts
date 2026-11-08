import { describe, expect, it } from 'vitest';
import { INITIAL, compute } from '@/pages/home/calcModel';
import type { Values } from '@/pages/home/calcModel';
import {
  equivalentPrice,
  equivalentSeries,
  quoteValues,
  secondQuoteValues,
} from '@/pages/home/quoteCosts';

const first: Values = {
  ...INITIAL, price: '49.99', supplier: '8.50', shipping: '2', fba: '9.20',
  packaging: '0.35', customs: '5.5', amazon: '15', ppc: '10', returns: '8', vat: '20', units: '100',
};

const second: Values = { ...first, shipping: '3.10', packaging: '0.80', customs: '12' };

describe('equivalentPrice', () => {
  it('gives the same net as the second quote when costed with the first quote', () => {
    [6, 8.5, 11.25].forEach((price) => {
      const expected = compute({ ...second, supplier: String(price) }).net;
      const converted = equivalentPrice(price, first, second);
      const actual = compute({ ...first, supplier: String(converted) }).net;
      expect(actual).toBeCloseTo(expected, 6);
    });
  });

  it('returns the same price when both quotes carry the same costs', () => {
    expect(equivalentPrice(8.5, first, first)).toBeCloseTo(8.5, 9);
  });

  it('rounds the whole series to cents', () => {
    const series = equivalentSeries([8.5, 9.12345], first, second);
    series.forEach((value) => {
      expect(Math.round(value * 100) / 100).toBeCloseTo(value, 9);
    });
  });
});

describe('quoteValues and secondQuoteValues', () => {
  it('keeps the scenario value for blank fields', () => {
    const merged = quoteValues(first, { shipping: '4', packaging: '', customs: ' ' });
    expect(merged.shipping).toBe('4');
    expect(merged.packaging).toBe(first.packaging);
    expect(merged.customs).toBe(first.customs);
  });

  it('returns the scenario values unchanged without stored costs', () => {
    expect(quoteValues(first, undefined)).toBe(first);
  });

  it('sets the supplier to the latest purchase price of the second quote', () => {
    const values = secondQuoteValues(first, undefined, 7.4);
    expect(values.supplier).toBe('7.4');
    expect(secondQuoteValues(first, undefined, null).supplier).toBe(first.supplier);
  });
});
