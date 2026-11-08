import { afterEach, describe, expect, it, vi } from 'vitest';
import { validSupabaseConfig } from '@/lib/supabaseConfig';
import { handleBackToTopKey } from '@/pages/home/useBackToTopShortcut';

afterEach(() => { vi.unstubAllGlobals(); });

describe('Supabase configuration', () => {
  it.each([
    '', 'not-a-url', 'https://markethunter-test.invalid', 'https://demo.test',
    'https://demo.example', 'https://placeholder.supabase.co', 'https://account-ui-test.supabase.co',
    'http://remote.supabase.co', 'https://user:password@project.supabase.co',
  ])('rejects unusable backend %s', (url) => {
    expect(validSupabaseConfig(url, 'public-test-key')).toBe(false);
  });
  it.each(['https://project.supabase.co', 'https://backend.custom-domain.com', 'http://127.0.0.1:54321', 'http://localhost:54321'])(
    'allows project and local development URLs %s', (url) => {
      expect(validSupabaseConfig(url, 'public-test-key')).toBe(true);
    },
  );
  it('requires a real configured public key', () => {
    expect(validSupabaseConfig('https://project.supabase.co', '')).toBe(false);
    expect(validSupabaseConfig('https://project.supabase.co', 'placeholder-anon-key')).toBe(false);
  });
});

describe('back to top keyboard shortcut', () => {
  const event = (values: Record<string, unknown> = {}) => Object.assign(new Event('keydown', { cancelable: true }), values);
  const dispatch = (value: Event) => handleBackToTopKey(value as KeyboardEvent);
  it('ignores a keydown event without key instead of throwing', () => {
    expect(() => dispatch(event())).not.toThrow();
    expect(() => dispatch(event({ key: null }))).not.toThrow();
  });
  it('scrolls for uppercase T and respects text fields, modifiers and composition', () => {
    const scrollTo = vi.fn();
    vi.stubGlobal('window', { scrollTo, matchMedia: () => ({ matches: true }) });
    vi.stubGlobal('document', { activeElement: null });
    dispatch(event({ key: 'T' }));
    expect(scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'auto' });
    scrollTo.mockClear();
    for (const patch of [{ ctrlKey: true }, { metaKey: true }, { altKey: true }, { isComposing: true }]) {
      dispatch(event({ key: 't', ...patch }));
    }
    for (const tagName of ['INPUT', 'TEXTAREA', 'SELECT']) {
      vi.stubGlobal('document', { activeElement: { tagName } });
      dispatch(event({ key: 't' }));
    }
    vi.stubGlobal('document', { activeElement: { tagName: 'DIV', isContentEditable: true } });
    dispatch(event({ key: 't' }));
    expect(scrollTo).not.toHaveBeenCalled();
  });
});
