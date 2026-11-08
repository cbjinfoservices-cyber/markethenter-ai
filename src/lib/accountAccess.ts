import { supabase } from './supabase';

export const ACCOUNT_ROLES = ['user', 'admin'] as const;
export const ACCOUNT_PLANS = ['free', 'starter', 'pro', 'premium', 'agency'] as const;
export type AccountRole = typeof ACCOUNT_ROLES[number];
export type AccountPlan = typeof ACCOUNT_PLANS[number];
export type AccountAccess = { role: AccountRole; plan: AccountPlan; updated_at: string };
export type AdminAccount = AccountAccess & {
  id: string;
  email: string | null;
  created_at: string;
  last_sign_in_at: string | null;
  confirmed: boolean;
};
export type AdminSnapshot = {
  accounts: AdminAccount[];
  total: number;
  admins: number;
  confirmed: number;
  recent: number;
  plans: Partial<Record<AccountPlan, number>>;
};

const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const date = (value: unknown): value is string =>
  typeof value === 'string' && Number.isFinite(Date.parse(value));
const nullableDate = (value: unknown): value is string | null => value === null || date(value);
const nullableString = (value: unknown): value is string | null => value === null || typeof value === 'string';
const count = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
export const isAccountRole = (value: unknown): value is AccountRole =>
  ACCOUNT_ROLES.some((role) => role === value);
export const isAccountPlan = (value: unknown): value is AccountPlan =>
  ACCOUNT_PLANS.some((plan) => plan === value);

export function parseAccess(value: unknown): AccountAccess {
  if (!record(value) || !isAccountRole(value.role) || !isAccountPlan(value.plan) || !date(value.updated_at)) {
    throw new Error('invalid-account-response');
  }
  return { role: value.role, plan: value.plan, updated_at: value.updated_at };
}

export function parseAdminSnapshot(value: unknown): AdminSnapshot {
  if (!record(value) || !Array.isArray(value.accounts) ||
    !count(value.total) || !count(value.admins) || !count(value.confirmed) || !count(value.recent) ||
    !record(value.plans)) throw new Error('invalid-account-response');
  const plans: Partial<Record<AccountPlan, number>> = {};
  for (const [plan, amount] of Object.entries(value.plans)) {
    if (!isAccountPlan(plan) || !count(amount)) throw new Error('invalid-account-response');
    plans[plan] = amount;
  }
  const accounts = value.accounts.map((account): AdminAccount => {
    if (!record(account) || typeof account.id !== 'string' ||
      !nullableString(account.email) ||
      !date(account.created_at) || !nullableDate(account.last_sign_in_at) || typeof account.confirmed !== 'boolean') {
      throw new Error('invalid-account-response');
    }
    return {
      ...parseAccess(account), id: account.id, email: account.email,
      created_at: account.created_at, last_sign_in_at: account.last_sign_in_at,
      confirmed: account.confirmed,
    };
  });
  return { accounts, plans, total: value.total, admins: value.admins, confirmed: value.confirmed, recent: value.recent };
}

export async function fetchAccountAccess(userId: string): Promise<AccountAccess> {
  const { data, error } = await supabase.from('account_access')
    .select('role, plan, updated_at').eq('user_id', userId).single();
  if (error) throw error;
  return parseAccess(data);
}

export async function fetchAdminAccounts(page: number): Promise<AdminSnapshot> {
  const { data, error } = await supabase.rpc('admin_accounts', { p_page: page });
  if (error) throw error;
  return parseAdminSnapshot(data);
}

export async function updateAccount(account: AdminAccount, role: AccountRole, plan: AccountPlan): Promise<void> {
  const { error } = await supabase.rpc('admin_update_account', {
    p_user_id: account.id, p_role: role, p_plan: plan,
    p_expected_updated_at: account.updated_at,
  });
  if (error) throw error;
}

export function accountErrorKey(error: unknown): string {
  const message = record(error) && typeof error.message === 'string'
    ? error.message : error instanceof Error ? error.message : '';
  for (const code of ['admin-required', 'last-admin', 'account-changed', 'account-not-found', 'invalid-account-response']) {
    if (message.includes(code)) return `account.errors.${code}`;
  }
  return 'account.errors.failed';
}
