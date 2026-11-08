import { describe, expect, it, vi } from 'vitest';
import { createProviderKeyReader } from '../supabase/functions/sourcing-bestsellers/providerKey';
import { createPriceVerifier } from '../supabase/functions/sourcing-bestsellers/verification';
import { createHandler } from '../supabase/functions/sourcing-bestsellers/handler';

describe('server-only Rainforest key', () => {
  it('reads rotations without caching a key and uses environment only when Vault has no key', async () => {
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json('first-private-key'))
      .mockResolvedValueOnce(Response.json('second-private-key'))
      .mockResolvedValueOnce(Response.json(null));
    const read = createProviderKeyReader('https://local.invalid', 'service-key', 'env-key', fetcher);
    expect(await read()).toBe('first-private-key');
    expect(await read()).toBe('second-private-key');
    expect(await read()).toBe('env-key');
    expect(fetcher.mock.calls[0][0]).toBe('https://local.invalid/rest/v1/rpc/sourcing_rainforest_key');
  });

  it.each([new Response('', { status: 403 }), Response.json({ key: 'invalid' }), Response.json('')])(
    'does not fall back to an environment key when secret storage fails', async (response) => {
      const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response);
      await expect(createProviderKeyReader('https://local.invalid', 'service', 'fallback', fetcher)())
        .rejects.toThrow('provider-key-store');
    },
  );

  it('does not read secrets or contact a provider when a price cache is fresh', async () => {
    const key = vi.fn(async () => 'private-key');
    const cache = { read: vi.fn(async () => ({ price: 10, checkedAt: new Date().toISOString() })), write: vi.fn() };
    const fetcher = vi.fn<typeof fetch>();
    expect((await createPriceVerifier(key, cache, fetcher)('FR', 'B000000001', async () => false)).price).toBe(10);
    expect(key).not.toHaveBeenCalled();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('requires authentication before reading a provider secret on a cache miss', async () => {
    const key = vi.fn(async () => 'private-key');
    const fetcher = vi.fn<typeof fetch>();
    const handler = createHandler(key, fetcher);
    const result = await handler(new Request('https://local.invalid', {
      method: 'POST', body: JSON.stringify({ category: 'maison' }),
    }));
    expect(result.status).toBe(401);
    expect(key).not.toHaveBeenCalled();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('reports unavailable key storage explicitly without exposing key values', async () => {
    const fetcher = vi.fn<typeof fetch>();
    const handler = createHandler(async () => { throw new Error('private database details'); }, fetcher,
      'rainforest', undefined, undefined, async () => true);
    const result = await handler(new Request('https://local.invalid', {
      method: 'POST', body: JSON.stringify({ category: 'maison' }),
    }));
    expect(result.status).toBe(503);
    expect(await result.json()).toEqual({ error: 'provider-key-store' });
    expect(fetcher).not.toHaveBeenCalled();
  });
});
