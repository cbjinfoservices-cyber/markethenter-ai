import { describe, expect, it } from 'vitest';
import { confirmationRedirectUrl } from '@/lib/authRedirect';

describe('confirmation redirect', () => {
  it.each([
    ['/', 'https://example.com/dashboard'],
    ['/app/', 'https://example.com/app/dashboard'],
    ['/app', 'https://example.com/app/dashboard'],
  ])('uses the dashboard under base path %s', (base, expected) => {
    expect(confirmationRedirectUrl('https://example.com', base)).toBe(expected);
  });
});
