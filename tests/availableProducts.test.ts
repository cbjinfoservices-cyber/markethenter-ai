import { describe, expect, it, vi } from 'vitest';
import { availableProducts, parsePriceVerification, PriceVerificationError } from '../src/pages/sourcing/availableProducts';

const ids = ['B000000001', 'B000000002', 'B000000003', 'B000000004'];
const items = ids.map((asin) => ({ asin, title: asin, price: 215 }));
const observation = (asin: string, price: number | null, age = 0) => ({
  asin, price, checkedAt: new Date(Date.now() - age).toISOString(),
});

describe('products with available Amazon detail prices', () => {
  it('hides missing and unavailable prices and replaces ranking prices with detail prices', async () => {
    expect(await availableProducts(items, [
      observation(ids[0], 1.89), observation(ids[1], null),
    ], null, () => true)).toEqual([{ ...items[0], price: 1.89 }]);
  });

  it('does not use expired, future, zero, negative or nonfinite prices', async () => {
    for (const saved of [
      observation(ids[0], 10, 3_600_000), observation(ids[0], 10, -60_000),
      observation(ids[0], 0), observation(ids[0], -1), observation(ids[0], NaN),
    ]) {
      expect(await availableProducts(items, [saved], null, () => true)).toEqual([]);
    }
  });

  it('verifies at most three ASINs per request and reuses cached absence', async () => {
    const verify = vi.fn(async (asins: string[]) => asins.map((asin) => observation(asin, 10)));
    const result = await availableProducts(items, [observation(ids[0], null)], verify, () => true);
    expect(verify).toHaveBeenCalledExactlyOnceWith(ids.slice(1));
    expect(result).toHaveLength(3);
    verify.mockClear();
    await availableProducts(items, [], verify, () => true);
    expect(verify.mock.calls.map(([asins]) => asins)).toEqual([ids.slice(0, 3), ids.slice(3)]);
  });

  it('reports verification failures instead of treating them as absent prices', async () => {
    await expect(availableProducts(items, [], async () => { throw new Error('provider-http'); }, () => true))
      .rejects.toThrow('provider-http');
    await expect(availableProducts(items, [], async () => [], () => true))
      .rejects.toThrow('provider-invalid');
  });

  it('publishes cached and completed batches before a later verification failure', async () => {
    const progress = vi.fn();
    const verify = vi.fn(async () => [observation(ids[1], 10)])
      .mockRejectedValueOnce(new Error('provider-timeout'));
    await expect(availableProducts(items, [observation(ids[0], 1.89)], verify, () => true, progress))
      .rejects.toThrow('provider-timeout');
    expect(progress).toHaveBeenLastCalledWith([{ ...items[0], price: 1.89 }]);

    const batches = vi.fn(async (asins: string[]) => asins.map((asin) => observation(asin, 10)));
    batches.mockImplementationOnce(async (asins) => asins.map((asin) => observation(asin, 10)));
    batches.mockImplementationOnce(async () => { throw new Error('provider-http'); });
    await expect(availableProducts(items, [], batches, () => true, progress)).rejects.toThrow('provider-http');
    expect(progress).toHaveBeenLastCalledWith(items.slice(0, 3).map((item) => ({ ...item, price: 10 })));
  });

  it('stops issuing paid requests after the requesting view changes', async () => {
    const verify = vi.fn(async (asins: string[]) => asins.map((asin) => observation(asin, 10)));
    await availableProducts(items, [], verify, () => false);
    expect(verify).not.toHaveBeenCalled();
  });

  it('publishes successful prices from a failed batch and stops further requests', async () => {
    const progress = vi.fn();
    const failure = new PriceVerificationError('provider-http', [
      observation(ids[0], 10), observation(ids[2], null), observation(ids[3], 99),
    ], 429);
    const verify = vi.fn(async () => { throw failure; });
    await expect(availableProducts(items, [], verify, () => true, progress)).rejects.toBe(failure);
    expect(progress).toHaveBeenLastCalledWith([{ ...items[0], price: 10 }]);
    expect(verify).toHaveBeenCalledTimes(1);
  });

  it('does not publish a failed batch after the requesting view changes', async () => {
    let current = true;
    const progress = vi.fn();
    const verify = vi.fn(async () => {
      current = false;
      throw new PriceVerificationError('provider-http', [observation(ids[0], 10)], 503);
    });
    await expect(availableProducts(items, [], verify, () => current, progress)).rejects.toThrow('provider-http');
    expect(progress).toHaveBeenCalledExactlyOnceWith([]);
  });

  it('parses successful and failed verification responses without masking the HTTP status', () => {
    const observations = [observation(ids[0], 10)];
    expect(parsePriceVerification({ observations })).toEqual(observations);
    try {
      parsePriceVerification({ error: 'provider-http', providerStatus: 429, observations });
      expect.unreachable('Expected an explicit verification error');
    } catch (error) {
      expect(error).toBeInstanceOf(PriceVerificationError);
      expect(error).toMatchObject({ message: 'provider-http', providerStatus: 429, observations });
    }
    expect(() => parsePriceVerification({ error: 'provider-http', providerStatus: 503 }))
      .toThrow('provider-http');
  });

  it.each([
    null, {}, { observations: [null] }, { observations: [observation('invalid', 10)] },
    { observations: [observation(ids[0], -1)] }, { observations: null, error: 'provider-http' },
    { observations: [], error: 42 }, { observations: [], providerStatus: '429' },
  ])('rejects malformed verification responses: %j', (payload) => {
    expect(() => parsePriceVerification(payload)).toThrow('provider-invalid');
  });
});
