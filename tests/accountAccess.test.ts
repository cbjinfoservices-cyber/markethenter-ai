import { describe, expect, it } from 'vitest';
import {
  ACCOUNT_PLANS, ACCOUNT_ROLES, accountErrorKey, isAccountPlan, isAccountRole, parseAccess, parseAdminSnapshot,
} from '@/lib/accountAccess';
import fr from '@/i18n/local/fr/account';
import en from '@/i18n/local/en/account';

const access = { role: 'user', plan: 'free', updated_at: '2026-11-02T15:00:00Z' };
const account = {
  ...access, id: '00000000-0000-4000-8000-000000000001', email: 'user@example.invalid',
  created_at: '2026-11-02T15:00:00Z', last_sign_in_at: null, confirmed: false,
};
const snapshot = { accounts: [account], total: 1, admins: 0, confirmed: 0, recent: 1, plans: { free: 1 } };

describe('validated account-access responses', () => {
  it('accepts known roles and plans only', () => {
    expect(ACCOUNT_ROLES.every(isAccountRole)).toBe(true);
    expect(ACCOUNT_PLANS.every(isAccountPlan)).toBe(true);
    expect(isAccountRole('owner')).toBe(false);
    expect(isAccountPlan('enterprise')).toBe(false);
    expect(parseAccess(access)).toEqual(access);
    expect(parseAdminSnapshot(snapshot)).toEqual(snapshot);
  });

  it.each([null, {}, { ...access, role: 'owner' }, { ...access, plan: 'enterprise' }, { ...access, updated_at: 'invalid' }])(
    'fails closed on invalid access %j', (value) => {
      expect(() => parseAccess(value)).toThrow('invalid-account-response');
    },
  );

  it.each([
    null, { ...snapshot, accounts: null }, { ...snapshot, total: -1 },
    { ...snapshot, plans: { owner: 10 } }, { ...snapshot, accounts: [{ ...account, confirmed: 'yes' }] },
    { ...snapshot, accounts: [{ ...account, created_at: 'invalid' }] },
  ])('rejects malformed administrator data %j', (value) => {
    expect(() => parseAdminSnapshot(value)).toThrow('invalid-account-response');
  });

  it.each(['admin-required', 'last-admin', 'account-changed', 'account-not-found', 'invalid-account-response'])(
    'maps %s into a visible translated error', (message) => {
      const key = accountErrorKey({ message });
      expect(fr[key]).toBeTruthy();
      expect(en[key]).toBeTruthy();
    },
  );

  it('never exposes raw backend errors in UI copy', () => {
    expect(accountErrorKey({ message: 'private backend diagnostic' })).toBe('account.errors.failed');
    expect(Object.keys(fr).sort()).toEqual(Object.keys(en).sort());
  });
});
