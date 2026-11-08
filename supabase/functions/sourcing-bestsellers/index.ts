import { createHandler } from './handler.ts';
import { createCatalogCache } from './catalogCache.ts';
import { createPriceCache } from './verification.ts';
import { createRedisCache, withRedisCatalogCache, withRedisPriceCache } from './redisCache.ts';
import { createProviderKeyReader } from './providerKey.ts';

const provider = Deno.env.get('SOURCING_PROVIDER') ?? 'rainforest';
const apiKey = Deno.env.get(provider === 'logimu' ? 'LOGIMU_API_KEY' : 'RAINFOREST_API_KEY');
const supabaseUrl = Deno.env.get('SUPABASE_URL');
const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const providerKey = provider === 'rainforest' && supabaseUrl && serviceRoleKey
  ? createProviderKeyReader(supabaseUrl, serviceRoleKey, apiKey) : apiKey;
const catalogDatabase = createCatalogCache(supabaseUrl, serviceRoleKey);
if (!catalogDatabase) throw new Error('catalog-cache: missing server configuration');

const priceDatabase = createPriceCache(supabaseUrl, serviceRoleKey);
const redis = createRedisCache(Deno.env.get('UPSTASH_REDIS_REST_URL'), Deno.env.get('UPSTASH_REDIS_REST_TOKEN'));
const redisPrefix = Deno.env.get('SOURCING_REDIS_PREFIX') ?? 'markethunter:sourcing:v1';
const catalogCache = redis ? withRedisCatalogCache(catalogDatabase, redis, redisPrefix) : catalogDatabase;
const priceCache = redis && priceDatabase ? withRedisPriceCache(priceDatabase, redis, redisPrefix) : priceDatabase;
const authenticate = async (request: Request): Promise<boolean> => {
  const authorization = request.headers.get('authorization') ?? '';
  if (!/^Bearer\s+\S+$/i.test(authorization)) return false;
  if (!supabaseUrl || !anonKey) throw new Error('auth-configuration');

  const response = await fetch(`${supabaseUrl.replace(/\/+$/, '')}/auth/v1/user`, {
    headers: { apikey: anonKey, Authorization: authorization },
    signal: AbortSignal.timeout(10_000),
  });
  if (response.status === 401 || response.status === 403) return false;
  if (!response.ok) throw new Error('auth-unavailable');
  const user: unknown = await response.json();
  return user !== null && typeof user === 'object' && 'id' in user && typeof user.id === 'string';
};

const cronSecret = Deno.env.get('SOURCING_CRON_SECRET');
const authenticateScheduled = async (request: Request): Promise<boolean> => {
  if (!cronSecret || cronSecret.length < 32) throw new Error('cron-configuration');
  return request.headers.get('x-sourcing-cron-secret') === cronSecret;
};

Deno.serve(createHandler(providerKey, fetch, provider, priceCache, catalogCache, authenticate, authenticateScheduled));
