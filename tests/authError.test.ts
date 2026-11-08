import { describe, expect, it } from 'vitest';
import { authErrorKey } from '../src/lib/authError';

describe('authentication error explanations', () => {
  it.each(['Error sending confirmation email', 'Error sending recovery email', 'SMTP connection failed',
    'lookup supabase-mail: server misbehaving'])('identifies mail infrastructure failures: %s', (message) => {
    expect(authErrorKey(message)).toBe('home.account.errMailService');
  });
  it.each(['Invalid email', 'Email address is invalid'])('identifies genuinely invalid addresses: %s', (message) => {
    expect(authErrorKey(message)).toBe('home.account.errEmail');
  });
  it('does not blame email syntax for other errors mentioning email', () => {
    expect(authErrorKey('Unexpected email provider failure')).toBeNull();
    expect(authErrorKey('Email not confirmed')).toBe('home.account.errUnconfirmed');
    expect(authErrorKey('Email rate limit exceeded')).toBe('home.account.errRate');
    expect(authErrorKey('Invalid login credentials')).toBe('home.account.errInvalid');
  });
});
