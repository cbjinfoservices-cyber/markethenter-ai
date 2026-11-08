export type ProviderKey = string | undefined | (() => Promise<string | undefined>);

export async function resolveProviderKey(key: ProviderKey): Promise<string | undefined> {
  const value = typeof key === 'function' ? await key() : key;
  return value?.trim() || undefined;
}

export function createProviderKeyReader(url: string, serviceKey: string, fallback?: string, fetcher: typeof fetch = fetch) {
  return async (): Promise<string | undefined> => {
    const response = await fetcher(`${url.replace(/\/+$/, '')}/rest/v1/rpc/sourcing_rainforest_key`, {
      method: 'POST',
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' },
      body: '{}',
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error('provider-key-store');
    const value: unknown = await response.json();
    if (value !== null && (typeof value !== 'string' || !value.trim())) throw new Error('provider-key-store');
    return typeof value === 'string' ? value : fallback;
  };
}
