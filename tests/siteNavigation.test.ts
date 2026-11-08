import { describe, expect, it } from 'vitest';
import { navigationFor } from '@/pages/home/navigation';

describe('navigation based on authentication', () => {
  it('only presents the three public sections to signed-out visitors', () => {
    expect(navigationFor(false).map((item) => item.to)).toEqual([
      '/#modules', '/tarifs', '/#faq',
    ]);
    expect(navigationFor(false).some((item) => item.to === '/dashboard')).toBe(false);
  });

  it('only presents the four workspace destinations after sign-in', () => {
    expect(navigationFor(true).map((item) => item.to)).toEqual([
      '/dashboard', '/sourcing', '/calculateur#calculator', '/fournisseurs',
    ]);
    expect(navigationFor(true).some((item) => item.to.startsWith('/#'))).toBe(false);
  });

  it('returns the public menu again after sign-out', () => {
    expect(navigationFor(true)[0].key).toBe('dash');
    expect(navigationFor(false)[0].key).toBe('modules');
  });
});
