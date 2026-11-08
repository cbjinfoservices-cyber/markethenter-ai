import { isRecord } from '../_shared/amazon.ts';
import { CATALOG_CACHE_TTL, parseCatalogSnapshot } from './catalogCache.ts';
import type { CatalogCache, CatalogSnapshot } from './catalogCache.ts';
import { PRICE_CACHE_TTL, parsePriceObservation } from './verification.ts';
import type { PriceCache, PriceObservation } from './verification.ts';

type RedisCache = {
  get: (key: string) => Promise<unknown>;
  put: (key: string, value: unknown, observedAt: number, ttlMs: number) => Promise<void>;
};

const SET_IF_NEWER = `
local current = redis.call('GET', KEYS[1])
if current then
  local ok, decoded = pcall(cjson.decode, current)
  if ok and type(decoded) == 'table' and type(decoded.observedAt) == 'number'
    and decoded.observedAt > tonumber(ARGV[2]) then
    return 0
  end
end
redis.call('SET', KEYS[1], ARGV[1], 'PX', ARGV[3])
return 1
`;

export function createRedisCache(
  url: string | undefined,
  token: string | undefined,
  fetcher: typeof fetch = fetch,
): RedisCache | undefined {
  if (!url || !token) {
    console.warn('sourcing-redis: not configured; using PostgreSQL');
    return undefined;
  }
  const endpoint = new URL(url);
  if (endpoint.protocol !== 'https:' || endpoint.username || endpoint.password ||
    endpoint.search || endpoint.hash) {
    throw new Error('sourcing-redis: invalid REST URL');
  }
  const command = async (args: (string | number)[]): Promise<unknown> => {
    const response = await fetcher(endpoint.href, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(args),
      signal: AbortSignal.timeout(2000),
    });
    if (!response.ok) throw new Error('Redis HTTP error');
    const body: unknown = await response.json();
    if (!isRecord(body) || 'error' in body || !('result' in body)) throw new Error('Redis command error');
    return body.result;
  };
  return {
    async get(key) {
      const result = await command(['GET', key]);
      if (result === null) return null;
      if (typeof result !== 'string') throw new Error('Redis invalid response');
      const parsed: unknown = JSON.parse(result);
      if (!isRecord(parsed) || typeof parsed.observedAt !== 'number' || !('value' in parsed)) {
        throw new Error('Redis invalid entry');
      }
      return parsed.value;
    },
    async put(key, value, observedAt, ttlMs) {
      const result = await command(['EVAL', SET_IF_NEWER, 1, key,
        JSON.stringify({ observedAt, value }), observedAt, ttlMs]);
      if (result !== 0 && result !== 1) throw new Error('Redis invalid write response');
    },
  };
}

function layeredRead<T>(
  redis: RedisCache,
  key: string,
  readDatabase: () => Promise<T | null>,
  parse: (value: unknown) => T | null,
  timestamp: (value: T) => string,
  ttl: number,
  now: () => number,
): Promise<T | null> {
  const remaining = (value: T) => {
    const age = now() - Date.parse(timestamp(value));
    return age >= 0 && age < ttl ? Math.floor(ttl - age) : 0;
  };
  const promote = async (value: T) => {
    const remainingMs = remaining(value);
    if (remainingMs <= 0) return;
    try {
      await redis.put(key, value, Date.parse(timestamp(value)), remainingMs);
    } catch {
      console.warn('sourcing-redis: write failed; PostgreSQL remains authoritative');
    }
  };
  return (async () => {
    try {
      const raw = await redis.get(key);
      if (raw !== null) {
        const value = parse(raw);
        if (!value) console.warn('sourcing-redis: invalid entry; reading PostgreSQL');
        else if (remaining(value) > 0) return value;
      }
    } catch {
      console.warn('sourcing-redis: read failed; reading PostgreSQL');
    }
    const value = await readDatabase();
    if (value) await promote(value);
    return value;
  })();
}

export function withRedisCatalogCache(database: CatalogCache, redis: RedisCache, prefix: string, now = Date.now): CatalogCache {
  const keyOf = (key: Parameters<CatalogCache['read']>[0]) =>
    `${prefix}:catalog:${key.provider}:${key.market}:${key.category}:${key.kind}`;
  return {
    read: (key) => layeredRead<CatalogSnapshot>(
      redis, keyOf(key), () => database.read(key), parseCatalogSnapshot,
      (value) => value.provenance.collectedAt, CATALOG_CACHE_TTL, now,
    ),
    async write(key, value) {
      await database.write(key, value);
      const age = now() - Date.parse(value.provenance.collectedAt);
      if (age < 0 || age >= CATALOG_CACHE_TTL) return;
      try {
        await redis.put(keyOf(key), value, Date.parse(value.provenance.collectedAt), Math.floor(CATALOG_CACHE_TTL - age));
      } catch {
        console.warn('sourcing-redis: write failed; PostgreSQL remains authoritative');
      }
    },
  };
}

export function withRedisPriceCache(database: PriceCache, redis: RedisCache, prefix: string, now = Date.now): PriceCache {
  const keyOf = (market: string, asin: string) => `${prefix}:price:${market}:${asin}`;
  return {
    read: (market, asin) => layeredRead<PriceObservation>(
      redis, keyOf(market, asin), () => database.read(market, asin), parsePriceObservation,
      (value) => value.checkedAt, PRICE_CACHE_TTL, now,
    ),
    async write(market, asin, value) {
      await database.write(market, asin, value);
      const age = now() - Date.parse(value.checkedAt);
      if (age < 0 || age >= PRICE_CACHE_TTL) return;
      try {
        await redis.put(keyOf(market, asin), value, Date.parse(value.checkedAt), Math.floor(PRICE_CACHE_TTL - age));
      } catch {
        console.warn('sourcing-redis: write failed; PostgreSQL remains authoritative');
      }
    },
  };
}
