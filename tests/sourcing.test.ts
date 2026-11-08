import { describe, expect, it, vi } from 'vitest';
import { AMAZON_MARKETS, listingUrl, normaliseListings, parsePriceText } from '../supabase/functions/_shared/amazon';
import { createHandler as createHandlerImpl } from '../supabase/functions/sourcing-bestsellers/handler';
import { parseCatalog } from '@/pages/sourcing/sourcingCatalog';
import type { CatalogQuery } from '@/pages/sourcing/sourcingCatalog';
import { opportunityScore } from '@/pages/sourcing/opportunityScore';
import { rowFor } from '@/pages/sourcing/productMargin';
import { SOURCING_PRODUCTS } from '@/mocks/sourcing';
import { arrangeGrid } from '@/pages/sourcing/arrangeGrid';
import { itemFromRow } from '@/pages/sourcing/compareItem';
import { buildCompareCsv } from '@/pages/sourcing/compareCsv';
import { buildCompareText } from '@/pages/sourcing/compareText';
import fr from '@/i18n/local/fr/home';
import en from '@/i18n/local/en/home';

const raw = { asin: 'B012345678', title: 'Cable organiser', price: { value: 49.99, currency: 'EUR' }, rank: 7, rating: 4.5, ratings_total: 120 };
const request = (body: unknown) => new Request('https://local.invalid', { method: 'POST', body: JSON.stringify(body) });
const createHandler = (
  apiKey: Parameters<typeof createHandlerImpl>[0],
  fetcher?: Parameters<typeof createHandlerImpl>[1],
  provider?: Parameters<typeof createHandlerImpl>[2],
  cache?: Parameters<typeof createHandlerImpl>[3],
  catalogCache?: Parameters<typeof createHandlerImpl>[4],
) => createHandlerImpl(apiKey, fetcher, provider, cache, catalogCache, async () => true);
const query: CatalogQuery = { market: 'FR', category: 'all', kind: 'bestsellers', exchangeRate: 1 };
const payload = (q = query) => ({
  products: normaliseListings([{ ...raw, price: { value: 49.99, currency: AMAZON_MARKETS[q.market].currency } }], q.market),
  provenance: {
    provider: 'Rainforest API', market: q.market, category: q.category, kind: q.kind,
    currency: AMAZON_MARKETS[q.market].currency, collectedAt: '2026-11-02T12:00:00Z',
    sourceUrl: listingUrl(q.market, q.category, q.kind),
  },
});

describe('Amazon provider contract', () => {
  it.each(Object.keys(AMAZON_MARKETS) as (keyof typeof AMAZON_MARKETS)[])('routes %s to its own Amazon domain', async (market) => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json({
      bestsellers: [{ ...raw, price: { value: 49.99, currency: AMAZON_MARKETS[market].currency, raw: `${AMAZON_MARKETS[market].currency} 49.99` } }],
    }));
    const response = await createHandler('test-key', fetcher)(request({ market, category: 'all', kind: 'most-wished-for' }));
    expect(response.status).toBe(200);
    const url = new URL(String(fetcher.mock.calls[0][0]));
    expect(url.searchParams.get('url')).toBe(`https://www.${AMAZON_MARKETS[market].domain}/gp/most-wished-for`);
    const result = await response.json();
    expect(result.provenance.market).toBe(market);
    expect(result.provenance.currency).toBe(AMAZON_MARKETS[market].currency);
    expect(result.provenance.collectedAt).toMatch(/Z$/);
    expect(JSON.stringify(result)).not.toContain('test-key');
  });

  it.each([{ market: 'XX' }, { category: '__proto__' }, { kind: 'invented' }, null])('rejects invalid input %j before contacting provider', async (body) => {
    const fetcher = vi.fn<typeof fetch>();
    expect((await createHandler('test-key', fetcher)(request(body))).status).toBe(400);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('rejects invalid JSON and unsupported methods; supports CORS preflight', async () => {
    const handler = createHandler('test-key');
    expect((await handler(new Request('https://local.invalid', { method: 'POST', body: '{' }))).status).toBe(400);
    expect((await handler(new Request('https://local.invalid'))).status).toBe(405);
    const response = await handler(new Request('https://local.invalid', { method: 'OPTIONS' }));
    expect(response.status).toBe(200);
    expect(response.headers.get('Access-Control-Allow-Methods')).toContain('POST');
  });

  it('requires a connected account before making a paid provider request', async () => {
    const fetcher = vi.fn<typeof fetch>();
    const handler = createHandlerImpl('test-key', fetcher, 'rainforest', undefined, undefined, async () => false);
    const response = await handler(request(query));
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'auth-required' });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('fails closed with a service error when authentication cannot be checked', async () => {
    const fetcher = vi.fn<typeof fetch>();
    const handler = createHandlerImpl('test-key', fetcher, 'rainforest', undefined, undefined, async () => {
      throw new Error('auth unavailable');
    });
    const response = await handler(request(query));
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: 'auth-unavailable' });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('reports missing credentials with a non-success status', async () => {
    const response = await createHandler(undefined)(request(query));
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: 'missing-key' });
  });

  it.each([
    { response: () => new Response('', { status: 401 }), status: 502, error: 'provider-auth' },
    { response: () => new Response('', { status: 403 }), status: 502, error: 'provider-auth' },
    { response: () => new Response('', { status: 429 }), status: 502, error: 'provider-http' },
    { response: () => Response.json({ bestsellers: [] }), status: 502, error: 'provider-empty' },
    { response: () => Response.json({ search_results: [raw] }), status: 502, error: 'provider-invalid' },
    { response: () => Response.json({ bestsellers: [raw], request_info: { success: false } }), status: 502, error: 'provider-rejected' },
    { response: () => Response.json({ request_info: { success: false } }), status: 502, error: 'provider-rejected' },
    { response: () => { throw new DOMException('timeout', 'TimeoutError'); }, status: 504, error: 'provider-timeout' },
    { response: () => { throw new TypeError('network'); }, status: 502, error: 'provider-unreachable' },
  ])('reports $error without demo fallback', async ({ response, status, error }) => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => response());
    const result = await createHandler('test-key', fetcher)(request(query));
    expect(result.status).toBe(status);
    expect(await result.json()).toMatchObject({ error });
  });

  it('filters invalid records, deduplicates ASINs, preserves missing signals', () => {
    expect(normaliseListings([
      raw, raw, { ...raw, asin: 'invalid' }, { ...raw, price: { value: 20, currency: 'USD' } },
      { ...raw, asin: 'B012345679', rank: undefined, rating: undefined, ratings_total: undefined },
    ], 'FR')).toHaveLength(2);
    expect(normaliseListings([{ ...raw, rank: undefined, ratings_total: undefined }], 'FR')[0]).toMatchObject({ rank: null, reviews: null });
  });
});

describe('Logimu provider contract', () => {
  const q: CatalogQuery = { ...query, category: 'maison' };
  const observedAt = '2026-10-09T06:14:27.073931+00:00';
  const logimuPayload = (market: keyof typeof AMAZON_MARKETS = 'FR') => ({
    ok: true, marketplace: market.toLowerCase(), page_type: 'category', observed_at: observedAt,
    bestsellers: [{ ...raw, price: { value: 49.99, currency: AMAZON_MARKETS[market].currency, raw: `${AMAZON_MARKETS[market].currency} 49.99` } }],
    cached: true, cache_age_seconds: 900,
  });

  it.each(Object.keys(AMAZON_MARKETS) as (keyof typeof AMAZON_MARKETS)[])('normalises %s through the same frontend contract as Rainforest', async (market) => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json(logimuPayload(market)));
    const requestQuery = { ...q, market, exchangeRate: AMAZON_MARKETS[market].currency === 'EUR' ? 1 : 1.2 };
    const result = await createHandler('logimu-test-key', fetcher, 'logimu')(request(requestQuery));
    expect(result.status).toBe(200);
    expect(fetcher).toHaveBeenCalledTimes(1);
    const [urlValue, init] = fetcher.mock.calls[0];
    const url = new URL(String(urlValue));
    expect(url.origin + url.pathname).toBe('https://api.logimu.com/v1/bestsellers');
    expect(url.searchParams.get('pages')).toBe('1');
    expect(url.searchParams.get('country')).toBe(market.toLowerCase());
    expect(url.searchParams.get('url')).toBe(listingUrl(market, 'maison', 'bestsellers'));
    expect(String(url)).not.toContain('logimu-test-key');
    expect(new Headers(init?.headers).get('X-API-KEY')).toBe('logimu-test-key');
    const body = await result.json();
    expect(JSON.stringify(body)).not.toContain('logimu-test-key');
    const catalog = parseCatalog(body, requestQuery);
    expect(catalog.provenance).toMatchObject({ provider: 'Logimu', collectedAt: observedAt, market });
    expect(catalog.products[0]).toMatchObject({ rank: 7, reviews: 120, collectedAt: observedAt });
  });

  it.each([
    { body: query, provider: 'logimu', key: 'test-key', status: 400, error: 'category-required' },
    { body: { ...q, kind: 'movers-and-shakers' }, provider: 'logimu', key: 'test-key', status: 400, error: 'unsupported-ranking' },
    { body: { ...q, kind: 'most-wished-for' }, provider: 'logimu', key: 'test-key', status: 400, error: 'unsupported-ranking' },
    { body: q, provider: 'unknown', key: 'test-key', status: 503, error: 'invalid-provider' },
    { body: q, provider: 'logimu', key: undefined, status: 503, error: 'missing-key' },
    { body: q, provider: 'logimu', key: '   ', status: 503, error: 'missing-key' },
  ])('rejects $error before any paid call', async ({ body, provider, key, status, error }) => {
    const fetcher = vi.fn<typeof fetch>();
    const response = await createHandler(key, fetcher, provider)(request(body));
    expect(response.status).toBe(status);
    expect(await response.json()).toEqual({ error });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it.each([
    { patch: { ok: false }, error: 'provider-rejected' },
    { patch: { marketplace: 'de' }, error: 'provider-invalid' },
    { patch: { page_type: 'root' }, error: 'provider-invalid' },
    { patch: { observed_at: undefined }, error: 'provider-invalid' },
    { patch: { observed_at: 'not-a-date' }, error: 'provider-invalid' },
    { patch: { bestsellers: undefined }, error: 'provider-invalid' },
    { patch: { bestsellers: [{ ...raw, price: null }] }, error: 'provider-empty' },
    { patch: { bestsellers: [{ ...raw, price: { value: 30, currency: 'USD' } }] }, error: 'provider-empty' },
  ])('rejects unusable Logimu data: $error ($patch)', async ({ patch, error }) => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ ...logimuPayload(), ...patch }));
    const response = await createHandler('test-key', fetcher, 'logimu')(request(q));
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error });
  });

  it('does not silently retry or switch providers after an authentication error', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response('', { status: 401 }));
    const response = await createHandler('test-key', fetcher, 'logimu')(request(q));
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: 'provider-auth', providerStatus: 401 });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('excludes the Sanytol decimal mismatch while retaining usable listings and reporting the exclusion', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json({
      ...logimuPayload(),
      bestsellers: [
        { ...raw, asin: 'B01FXICQ50', price: { value: 215, currency: 'EUR', raw: '2,15 \u20ac' } },
        { ...raw, price: { value: 16.9, currency: 'EUR', raw: '16,90 \u20ac' } },
      ],
    }));
    const response = await createHandler('test-key', fetcher, 'logimu')(request(q));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.excludedPriceCount).toBe(1);
    expect(body.products).toHaveLength(1);
    expect(body.products[0].asin).toBe(raw.asin);
    const catalog = parseCatalog(body, q);
    expect(catalog.excludedPriceCount).toBe(1);
    expect(catalog.products[0].price).toBe(16.9);
    expect(catalog.products.some((product) => product.id.endsWith('B01FXICQ50'))).toBe(false);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it.each([
    { value: 215, currency: 'EUR', raw: '2,15 \u20ac' },
    { value: 215, currency: 'EUR' },
    { value: 215, currency: 'EUR', raw: '215 USD' },
    { value: 215, currency: 'EUR', raw: null },
    { value: 215, currency: 'EUR', raw: '215 EUR (2 EUR / unit)' },
  ])('reports a price error rather than publishing an unverifiable amount: %j', async (price) => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json({
      ...logimuPayload(), bestsellers: [{ ...raw, price }],
    }));
    const response = await createHandler('test-key', fetcher, 'logimu')(request(q));
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: 'provider-price-invalid' });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('accepts 1.89 only when that is the value received, without hardcoding any ASIN', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json({
      ...logimuPayload(),
      bestsellers: [{ ...raw, asin: 'B01FXICQ50', price: { value: 1.89, raw: '1,89 EUR', currency: 'EUR' } }],
    }));
    const response = await createHandler('test-key', fetcher, 'logimu')(request(q));
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.excludedPriceCount).toBe(0);
    expect(parseCatalog(body, q).products[0].price).toBe(1.89);
  });
});

describe('price text validation', () => {
  it.each([
    ['1,89 \u20ac', 'EUR', 1.89], ['EUR 1.89', 'EUR', 1.89],
    ['1\u202f234,56 \u20ac', 'EUR', 1234.56], ['1 234,56 EUR', 'EUR', 1234.56],
    ['1.234,56 \u20ac', 'EUR', 1234.56], ['\u20ac1,234.56', 'EUR', 1234.56],
    ['$1,234.56', 'USD', 1234.56], ['\u00a31,234.56', 'GBP', 1234.56],
    ['215 EUR', 'EUR', 215], ['49.99', 'EUR', 49.99],
    ['1,234', 'USD', 1234],
  ] as const)('parses %s in %s without dropping decimals', (text, currency, expected) => {
    expect(parsePriceText(text, currency)).toBe(expected);
  });

  it.each([
    '2,15-3,99 EUR', '1,89 EUR (0,03 EUR / unit)', 'EUR 1,89 USD', '$1.89',
    '12 34,56 EUR', '1,23,456.78', '1.234.56 EUR', '-1,89 EUR', '0 EUR',
    '', 'NaN', 'Infinity', '1e2', '1.89 / unit', 'from 1.89', '1 234.567,89',
  ])('rejects ambiguous or malformed amounts: %s', (text) => {
    expect(parsePriceText(text, 'EUR')).toBeNull();
  });

  it('does not infer an error from price magnitude alone', () => {
    expect(normaliseListings([{ ...raw, price: { value: 215, raw: '215 EUR', currency: 'EUR' } }], 'FR')[0].price).toBe(215);
  });
});

describe('catalogue provenance and currency', () => {
  it.each([undefined, '2,15 EUR'])('blocks legacy or inconsistent Logimu prices in the frontend: %s', (priceText) => {
    const q: CatalogQuery = { ...query, category: 'maison' };
    const body = payload(q);
    expect(() => parseCatalog({
      ...body,
      products: [{ ...body.products[0], price: 215, priceText }],
      provenance: { ...body.provenance, provider: 'Logimu' },
    }, q)).toThrow('provider-price-invalid');
  });

  it.each([-1, 1.5, '2', NaN])('rejects malformed exclusion count: %s', (excludedPriceCount) => {
    expect(() => parseCatalog({ ...payload(), excludedPriceCount }, query)).toThrow('provider-invalid');
  });
  it.each(['missing-key', 'provider-rejected', 'provider-http'])('preserves %s from an HTTP 200 error response', (error) => {
    expect(() => parseCatalog({ products: [], error }, query)).toThrow(error);
  });

  it('does not accept products when the response also reports an error', () => {
    expect(() => parseCatalog({ ...payload(), error: 'missing-key' }, query)).toThrow('missing-key');
  });

  it.each(['', null, { message: 'missing-key' }])('rejects malformed error envelopes instead of accepting a catalogue: %j', (error) => {
    expect(() => parseCatalog({ products: [], error }, query)).toThrow('provider-invalid');
  });

  it('carries provenance into CSV and text comparisons', () => {
    const product = parseCatalog(payload(), query).products[0];
    const item = itemFromRow(rowFor({ ...product, priceVerification: 'concordant', detailPrice: product.originalPrice, priceCheckedAt: new Date().toISOString() }, 5, 20));
    const csv = buildCompareCsv([item], 'fr-FR', (key) => key);
    const text = buildCompareText([item], 'fr-FR', (key) => key);
    for (const output of [csv, text]) {
      expect(output).toContain('2026-11-02T12:00:00Z');
      expect(output).toContain('https://www.amazon.fr/dp/B012345678');
    }
  });

  it('retains the original price, request, timestamp and EUR conversion', () => {
    const q: CatalogQuery = { ...query, market: 'UK', exchangeRate: 1.2 };
    const catalog = parseCatalog(payload(q), q);
    expect(catalog.products[0]).toMatchObject({
      id: 'UK-B012345678', originalPrice: 49.99, originalCurrency: 'GBP',
      price: 59.988, estimated: true, market: 'UK', category: 'autres',
      sourceUrl: 'https://www.amazon.co.uk/dp/B012345678', units: 300, trend: 0,
    });
    expect(catalog.provenance.exchangeRate).toBe(1.2);
  });

  it.each([0, -1, NaN, Infinity])('rejects invalid exchange rate %s', (exchangeRate) => {
    const q: CatalogQuery = { ...query, market: 'UK', exchangeRate };
    expect(() => parseCatalog(payload(q), q)).toThrow('invalid-exchange-rate');
  });

  it('does not convert euro markets or accept a response for a different request', () => {
    expect(() => parseCatalog(payload(), { ...query, exchangeRate: 2 })).toThrow('invalid-exchange-rate');
    expect(() => parseCatalog(payload(), { ...query, market: 'DE' })).toThrow('provider-invalid');
    expect(() => parseCatalog({ products: [] }, query)).toThrow('provider-invalid');
  });

  it('rejects unknown providers and unsupported Logimu provenance', () => {
    for (const provider of ['Unknown API', 'Logimu']) {
      const body = payload();
      expect(() => parseCatalog({ ...body, provenance: { ...body.provenance, provider } }, query)).toThrow('provider-invalid');
    }
  });

  it('does not invent missing rank, reviews or growth', () => {
    const p = payload();
    const product = { ...p.products[0], rank: null, reviews: null };
    const result = parseCatalog({ ...p, products: [product] }, query).products[0];
    expect(result).toMatchObject({ rank: 0, reviews: 0, reviewCountKnown: false, trend: 0 });
    expect(opportunityScore(rowFor({ ...result, priceVerification: 'concordant', detailPrice: result.originalPrice, priceCheckedAt: new Date().toISOString() }, 5, 20)).total).toBeNull();
  });
});

describe('explainable opportunity score', () => {
  it('never gives a profitable-looking grade to a loss-making product', () => {
    const row = rowFor({ ...SOURCING_PRODUCTS[0], price: 1, rank: 1, reviews: 0 }, 5, 20);
    const score = opportunityScore(row);
    expect(row.metrics.net).toBeLessThan(0);
    expect(score.total).toBeLessThan(40);
    expect(score.grade).toBe('D');
  });

  it('uses the documented formula, equal weights and 60% maximum coverage', () => {
    const row = rowFor(SOURCING_PRODUCTS[0], 5, 20);
    const s = opportunityScore(row);
    expect(s.demand).toBe(Math.round(100 / (1 + row.product.rank / 100)));
    expect(s.competition).toBe(Math.round(Math.min(100, 20 * Math.log10(1 + row.product.reviews))));
    expect(s.margin).toBe(Math.round(Math.max(0, Math.min(100, 2 * row.metrics.netMargin))));
    expect(s.total).toBe(Math.round((s.demand! + 100 - s.competition! + s.margin!) / 3));
    expect(s.coverage).toBe(60);
  });

  describe('French and English availability copy', () => {
    it.each([fr, en])('provides every new UI label and correct target price', (messages) => {
      for (const key of Object.keys(fr).filter((key) =>
        key.startsWith('home.sourcing.score.') || key.startsWith('home.sourcing.errors.') ||
        key.startsWith('home.sourcing.market') || key.startsWith('home.sourcing.kind.') ||
        key.startsWith('home.sourcing.provenance.'))) {
        expect(Object.hasOwn(messages, key), key).toBe(true);
      }
      expect(messages['home.plan.starter.price']).toBe('29 €');
      expect(messages['home.plan.pro.price']).toBe('69 €');
      expect(messages['home.plan.agency.price']).toBe('299 €');
    });
  });

  it.each(['movers-and-shakers', 'most-wished-for'] as const)('does not treat %s as a sales rank', (listingKind) => {
    const s = opportunityScore(rowFor({ ...SOURCING_PRODUCTS[0], listingKind }, 5, 20));
    expect(s.demand).toBeNull();
    expect(s.total).toBeNull();
    expect(s.grade).toBeNull();
    expect(s.coverage).toBe(40);
  });

  it('always puts missing ranks last, including reversed sorting', () => {
    const rows = [0, 1, 5].map((rank) => rowFor({ ...SOURCING_PRODUCTS[0], id: String(rank), rank }, 5, 20));
    for (const flip of [true, false]) {
      const sorted = arrangeGrid(rows, { category: 'all', verdict: 'all', sort: 'rank', sort2: 'none', flip, minMargin: -50, locale: 'fr-FR' });
      expect(sorted.at(-1)?.product.rank).toBe(0);
    }
  });
});
