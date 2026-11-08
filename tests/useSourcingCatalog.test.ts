import { setImmediate } from 'node:timers/promises';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const hooks = vi.hoisted(() => ({
  state: [] as unknown[],
  effects: [] as (() => (() => void))[],
  invoke: vi.fn(),
}));
vi.mock('react', () => ({
  useState: (value: unknown) => {
    const index = hooks.state.push(value) - 1;
    return [value, (next: unknown) => { hooks.state[index] = next; }];
  },
  useCallback: (callback: unknown) => callback,
  useRef: (current: unknown) => ({ current }),
  useEffect: (effect: () => (() => void)) => { hooks.effects.push(effect); },
}));
vi.mock('@/lib/supabase', () => ({
  isSupabaseReady: true, supabase: { functions: { invoke: hooks.invoke } },
}));
import useSourcingCatalog from '@/pages/sourcing/useSourcingCatalog';

describe('cache-only sourcing page', () => {
  beforeEach(() => {
    hooks.state.length = 0;
    hooks.effects.length = 0;
    hooks.invoke.mockReset().mockResolvedValue({ data: { products: [], cacheMiss: true }, error: null });
    vi.useFakeTimers();
    vi.stubGlobal('window', { setInterval, clearInterval });
    vi.stubGlobal('document', { visibilityState: 'visible' });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('never falls back to demo products when Supabase is configured but empty', async () => {
    const catalog = useSourcingCatalog();
    expect(catalog.products).toEqual([]);
    expect(catalog.source).toBe('live');
    await catalog.refresh('all');
    expect(hooks.state[0]).toEqual([]);
    expect(hooks.state[5]).toHaveLength(7);
    expect(hooks.invoke).toHaveBeenCalledTimes(7);
    for (const [name, options] of hooks.invoke.mock.calls) {
      expect(name).toBe('sourcing-bestsellers');
      expect(options.body.action).toBe('read-cache');
    }
  });

  it('reloads only the selected category on manual refresh without any price verification calls', async () => {
    hooks.invoke.mockResolvedValue({
      data: {
        products: [{ asin: 'B000000001', title: 'Product', price: 215 }],
        observations: [{ asin: 'B000000001', price: 10, checkedAt: new Date().toISOString() }],
      }, error: null,
    });
    await useSourcingCatalog().refresh('maison');
    expect(hooks.invoke).toHaveBeenCalledExactlyOnceWith('sourcing-bestsellers', {
      body: { action: 'read-cache', category: 'maison' },
    });
    expect(hooks.state[0]).toEqual([expect.objectContaining({ price: 10 })]);
  });

  it('polls the server cache every minute only while visible and cleans up on unmount', async () => {
    useSourcingCatalog();
    const cleanup = hooks.effects[0]();
    await setImmediate();
    expect(hooks.invoke).toHaveBeenCalledTimes(7);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(hooks.invoke).toHaveBeenCalledTimes(14);
    vi.stubGlobal('document', { visibilityState: 'hidden' });
    await vi.advanceTimersByTimeAsync(60_000);
    expect(hooks.invoke).toHaveBeenCalledTimes(14);
    cleanup();
    vi.stubGlobal('document', { visibilityState: 'visible' });
    await vi.advanceTimersByTimeAsync(60_000);
    expect(hooks.invoke).toHaveBeenCalledTimes(14);
    expect(hooks.invoke.mock.calls.every(([, options]) => options.body.action === 'read-cache')).toBe(true);
  });

  it('never verifies uncached prices and reports their absence', async () => {
    hooks.invoke.mockResolvedValue({
      data: { products: [{ asin: 'B000000001', title: 'Product', price: 215 }], observations: [] },
      error: null,
    });
    await useSourcingCatalog().refresh('maison');
    expect(hooks.state[0]).toEqual([]);
    expect(hooks.state[3]).toBe('prices-not-verified');
    expect(hooks.invoke).toHaveBeenCalledTimes(1);
  });

  it('does not overlap periodic reads while an earlier cache read is pending', async () => {
    let complete: (result: { data: { products: never[]; cacheMiss: boolean }; error: null }) => void = () => {};
    hooks.invoke.mockImplementationOnce(() => new Promise((resolve) => { complete = resolve; }));
    useSourcingCatalog();
    const cleanup = hooks.effects[0]();
    expect(hooks.invoke).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(hooks.invoke).toHaveBeenCalledTimes(1);
    complete({ data: { products: [], cacheMiss: true }, error: null });
    await setImmediate();
    expect(hooks.invoke).toHaveBeenCalledTimes(7);
    cleanup();
  });
});
